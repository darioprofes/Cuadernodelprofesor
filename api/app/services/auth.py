from fastapi import HTTPException, Request

# ==========================================================
# Configuración
# ==========================================================
#
# Authentik protege profe.lamarejada.es con su forward auth, e inyecta el
# usuario autenticado en la cabecera "X-authentik-username" en cada
# petición. Uso personal: no hay reparto por usuario como en el panel, solo
# se exige que la cabecera llegue (si no, la petición no ha pasado por
# Authentik y se rechaza).
#


def require_auth(request: Request):

    username = request.headers.get("x-authentik-username")

    if not username:
        raise HTTPException(status_code=401, detail="Falta la cabecera de autenticación.")

    return username
