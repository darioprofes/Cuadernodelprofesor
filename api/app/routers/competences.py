from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import ForeignKeyViolation, RestrictViolation

from services.auth import require_auth
from services.schemas import ApiModel
from services.competences import (
    SpecificCompetence,
    SpecificCompetenceInput,
    SpecificCompetencePatch,
    list_competences,
    get_competence,
    create_competence,
    update_competence,
    delete_competence,
    link_descriptor,
    unlink_descriptor,
)


class DescriptorLinkInput(ApiModel):
    descriptor_id: str

courses_router = APIRouter(prefix="/courses/{course_id}/competences", tags=["Competencias específicas"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/competences", tags=["Competencias específicas"], dependencies=[Depends(require_auth)])


@courses_router.get("", response_model=list[SpecificCompetence])
def get_competences(course_id: str):

    return list_competences(course_id)


@courses_router.post("", response_model=SpecificCompetence, status_code=201)
def post_competence(course_id: str, data: SpecificCompetenceInput):

    return create_competence(course_id, data)


@router.get("/{competence_id}", response_model=SpecificCompetence)
def get_one_competence(competence_id: str):

    sc = get_competence(competence_id)

    if sc is None:
        raise HTTPException(status_code=404, detail="Competencia específica no encontrada.")

    return sc


@router.patch("/{competence_id}", response_model=SpecificCompetence)
def patch_competence(competence_id: str, data: SpecificCompetencePatch):

    sc = update_competence(competence_id, data)

    if sc is None:
        raise HTTPException(status_code=404, detail="Competencia específica no encontrada.")

    return sc


@router.delete("/{competence_id}", status_code=204)
def delete_one_competence(competence_id: str):

    try:
        deleted = delete_competence(competence_id)
    except (RestrictViolation, ForeignKeyViolation):
        raise HTTPException(status_code=409, detail="No se puede borrar: hay criterios de evaluación que la referencian.")

    if not deleted:
        raise HTTPException(status_code=404, detail="Competencia específica no encontrada.")


@router.post("/{competence_id}/descriptors", status_code=204)
def post_descriptor_link(competence_id: str, data: DescriptorLinkInput):

    link_descriptor(competence_id, data.descriptor_id)


@router.delete("/{competence_id}/descriptors/{descriptor_id}", status_code=204)
def delete_descriptor_link(competence_id: str, descriptor_id: str):

    unlink_descriptor(competence_id, descriptor_id)
