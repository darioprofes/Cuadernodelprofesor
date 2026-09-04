# ==========================================================
# Generador de prompt: Instrumento de evaluación
# ==========================================================
#
# A diferencia del resto de generadores (que arman un prompt para copiar y
# pegar en una IA online), este llama DIRECTAMENTE al ia-server -- criterios
# de evaluación no son un dato personal que proteger, así que ni hace falta
# anonimizar ni tiene sentido el paso de copiar/pegar (ver plan general,
# punto 6: "IA local solo para los aptos"). El resultado se devuelve ya
# listo para abrir en el formulario de edición de instrumentos y revisar
# antes de guardar -- nunca se guarda a ciegas.
#
# Mismo criterio del resto de generadores: los criterios que usa la IA
# vienen de la lista real del curso, nunca inventados -- cualquier código
# que la IA devuelva y no exista de verdad se descarta al procesar la
# respuesta.

import json
import re

import json_repair

from services.courses import get_course
from services.criteria import list_criteria
from services.llm_client import generar_texto, generar_texto_groq

_ETIQUETAS_TIPO = {
    "checklist": "Lista de cotejo",
    "rating_scale": "Escala de valoración",
    "rubric": "Rúbrica",
    "criterial_exam": "Examen criterial",
}

_INSTRUCCIONES_TIPO = {
    "checklist": (
        "Una lista de ítems observables (\"se ha hecho o no\", sin niveles de desempeño). Cada "
        "ítem: una descripción breve de lo que se comprueba, un peso relativo (weight -- un "
        "número libre, más peso significa que ese ítem importa más en la nota final), y los "
        "criterios de evaluación que evidencia."
    ),
    "rating_scale": (
        "{n} niveles de desempeño genéricos que aplican por igual a todos los ítems (p.ej. "
        "\"No conseguido\", \"En proceso\", \"Conseguido\", \"Superado\"...) y una lista de "
        "ítems. Cada ítem: una descripción breve de lo que se evalúa, un peso relativo "
        "(weight), y los criterios de evaluación que evidencia."
    ),
    "rubric": (
        "{n} niveles de desempeño y una lista de ítems (las filas de la rúbrica). Cada ítem: "
        "una descripción breve del aspecto que evalúa, un peso relativo (weight), los "
        "criterios de evaluación que evidencia, y una descripción ESPECÍFICA de cómo se ve el "
        "desempeño en CADA nivel para ese ítem concreto (levelDescriptions) -- no una frase "
        "genérica repetida, sino qué distingue de verdad a un nivel de otro para ese ítem."
    ),
    "criterial_exam": (
        "Una lista de preguntas de examen. Cada pregunta: un enunciado breve, sus puntos "
        "máximos reales (weight -- p.ej. 2 o 2.5, el valor real de la pregunta en el examen, "
        "no una importancia abstracta), y los criterios de evaluación que evidencia."
    ),
}


