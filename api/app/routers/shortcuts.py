from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.shortcuts import (
    Shortcut,
    ShortcutInput,
    ShortcutPatch,
    list_shortcuts,
    create_shortcut,
    update_shortcut,
    delete_shortcut,
)

router = APIRouter(prefix="/shortcuts", tags=["Accesos directos"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[Shortcut])
def get_shortcuts():

    return list_shortcuts()


@router.post("", response_model=Shortcut, status_code=201)
def post_shortcut(data: ShortcutInput):

    return create_shortcut(data)


@router.patch("/{shortcut_id}", response_model=Shortcut)
def patch_shortcut(shortcut_id: str, data: ShortcutPatch):

    result = update_shortcut(shortcut_id, data)

    if result is None:
        raise HTTPException(status_code=404, detail="Acceso directo no encontrado.")

    return result


@router.delete("/{shortcut_id}", status_code=204)
def delete_one_shortcut(shortcut_id: str):

    if not delete_shortcut(shortcut_id):
        raise HTTPException(status_code=404, detail="Acceso directo no encontrado.")
