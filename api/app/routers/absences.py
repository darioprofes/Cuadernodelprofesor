from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import ForeignKeyViolation, CheckViolation

from services.auth import require_auth
from services.absences import Absence, AbsenceInput, list_absences_for_class, put_absence, delete_absence

classes_router = APIRouter(prefix="/classes/{class_id}/absences", tags=["Asistencia"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/enrollments/{enrollment_id}/absences", tags=["Asistencia"], dependencies=[Depends(require_auth)])


@classes_router.get("", response_model=list[Absence])
def get_absences(class_id: str):

    return list_absences_for_class(class_id)


@router.put("", response_model=Absence)
def put_one_absence(enrollment_id: str, data: AbsenceInput):

    try:
        return put_absence(enrollment_id, data)
    except ForeignKeyViolation:
        raise HTTPException(status_code=404, detail="La matrícula no existe.")
    except CheckViolation:
        raise HTTPException(status_code=422, detail="Tipo de falta inválido: debe ser R, J o I.")


@router.delete("", status_code=204)
def delete_one_absence(enrollment_id: str, date: str, period_index: int):

    if not delete_absence(enrollment_id, date, period_index):
        raise HTTPException(status_code=404, detail="Falta no encontrada.")
