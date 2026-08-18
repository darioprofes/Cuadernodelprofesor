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

from services.courses import get_course
from services.criteria import list_criteria
from services.llm_client import generar_texto

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


def construir_prompt(course_id, criterion_ids, tool_type, contexto=None, num_niveles=None):
    """Devuelve el texto del prompt (no hay paso de copiar/pegar -- se pasa
    directo a generar_texto(), pero se deja como función separada para
    poder inspeccionarlo/probarlo suelto igual que el resto de
    generadores)."""

    if tool_type not in _ETIQUETAS_TIPO:
        raise ValueError(f"Tipo de instrumento desconocido: {tool_type}")

    curso = get_course(course_id)

    if curso is None:
        raise ValueError("Curso no encontrado.")

    todos_los_criterios = list_criteria(course_id)
    ids_pedidos = set(criterion_ids or [])
    criterios = [c for c in todos_los_criterios if str(c.id) in ids_pedidos]

    if not criterios:
        raise ValueError(
            "Ninguno de los criterios indicados existe en este curso -- vincula al menos un "
            "criterio antes de generar el instrumento."
        )

    lista_criterios = "\n".join(f"- {c.code}: {c.description}" for c in criterios)

    necesita_niveles = tool_type in ("rating_scale", "rubric")
    n = num_niveles or 4
    instruccion_tipo = _INSTRUCCIONES_TIPO[tool_type].format(n=n) if necesita_niveles else _INSTRUCCIONES_TIPO[tool_type]

    seccion_contexto = f"\nLo que se va a evaluar con este instrumento: {contexto}\n" if contexto else ""

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
{seccion_contexto}
<criterios_de_evaluacion>
Debe cubrir estos criterios de evaluación (usa SOLO estos códigos, ninguno más):
{lista_criterios}
</criterios_de_evaluacion>

<tarea>
{instruccion_tipo}

Reparte los criterios dados entre {"las preguntas" if tool_type == "criterial_exam" else "los ítems"} de \
forma equilibrada -- que cada criterio quede cubierto por al menos uno, sin forzar {"preguntas" if tool_type == "criterial_exam" else "ítems"} \
que no aporten nada real. No inventes criterios fuera de la lista dada -- si lo haces, esos \
códigos se descartarán al procesar la respuesta.
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


def generar_instrumento(course_id, criterion_ids, tool_type, contexto=None, num_niveles=None):
    """Llama al ia-server, valida la respuesta contra los criterios reales
    del curso y devuelve (instrumento, codigos_descartados). `instrumento`
    ya tiene la forma de un EvaluationTool sin `id` (lo pone el frontend al
    guardar), listo para abrir en el formulario de edición y revisar antes
    de guardar. Lanza ValueError si el ia-server no responde o la
    respuesta no es JSON válido -- nunca se devuelve nada a medio
    procesar."""

    prompt = construir_prompt(course_id, criterion_ids, tool_type, contexto, num_niveles)

    respuesta_texto = generar_texto(prompt)

    if respuesta_texto is None:
        raise ValueError(
            "El servidor de IA local no está disponible ahora mismo. Inténtalo de nuevo en unos "
            "minutos."
        )

    try:
        datos = json.loads(_extraer_json(respuesta_texto))
    except json.JSONDecodeError as exc:
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
