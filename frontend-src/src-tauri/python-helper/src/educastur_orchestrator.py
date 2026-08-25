# ==========================================================
# Orquestación de la sincronización con Educastur (sidecar de escritorio)
# ==========================================================
#
# Adaptación de la parte de api/app/services/educastur_sync.py::sincronizar
# que habla con Educastur -- NO toca ninguna base de datos (a diferencia
# del original, que consulta/actualiza Postgres directamente). Aquí:
#   - las faltas ya vienen filtradas y resueltas desde Rust (procesables:
#     ya se descartaron los días no lectivos y las franjas sin hora
#     resoluble, con hora_inicio/hora_fin ya en minutos) -- no hace falta
#     _pending_absences/_is_dia_no_lectivo/_parse_period_range de saberes
#     de calendario aquí.
#   - en vez de _mark_synced/_mark_error/_delete_synced_blank escribiendo
#     en la base, se acumulan resultados en listas y se devuelven --
#     quien llama (Rust) es quien escribe en el SQLite local.
#
# Si se toca la lógica de emparejamiento/orquestación en el original,
# copiar el cambio aquí también (ver frontend-src/src-tauri/python-helper/README.md).

import re
import unicodedata

from educastur_client import DiaNoLectivoError, EducasturClient, EducasturError

_PERIOD_RANGE_RE = re.compile(r"(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})")


def _parse_period_range(label):

    m = _PERIOD_RANGE_RE.search(label or "")

    if not m:
        return None

    h1, m1, h2, m2 = (int(x) for x in m.groups())

    return h1 * 60 + m1, h2 * 60 + m2


def _nombre(row):

    return f"{row.get('nombre') or ''} {row.get('primer_apellido') or ''} {row.get('segundo_apellido') or ''}".strip()


def _clave_nombre(*partes):

    texto = " ".join(p for p in partes if p)
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()

    return re.sub(r"\s+", " ", texto).strip().lower()


