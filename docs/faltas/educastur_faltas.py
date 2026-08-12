"""
Cliente para el "Área del Profesorado" (Educastur) — flujo completo:

  1. Login contra Keycloak (rhsso.asturias.es) -> access_token
  2. GET  tramo-horario/empleado/{id}/centro/{id}?fecha=... -> tramos del día
  3. POST faltas-tramo/buscar   -> cursos + alumnos de un tramo concreto
  4. POST faltas-tramo/procesar -> registra una falta

No metas tu contraseña en este fichero: se pide de forma interactiva.
No compartas capturas con el access_token completo ni con datos de
alumnos reales (nombre/DNI) fuera de este script.

USO:
    python3 educastur_faltas.py
"""

import re
import getpass
from datetime import date
from urllib.parse import urlparse, parse_qs

import requests

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

REALM_BASE = "https://rhsso.asturias.es/auth/realms/educacion-clave"
AUTH_URL = f"{REALM_BASE}/protocol/openid-connect/auth"
TOKEN_URL = f"{REALM_BASE}/protocol/openid-connect/token"

CLIENT_ID = "AreaProfesorado"
# Ojo: el redirect_uri visto en la captura incluye un fragmento (#/home).
# Si el paso de login falla al buscar el formulario, probar sin el
# "#/home" final, ya que los fragmentos no siempre viajan al servidor.
REDIRECT_URI = "https://www62.asturias.es/AreaProfesorado/#/home"

FALTAS_API_BASE = "https://www62.asturias.es/faltas-back/api/faltas-tramo"

# Únicos códigos de falta que permite la interfaz oficial.
TIPOS_FALTA_VALIDOS = {"R", "J", "I"}  # Retraso, Justificada, Injustificada
# "" (cadena vacía) es el valor especial usado para desmarcar una falta.
TIPOS_FALTA_ACEPTADOS = TIPOS_FALTA_VALIDOS | {""}


# ---------------------------------------------------------------------------
# Paso 1: login -> access_token
# ---------------------------------------------------------------------------

def login(usuario: str, contrasena: str) -> tuple[requests.Session, dict]:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0"
    })

    # --- pedir la página de login ---
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid",
    }
    resp = session.get(AUTH_URL, params=params)
    resp.raise_for_status()

    match = re.search(r'action="([^"]+)"', resp.text)
    if not match:
        raise RuntimeError(
            "No se encontró el formulario de login en el HTML devuelto. "
            "Puede que el redirect_uri necesite ajustarse (probar sin el "
            "fragmento '#/home'), o que la estructura de la página haya cambiado."
        )
    form_action = match.group(1).replace("&amp;", "&")
    print("[1/4] Formulario de login localizado.")

    # --- enviar credenciales ---
    resp2 = session.post(
        form_action,
        data={"username": usuario, "password": contrasena},
        allow_redirects=False,
    )

    if resp2.status_code != 302:
        raise RuntimeError(
            f"Login fallido (status {resp2.status_code}). "
            "Revisa usuario/contraseña, o que los nombres de campo "
            "'username'/'password' sean correctos."
        )

    location = resp2.headers.get("Location", "")
    code = parse_qs(urlparse(location).query).get("code", [None])[0]
    if not code:
        raise RuntimeError(f"No se recibió 'code' en la redirección. Location: {location}")
    print("[2/4] Login OK, code de autorización obtenido.")

    # --- canjear el code por el token ---
    resp3 = session.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
    })
    resp3.raise_for_status()
    tokens = resp3.json()
    print("[3/4] Token obtenido (expira en", tokens.get("expires_in"), "segundos).")

    return session, tokens


# ---------------------------------------------------------------------------
# Paso 2: tramos horarios del día
# ---------------------------------------------------------------------------

