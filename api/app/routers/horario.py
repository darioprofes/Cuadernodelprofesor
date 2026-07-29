from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from services.auth import require_auth
from services.horario_pdf import extraer_filas_pdf

router = APIRouter(prefix="/horario", tags=["Horario"], dependencies=[Depends(require_auth)])


@router.post("/importar-pdf")
async def importar_pdf(archivo: UploadFile = File(...)):

    contenido_bytes = await archivo.read()

    try:
        filas, errores = extraer_filas_pdf(contenido_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se ha podido leer el PDF: {exc}")

    return {"filas": filas, "errores": errores}
