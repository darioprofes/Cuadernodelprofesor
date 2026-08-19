# ==========================================================
# Generadores de prompts para IA (Herramientas IA)
# ==========================================================
#
# Primer generador: Unidad de programación. Reutiliza el mismo patrón ya
# validado con el Anonimizador -- inyectar datos reales (aquí: el currículo
# del curso) en el prompt, nunca dejar que la IA invente nada, y validar
# cualquier código que devuelva contra lo que existe de verdad en Postgres.

import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from services.auth import require_auth
from services.extraccion_docx import extraer_markdown_docx
from services.extraccion_pdf import extraer_texto_pdf
from services.extraccion_pptx import extraer_texto_pptx
from services.llm_client import esta_disponible as ia_local_esta_disponible
from services.prompts import instrumento_evaluacion as prompt_instrumento
from services.prompts.unidad_programacion import construir_prompt, procesar_respuesta

router = APIRouter(prefix="/prompts", tags=["Generadores de prompts"], dependencies=[Depends(require_auth)])


@router.get("/ia-local/estado")
async def estado_ia_local():
    return {"disponible": ia_local_esta_disponible()}

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
        unidad, codigos_descartados, instrumento_examen = procesar_respuesta(datos.course_id, datos.respuesta, datos.mapa)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"unidad": unidad, "codigosDescartados": codigos_descartados, "instrumentoExamen": instrumento_examen}


class GenerarInstrumentoRequest(BaseModel):
    course_id: str
    criterion_ids: list[str]
    tool_type: str
    contexto: Optional[str] = None
    num_niveles: Optional[int] = None


# La generación real puede tardar cerca de un minuto (llamada al ia-server).
# Se probó primero con una respuesta en streaming (espacios de relleno
# mientras se espera) para mantener viva una única conexión larga, pero en
# real seguía dando 502 -- Authentik corta la conexión con "profe" antes de
# tiempo (visto en los logs de NPM: "upstream prematurely closed connection
# while reading response header", y Authentik sin loggear nada esa ventana,
# 2026-08-19) y Cloudflare tiene su propio límite duro (~100s) que tampoco se
# puede ajustar. En vez de perseguir el timeout más corto entre tres proxies
# que no controlamos del todo, el POST devuelve un job_id al instante (nunca
# tarda más de lo que tarda construir el prompt) y el frontend pregunta el
# estado cada pocos segundos -- ninguna petición HTTP individual dura más de
# un segundo, así que da igual el timeout de cada capa.
_trabajos_instrumento: dict[str, dict] = {}
_trabajos_lock = threading.Lock()
_TTL_TRABAJO_SEGUNDOS = 3600


def _limpiar_trabajos_viejos():
    limite = time.monotonic() - _TTL_TRABAJO_SEGUNDOS
    for job_id in [jid for jid, t in _trabajos_instrumento.items() if t["creado"] < limite]:
        del _trabajos_instrumento[job_id]


def _ejecutar_generacion_instrumento(job_id: str, datos: GenerarInstrumentoRequest):
    try:
        instrumento, codigos_descartados = prompt_instrumento.generar_instrumento(
            datos.course_id, datos.criterion_ids, datos.tool_type, datos.contexto, datos.num_niveles,
        )
        resultado = {"estado": "listo", "instrumento": instrumento, "codigosDescartados": codigos_descartados}
    except ValueError as exc:
        resultado = {"estado": "error", "detail": str(exc)}
    except Exception as exc:
        resultado = {"estado": "error", "detail": f"Error inesperado generando el instrumento: {exc}"}

    with _trabajos_lock:
        if job_id in _trabajos_instrumento:
            _trabajos_instrumento[job_id].update(resultado)


@router.post("/instrumento-evaluacion/generar", status_code=202)
async def generar_prompt_instrumento(datos: GenerarInstrumentoRequest):
    job_id = str(uuid.uuid4())
    with _trabajos_lock:
        _limpiar_trabajos_viejos()
        _trabajos_instrumento[job_id] = {"estado": "en_progreso", "creado": time.monotonic()}

    threading.Thread(target=_ejecutar_generacion_instrumento, args=(job_id, datos), daemon=True).start()
    return {"jobId": job_id}


@router.get("/instrumento-evaluacion/generar/{job_id}")
async def estado_prompt_instrumento(job_id: str):
    with _trabajos_lock:
        trabajo = _trabajos_instrumento.get(job_id)
    if trabajo is None:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado (o ya expiró).")
    return trabajo


# Vía alternativa a la IA local -- por si va lenta o no está disponible, el
# mismo prompt para copiar y pegar en cualquier IA online (como ya hace el
# generador de Unidad de programación/SA), sin llamar al ia-server para
# nada. Los dos pasos son rápidos de por sí (solo texto, sin IA) -- no hace
# falta el patrón job+polling aquí.
@router.post("/instrumento-evaluacion/prompt")
async def generar_prompt_instrumento_texto(datos: GenerarInstrumentoRequest):
    try:
        prompt = prompt_instrumento.construir_prompt(
            datos.course_id, datos.criterion_ids, datos.tool_type, datos.contexto, datos.num_niveles,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"prompt": prompt}


class ValidarInstrumentoRequest(BaseModel):
    course_id: str
    tool_type: str
    respuesta: str


@router.post("/instrumento-evaluacion/validar")
async def validar_respuesta_instrumento(datos: ValidarInstrumentoRequest):
    try:
        instrumento, codigos_descartados = prompt_instrumento.procesar_respuesta(
            datos.course_id, datos.tool_type, datos.respuesta,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"instrumento": instrumento, "codigosDescartados": codigos_descartados}
