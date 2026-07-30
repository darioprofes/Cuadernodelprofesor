from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.key_competences import (
    KeyCompetence,
    KeyCompetenceInput,
    KeyCompetencePatch,
    OperationalDescriptor,
    OperationalDescriptorInput,
    list_key_competences,
    get_key_competence,
    create_key_competence,
    update_key_competence,
    delete_key_competence,
    create_descriptor,
    delete_descriptor,
)

router = APIRouter(prefix="/key-competences", tags=["Competencias clave"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[KeyCompetence])
def get_key_competences():

    return list_key_competences()


@router.get("/{key_competence_id}", response_model=KeyCompetence)
def get_one_key_competence(key_competence_id: str):

    kc = get_key_competence(key_competence_id)

    if kc is None:
        raise HTTPException(status_code=404, detail="Competencia clave no encontrada.")

    return kc


@router.post("", response_model=KeyCompetence, status_code=201)
def post_key_competence(data: KeyCompetenceInput):

    return create_key_competence(data)


@router.patch("/{key_competence_id}", response_model=KeyCompetence)
def patch_key_competence(key_competence_id: str, data: KeyCompetencePatch):

    kc = update_key_competence(key_competence_id, data)

    if kc is None:
        raise HTTPException(status_code=404, detail="Competencia clave no encontrada.")

    return kc


@router.delete("/{key_competence_id}", status_code=204)
def delete_one_key_competence(key_competence_id: str):

    if not delete_key_competence(key_competence_id):
        raise HTTPException(status_code=404, detail="Competencia clave no encontrada.")


@router.post("/{key_competence_id}/descriptors", response_model=OperationalDescriptor, status_code=201)
def post_descriptor(key_competence_id: str, data: OperationalDescriptorInput):

    return create_descriptor(key_competence_id, data)


@router.delete("/descriptors/{descriptor_id}", status_code=204)
def delete_one_descriptor(descriptor_id: str):

    if not delete_descriptor(descriptor_id):
        raise HTTPException(status_code=404, detail="Descriptor no encontrado.")
