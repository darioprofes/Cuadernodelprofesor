from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from services.auth import require_auth
from services.anonimizador import anonimizar
from services.extraccion_docx import extraer_markdown_docx

router = APIRouter(prefix="/ai-tools", tags=["Herramientas IA"], dependencies=[Depends(require_auth)])


class AnonimizarRequest(BaseModel):
    texto: str


@router.post("/anonimizar")
async def anonimizar_documento(datos: AnonimizarRequest):

    # Sin estado en servidor: el mapa código -> dato real se devuelve una
    # única vez y no se guarda en ningún sitio -- el frontend decide qué
    # hacer con él (en memoria, nunca persistido) para poder reintegrarlo
    # más tarde sin tener que guardar los códigos eternamente.
    anonimizado, mapa = anonimizar(datos.texto)

    return {"anonimizado": anonimizado, "mapa": mapa}


@router.post("/extraer-docx")
async def extraer_docx(archivo: UploadFile = File(...)):

    contenido_bytes = await archivo.read()

    try:
        texto = extraer_markdown_docx(contenido_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se ha podido leer el documento: {exc}")

    return {"texto": texto}
