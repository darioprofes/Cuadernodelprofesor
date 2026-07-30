from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from services.auth import require_auth
from services.enrollments import (
    Enrollment,
    EnrollmentInput,
    EnrollmentPatch,
    list_enrollments,
    create_enrollment,
    update_enrollment,
    delete_enrollment,
)

classes_router = APIRouter(prefix="/classes/{class_id}/enrollments", tags=["Matrículas"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/enrollments", tags=["Matrículas"], dependencies=[Depends(require_auth)])


@classes_router.get("", response_model=list[Enrollment])
def get_enrollments(class_id: str):

    return list_enrollments(class_id)


@classes_router.post("", response_model=Enrollment, status_code=201)
def post_enrollment(class_id: str, data: EnrollmentInput):

    if (data.student_id is None) == (data.new_student is None):
        raise HTTPException(status_code=400, detail="Indica exactamente uno de studentId o newStudent.")

    return create_enrollment(class_id, data)


@router.patch("/{enrollment_id}", response_model=Enrollment)
def patch_enrollment(enrollment_id: str, data: EnrollmentPatch):

    status, enrollment = update_enrollment(enrollment_id, data)

    if status == "not_found":
        raise HTTPException(status_code=404, detail="Matrícula no encontrada.")

    if status == "conflict":
        return JSONResponse(
            status_code=409,
            content={
                "detail": "La matrícula se ha modificado desde otra pestaña o dispositivo.",
                "current": enrollment.model_dump(by_alias=True, mode="json"),
            },
        )

    return enrollment


@router.delete("/{enrollment_id}", status_code=204)
def delete_one_enrollment(enrollment_id: str):

    if not delete_enrollment(enrollment_id):
        raise HTTPException(status_code=404, detail="Matrícula no encontrada.")
