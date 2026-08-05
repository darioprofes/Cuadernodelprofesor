from typing import Any

from fastapi import APIRouter, Depends

from services.auth import require_auth
from services.backup import export_all, import_all

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
