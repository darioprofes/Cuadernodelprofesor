from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from services.auth import require_auth
from services.app_db import get_blob, set_blob, VersionConflict, InvalidBlob

router = APIRouter(tags=["Base de datos"], dependencies=[Depends(require_auth)])


@router.get("/db")
def download_db():

    blob, version = get_blob()

    if blob is None:
        return Response(status_code=204)

    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={"X-Blob-Version": str(version)},
    )


@router.put("/db")
async def upload_db(request: Request):

    blob = await request.body()

    version_header = request.headers.get("x-blob-version")
    expected_version = int(version_header) if version_header is not None else None

    try:
        new_version = set_blob(blob, expected_version)
    except VersionConflict as exc:
        raise HTTPException(
            status_code=409,
            detail=f"La base de datos se ha modificado desde otra pestaña o dispositivo (versión actual: {exc.current_version}). Recarga la página antes de seguir editando para no perder esos cambios.",
        )
    except InvalidBlob as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"ok": True, "version": new_version}
