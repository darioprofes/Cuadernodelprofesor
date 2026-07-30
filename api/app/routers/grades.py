from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import ForeignKeyViolation

from services.auth import require_auth
from services.grades import Grade, GradeInput, list_grades_for_class, put_grade, delete_grade

classes_router = APIRouter(prefix="/classes/{class_id}/grades", tags=["Notas"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/assignments/{assignment_id}/grades", tags=["Notas"], dependencies=[Depends(require_auth)])


@classes_router.get("", response_model=list[Grade])
def get_grades(class_id: str):

    return list_grades_for_class(class_id)


@router.put("/{enrollment_id}", response_model=Grade)
def put_one_grade(assignment_id: str, enrollment_id: str, data: GradeInput):

    try:
        return put_grade(assignment_id, enrollment_id, data)
    except ForeignKeyViolation:
        raise HTTPException(status_code=404, detail="La tarea evaluable o la matrícula no existen.")


@router.delete("/{enrollment_id}", status_code=204)
def delete_one_grade(assignment_id: str, enrollment_id: str):

    if not delete_grade(assignment_id, enrollment_id):
        raise HTTPException(status_code=404, detail="Nota no encontrada.")
