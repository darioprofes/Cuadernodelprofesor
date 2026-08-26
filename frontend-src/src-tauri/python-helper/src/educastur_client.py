"""
Cliente para el "Área del Profesorado" (Educastur): login vía Keycloak,
consulta de tramos horarios, alumnado de un tramo, y marcado/desmarcado
de faltas.

COPIA de api/app/services/educastur_client.py para el sidecar de
escritorio (ver frontend-src/src-tauri/python-helper/README.md) -- este
módulo en sí no cambia (solo requests, sin tocar base de datos), se
copia tal cual. Si se toca en el backend web, copiar el cambio aquí
también.

Verificado en vivo por el usuario contra su cuenta real (ver
docs/faltas/educastur_client.py y probar_educastur.py, mismo contenido) —
esta copia es la que corre de verdad en el backend.

  - User-Agent propio (FaroDocente/1.0) en vez de simular un
    navegador: el servidor sabe en todo momento qué tipo de cliente está
    haciendo la petición — decisión explícita del usuario, fingir un
    navegador no ocultaría nada real de todas formas.
  - `logout()` revoca el refresh_token al terminar la sincronización, en
    vez de esperar a que caduque solo. Ningún token se persiste en ningún
    sitio (ver integracion-educastur-faltas.md) — esta clase vive solo
    durante la propia llamada de sincronización.

No es una API pública ni documentada por Educastur — es el mismo
client_id que usa su propia web, reutilizado desde fuera. Puede romperse
sin aviso si cambian el flujo de login.
"""

import json
import re
from urllib.parse import urlparse, parse_qs

import requests

REALM_BASE = "https://rhsso.asturias.es/auth/realms/educacion-clave"
AUTH_URL = f"{REALM_BASE}/protocol/openid-connect/auth"
TOKEN_URL = f"{REALM_BASE}/protocol/openid-connect/token"
LOGOUT_URL = f"{REALM_BASE}/protocol/openid-connect/logout"
# API de cuenta estándar de Keycloak — solo trae los datos propios del
# login (nombre, email, atributos del realm si los hay). NO es la fuente
# de idEmpleado/idCentro/idPerfil, pese a que en un principio parecía la
# candidata lógica: esos IDs viven en la API de faltas (ver
# FALTAS_EMPLEADO_URL más abajo), confirmado inspeccionando la web real.
ACCOUNT_URL = f"{REALM_BASE}/account"

CLIENT_ID = "AreaProfesorado"
REDIRECT_URI = "https://www62.asturias.es/AreaProfesorado/#/home"

FALTAS_API_BASE = "https://www62.asturias.es/faltas-back/api/faltas-tramo"
# Fuente real de idEmpleado/idCentro/idPerfil — confirmado inspeccionando
# la web real con las herramientas de desarrollador (no documentado,
# puede cambiar de forma).
FALTAS_EMPLEADO_URL = "https://www62.asturias.es/faltas-back/api/faltas/empleado"

USER_AGENT = "FaroDocente/1.0 (+https://profe.lamarejada.es)"

TIPOS_FALTA_VALIDOS = {"R", "J", "I"}
TIPOS_FALTA_ACEPTADOS = TIPOS_FALTA_VALIDOS | {""}


class EducasturError(Exception):
    """Cualquier fallo del lado de Educastur (login, red, respuesta inesperada)."""


class DiaNoLectivoError(EducasturError):
    """
    La fecha consultada es festivo o fin de semana — Educastur devuelve un
    código propio (430) en vez de una lista vacía. No es un fallo real:
    para una sincronización que procesa varias fechas seguidas, este caso
    se distingue de un error genuino y esa fecha se salta sin más, en vez
    de tratarse como un fallo que bloquea el resto.
    """


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

    # Perfil de cuenta de Keycloak (nombre, email, atributos del realm si
    # los hay). Útil como dato de usuario, pero NO trae idEmpleado/
    # idCentro/idPerfil — para eso, obtener_datos_empleado().
    def obtener_perfil(self, access_token: str) -> dict:

        try:
            resp = self.session.get(ACCOUNT_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError):
            return {}

    # Fuente real de idEmpleado/idCentro/idPerfil: este endpoint específico
    # de la API de faltas, no la cuenta de Keycloak. Devuelve el JSON crudo
    # tal cual lo da Educastur (id, nif, nombre, perfiles[].centros[]...) —
    # para los IDs ya resueltos y listos para usar, ver resolver_ids_empleado().
    def obtener_datos_empleado(self, access_token: str) -> dict:

        resp = self.session.get(
            FALTAS_EMPLEADO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    # Traduce el JSON crudo de obtener_datos_empleado() a los tres IDs que
    # necesita el resto del cliente. Estructura real confirmada: idEmpleado
    # va en la raíz como "id" (no "idEmpleado"); idPerfil e idCentro van
    # anidados en perfiles[]/centros[] (idPerfil llega como string, se
    # convierte a int). Coge el primer perfil y el primer centro de ese
    # perfil — si el usuario tuviera varios (más de un centro, o un rol
    # distinto a "Profesorado"), esto habría que revisarlo para dejar elegir
    # explícitamente, en vez de asumir siempre el primero.
    def resolver_ids_empleado(self, datos_empleado: dict) -> dict:

        id_empleado = datos_empleado.get("id")

        perfiles = datos_empleado.get("perfiles") or []
        id_perfil = None
        id_centro = None
        if perfiles:
            primer_perfil = perfiles[0]
            id_perfil_raw = primer_perfil.get("idPerfil")
            id_perfil = int(id_perfil_raw) if id_perfil_raw is not None else None
            centros = primer_perfil.get("centros") or []
            if centros:
                id_centro = centros[0].get("idCentro")

        return {
            "id_empleado": id_empleado,
            "id_centro": id_centro,
            "id_perfil": id_perfil,
        }

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
        # Código propio de Educastur (ni siquiera un código HTTP estándar):
        # significa "fecha festiva o fin de semana", confirmado tanto desde
        # este cliente como reproducido en la propia web oficial. No es un
        # fallo real de la petición, así que se distingue del resto de
        # errores para que el llamante pueda decidir saltarse la fecha en
        # vez de tratarlo como un fallo genérico.
        if resp.status_code == 430:
            raise DiaNoLectivoError(f"{fecha} es festivo o fin de semana — Educastur no permite consultar faltas ese día.")
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
