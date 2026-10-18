from fastapi import APIRouter, Depends, Query
from services.auth import require_auth
from services import change_history
from pydantic import BaseModel

router = APIRouter(tags=['Historial'], dependencies=[Depends(require_auth)])

class ClearHistoryInput(BaseModel):
    confirmation: str = ''

@router.post('/history/clear')
def clear_history(data: ClearHistoryInput):
    return change_history.clear_history(data.confirmation)

@router.get('/classes/{class_id}/history')
def list_changes(class_id: str, page: int = Query(0, ge=0)):
    return change_history.list_changes(class_id, page)

@router.get('/history/{batch_id}')
def preview(batch_id: str):
    return change_history.preview(batch_id)

@router.post('/history/{batch_id}/restore')
def restore(batch_id: str):
    return change_history.restore(batch_id)
