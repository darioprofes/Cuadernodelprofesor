import re
from typing import Optional

import requests

from services.db import get_conn
from services.schemas import ApiModel
from services.educastur_client import EducasturClient, EducasturError, DiaNoLectivoError

_PERIOD_RANGE_RE = re.compile(r"(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})")


# Mismo criterio que parsePeriodRange en frontend-src/utils.ts — se
# mantiene deliberadamente igual de tolerante (con o sin etiqueta
# alrededor de la hora) para no divergir de cómo se interpreta en el
# propio Cuaderno.
def _parse_period_range(label: str) -> Optional[tuple[int, int]]:
    m = _PERIOD_RANGE_RE.search(label)
    if not m:
        return None
    h1, m1, h2, m2 = (int(x) for x in m.groups())
    return h1 * 60 + m1, h2 * 60 + m2


class SincronizarInput(ApiModel):
    usuario: str
    contrasena: str
    id_empleado: Optional[int] = None
    id_centro: Optional[int] = None
    id_perfil: Optional[int] = None


class SyncErrorRow(ApiModel):
    absence_id: str
    alumno: str
    motivo: str


class SyncResult(ApiModel):
    sincronizadas: int
    errores: list[SyncErrorRow]
    id_empleado: Optional[int] = None
    id_centro: Optional[int] = None
    id_perfil: Optional[int] = None
    nombre_profesor: Optional[str] = None


def _nombre(row: dict) -> str:
    return f"{row.get('nombre') or ''} {row.get('primer_apellido') or ''} {row.get('segundo_apellido') or ''}".strip()


def _get_config() -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id_empleado, id_centro, id_perfil, nombre_profesor FROM educastur_config WHERE id = true")
            row = cur.fetchone()
            return dict(row) if row else {}


