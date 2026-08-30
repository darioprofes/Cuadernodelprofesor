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
from services.courses import get_course
from services.extraccion_docx import extraer_markdown_docx
from services.extraccion_pdf import extraer_texto_pdf
from services.extraccion_pptx import extraer_texto_pptx
from services.llm_client import esta_disponible as ia_local_esta_disponible
from services.llm_client import groq_disponible
from services.prompts import adaptacion_material as prompt_adaptacion
from services.prompts import deteccion_curricular as prompt_deteccion
from services.prompts import instrumento_evaluacion as prompt_instrumento
from services.prompts.situacion_aprendizaje import (
    SADemasiadoGrandeError,
    TrabajoCanceladoError,
    construir_prompt,
    generar_situacion_aprendizaje_groq,
    generar_situacion_aprendizaje_por_partes_groq,
    procesar_respuesta,
)

router = APIRouter(prefix="/prompts", tags=["Generadores de prompts"], dependencies=[Depends(require_auth)])


@router.get("/ia-local/estado")
async def estado_ia_local():
    return {"disponible": ia_local_esta_disponible()}


@router.get("/groq/estado")
async def estado_groq():
    return {"disponible": groq_disponible()}

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


# Genera la SA automáticamente con Groq en vez de copiar/pegar -- rápido
# (unos segundos, incluso con el resumen previo si hace falta) así que,
# igual que el resto de endpoints de Groq, no necesita el patrón
# job+polling que sí hace falta con el ia-server local.
@router.post("/unidad-programacion/generar-groq")
async def generar_unidad_groq(datos: GenerarUnidadRequest):

    try:
        unidad, codigos_descartados, documento_resumido = generar_situacion_aprendizaje_groq(
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
    except SADemasiadoGrandeError as exc:
        # "code" aparte del mensaje -- para que el frontend pueda ofrecer
        # el generador por partes como alternativa sin tener que reconocer
        # el texto en español del error.
        raise HTTPException(status_code=400, detail={"code": "demasiado_grande", "message": str(exc), "estimado": exc.estimado})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "unidad": unidad,
        "codigosDescartados": codigos_descartados,
        "documentoResumido": documento_resumido,
    }


# Generación por partes (boceto + una llamada por sesión + producto +
# examen) -- fallback para cuando /generar-groq avisa de que la SA no cabe
# en el presupuesto de la capa gratuita de Groq. A diferencia de esa vía
# (rápida, síncrona), esta encadena varias llamadas y puede esperar varios
# segundos (a veces minutos u horas, si el cupo diario de Groq está
# agotado -- ver TrabajoCanceladoError/_ESPERA_MAXIMA_ACUMULADA_SEGUNDOS en
# situacion_aprendizaje.py) entre alguna de ellas si topa con el límite de
# tasa -- mismo patrón job+polling que instrumento-evaluacion/generar (ver
# esa nota más abajo): el POST devuelve al instante, el frontend sondea el
# progreso.
_trabajos_sa: dict[str, dict] = {}

# Un threading.Event por trabajo en curso, para poder cancelarlo desde
# fuera del hilo que lo ejecuta (ver POST /trabajos/{job_id}/cancelar). Se
# guarda aparte de _trabajos_sa/_trabajos_instrumento (y no dentro de esos
# dicts) porque un Event no es serializable a JSON y esos dicts sí se
# devuelven tal cual como respuesta HTTP.
_eventos_cancelacion: dict[str, threading.Event] = {}


def _titulo_curso(course_id: str) -> str:
    try:
        curso = get_course(course_id)
    except Exception:
        curso = None
    return f"{curso.level} · {curso.subject}" if curso else "Curso no encontrado"


def _ejecutar_generacion_sa_por_partes(job_id: str, datos: GenerarUnidadRequest, evento: threading.Event):

    def on_progreso(mensaje, espera_hasta=None):
        with _trabajos_lock:
            if job_id in _trabajos_sa:
                _trabajos_sa[job_id]["mensaje"] = mensaje
                # None en cualquier aviso que no sea una espera real -- borra
                # la cuenta atrás de un paso anterior en vez de dejarla
                # colgada mostrando un tiempo que ya no significa nada.
                _trabajos_sa[job_id]["esperaHasta"] = espera_hasta

    try:
        unidad, codigos_descartados = generar_situacion_aprendizaje_por_partes_groq(
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
            on_progreso=on_progreso,
            debe_cancelar=evento.is_set,
        )
        resultado = {
            "estado": "listo",
            "unidad": unidad,
            "codigosDescartados": codigos_descartados,
        }
    except TrabajoCanceladoError:
        resultado = {"estado": "cancelado", "detail": "Cancelado por el usuario."}
    except ValueError as exc:
        resultado = {"estado": "error", "detail": str(exc)}
    except Exception as exc:
        resultado = {"estado": "error", "detail": f"Error inesperado generando la situación de aprendizaje: {exc}"}

    with _trabajos_lock:
        if job_id in _trabajos_sa:
            _trabajos_sa[job_id].update(resultado)
        _eventos_cancelacion.pop(job_id, None)


