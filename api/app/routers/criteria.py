from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.criteria import (
    EvaluationCriterion,
    EvaluationCriterionInput,
    EvaluationCriterionPatch,
    list_criteria,
    get_criterion,
    create_criterion,
    update_criterion,
    delete_criterion,
)

courses_router = APIRouter(prefix="/courses/{course_id}/criteria", tags=["Criterios de evaluación"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/criteria", tags=["Criterios de evaluación"], dependencies=[Depends(require_auth)])


@courses_router.get("", response_model=list[EvaluationCriterion])
def get_criteria(course_id: str):

    return list_criteria(course_id)


@courses_router.post("", response_model=EvaluationCriterion, status_code=201)
def post_criterion(course_id: str, data: EvaluationCriterionInput):

    return create_criterion(course_id, data)


@router.get("/{criterion_id}", response_model=EvaluationCriterion)
def get_one_criterion(criterion_id: str):

    criterion = get_criterion(criterion_id)

    if criterion is None:
        raise HTTPException(status_code=404, detail="Criterio no encontrado.")

    return criterion


@router.patch("/{criterion_id}", response_model=EvaluationCriterion)
def patch_criterion(criterion_id: str, data: EvaluationCriterionPatch):

    criterion = update_criterion(criterion_id, data)

    if criterion is None:
        raise HTTPException(status_code=404, detail="Criterio no encontrado.")

    return criterion


@router.delete("/{criterion_id}", status_code=204)
def delete_one_criterion(criterion_id: str):

    if not delete_criterion(criterion_id):
        raise HTTPException(status_code=404, detail="Criterio no encontrado.")
