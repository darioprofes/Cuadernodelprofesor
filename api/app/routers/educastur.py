from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.educastur_client import EducasturError
from services.educastur_sync import SincronizarInput, SyncResult, sincronizar

router = APIRouter(prefix="/educastur", tags=["Educastur"], dependencies=[Depends(require_auth)])


@router.post("/sincronizar", response_model=SyncResult)
def post_sincronizar(data: SincronizarInput):

    try:
        return sincronizar(data)
    except EducasturError as e:
        raise HTTPException(status_code=422, detail=str(e))