@router.post("/unidad-programacion/generar-groq-por-partes", status_code=202)
async def generar_unidad_groq_por_partes(datos: GenerarUnidadRequest):
    job_id = str(uuid.uuid4())
    evento = threading.Event()
    with _trabajos_lock:
        _limpiar_trabajos_viejos(_trabajos_sa)
        _trabajos_sa[job_id] = {
            "estado": "en_progreso",
            "mensaje": "Empezando...",
            "creado": time.monotonic(),
            "tipo": "sa",
            "titulo": f"Situación de aprendizaje · {_titulo_curso(datos.course_id)}",
            "iniciado": time.time(),
            # Para poder guardar el resultado como unidad de programación
            # directamente desde la cola de trabajos (ver TrabajosIAPanel.tsx
            # en el frontend) sin tener que navegar antes a ese curso.
            "courseId": datos.course_id,
        }
        _eventos_cancelacion[job_id] = evento

    threading.Thread(target=_ejecutar_generacion_sa_por_partes, args=(job_id, datos, evento), daemon=True).start()
    return {"jobId": job_id}


@router.get("/unidad-programacion/generar-groq-por-partes/{job_id}")
async def estado_unidad_groq_por_partes(job_id: str):
    with _trabajos_lock:
        trabajo = _trabajos_sa.get(job_id)
    if trabajo is None:
        # Los trabajos viven solo en memoria (ver _trabajos_sa más arriba) --
        # un reinicio del contenedor a mitad de una generación los borra sin
        # dejar rastro (nos pasó de verdad una vez). No hay forma de
        # distinguir con certeza "expiró por TTL" de "se perdió en un
        # reinicio" sin persistirlo en base de datos, así que el mensaje
        # cubre ambos en vez de sugerir solo el caso menos probable.
        raise HTTPException(
            status_code=404,
            detail="No se encuentra este trabajo -- puede que haya expirado (más de una hora) o que el "
            "servidor se haya reiniciado a mitad de la generación. Inténtalo de nuevo.",
        )
    return trabajo


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
    # Texto (pegado o extraído con /prompts/extraer-documento) de lo que se
    # ha visto de verdad en clase -- opcional, ver nota en
    # instrumento_evaluacion.py::construir_prompt.
    documento: Optional[str] = None


class SugerirCriteriosRequest(BaseModel):
    course_id: str
    descripcion: str
    documento: Optional[str] = None


# Paso previo opcional a /instrumento-evaluacion/generar-groq -- ver la nota
# de cabecera de sugerir_criterios_groq() en instrumento_evaluacion.py. Solo
# por Groq (rápido, sin patrón job+polling) -- no se ofrece IA local/online
# para este paso.
@router.post("/instrumento-evaluacion/sugerir-criterios-groq")
async def sugerir_criterios_instrumento_groq(datos: SugerirCriteriosRequest):
    try:
        criterion_ids, codigos_descartados = prompt_instrumento.sugerir_criterios_groq(
            datos.course_id, datos.descripcion, datos.documento,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"criterionIds": criterion_ids, "codigosDescartados": codigos_descartados}


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


def _limpiar_trabajos_viejos(trabajos: dict):
    # Recibe el diccionario a limpiar en vez de tener _trabajos_instrumento
    # escrito a fuego -- se llama tanto para ese diccionario como para
    # _trabajos_sa (generación de SA por partes), y antes de parametrizarlo
    # _trabajos_sa nunca se purgaba: cada generación por partes dejaba un
    # trabajo colgado en memoria para siempre.
    limite = time.monotonic() - _TTL_TRABAJO_SEGUNDOS
    for job_id in [jid for jid, t in trabajos.items() if t["creado"] < limite]:
        del trabajos[job_id]