def obtener_tramos(session: requests.Session, access_token: str,
                    id_empleado: int, id_centro: int, fecha: str) -> list[dict]:
    """
    Devuelve la lista de tramos horarios del día, p.ej.:
        [{"idTramo": 296058, "horaInicio": "12:25", "horaFin": "13:20",
          "descripcion": "12:25-13:20  Ámbito científico-tecnológico"}, ...]
    """
    url = f"{FALTAS_API_BASE}/tramo-horario/empleado/{id_empleado}/centro/{id_centro}"
    resp = session.get(
        url,
        params={"fecha": fecha},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Paso 3: cursos + alumnos de un tramo concreto
# ---------------------------------------------------------------------------

def buscar_alumnos(session: requests.Session, access_token: str,
                    fecha: str, id_tramo: int,
                    id_empleado: int, id_perfil: int, id_centro: int) -> list[dict]:
    """
    Devuelve la lista de cursos con sus alumnos para ese tramo, p.ej.:
        [{"idCurso": ..., "nombreCurso": ..., "idUnidad": ..., "nombreUnidad": ...,
          "alumnosFaltas": [{"idAlumno": ..., "idMatricula": ..., "nombre": ...,
                              "tipoFalta": ..., "idFalta": ..., ...}, ...]}, ...]
    """
    url = f"{FALTAS_API_BASE}/buscar"
    body = {
        "fecha": fecha,
        "idTramo": id_tramo,
        "usuarioConectado": {
            "idEmpleado": id_empleado,
            "idPerfilSeleccionado": id_perfil,
            "idCentroSeleccionado": id_centro,
        },
    }
    resp = session.post(
        url,
        json=body,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Paso 4: registrar una falta
# ---------------------------------------------------------------------------

def procesar_falta(session: requests.Session, access_token: str,
                    fecha_falta: str, id_tramo: int,
                    id_curso: int, id_unidad: int,
                    alumno: dict, tipo_falta: str,
                    id_empleado: int, id_perfil: int, id_centro: int,
                    id_falta: int = 0) -> dict:
    """
    Registra (o actualiza, si id_falta != 0) una falta para un alumno.

    `alumno` debe traer al menos idAlumno, idMatricula, dni, nombre,
    apellido1, apellido2 (se puede pasar directamente uno de los objetos
    devueltos por buscar_alumnos, reutilizando sus campos).

    `tipo_falta` debe ser uno de los códigos que acepta la interfaz
    oficial: "R" (retraso), "J" (justificada), "I" (injustificada), o
    "" (cadena vacía) para desmarcar una falta existente.
    """
    if tipo_falta not in TIPOS_FALTA_ACEPTADOS:
        raise ValueError(
            f"tipo_falta inválido: {tipo_falta!r}. "
            f"Debe ser uno de {sorted(TIPOS_FALTA_ACEPTADOS)!r} (incluyendo '' para desmarcar)."
        )

    url = f"{FALTAS_API_BASE}/procesar"
    body = {
        "fechaFalta": fecha_falta,
        "idTramo": id_tramo,
        "cursos": [
            {
                "idCurso": id_curso,
                "idUnidad": id_unidad,
                "faltas": [
                    {
                        "idFalta": id_falta,
                        "tipoFalta": tipo_falta,
                        "alumno": {
                            "idAlumno": alumno["idAlumno"],
                            "idMatricula": alumno["idMatricula"],
                            "dni": alumno.get("dni", ""),
                            "nombre": alumno.get("nombre", ""),
                            "apellido1": alumno.get("apellido1", ""),
                            "apellido2": alumno.get("apellido2", ""),
                            "mensaje": "",
                        },
                    }
                ],
            }
        ],
        "usuarioConectado": {
            "idEmpleado": id_empleado,
            "idPerfilSeleccionado": id_perfil,
            "idCentroSeleccionado": id_centro,
        },
    }
    resp = session.post(
        url,
        json=body,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    resp.raise_for_status()
    print("[4/4] Falta registrada.")
    return resp.json() if resp.content else {}


def desmarcar_falta(session: requests.Session, access_token: str,
                     fecha_falta: str, id_tramo: int,
                     id_curso: int, id_unidad: int,
                     alumno: dict, id_falta: int,
                     id_empleado: int, id_perfil: int, id_centro: int) -> dict:
    """
    Quita una falta ya registrada (idFalta debe ser el id real, no 0).
    Usa el mismo endpoint /procesar, pero con tipoFalta como cadena vacía.
    """
    return procesar_falta(
        session, access_token,
        fecha_falta=fecha_falta,
        id_tramo=id_tramo,
        id_curso=id_curso,
        id_unidad=id_unidad,
        alumno=alumno,
        tipo_falta="",
        id_empleado=id_empleado,
        id_perfil=id_perfil,
        id_centro=id_centro,
        id_falta=id_falta,
    )


# ---------------------------------------------------------------------------
# Demo interactiva
# ---------------------------------------------------------------------------

def main():
    usuario = input("Usuario: ")
    contrasena = getpass.getpass("Contraseña: ")

    session, tokens = login(usuario, contrasena)
    access_token = tokens["access_token"]

    # --- estos tres IDs identifican al profesor/centro; hay que
    # obtenerlos una vez (p.ej. del propio JWT o de un endpoint de
    # perfil) y guardarlos asociados al usuario en tu backend ---
    id_empleado = int(input("ID empleado: "))
    id_centro = int(input("ID centro: "))
    id_perfil = int(input("ID perfil (normalmente 2 para profesor): ") or "2")

    fecha = input(f"Fecha [{date.today().isoformat()}]: ") or date.today().isoformat()

    tramos = obtener_tramos(session, access_token, id_empleado, id_centro, fecha)
    if not tramos:
        print("No hay tramos para esa fecha.")
        return

    print("\nTramos disponibles:")
    for i, t in enumerate(tramos):
        print(f"  {i}: {t['descripcion']}")
    idx = int(input("Elige un tramo (número): "))
    id_tramo = tramos[idx]["idTramo"]

    cursos = buscar_alumnos(session, access_token, fecha, id_tramo,
                             id_empleado, id_perfil, id_centro)

    print("\nAlumnos del tramo:")
    alumnos_flat = []  # (curso, alumno) para referencia por índice
    for curso in cursos:
        print(f"-- {curso['nombreCurso']} / {curso['nombreUnidad']} --")
        for a in curso["alumnosFaltas"]:
            alumnos_flat.append((curso, a))
            idx2 = len(alumnos_flat) - 1
            estado = a.get("tipoFalta") or "-"
            print(f"  {idx2}: {a['nombre']} {a['apellido1']} {a['apellido2']} "
                  f"(falta actual: {estado})")

    idx_alumno = int(input("\nElige alumno (número) para registrar una falta: "))
    curso_sel, alumno_sel = alumnos_flat[idx_alumno]

    tipo = None
    while tipo not in TIPOS_FALTA_ACEPTADOS:
        tipo = input(
            "Tipo de falta (R retraso / J justificada / I injustificada / "
            "vacío para desmarcar): "
        ).strip().upper()
        if tipo not in TIPOS_FALTA_ACEPTADOS:
            print(f"  Valor no válido. Debe ser uno de {sorted(TIPOS_FALTA_VALIDOS)} o vacío.")

    resultado = procesar_falta(
        session, access_token,
        fecha_falta=fecha,
        id_tramo=id_tramo,
        id_curso=curso_sel["idCurso"],
        id_unidad=curso_sel["idUnidad"],
        alumno=alumno_sel,
        tipo_falta=tipo,
        id_empleado=id_empleado,
        id_perfil=id_perfil,
        id_centro=id_centro,
        id_falta=alumno_sel.get("idFalta", 0),
    )
    print("Resultado:", resultado)


if __name__ == "__main__":
    main()
