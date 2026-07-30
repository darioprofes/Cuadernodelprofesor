from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.categories import (
    Category,
    CategoryInput,
    CategoryPatch,
    list_categories,
    create_category,
    update_category,
    delete_category,
)

classes_router = APIRouter(prefix="/classes/{class_id}/categories", tags=["Categorías"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/categories", tags=["Categorías"], dependencies=[Depends(require_auth)])


@classes_router.get("", response_model=list[Category])
def get_categories(class_id: str):

    return list_categories(class_id)


@classes_router.post("", response_model=Category, status_code=201)
def post_category(class_id: str, data: CategoryInput):

    return create_category(class_id, data)


@router.patch("/{category_id}", response_model=Category)
def patch_category(category_id: str, data: CategoryPatch):

    category = update_category(category_id, data)

    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")

    return category


@router.delete("/{category_id}", status_code=204)
def delete_one_category(category_id: str):

    if not delete_category(category_id):
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
