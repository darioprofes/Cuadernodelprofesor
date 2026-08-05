from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from services.auth import require_auth
from services.photos import get_photo, set_photo, delete_photo

router = APIRouter(prefix="/photos", tags=["Fotos de alumnado"], dependencies=[Depends(require_auth)])


@router.get("/{student_id}")
def download_photo(student_id: str):

    result = get_photo(student_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Este alumno no tiene foto.")

    data, content_type = result

    return Response(content=data, media_type=content_type)


@router.put("/{student_id}")
async def upload_photo(student_id: str, request: Request):

    content_type = request.headers.get("content-type", "application/octet-stream")

    data = await request.body()

    if not data:
        raise HTTPException(status_code=400, detail="No se ha recibido ninguna imagen.")

    if not set_photo(student_id, data, content_type):
        raise HTTPException(status_code=404, detail="Alumno no encontrado.")

    return {"ok": True}


@router.delete("/{student_id}")
def remove_photo(student_id: str):

    if not delete_photo(student_id):
        raise HTTPException(status_code=404, detail="Alumno no encontrado.")

    return {"ok": True}
