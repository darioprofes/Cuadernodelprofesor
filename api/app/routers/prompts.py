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
from services.prompts.instrumento_evaluacion import generar_instrumento
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
            texto, num_unidades, con_vision, vision_fallida = extraer_texto_pptx(contenido_bytes)
            aviso = _construir_aviso(texto, num_unidades, "diapositiva", con_vision, vision_fallida)

        elif extension == ".pdf":
            texto, num_unidades, con_vision, vision_fallida = extraer_texto_pdf(contenido_bytes)
            aviso = _construir_aviso(texto, num_unidades, "página", con_vision, vision_fallida)

        else:
            raise HTTPException(status_code=400, detail="Formato no admitido. Sube un .docx, .pptx o .pdf.")

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
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
        f"contenido antes de generar el prompt."
    )


def _construir_aviso(texto, num_unidades, nombre_unidad, con_vision, vision_fallida):

    partes = []

    if con_vision:
        lista = ", ".join(str(n) for n in con_vision)
        partes.append(
            f"Se ha usado IA de visión para leer {len(con_vision)} {nombre_unidad}(s) con poco "
            f"texto ({lista}). Revisa que la transcripción sea correcta antes de continuar."
        )

    if vision_fallida:
        lista = ", ".join(str(n) for n in vision_fallida)
        partes.append(
            f"No se ha podido usar IA de visión (servidor no disponible) para {len(vision_fallida)} "
            f"{nombre_unidad}(s) con poco texto ({lista}). Revisa que no falte contenido."
        )

    if not con_vision:
        aviso_generico = _aviso_texto_escaso(texto, num_unidades, nombre_unidad)
        if aviso_generico:
            partes.append(aviso_generico)

    return " ".join(partes) if partes else None


class ActividadObligatoria(BaseModel):
    texto: str
    sesion: Optional[int] = None


class GenerarUnidadRequest(BaseModel):
    course_id: str
    documento: str
    # "documento" (Modo A, por defecto) o "descripcion" (Modo B) -- ver
    # nota de cabecera en construir_prompt().
    modo: str = "documento"
    # Bloque 1 del wizard -- ver nota de cabecera en construir_prompt().
    sesiones_modo: str = "ia"
    sesiones_fijo: Optional[int] = None
    sesiones_min: Optional[int] = None
    sesiones_max: Optional[int] = None
    caracteristicas_grupo: list[str] = []
    # Bloque 2 del wizard -- ver nota de cabecera en construir_prompt().
    tipos_actividad: list[str] = []
    estructuras_cooperativas: list[str] = []
    actividades_obligatorias: list[ActividadObligatoria] = []
    estructura_sesion: str = "ia"
    estructura_sesion_detalle: Optional[str] = None
    progresion_autonomia: str = "ia"
    atencion_diversidad: str = "diferenciadas"
    atencion_diversidad_detalle: Optional[str] = None
    class_id: Optional[str] = None
    # Bloque 3 (Evaluación). El profesor elige el tipo de producto y el
    # formato de examen de sendas listas cerradas en el frontend -- la IA ya
    # no decide ninguno de los dos, solo redacta su contenido. Ambos son
    # opcionales (toggle); producto_incluido nace marcado en el wizard
    # porque casi siempre tiene sentido, examen_incluido no.
    producto_incluido: bool = True
    producto_tipo: Optional[str] = None
    examen_incluido: bool = False
    examen_formato: Optional[str] = None
    # Duración real de sesión (no hay minutos guardados en el horario, lo
    # indica el profesor a mano) y diagnóstico de conocimientos previos
    # opcional -- ver nota de cabecera en construir_prompt().
    duracion_sesion_min: int = 55
    diagnostico_incluido: bool = False
    diagnostico_minutos: Optional[int] = None


@router.post("/unidad-programacion/generar")
async def generar_prompt_unidad(datos: GenerarUnidadRequest):

    try:
        prompt, mapa = construir_prompt(
            datos.course_id, datos.documento, datos.modo,
            datos.sesiones_modo, datos.sesiones_fijo, datos.sesiones_min, datos.sesiones_max,
            datos.caracteristicas_grupo,
            datos.tipos_actividad, datos.estructuras_cooperativas,
            [a.model_dump() for a in datos.actividades_obligatorias],
            datos.estructura_sesion, datos.estructura_sesion_detalle,
            datos.progresion_autonomia,
            datos.atencion_diversidad, datos.atencion_diversidad_detalle,
            datos.class_id,
            datos.producto_incluido, datos.producto_tipo,
            datos.examen_incluido, datos.examen_formato,
            datos.duracion_sesion_min,
            datos.diagnostico_incluido, datos.diagnostico_minutos,
        )
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


class GenerarInstrumentoRequest(BaseModel):
    course_id: str
    criterion_ids: list[str]
    tool_type: str
    contexto: Optional[str] = None
    num_niveles: Optional[int] = None


@router.post("/instrumento-evaluacion/generar")
async def generar_prompt_instrumento(datos: GenerarInstrumentoRequest):

    try:
        instrumento, codigos_descartados = generar_instrumento(
            datos.course_id, datos.criterion_ids, datos.tool_type, datos.contexto, datos.num_niveles,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"instrumento": instrumento, "codigosDescartados": codigos_descartados}
