from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.programming_units import (
    ProgrammingUnit,
    ProgrammingUnitInput,
    ProgrammingUnitPatch,
    list_programming_units,
    create_programming_unit,
    update_programming_unit,
    delete_programming_unit,
)

courses_router = APIRouter(prefix="/courses/{course_id}/programming-units", tags=["Unidades de programación"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/programming-units", tags=["Unidades de programación"], dependencies=[Depends(require_auth)])


@courses_router.get("", response_model=list[ProgrammingUnit])
def get_units(course_id: str):

    return list_programming_units(course_id)


@courses_router.post("", response_model=ProgrammingUnit, status_code=201)
def post_unit(course_id: str, data: ProgrammingUnitInput):

    return create_programming_unit(course_id, data)


@router.patch("/{unit_id}", response_model=ProgrammingUnit)
def patch_unit(unit_id: str, data: ProgrammingUnitPatch):

    unit = update_programming_unit(unit_id, data)

    if unit is None:
        raise HTTPException(status_code=404, detail="Unidad de programación no encontrada.")

    return unit


@router.delete("/{unit_id}", status_code=204)
def delete_one_unit(unit_id: str):

    if not delete_programming_unit(unit_id):
        raise HTTPException(status_code=404, detail="Unidad de programación no encontrada.")
