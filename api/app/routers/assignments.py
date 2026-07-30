from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from services.auth import require_auth
from services.assignments import (
    Assignment,
    AssignmentInput,
    AssignmentPatch,
    list_assignments,
    get_assignment,
    create_assignment,
    update_assignment,
    delete_assignment,
)

classes_router = APIRouter(prefix="/classes/{class_id}/assignments", tags=["Tareas evaluables"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/assignments", tags=["Tareas evaluables"], dependencies=[Depends(require_auth)])


@classes_router.get("", response_model=list[Assignment])
def get_assignments(class_id: str):

    return list_assignments(class_id)


@classes_router.post("", response_model=Assignment, status_code=201)
def post_assignment(class_id: str, data: AssignmentInput):

    return create_assignment(class_id, data)


@router.get("/{assignment_id}", response_model=Assignment)
def get_one_assignment(assignment_id: str):

    assignment = get_assignment(assignment_id)

    if assignment is None:
        raise HTTPException(status_code=404, detail="Tarea evaluable no encontrada.")

    return assignment


@router.patch("/{assignment_id}", response_model=Assignment)
def patch_assignment(assignment_id: str, data: AssignmentPatch):

    status, assignment = update_assignment(assignment_id, data)

    if status == "not_found":
        raise HTTPException(status_code=404, detail="Tarea evaluable no encontrada.")

    if status == "conflict":
        return JSONResponse(
            status_code=409,
            content={
                "detail": "La tarea evaluable se ha modificado desde otra pestaña o dispositivo.",
                "current": assignment.model_dump(by_alias=True, mode="json"),
            },
        )

    return assignment


@router.delete("/{assignment_id}", status_code=204)
def delete_one_assignment(assignment_id: str):

    if not delete_assignment(assignment_id):
        raise HTTPException(status_code=404, detail="Tarea evaluable no encontrada.")
