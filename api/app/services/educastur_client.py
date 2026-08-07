"""
Cliente para el "Área del Profesorado" (Educastur) — adaptado del script de
referencia en docs/faltas/educastur_faltas.py (login Keycloak, tramos
horarios, alumnado de un tramo, marcar/desmarcar falta), con dos cambios
deliberados respecto al script original:

  - User-Agent propio y honesto (CuadernoDocente/1.0), no el spoofing de
    Chrome del script — decisión explícita del usuario: el patrón de
    peticiones (varias faltas seguidas en milisegundos) ya delata que es
    automático de todas formas, fingir un navegador no oculta nada real.
  - `logout()` nuevo: revoca el refresh_token al terminar la sincronización
    en vez de dejar que caduque solo — cierra la ventana de exposición de
    inmediato. Nunca se persiste ningún token en ningún sitio (ver
    integracion-educastur-faltas.md): esta clase vive solo durante la
    propia llamada de sincronización, nunca más.

No es una API pública ni documentada por Educastur — es el mismo
client_id que usa su propia web, reutilizado desde fuera. Puede romperse
sin aviso si cambian el flujo de login.
"""

import base64
import json
import re
from urllib.parse import urlparse, parse_qs

import requests

REALM_BASE = "https://rhsso.asturias.es/auth/realms/educacion-clave"
AUTH_URL = f"{REALM_BASE}/protocol/openid-connect/auth"
TOKEN_URL = f"{REALM_BASE}/protocol/openid-connect/token"
LOGOUT_URL = f"{REALM_BASE}/protocol/openid-connect/logout"

CLIENT_ID = "AreaProfesorado"
REDIRECT_URI = "https://www62.asturias.es/AreaProfesorado/#/home"

FALTAS_API_BASE = "https://www62.asturias.es/faltas-back/api/faltas-tramo"

USER_AGENT = "CuadernoDocente/1.0 (+https://profe.lamarejada.es)"

TIPOS_FALTA_VALIDOS = {"R", "J", "I"}
TIPOS_FALTA_ACEPTADOS = TIPOS_FALTA_VALIDOS | {""}


class EducasturError(Exception):
    """Cualquier fallo del lado de Educastur (login, red, respuesta inesperada)."""


class EducasturClient:

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    # ---------------------------------------------------------------
    # Login -> access_token/refresh_token. Nada de esto se persiste
    # fuera de esta instancia, que vive solo durante la sincronización.
    # ---------------------------------------------------------------
    def login(self, usuario: str, contrasena: str) -> dict:

        params = {
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": "openid",
        }
        resp = self.session.get(AUTH_URL, params=params, timeout=15)
        resp.raise_for_status()

        match = re.search(r'action="([^"]+)"', resp.text)
        if not match:
            raise EducasturError(
                "No se encontró el formulario de login de Educastur. "
                "Puede que hayan cambiado el flujo — habría que revisar el cliente."
            )
        form_action = match.group(1).replace("&amp;", "&")

        resp2 = self.session.post(
            form_action,
            data={"username": usuario, "password": contrasena},
            allow_redirects=False,
            timeout=15,
        )

        if resp2.status_code != 302:
            raise EducasturError("Usuario o contraseña de Educastur incorrectos.")

        location = resp2.headers.get("Location", "")
        code = parse_qs(urlparse(location).query).get("code", [None])[0]
        if not code:
            raise EducasturError("Login de Educastur no devolvió código de autorización.")

        resp3 = self.session.post(TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
        }, timeout=15)
        resp3.raise_for_status()

        return resp3.json()

    def logout(self, refresh_token: str) -> None:

        try:
            self.session.post(LOGOUT_URL, data={
                "client_id": CLIENT_ID,
                "refresh_token": refresh_token,
            }, timeout=10)
        except requests.RequestException:
            # No es crítico: si falla, el refresh_token igualmente caduca
            # por su cuenta (Keycloak lo rota en cada uso) — no bloquea la
            # sincronización por esto.
            pass

    def obtener_tramos(self, access_token: str, id_empleado: int, id_centro: int, fecha: str) -> list[dict]:

        url = f"{FALTAS_API_BASE}/tramo-horario/empleado/{id_empleado}/centro/{id_centro}"
        resp = self.session.get(
            url, params={"fecha": fecha},
            headers={"Authorization": f"Bearer {access_token}"}, timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    def buscar_alumnos(self, access_token: str, fecha: str, id_tramo: int,
                        id_empleado: int, id_perfil: int, id_centro: int) -> list[dict]:

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
        resp = self.session.post(url, json=body, headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def procesar_falta(self, access_token: str, fecha_falta: str, id_tramo: int,
                        id_curso: int, id_unidad: int, alumno: dict, tipo_falta: str,
                        id_empleado: int, id_perfil: int, id_centro: int, id_falta: int = 0) -> dict:

        if tipo_falta not in TIPOS_FALTA_ACEPTADOS:
            raise ValueError(f"tipo_falta inválido: {tipo_falta!r}")

        url = f"{FALTAS_API_BASE}/procesar"
        body = {
            "fechaFalta": fecha_falta,
            "idTramo": id_tramo,
            "cursos": [{
                "idCurso": id_curso,
                "idUnidad": id_unidad,
                "faltas": [{
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
                }],
            }],
            "usuarioConectado": {
                "idEmpleado": id_empleado,
                "idPerfilSeleccionado": id_perfil,
                "idCentroSeleccionado": id_centro,
            },
        }
        resp = self.session.post(url, json=body, headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
        resp.raise_for_status()
        return resp.json() if resp.content else {}


# Sin verificar firma: el token ya viene de un login que acabamos de hacer
# nosotros mismos, solo se lee para intentar sacar id_empleado/id_centro/
# id_perfil de los claims — punto de incertidumbre real (ver
# integracion-educastur-faltas.md), qué trae exactamente solo se sabe
# probando con una cuenta real.
def decode_jwt_claims(access_token: str) -> dict:

    try:
        payload_b64 = access_token.split(".")[1]
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except (IndexError, ValueError, json.JSONDecodeError):
        return {}
