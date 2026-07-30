from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.basic_knowledge import (
    BasicKnowledge,
    BasicKnowledgeInput,
    BasicKnowledgePatch,
    list_basic_knowledge,
    create_basic_knowledge,
    update_basic_knowledge,
    delete_basic_knowledge,
)

courses_router = APIRouter(prefix="/courses/{course_id}/basic-knowledge", tags=["Conocimientos básicos"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/basic-knowledge", tags=["Conocimientos básicos"], dependencies=[Depends(require_auth)])


@courses_router.get("", response_model=list[BasicKnowledge])
def get_items(course_id: str):

    return list_basic_knowledge(course_id)


@courses_router.post("", response_model=BasicKnowledge, status_code=201)
def post_item(course_id: str, data: BasicKnowledgeInput):

    return create_basic_knowledge(course_id, data)


@router.patch("/{item_id}", response_model=BasicKnowledge)
def patch_item(item_id: str, data: BasicKnowledgePatch):

    item = update_basic_knowledge(item_id, data)

    if item is None:
        raise HTTPException(status_code=404, detail="Conocimiento básico no encontrado.")

    return item


@router.delete("/{item_id}", status_code=204)
def delete_one_item(item_id: str):

    if not delete_basic_knowledge(item_id):
        raise HTTPException(status_code=404, detail="Conocimiento básico no encontrado.")