def _save_config(id_empleado: int, id_centro: int, id_perfil: int, nombre_profesor: Optional[str]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO educastur_config (id, id_empleado, id_centro, id_perfil, nombre_profesor, updated_at)
                VALUES (true, %s, %s, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                    id_empleado = EXCLUDED.id_empleado,
                    id_centro = EXCLUDED.id_centro,
                    id_perfil = EXCLUDED.id_perfil,
                    nombre_profesor = EXCLUDED.nombre_profesor,
                    updated_at = EXCLUDED.updated_at
                """,
                [id_empleado, id_centro, id_perfil, nombre_profesor]
            )


# Faltas locales pendientes, con lo necesario para emparejar con Educastur:
# DNI del alumno (students.dni) y los "periods" del curso académico de su
# clase, para resolver a qué franja horaria real corresponde period_index.
def _pending_absences() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    ab.id, ab.date, ab.period_index, ab.tipo_falta, ab.educastur_falta_id,
                    s.dni, s.nombre, s.primer_apellido, s.segundo_apellido,
                    ay.periods
                FROM absences ab
                JOIN enrollments e ON e.id = ab.enrollment_id
                JOIN students s ON s.id = e.student_id
                JOIN classes c ON c.id = e.class_id
                JOIN academic_years ay ON ay.id = c.academic_year_id
                WHERE ab.synced_at IS NULL
                """
            )
            return cur.fetchall()


def _mark_synced(absence_id: str, educastur_falta_id: Optional[int]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE absences SET synced_at = now(), sync_error = NULL, educastur_falta_id = %s WHERE id = %s",
                [educastur_falta_id, absence_id]
            )


def _mark_error(absence_id: str, motivo: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE absences SET sync_error = %s WHERE id = %s", [motivo, absence_id])


# Orquesta una sincronización completa, de principio a fin, en una única
# llamada: login -> agrupar pendientes por (fecha, tramo real de Educastur)
# -> procesar_falta por grupo -> logout. Nunca deja nada de la sesión vivo
# más allá de esta función (ver integracion-educastur-faltas.md).
def sincronizar(data: SincronizarInput) -> SyncResult:

    client = EducasturClient()

    tokens = client.login(data.usuario, data.contrasena)
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token", "")

    try:
        stored = _get_config()

        # GET /faltas/empleado — fuente real de idEmpleado/idCentro/
        # idPerfil, confirmado contra una cuenta real (ver
        # docs/faltas/educastur_client.py): idEmpleado va en la raíz como
        # "id", idPerfil/idCentro van anidados en perfiles[]/centros[].
        datos_empleado = client.obtener_datos_empleado(access_token)
        ids = client.resolver_ids_empleado(datos_empleado)

        id_empleado = data.id_empleado or stored.get("id_empleado") or ids["id_empleado"]
        id_centro = data.id_centro or stored.get("id_centro") or ids["id_centro"]
        id_perfil = data.id_perfil or stored.get("id_perfil") or ids["id_perfil"] or 2

        nombre_profesor = datos_empleado.get("nombre") or stored.get("nombre_profesor")

        if not id_empleado or not id_centro:
            raise EducasturError(
                "No se han podido determinar tu id de empleado/centro en Educastur — "
                "hace falta indicarlos a mano la primera vez."
            )

        _save_config(id_empleado, id_centro, id_perfil, nombre_profesor)

        pending = _pending_absences()

        errores: list[SyncErrorRow] = []
        sincronizadas = 0

        pending_by_date: dict[str, list[dict]] = {}
        for row in pending:
            pending_by_date.setdefault(str(row["date"]), []).append(row)

        for fecha, rows in pending_by_date.items():

            try:
                tramos = client.obtener_tramos(access_token, id_empleado, id_centro, fecha)
            except DiaNoLectivoError:
                # No es un fallo real: Educastur no permite consultar faltas
                # en festivos/fines de semana. Si hay una falta local marcada
                # en una fecha así, es un dato de la propia app que no tiene
                # equivalente que sincronizar — se informa, no se reintenta.
                for row in rows:
                    motivo = f"{fecha} es festivo o fin de semana según Educastur, no se puede sincronizar."
                    _mark_error(str(row["id"]), motivo)
                    errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo=motivo))
                continue
            except requests.RequestException as e:
                for row in rows:
                    _mark_error(str(row["id"]), f"No se pudieron obtener los tramos de Educastur: {e}")
                    errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo="No se pudieron obtener los tramos de Educastur."))
                continue

            # Agrupar las faltas de esta fecha por el tramo real de
            # Educastur que les corresponde (cruce por hora de inicio,
            # igual que el emparejamiento diseñado — ver plan).
            rows_by_tramo: dict[int, list[dict]] = {}
            for row in rows:
                periods = row["periods"] or []
                label = periods[row["period_index"]] if row["period_index"] < len(periods) else None
                rango = _parse_period_range(label) if label else None
                if not rango:
                    errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo="No se pudo resolver la franja horaria de esta falta."))
                    continue

                tramo_match = next(
                    (t for t in tramos if (tr := _parse_period_range(t.get("descripcion", ""))) and tr[0] == rango[0]),
                    None
                )
                if not tramo_match:
                    errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo=f"No hay un tramo de Educastur el {fecha} que coincida con esta franja."))
                    continue

                rows_by_tramo.setdefault(tramo_match["idTramo"], []).append(row)

            for id_tramo, tramo_rows in rows_by_tramo.items():

                try:
                    cursos = client.buscar_alumnos(access_token, fecha, id_tramo, id_empleado, id_perfil, id_centro)
                except requests.RequestException:
                    for row in tramo_rows:
                        _mark_error(str(row["id"]), "No se pudo consultar el alumnado de Educastur.")
                        errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo="No se pudo consultar el alumnado de Educastur."))
                    continue

                alumnos_por_dni: dict[str, tuple[dict, dict]] = {}
                for curso in cursos:
                    for alumno in curso.get("alumnosFaltas", []):
                        if alumno.get("dni"):
                            alumnos_por_dni[alumno["dni"]] = (curso, alumno)

                for row in tramo_rows:
                    if not row["dni"]:
                        _mark_error(str(row["id"]), "El alumno no tiene DNI registrado en la app.")
                        errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo="El alumno no tiene DNI registrado en la app, no se puede emparejar."))
                        continue

                    match = alumnos_por_dni.get(row["dni"])
                    if not match:
                        _mark_error(str(row["id"]), "No se encontró a este alumno en Educastur para este tramo.")
                        errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo="No se encontró a este alumno en Educastur para este tramo."))
                        continue

                    curso, alumno = match

                    try:
                        resultado = client.procesar_falta(
                            access_token, fecha, id_tramo, curso["idCurso"], curso["idUnidad"],
                            alumno, row["tipo_falta"], id_empleado, id_perfil, id_centro,
                            id_falta=row["educastur_falta_id"] or 0,
                        )
                        nuevo_id_falta = resultado.get("idFalta") if isinstance(resultado, dict) else None
                        _mark_synced(str(row["id"]), nuevo_id_falta or row["educastur_falta_id"])
                        sincronizadas += 1
                    except requests.RequestException as e:
                        motivo = "Error al enviar la falta a Educastur."
                        _mark_error(str(row["id"]), motivo)
                        errores.append(SyncErrorRow(absence_id=str(row["id"]), alumno=_nombre(row), motivo=motivo))

        return SyncResult(
            sincronizadas=sincronizadas, errores=errores,
            id_empleado=id_empleado, id_centro=id_centro, id_perfil=id_perfil,
            nombre_profesor=nombre_profesor,
        )

    finally:
        # Se revoca siempre, tanto si todo fue bien como si hubo errores a
        # mitad — la sesión no debe seguir viva ni un segundo más de lo
        # necesario (ver "Mitigaciones adicionales" en el plan).
        client.logout(refresh_token)
