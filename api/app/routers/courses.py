from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from psycopg.errors import ForeignKeyViolation, RestrictViolation

from services.auth import require_auth
from services.courses import (
    Course,
    CourseInput,
    CoursePatch,
    list_courses,
    get_course,
    create_course,
    update_course,
    delete_course,
)

router = APIRouter(prefix="/courses", tags=["Cursos"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[Course])
def get_courses():

    return list_courses()


@router.get("/{course_id}", response_model=Course)
def get_one_course(course_id: str):

    course = get_course(course_id)

    if course is None:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    return course


@router.post("", response_model=Course, status_code=201)
def post_course(data: CourseInput):

    return create_course(data)


@router.patch("/{course_id}", response_model=Course)
def patch_course(course_id: str, data: CoursePatch):

    status, course = update_course(course_id, data)

    if status == "not_found":
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    if status == "conflict":
        return JSONResponse(
            status_code=409,
            content={
                "detail": "El curso se ha modificado desde otra pestaña o dispositivo.",
                "current": course.model_dump(by_alias=True, mode="json"),
            },
        )

    return course


@router.delete("/{course_id}", status_code=204)
def delete_one_course(course_id: str):

    try:
        deleted = delete_course(course_id)
    except (RestrictViolation, ForeignKeyViolation):
        raise HTTPException(status_code=409, detail="No se puede borrar: hay clases que usan este curso.")

    if not deleted:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