def sincronizar(datos):
    """`datos` (dict, ya parseado del JSON de stdin):
    {
      "usuario": str, "contrasena": str,
      "id_empleado": int|None, "id_centro": int|None, "id_perfil": int|None,
      "stored": {"id_empleado": int|None, "id_centro": int|None, "id_perfil": int|None},
      "procesables": [
        {"absence_id": str, "fecha": "YYYY-MM-DD", "hora_inicio": int, "hora_fin": int,
         "dni": str|None, "nombre": str, "primer_apellido": str, "segundo_apellido": str,
         "tipo_falta": "R"|"J"|"I"|"", "educastur_falta_id": int|None},
        ...
      ]
    }

    Devuelve {"sincronizadas": [...], "errores": [...], "id_empleado":,
    "id_centro":, "id_perfil":, "nombre_profesor":} -- mismas claves que
    SyncResult en el backend web, salvo que "sincronizadas" aquí es la
    LISTA de filas sincronizadas (con su educastur_falta_id real y si fue
    un borrado), no solo el recuento -- Rust necesita esos datos para
    escribir en SQLite."""

    procesables = datos.get("procesables") or []

    if not procesables:
        return {"sincronizadas": [], "errores": [], "id_empleado": None, "id_centro": None, "id_perfil": None, "nombre_profesor": None}

    client = EducasturClient()

    try:
        tokens = client.login(datos["usuario"], datos["contrasena"])
    except EducasturError as e:
        raise ValueError(str(e))

    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token", "")

    try:
        stored = datos.get("stored") or {}

        datos_empleado = client.obtener_datos_empleado(access_token)
        ids = client.resolver_ids_empleado(datos_empleado)

        id_empleado = datos.get("id_empleado") or stored.get("id_empleado") or ids["id_empleado"]
        id_centro = datos.get("id_centro") or stored.get("id_centro") or ids["id_centro"]
        id_perfil = datos.get("id_perfil") or stored.get("id_perfil") or ids["id_perfil"] or 2

        nombre_profesor = datos_empleado.get("nombre") or stored.get("nombre_profesor")

        if not id_empleado or not id_centro:
            raise ValueError(
                "No se han podido determinar tu id de empleado/centro en Educastur -- "
                "hace falta indicarlos a mano la primera vez."
            )

        sincronizadas = []
        errores = []

        pending_by_date = {}
        for row in procesables:
            pending_by_date.setdefault(row["fecha"], []).append(row)

        for fecha, rows in pending_by_date.items():

            try:
                tramos = client.obtener_tramos(access_token, id_empleado, id_centro, fecha)
            except DiaNoLectivoError:
                for row in rows:
                    errores.append({
                        "absence_id": row["absence_id"], "alumno": _nombre(row),
                        "motivo": f"{fecha} es festivo o fin de semana según Educastur, no se puede sincronizar.",
                    })
                continue
            except Exception as e:
                for row in rows:
                    errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": f"No se pudieron obtener los tramos de Educastur: {e}"})
                continue

            rows_by_tramo = {}
            for row in rows:
                rango = (row["hora_inicio"], row["hora_fin"])
                tramo_match = next(
                    (t for t in tramos if (tr := _parse_period_range(t.get("descripcion", ""))) and tr[0] == rango[0]),
                    None,
                )
                if not tramo_match:
                    errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": f"No hay un tramo de Educastur el {fecha} que coincida con esta franja."})
                    continue
                rows_by_tramo.setdefault(tramo_match["idTramo"], []).append(row)

            for id_tramo, tramo_rows in rows_by_tramo.items():

                try:
                    cursos = client.buscar_alumnos(access_token, fecha, id_tramo, id_empleado, id_perfil, id_centro)
                except Exception:
                    for row in tramo_rows:
                        errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": "No se pudo consultar el alumnado de Educastur."})
                    continue

                alumnos_por_dni = {}
                alumnos_por_nombre = {}
                for curso in cursos:
                    for alumno in curso.get("alumnosFaltas", []):
                        if alumno.get("dni"):
                            alumnos_por_dni[alumno["dni"]] = (curso, alumno)
                        clave = _clave_nombre(alumno.get("nombre", ""), alumno.get("apellido1", ""), alumno.get("apellido2", ""))
                        if clave:
                            alumnos_por_nombre.setdefault(clave, []).append((curso, alumno))

                to_refresh = []

                for row in tramo_rows:
                    if row.get("dni"):
                        match = alumnos_por_dni.get(row["dni"])
                        if not match:
                            errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": "No se encontró a este alumno en Educastur para este tramo."})
                            continue
                    else:
                        candidatos = alumnos_por_nombre.get(_clave_nombre(row["nombre"], row["primer_apellido"], row["segundo_apellido"]), [])
                        if len(candidatos) == 1:
                            match = candidatos[0]
                        elif len(candidatos) > 1:
                            errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": "El alumno no tiene DNI y hay varios alumnos con ese nombre en Educastur para este tramo -- no se puede identificar sin DNI."})
                            continue
                        else:
                            errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": "El alumno no tiene DNI registrado en la app y no se encontró por nombre en Educastur para este tramo."})
                            continue

                    curso, alumno = match

                    try:
                        client.procesar_falta(
                            access_token, fecha, id_tramo, curso["idCurso"], curso["idUnidad"],
                            alumno, row["tipo_falta"], id_empleado, id_perfil, id_centro,
                            id_falta=row.get("educastur_falta_id") or 0,
                        )
                        if row["tipo_falta"] == "":
                            sincronizadas.append({"absence_id": row["absence_id"], "educastur_falta_id": None, "borrado": True})
                        else:
                            to_refresh.append((row, alumno))
                    except Exception:
                        errores.append({"absence_id": row["absence_id"], "alumno": _nombre(row), "motivo": "Error al enviar la falta a Educastur."})

                if to_refresh:
                    try:
                        cursos_actualizados = client.buscar_alumnos(access_token, fecha, id_tramo, id_empleado, id_perfil, id_centro)
                    except Exception:
                        cursos_actualizados = []

                    por_matricula = {}
                    for curso_act in cursos_actualizados:
                        for al in curso_act.get("alumnosFaltas", []):
                            if al.get("idMatricula") is not None:
                                por_matricula[al["idMatricula"]] = al

                    for row, alumno in to_refresh:
                        refrescado = por_matricula.get(alumno.get("idMatricula"))
                        nuevo_id_falta = refrescado.get("idFalta") if refrescado else None
                        sincronizadas.append({
                            "absence_id": row["absence_id"],
                            "educastur_falta_id": nuevo_id_falta or row.get("educastur_falta_id"),
                            "borrado": False,
                        })

        return {
            "sincronizadas": sincronizadas, "errores": errores,
            "id_empleado": id_empleado, "id_centro": id_centro, "id_perfil": id_perfil,
            "nombre_profesor": nombre_profesor,
        }

    finally:
        client.logout(refresh_token)