def _ejecutar_generacion_instrumento(job_id: str, datos: GenerarInstrumentoRequest):
    try:
        instrumento, codigos_descartados = prompt_instrumento.generar_instrumento(
            datos.course_id, datos.criterion_ids, datos.tool_type, datos.contexto, datos.num_niveles,
            datos.documento,
        )
        resultado = {"estado": "listo", "instrumento": instrumento, "codigosDescartados": codigos_descartados}
    except ValueError as exc:
        resultado = {"estado": "error", "detail": str(exc)}
    except Exception as exc:
        resultado = {"estado": "error", "detail": f"Error inesperado generando el instrumento: {exc}"}

    with _trabajos_lock:
        actual = _trabajos_instrumento.get(job_id)
        # Esta generación es UNA sola llamada bloqueante al ia-server, sin
        # ningún punto intermedio donde comprobar cancelación (a diferencia
        # de la SA por partes, encadenada en pasos) -- si el usuario ya
        # canceló mientras tanto (ver POST .../cancelar, que marca
        # "cancelado" al momento), no pisar ese estado con el resultado
        # tardío de una llamada que ya no le importa a nadie.
        if actual is not None and actual.get("estado") != "cancelado":
            actual.update(resultado)
        _eventos_cancelacion.pop(job_id, None)


@router.post("/instrumento-evaluacion/generar", status_code=202)
async def generar_prompt_instrumento(datos: GenerarInstrumentoRequest):
    job_id = str(uuid.uuid4())
    with _trabajos_lock:
        _limpiar_trabajos_viejos(_trabajos_instrumento)
        _trabajos_instrumento[job_id] = {
            "estado": "en_progreso",
            "creado": time.monotonic(),
            "tipo": "instrumento",
            "titulo": f"Instrumento de evaluación ({datos.tool_type}) · {_titulo_curso(datos.course_id)}",
            "iniciado": time.time(),
            "courseId": datos.course_id,
        }
        _eventos_cancelacion[job_id] = threading.Event()

    threading.Thread(target=_ejecutar_generacion_instrumento, args=(job_id, datos), daemon=True).start()
    return {"jobId": job_id}


@router.get("/instrumento-evaluacion/generar/{job_id}")
async def estado_prompt_instrumento(job_id: str):
    with _trabajos_lock:
        trabajo = _trabajos_instrumento.get(job_id)
    if trabajo is None:
        raise HTTPException(
            status_code=404,
            detail="No se encuentra este trabajo -- puede que haya expirado (más de una hora) o que el "
            "servidor se haya reiniciado a mitad de la generación. Inténtalo de nuevo.",
        )
    return trabajo


# A diferencia del ia-server local (lento, necesita el patrón job+polling de
# arriba), Groq responde en segundos -- una petición síncrona normal no
# tiene riesgo de que ningún proxy la corte por tardar demasiado.
@router.post("/instrumento-evaluacion/generar-groq")
async def generar_prompt_instrumento_groq(datos: GenerarInstrumentoRequest):
    try:
        instrumento, codigos_descartados = prompt_instrumento.generar_instrumento_groq(
            datos.course_id, datos.criterion_ids, datos.tool_type, datos.contexto, datos.num_niveles,
            datos.documento,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"instrumento": instrumento, "codigosDescartados": codigos_descartados}


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
            datos.documento,
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


# ==========================================================
# Adaptación de material (NEAE / repetidores / programas específicos)
# ==========================================================
#
# El frontend ya ha anonimizado material + notas del alumno (vía
# /ai-tools/anonimizar) y el profesor ya lo ha revisado ANTES de llamar a
# cualquiera de estos tres endpoints -- este router nunca ve el mapa de
# anonimización ni datos personales en crudo, solo el texto ya limpio.
# Mismas tres vías que el instrumento de evaluación (local con job+polling,
# Groq síncrono, prompt para copiar/pegar online).

class GenerarAdaptacionRequest(BaseModel):
    material: str
    notas_alumno: str


_trabajos_adaptacion: dict[str, dict] = {}


def _ejecutar_generacion_adaptacion(job_id: str, datos: GenerarAdaptacionRequest):
    try:
        resultado_texto = prompt_adaptacion.generar_adaptacion(datos.material, datos.notas_alumno)
        resultado = {"estado": "listo", "resultado": resultado_texto}
    except ValueError as exc:
        resultado = {"estado": "error", "detail": str(exc)}
    except Exception as exc:
        resultado = {"estado": "error", "detail": f"Error inesperado adaptando el material: {exc}"}

    with _trabajos_lock:
        actual = _trabajos_adaptacion.get(job_id)
        # Misma llamada única bloqueante que el instrumento por IA local --
        # ver el comentario equivalente en _ejecutar_generacion_instrumento.
        if actual is not None and actual.get("estado") != "cancelado":
            actual.update(resultado)
        _eventos_cancelacion.pop(job_id, None)


