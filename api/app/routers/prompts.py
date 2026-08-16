# ==========================================================
# Generadores de prompts para IA (Herramientas IA)
# ==========================================================
#
# Primer generador: Unidad de programación. Reutiliza el mismo patrón ya
# validado con el Anonimizador -- inyectar datos reales (aquí: el currículo
# del curso) en el prompt, nunca dejar que la IA invente nada, y validar
# cualquier código que devuelva contra lo que existe de verdad en Postgres.

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from services.auth import require_auth
from services.extraccion_docx import extraer_markdown_docx
from services.extraccion_pdf import extraer_texto_pdf
from services.extraccion_pptx import extraer_texto_pptx
from services.prompts.unidad_programacion import construir_prompt, procesar_respuesta

router = APIRouter(prefix="/prompts", tags=["Generadores de prompts"], dependencies=[Depends(require_auth)])

# Por debajo de esto, caracteres de media por página/diapositiva, se avisa de
# que puede faltar contenido (probable diapositiva/página hecha de imágenes,
# sin capa de texto) -- deliberadamente bajo para no avisar de más en
# diapositivas legítimamente cortas (un título + una línea).
_UMBRAL_CARACTERES_POR_UNIDAD = 30


@router.post("/extraer-documento")
async def extraer_documento(archivo: UploadFile = File(...)):

    extension = Path(archivo.filename or "").suffix.lower()
    contenido_bytes = await archivo.read()

    try:
        if extension == ".docx":
            texto = extraer_markdown_docx(contenido_bytes)
            aviso = None

        elif extension == ".pptx":
            texto, num_unidades = extraer_texto_pptx(contenido_bytes)
            aviso = _aviso_texto_escaso(texto, num_unidades, "diapositiva")

        elif extension == ".pdf":
            texto, num_unidades = extraer_texto_pdf(contenido_bytes)
            aviso = _aviso_texto_escaso(texto, num_unidades, "página")

        else:
            raise HTTPException(status_code=400, detail="Formato no admitido. Sube un .docx, .pptx o .pdf.")

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se ha podido leer el documento: {exc}")

    return {"texto": texto, "aviso": aviso}


def _aviso_texto_escaso(texto, num_unidades, nombre_unidad):

    if num_unidades == 0:
        return None

    caracteres_por_unidad = len(texto) / num_unidades

    if caracteres_por_unidad >= _UMBRAL_CARACTERES_POR_UNIDAD:
        return None

    return (
        f"El documento tiene muy poco texto extraíble por {nombre_unidad} "
        f"(puede que algunas sean imágenes o capturas). Revisa que no falte "
        f"contenido antes de generar el prompt -- esta herramienta no hace "
        f"OCR ni describe imágenes."
    )


class GenerarUnidadRequest(BaseModel):
    course_id: str
    documento: str


@router.post("/unidad-programacion/generar")
async def generar_prompt_unidad(datos: GenerarUnidadRequest):

    try:
        prompt, mapa = construir_prompt(datos.course_id, datos.documento)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # "mapa" siempre vacío hoy (ver nota en construir_prompt) -- se
    # mantiene en la respuesta por si esta decisión se revisa más adelante,
    # no porque se use ahora mismo.
    return {"prompt": prompt, "mapa": mapa}


class ValidarUnidadRequest(BaseModel):
    course_id: str
    respuesta: str
    mapa: dict[str, str] = {}


@router.post("/unidad-programacion/validar")
async def validar_respuesta_unidad(datos: ValidarUnidadRequest):

    try:
        unidad, codigos_descartados = procesar_respuesta(datos.course_id, datos.respuesta, datos.mapa)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"unidad": unidad, "codigosDescartados": codigos_descartados}
