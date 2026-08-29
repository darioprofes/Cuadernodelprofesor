from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from services.auth import require_auth
from services.preferences import (
    Preferences,
    PreferencesInput,
    delete_teacher_photo,
    get_preferences,
    get_teacher_photo,
    set_teacher_photo,
    update_preferences,
)

router = APIRouter(prefix="/preferences", tags=["Preferencias"], dependencies=[Depends(require_auth)])

# Mismo límite que api/app/routers/photos.py (fotos de alumnado) -- 10MB es
# generoso de sobra para una foto de carné real.
_TAMANO_MAXIMO_FOTO = 10 * 1024 * 1024


@router.get("", response_model=Preferences)
def read_preferences():

    return get_preferences()


@router.put("", response_model=Preferences)
def write_preferences(data: PreferencesInput):

    return update_preferences(data)


@router.get("/photo")
def download_teacher_photo():

    result = get_teacher_photo()

    if result is None:
        raise HTTPException(status_code=404, detail="No hay foto de perfil guardada.")

    data, content_type = result

    return Response(content=data, media_type=content_type)


@router.put("/photo")
async def upload_teacher_photo(request: Request):

    content_type = request.headers.get("content-type", "application/octet-stream")

    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen.")

    data = await request.body()

    if not data:
        raise HTTPException(status_code=400, detail="No se ha recibido ninguna imagen.")

    if len(data) > _TAMANO_MAXIMO_FOTO:
        raise HTTPException(status_code=413, detail="La imagen pesa demasiado (máximo 10MB).")

    set_teacher_photo(data, content_type)

    return {"ok": True}


@router.delete("/photo")
def remove_teacher_photo():

    delete_teacher_photo()

    return {"ok": True}
