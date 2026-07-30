from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from psycopg.errors import ForeignKeyViolation, RestrictViolation

from services.auth import require_auth
from services.students import (
    Student,
    StudentInput,
    StudentPatch,
    list_students,
    get_student,
    create_student,
    update_student,
    delete_student,
)

router = APIRouter(prefix="/students", tags=["Alumnado (persona)"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[Student])
def get_students():

    return list_students()


@router.get("/{student_id}", response_model=Student)
def get_one_student(student_id: str):

    student = get_student(student_id)

    if student is None:
        raise HTTPException(status_code=404, detail="Alumno/a no encontrado/a.")

    return student


@router.post("", response_model=Student, status_code=201)
def post_student(data: StudentInput):

    return create_student(data)


@router.patch("/{student_id}", response_model=Student)
def patch_student(student_id: str, data: StudentPatch):

    status, student = update_student(student_id, data)

    if status == "not_found":
        raise HTTPException(status_code=404, detail="Alumno/a no encontrado/a.")

    if status == "conflict":
        return JSONResponse(
            status_code=409,
            content={
                "detail": "El alumno/a se ha modificado desde otra pestaña o dispositivo.",
                "current": student.model_dump(by_alias=True, mode="json"),
            },
        )

    return student


@router.delete("/{student_id}", status_code=204)
def delete_one_student(student_id: str):

    try:
        deleted = delete_student(student_id)
    except (RestrictViolation, ForeignKeyViolation):
        raise HTTPException(
            status_code=409,
            detail="No se puede borrar: tiene matrículas (y posiblemente notas) asociadas en algún curso académico.",
        )

    if not deleted:
        raise HTTPException(status_code=404, detail="Alumno/a no encontrado/a.")