@router.post("/adaptacion-material/generar", status_code=202)
async def generar_adaptacion_material(datos: GenerarAdaptacionRequest):
    job_id = str(uuid.uuid4())
    with _trabajos_lock:
        _limpiar_trabajos_viejos(_trabajos_adaptacion)
        _trabajos_adaptacion[job_id] = {
            "estado": "en_progreso",
            "creado": time.monotonic(),
            "tipo": "adaptacion",
            "titulo": "Adaptación de material",
            "iniciado": time.time(),
        }
        _eventos_cancelacion[job_id] = threading.Event()

    threading.Thread(target=_ejecutar_generacion_adaptacion, args=(job_id, datos), daemon=True).start()
    return {"jobId": job_id}


@router.get("/adaptacion-material/generar/{job_id}")
async def estado_adaptacion_material(job_id: str):
    with _trabajos_lock:
        trabajo = _trabajos_adaptacion.get(job_id)
    if trabajo is None:
        raise HTTPException(
            status_code=404,
            detail="No se encuentra este trabajo -- puede que haya expirado (más de una hora) o que el "
            "servidor se haya reiniciado a mitad de la generación. Inténtalo de nuevo.",
        )
    return trabajo


@router.post("/adaptacion-material/generar-groq")
async def generar_adaptacion_material_groq(datos: GenerarAdaptacionRequest):
    try:
        resultado_texto = prompt_adaptacion.generar_adaptacion_groq(datos.material, datos.notas_alumno)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"resultado": resultado_texto}


@router.post("/adaptacion-material/prompt")
async def generar_adaptacion_material_texto(datos: GenerarAdaptacionRequest):
    prompt = prompt_adaptacion.construir_prompt(datos.material, datos.notas_alumno)
    return {"prompt": prompt}


# ==========================================================
# Detección de elementos curriculares movilizados por un documento
# ==========================================================
#
# Sin datos personales de por medio -- no pasa por el Anonimizador en
# ningún punto (a diferencia de adaptacion-material). Mismas tres vías que
# el resto de generadores nuevos de esta sesión.

class DetectarElementosRequest(BaseModel):
    course_id: str
    documento: str
    tipos: list[str]


def _resultado_deteccion(documento_anotado, elementos, codigos_descartados):
    return {
        "documentoAnotado": documento_anotado,
        "elementos": elementos,
        "codigosDescartados": codigos_descartados,
    }


_trabajos_deteccion: dict[str, dict] = {}


def _ejecutar_deteccion_curricular(job_id: str, datos: DetectarElementosRequest):
    try:
        documento_anotado, elementos, codigos_descartados = prompt_deteccion.detectar_elementos(
            datos.course_id, datos.documento, datos.tipos,
        )
        resultado = {"estado": "listo", **_resultado_deteccion(documento_anotado, elementos, codigos_descartados)}
    except ValueError as exc:
        resultado = {"estado": "error", "detail": str(exc)}
    except Exception as exc:
        resultado = {"estado": "error", "detail": f"Error inesperado detectando elementos curriculares: {exc}"}

    with _trabajos_lock:
        actual = _trabajos_deteccion.get(job_id)
        # Misma llamada única bloqueante que instrumento/adaptación -- ver
        # el comentario equivalente en _ejecutar_generacion_instrumento.
        if actual is not None and actual.get("estado") != "cancelado":
            actual.update(resultado)
        _eventos_cancelacion.pop(job_id, None)


@router.post("/deteccion-curricular/generar", status_code=202)
async def generar_deteccion_curricular(datos: DetectarElementosRequest):
    job_id = str(uuid.uuid4())
    with _trabajos_lock:
        _limpiar_trabajos_viejos(_trabajos_deteccion)
        _trabajos_deteccion[job_id] = {
            "estado": "en_progreso",
            "creado": time.monotonic(),
            "tipo": "deteccion",
            "titulo": f"Detección curricular · {_titulo_curso(datos.course_id)}",
            "iniciado": time.time(),
            "courseId": datos.course_id,
        }
        _eventos_cancelacion[job_id] = threading.Event()

    threading.Thread(target=_ejecutar_deteccion_curricular, args=(job_id, datos), daemon=True).start()
    return {"jobId": job_id}


