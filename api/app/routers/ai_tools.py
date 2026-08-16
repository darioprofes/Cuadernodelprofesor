import base64
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from services.auth import require_auth
from services.anonimizador import anonimizar, anonimizar_docx, reintegrar_docx
from services.extraccion_docx import extraer_markdown_docx

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

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


@router.post("/anonimizar-docx")
async def anonimizar_docx_endpoint(archivo: UploadFile = File(...)):

    contenido_bytes = await archivo.read()

    try:
        contenido_final, mapa = anonimizar_docx(contenido_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se ha podido procesar el documento: {exc}")

    # Base64 en JSON, no Response binaria como /reintegrar-docx: aquí el
    # mapa puede tener muchas más entradas (todo lo detectado en el
    # documento entero) y no cabe con garantías en una cabecera HTTP.
    return {
        "anonimizado_docx_base64": base64.b64encode(contenido_final).decode("ascii"),
        "mapa": mapa,
    }


@router.post("/reintegrar-docx")
async def reintegrar_docx_endpoint(archivo: UploadFile = File(...), mapa: str = Form(...)):

    contenido_bytes = await archivo.read()

    try:
        mapa_dict = json.loads(mapa)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El mapa de reidentificación no es JSON válido.")

    try:
        contenido_final, sobrantes = reintegrar_docx(contenido_bytes, mapa_dict)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se ha podido procesar el documento: {exc}")

    # Sin estado en servidor, igual que /anonimizar: el mapa llega en la
    # propia petición (el frontend lo tenía en memoria desde el paso 1) y se
    # olvida en cuanto termina de responder.
    return Response(
        content=contenido_final,
        media_type=DOCX_MEDIA_TYPE,
        headers={"X-Codigos-Sin-Resolver": ",".join(sobrantes)},
    )