def construir_prompt(course_id, criterion_ids, tool_type, contexto=None, num_niveles=None, documento_clase=None):
    """Devuelve el texto del prompt (no hay paso de copiar/pegar -- se pasa
    directo a generar_texto(), pero se deja como función separada para
    poder inspeccionarlo/probarlo suelto igual que el resto de
    generadores).

    `documento_clase` -- texto opcional (pegado o extraído de un
    documento) con lo que se ha visto de verdad en clase. Sin esto, la IA
    solo tenía la DESCRIPCIÓN de cada criterio (una frase curricular
    abstracta) para inventar preguntas/ítems -- con un examen criterial en
    particular, eso podía dar preguntas correctas en la forma pero ajenas
    a lo que realmente se trabajó en el aula. Si se da, el instrumento
    tiene que basarse en ese contenido concreto, no solo en la
    descripción del criterio.

    `criterion_ids` -- opcional. Si se da, la IA tiene que cubrir SOLO esos
    criterios (comportamiento de siempre). Si se deja vacío, la IA elige
    ella misma qué criterios de TODO el curso encajan con `contexto`/
    `documento_clase` -- pensado para cuando el profesor describe lo que
    quiere evaluar (p.ej. pega ya las preguntas de un examen) en vez de
    elegir los criterios a mano de antemano. En ese caso hace falta
    `contexto` o `documento_clase`: sin ninguno de los dos la IA no tiene
    de qué partir."""

    if tool_type not in _ETIQUETAS_TIPO:
        raise ValueError(f"Tipo de instrumento desconocido: {tool_type}")

    curso = get_course(course_id)

    if curso is None:
        raise ValueError("Curso no encontrado.")

    todos_los_criterios = list_criteria(course_id)

    if criterion_ids:
        ids_pedidos = set(criterion_ids)
        criterios = [c for c in todos_los_criterios if str(c.id) in ids_pedidos]
        if not criterios:
            raise ValueError(
                "Ninguno de los criterios indicados existe en este curso -- vincula al menos un "
                "criterio antes de generar el instrumento."
            )
        instruccion_criterios = "Debe cubrir estos criterios de evaluación (usa SOLO estos códigos, ninguno más):"
        instruccion_cobertura = (
            f'Reparte los criterios dados entre {"las preguntas" if tool_type == "criterial_exam" else "los ítems"} de '
            f'forma equilibrada -- que cada criterio quede cubierto por al menos uno, sin forzar '
            f'{"preguntas" if tool_type == "criterial_exam" else "ítems"} que no aporten nada real.'
        )
    else:
        if not todos_los_criterios:
            raise ValueError(
                "Este curso no tiene criterios de evaluación cargados todavía -- añádelos en Ajustes "
                "antes de generar un instrumento."
            )
        if not contexto and not documento_clase:
            raise ValueError(
                "Sin criterios elegidos a mano, hace falta describir qué quieres evaluar (o pegar el "
                "contenido visto en clase) para que la IA sepa de dónde partir."
            )
        criterios = todos_los_criterios
        instruccion_criterios = "Elige de esta lista SOLO los criterios que de verdad encajan con lo que se describe arriba (usa SOLO estos códigos, ninguno más):"
        instruccion_cobertura = (
            f'Vincula cada {"pregunta" if tool_type == "criterial_exam" else "ítem"} SOLO a los criterios que '
            f'de verdad evidencia -- no hace falta cubrir todos los de la lista, elige los que encajen con lo '
            f'descrito arriba, no fuerces relaciones que no existan.'
        )

    lista_criterios = "\n".join(f"- {c.code}: {c.description}" for c in criterios)

    necesita_niveles = tool_type in ("rating_scale", "rubric")
    n = num_niveles or 4
    instruccion_tipo = _INSTRUCCIONES_TIPO[tool_type].format(n=n) if necesita_niveles else _INSTRUCCIONES_TIPO[tool_type]

    seccion_contexto = f"\nLo que se va a evaluar con este instrumento: {contexto}\n" if contexto else ""
    # Sin esto, "contexto" solo servía de encabezado decorativo -- la IA lo
    # leía pero nada la obligaba a basarse en él, así que con un contexto
    # largo (p.ej. el enunciado real de un examen pegado tal cual, en vez de
    # una frase corta) el instrumento podía acabar siendo una elaboración
    # genérica de la descripción de cada criterio, ignorando lo pegado.
    # Misma instrucción que instruccion_documento un poco más abajo, pero
    # aplicada a `contexto` -- los dos campos pueden traer el mismo texto
    # (p.ej. desde una actividad de una Situación de Aprendizaje, ver
    # EvaluationToolManager.tsx/ProgrammingManager.tsx) y ambos deben pesar
    # igual como base real del instrumento, no solo como descripción.
    instruccion_contexto = (
        "\nBasa el instrumento en lo descrito arriba (\"Lo que se va a evaluar con este instrumento\") -- si "
        "ahí se ha pegado contenido real (el enunciado de un examen, la descripción de un producto...), las "
        "preguntas/ítems tienen que ajustarse a eso concretamente, no ser una elaboración genérica de la "
        "descripción de cada criterio."
        if contexto else ""
    )

    seccion_documento = (
        f"\n<contenido_visto_en_clase>\n{documento_clase}\n</contenido_visto_en_clase>\n"
        if documento_clase else ""
    )
    instruccion_documento = (
        "\nBasa el instrumento en el contenido de <contenido_visto_en_clase> -- las preguntas/ítems "
        "tienen que ser sobre lo que realmente se ha trabajado ahí, no una elaboración genérica de la "
        "descripción de cada criterio."
        if documento_clase else ""
    )

    if tool_type in ("checklist", "criterial_exam"):
        formato = """{
  "name": "Nombre breve del instrumento",
  "items": [
    {"description": "...", "weight": 1, "linkedCriteriaIds": ["códigos de criterios"]}
  ]
}"""
    elif tool_type == "rating_scale":
        formato = """{
  "name": "Nombre breve del instrumento",
  "levels": [{"name": "Nombre del nivel", "points": 1}],
  "items": [
    {"description": "...", "weight": 1, "linkedCriteriaIds": ["códigos de criterios"]}
  ]
}"""
    else:  # rubric
        formato = """{
  "name": "Nombre breve del instrumento",
  "levels": [{"name": "Nombre del nivel", "points": 1}],
  "items": [
    {
      "description": "...",
      "weight": 1,
      "linkedCriteriaIds": ["códigos de criterios"],
      "levelDescriptions": {"Nombre del nivel": "Cómo se ve este ítem en ese nivel concreto"}
    }
  ]
}"""

    prompt = f"""Eres un profesor de {curso.subject} de {curso.level} diseñando un instrumento de \
evaluación de tipo {_ETIQUETAS_TIPO[tool_type]}.
{seccion_contexto}{seccion_documento}
<criterios_de_evaluacion>
{instruccion_criterios}
{lista_criterios}
</criterios_de_evaluacion>

<tarea>
{instruccion_tipo}

{instruccion_cobertura} No inventes criterios fuera de la lista dada -- si lo haces, esos \
códigos se descartarán al procesar la respuesta.{instruccion_contexto}{instruccion_documento}
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE este JSON, sin texto antes ni después. Si hay niveles, usa el NOMBRE del \
nivel (no un id) como clave de "levelDescriptions":

{formato}
</formato_de_salida>"""

    return prompt


