from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import ForeignKeyViolation, RestrictViolation

from services.auth import require_auth
from services.academic_years import (
    AcademicYear,
    AcademicYearInput,
    AcademicYearPatch,
    EvaluationPeriod,
    EvaluationPeriodInput,
    EvaluationPeriodPatch,
    list_academic_years,
    get_academic_year,
    create_academic_year,
    update_academic_year,
    activate_academic_year,
    delete_academic_year,
    list_evaluation_periods,
    create_evaluation_period,
    update_evaluation_period,
    delete_evaluation_period,
)

router = APIRouter(prefix="/academic-years", tags=["Cursos académicos"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[AcademicYear])
def get_academic_years():

    return list_academic_years()


@router.get("/{year_id}", response_model=AcademicYear)
def get_one_academic_year(year_id: str):

    year = get_academic_year(year_id)

    if year is None:
        raise HTTPException(status_code=404, detail="Curso académico no encontrado.")

    return year


@router.post("", response_model=AcademicYear, status_code=201)
def post_academic_year(data: AcademicYearInput):

    return create_academic_year(data)


@router.patch("/{year_id}", response_model=AcademicYear)
def patch_academic_year(year_id: str, data: AcademicYearPatch):

    year = update_academic_year(year_id, data)

    if year is None:
        raise HTTPException(status_code=404, detail="Curso académico no encontrado.")

    return year


@router.post("/{year_id}/activate", response_model=AcademicYear)
def post_activate(year_id: str):

    year = activate_academic_year(year_id)

    if year is None:
        raise HTTPException(status_code=404, detail="Curso académico no encontrado.")

    return year


@router.delete("/{year_id}", status_code=204)
def delete_one_academic_year(year_id: str):

    if not delete_academic_year(year_id):
        raise HTTPException(status_code=404, detail="Curso académico no encontrado.")


@router.get("/{year_id}/evaluation-periods", response_model=list[EvaluationPeriod])
def get_evaluation_periods(year_id: str):

    return list_evaluation_periods(year_id)


@router.post("/{year_id}/evaluation-periods", response_model=EvaluationPeriod, status_code=201)
def post_evaluation_period(year_id: str, data: EvaluationPeriodInput):

    return create_evaluation_period(year_id, data)


@router.patch("/evaluation-periods/{period_id}", response_model=EvaluationPeriod)
def patch_evaluation_period(period_id: str, data: EvaluationPeriodPatch):

    period = update_evaluation_period(period_id, data)

    if period is None:
        raise HTTPException(status_code=404, detail="Período de evaluación no encontrado.")

    return period


@router.delete("/evaluation-periods/{period_id}", status_code=204)
def delete_one_evaluation_period(period_id: str):

    try:
        deleted = delete_evaluation_period(period_id)
    except (RestrictViolation, ForeignKeyViolation):
        raise HTTPException(status_code=409, detail="No se puede borrar: hay categorías o tareas evaluables que usan este período.")

    if not deleted:
        raise HTTPException(status_code=404, detail="Período de evaluación no encontrado.")
