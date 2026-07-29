from fastapi import APIRouter, Depends, Request

from services.auth import require_auth
from services.student_photos import list_photos, set_photo, delete_photo, delete_all_photos

router = APIRouter(prefix="/photos", tags=["Fotos de alumnado"], dependencies=[Depends(require_auth)])


@router.get("")
def get_all_photos():

    return list_photos()


@router.put("/{student_id}")
async def upload_photo(student_id: str, request: Request):

    body = await request.json()

    data_url = body.get("dataUrl", "")

    if data_url:
        set_photo(student_id, data_url)

    return {"ok": True}


@router.delete("/{student_id}")
def remove_photo(student_id: str):

    delete_photo(student_id)

    return {"ok": True}


@router.delete("")
def remove_all_photos():

    delete_all_photos()

    return {"ok": True}
