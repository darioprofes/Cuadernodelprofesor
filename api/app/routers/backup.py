from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from services.auth import require_auth
from services.backup import export_all, import_all, list_pending_restores, delete_pending_restore

router = APIRouter(prefix="/backup", tags=["Copia de seguridad"], dependencies=[Depends(require_auth)])


@router.get("/export")
def get_export() -> dict[str, list[dict[str, Any]]]:

    return export_all()


# Todo o nada, sin control de versión: es una restauración explícita y
# deliberada (mismo criterio que tenía la importación del sistema de blob
# viejo) — se acepta pase lo que pase en el estado actual, no tiene sentido
# bloquearla por un conflicto.
@router.post("/import")
def post_import(dump: dict[str, list[dict[str, Any]]]):

    import_all(dump)

    return {"ok": True}


# Copias de seguridad que el servidor se hizo A SÍ MISMO justo antes de
# sustituir sus datos por una restauración desde escritorio (ver
# /root/scripts/restore_from_desktop.sh) -- quedan pendientes de que el
# profesor confirme que todo está bien y las borre, o las use para
# deshacer si algo salió mal. No son las copias automáticas normales
# (esas van cifradas a GitHub, nunca pasan por aquí).
@router.get("/pending-restores")
def get_pending_restores() -> list[dict[str, Any]]:

    return list_pending_restores()


@router.delete("/pending-restores/{filename}")
def delete_pending_restore_route(filename: str):

    if not delete_pending_restore(filename):
        raise HTTPException(status_code=404, detail="No se encuentra esa copia pendiente.")

    return {"ok": True}
