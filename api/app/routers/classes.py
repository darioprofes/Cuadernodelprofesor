from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from services.auth import require_auth
from services.classes import (
    ClassData,
    ClassInput,
    ClassPatch,
    list_classes,
    get_class,
    create_class,
    update_class,
    delete_class,
)

years_router = APIRouter(prefix="/academic-years/{year_id}/classes", tags=["Clases"], dependencies=[Depends(require_auth)])
router = APIRouter(prefix="/classes", tags=["Clases"], dependencies=[Depends(require_auth)])


@years_router.get("", response_model=list[ClassData])
def get_classes(year_id: str):

    return list_classes(year_id)


@years_router.post("", response_model=ClassData, status_code=201)
def post_class(year_id: str, data: ClassInput):

    return create_class(year_id, data)


@router.get("/{class_id}", response_model=ClassData)
def get_one_class(class_id: str):

    cls = get_class(class_id)

    if cls is None:
        raise HTTPException(status_code=404, detail="Clase no encontrada.")

    return cls


@router.patch("/{class_id}", response_model=ClassData)
def patch_class(class_id: str, data: ClassPatch):

    status, cls = update_class(class_id, data)

    if status == "not_found":
        raise HTTPException(status_code=404, detail="Clase no encontrada.")

    if status == "conflict":
        return JSONResponse(
            status_code=409,
            content={
                "detail": "La clase se ha modificado desde otra pestaña o dispositivo.",
                "current": cls.model_dump(by_alias=True, mode="json"),
            },
        )

    return cls


@router.delete("/{class_id}", status_code=204)
def delete_one_class(class_id: str):

    if not delete_class(class_id):
        raise HTTPException(status_code=404, detail="Clase no encontrada.")