_PATRON_CERCA_JSON = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)


def _extraer_json(texto):

    coincidencia = _PATRON_CERCA_JSON.search(texto)

    if coincidencia:
        return coincidencia.group(1)

    return texto.strip()


def _parsear_json(texto):
    """json.loads normal, y si falla, json_repair como red de seguridad --
    ver el mismo helper y su motivo en situacion_aprendizaje.py (comillas
    sin escapar dentro de una cadena larga, que json.loads(strict=False) no
    cubre)."""

    try:
        return json.loads(texto, strict=False)
    except json.JSONDecodeError:
        return json_repair.loads(texto)


# ==========================================================
# Sugerir criterios a partir de una descripción
# ==========================================================
#
# Paso previo y opcional a generar_instrumento*(): el profesor describe qué
# quiere evaluar (p.ej. pega ya las preguntas de un examen) SIN elegir
# criterios de antemano, y esto le propone cuáles de TODO el curso encajan
# -- para que los revise/ajuste en el mismo selector de criterios de
# siempre (CriteriaSelectorModal.tsx) antes de generar el instrumento
# propiamente dicho, que sigue funcionando exactamente igual que con
# criterios elegidos a mano. Solo por Groq (rápido) -- a diferencia de la
# generación del instrumento, aquí no hace falta ofrecer IA local/online
# para un paso tan ligero.

def construir_prompt_sugerir_criterios(course_id, descripcion, documento_clase=None):

    curso = get_course(course_id)
    if curso is None:
        raise ValueError("Curso no encontrado.")

    todos_los_criterios = list_criteria(course_id)
    if not todos_los_criterios:
        raise ValueError(
            "Este curso no tiene criterios de evaluación cargados todavía -- añádelos en Ajustes "
            "antes de generar un instrumento."
        )

    lista_criterios = "\n".join(f"- {c.code}: {c.description}" for c in todos_los_criterios)

    seccion_documento = (
        f"\n<contenido_visto_en_clase>\n{documento_clase}\n</contenido_visto_en_clase>\n"
        if documento_clase else ""
    )

    return f"""Eres un profesor de {curso.subject} de {curso.level}. Quieres evaluar lo siguiente:

<lo_que_quiero_evaluar>
{descripcion}
</lo_que_quiero_evaluar>
{seccion_documento}
<criterios_de_evaluacion>
{lista_criterios}
</criterios_de_evaluacion>

<tarea>
Elige de la lista de arriba SOLO los códigos de criterios de evaluación que de verdad evidencia lo \
descrito -- no fuerces relaciones que no existan, no hace falta cubrir todos los criterios del curso, \
y no inventes códigos fuera de la lista dada.
</tarea>

Devuelve ÚNICAMENTE este JSON, sin texto antes ni después: {{"criterionCodes": ["códigos elegidos"]}}"""


def _procesar_sugerencia_criterios(course_id, respuesta_texto):
    """Devuelve (criterion_ids, codigos_descartados) -- mismo criterio de
    descartar silenciosamente cualquier código que la IA proponga y no
    exista de verdad en el curso que el resto de generadores."""

    try:
        datos = _parsear_json(_extraer_json(respuesta_texto))
    except Exception as exc:
        raise ValueError(f"La IA no devolvió un JSON válido: {exc}")

    criterios_por_codigo = {c.code: c for c in list_criteria(course_id)}
    criterion_ids = []
    codigos_descartados = []
    for codigo in (datos.get("criterionCodes") or []):
        criterio = criterios_por_codigo.get(codigo)
        if criterio:
            criterion_ids.append(str(criterio.id))
        else:
            codigos_descartados.append(codigo)

    return criterion_ids, codigos_descartados