@router.get("/deteccion-curricular/generar/{job_id}")
async def estado_deteccion_curricular(job_id: str):
    with _trabajos_lock:
        trabajo = _trabajos_deteccion.get(job_id)
    if trabajo is None:
        raise HTTPException(
            status_code=404,
            detail="No se encuentra este trabajo -- puede que haya expirado (más de una hora) o que el "
            "servidor se haya reiniciado a mitad de la generación. Inténtalo de nuevo.",
        )
    return trabajo


@router.post("/deteccion-curricular/generar-groq")
async def generar_deteccion_curricular_groq(datos: DetectarElementosRequest):
    try:
        documento_anotado, elementos, codigos_descartados = prompt_deteccion.detectar_elementos_groq(
            datos.course_id, datos.documento, datos.tipos,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _resultado_deteccion(documento_anotado, elementos, codigos_descartados)


@router.post("/deteccion-curricular/prompt")
async def generar_deteccion_curricular_texto(datos: DetectarElementosRequest):
    try:
        prompt = prompt_deteccion.construir_prompt(datos.course_id, datos.documento, datos.tipos)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"prompt": prompt}


class ValidarDeteccionRequest(BaseModel):
    course_id: str
    tipos: list[str]
    respuesta: str


@router.post("/deteccion-curricular/validar")
async def validar_deteccion_curricular(datos: ValidarDeteccionRequest):
    try:
        documento_anotado, elementos, codigos_descartados = prompt_deteccion.procesar_respuesta(
            datos.course_id, datos.tipos, datos.respuesta,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _resultado_deteccion(documento_anotado, elementos, codigos_descartados)


# ==========================================================
# Cola de trabajos en segundo plano (SA por partes + instrumento por IA
# local) -- vista unificada para el chip de avisos del frontend. Solo
# expone los campos ligeros (nunca "unidad"/"instrumento", el contenido
# generado completo) -- para ver o guardar el resultado de un trabajo
# "listo" ya están los endpoints .../generar-groq-por-partes/{job_id} y
# .../instrumento-evaluacion/generar/{job_id} de arriba.
# ==========================================================
_CAMPOS_LISTADO_TRABAJO = ("estado", "titulo", "tipo", "iniciado", "mensaje", "detail", "courseId", "esperaHasta")


@router.get("/trabajos")
async def listar_trabajos():
    with _trabajos_lock:
        todos = (
            list(_trabajos_sa.items()) + list(_trabajos_instrumento.items())
            + list(_trabajos_adaptacion.items()) + list(_trabajos_deteccion.items())
        )
        trabajos = [
            {"jobId": job_id, **{campo: t[campo] for campo in _CAMPOS_LISTADO_TRABAJO if campo in t}}
            for job_id, t in todos
        ]
    trabajos.sort(key=lambda t: t.get("iniciado", 0), reverse=True)
    return {"trabajos": trabajos}


@router.post("/trabajos/{job_id}/cancelar")
async def cancelar_trabajo(job_id: str):
    with _trabajos_lock:
        trabajo = (
            _trabajos_sa.get(job_id) or _trabajos_instrumento.get(job_id)
            or _trabajos_adaptacion.get(job_id) or _trabajos_deteccion.get(job_id)
        )
        if trabajo is None:
            raise HTTPException(status_code=404, detail="No se encuentra este trabajo.")
        if trabajo["estado"] != "en_progreso":
            return {"estado": trabajo["estado"]}

        evento = _eventos_cancelacion.get(job_id)
        if evento is not None:
            evento.set()

        if trabajo.get("tipo") in ("instrumento", "adaptacion", "deteccion"):
            # La generación con IA local es una única llamada bloqueante,
            # sin ningún paso intermedio donde comprobar el Event -- se
            # marca cancelado ya mismo en vez de esperar a que el ia-server
            # responda por su cuenta (puede tardar cerca de un minuto). El
            # hilo de fondo, al terminar, ve el estado ya en "cancelado" y
            # no lo pisa (ver _ejecutar_generacion_instrumento/_ejecutar_generacion_adaptacion).
            trabajo["estado"] = "cancelado"
            trabajo["detail"] = "Cancelado por el usuario."

    return {"estado": "cancelado"}
