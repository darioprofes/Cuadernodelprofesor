from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services.auth import require_auth
from services.anonimizador import anonimizar

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