def sugerir_criterios_groq(course_id, descripcion, documento_clase=None):
    """Llama a Groq y devuelve (criterion_ids, codigos_descartados). Lanza
    ValueError si Groq no responde o no hay clave configurada."""

    prompt = construir_prompt_sugerir_criterios(course_id, descripcion, documento_clase)

    respuesta_texto = generar_texto_groq(prompt)

    if respuesta_texto is None:
        raise ValueError(
            "Groq no está disponible ahora mismo (o falta configurar la clave). Inténtalo de nuevo, "
            "o elige los criterios a mano."
        )

    return _procesar_sugerencia_criterios(course_id, respuesta_texto)


def generar_instrumento(course_id, criterion_ids, tool_type, contexto=None, num_niveles=None, documento_clase=None):
    """Llama al ia-server, valida la respuesta contra los criterios reales
    del curso y devuelve (instrumento, codigos_descartados). Lanza
    ValueError si el ia-server no responde. El resto de la validación es
    idéntica a la vía "IA online" -- ver procesar_respuesta()."""

    prompt = construir_prompt(course_id, criterion_ids, tool_type, contexto, num_niveles, documento_clase)

    respuesta_texto = generar_texto(prompt)

    if respuesta_texto is None:
        raise ValueError(
            "El servidor de IA local no está disponible ahora mismo. Inténtalo de nuevo en unos "
            "minutos, o usa la opción de IA online."
        )

    return procesar_respuesta(course_id, tool_type, respuesta_texto)


def generar_instrumento_groq(course_id, criterion_ids, tool_type, contexto=None, num_niveles=None, documento_clase=None):
    """Igual que generar_instrumento() pero contra la API de Groq -- rápida
    de sobra (unos segundos) para no necesitar el patrón job+polling que sí
    hace falta con el ia-server local (ver routers/prompts.py). Lanza
    ValueError si no hay clave configurada o Groq no responde."""

    prompt = construir_prompt(course_id, criterion_ids, tool_type, contexto, num_niveles, documento_clase)

    respuesta_texto = generar_texto_groq(prompt)

    if respuesta_texto is None:
        raise ValueError(
            "Groq no está disponible ahora mismo (o falta configurar la clave). Inténtalo de nuevo, "
            "o usa la IA local o la IA online."
        )

    return procesar_respuesta(course_id, tool_type, respuesta_texto)


def procesar_respuesta(course_id, tool_type, respuesta_texto):
    """Valida el JSON de la IA (venga del ia-server o pegado a mano de una
    IA online) contra los criterios reales del curso y devuelve
    (instrumento, codigos_descartados). `instrumento` ya tiene la forma de
    un EvaluationTool sin `id` (lo pone el frontend al guardar), listo
    para abrir en el formulario de edición y revisar antes de guardar.
    Lanza ValueError si la respuesta no es JSON válido -- nunca se
    devuelve nada a medio procesar."""

    try:
        datos = _parsear_json(_extraer_json(respuesta_texto))
    except Exception as exc:
        raise ValueError(f"La IA no devolvió un JSON válido: {exc}")

    criterios_por_codigo = {c.code: c for c in list_criteria(course_id)}
    codigos_descartados = []

    def _mapear_ids(codigos):
        ids = []
        for codigo in (codigos or []):
            criterio = criterios_por_codigo.get(codigo)
            if criterio:
                ids.append(str(criterio.id))
            else:
                codigos_descartados.append(codigo)
        return ids

    # Los niveles no traen id propio en la respuesta (se le pidió a la IA
    # que usara el nombre como clave de levelDescriptions, para no obligarla
    # a inventar ids) -- se les asigna aquí uno real y estable dentro de
    # este borrador.
    niveles_por_nombre = {}
    levels_out = []
    for i, lvl in enumerate(datos.get("levels") or []):
        nombre = lvl.get("name") or f"Nivel {i + 1}"
        level_id = f"lvl-{i}"
        niveles_por_nombre[nombre] = level_id
        levels_out.append({"id": level_id, "name": nombre, "points": lvl.get("points", i)})

    items_out = []
    for i, item in enumerate(datos.get("items") or []):
        item_out = {
            "id": f"item-{i}",
            "description": item.get("description", ""),
            "weight": item.get("weight", 1),
            "linkedCriteriaIds": _mapear_ids(item.get("linkedCriteriaIds")),
        }
        if tool_type == "rubric":
            descripciones_in = item.get("levelDescriptions") or {}
            item_out["levelDescriptions"] = {
                niveles_por_nombre[nombre]: descripcion
                for nombre, descripcion in descripciones_in.items()
                if nombre in niveles_por_nombre
            }
        items_out.append(item_out)

    instrumento = {
        "type": tool_type,
        "name": datos.get("name") or _ETIQUETAS_TIPO[tool_type],
        "items": items_out,
    }
    if tool_type in ("rating_scale", "rubric"):
        instrumento["levels"] = levels_out

    return instrumento, codigos_descartados
