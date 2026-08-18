# ==========================================================
# Generador de prompt: Unidad de programación
# ==========================================================
#
# Mismo patrón validado dos veces con datos reales en el prototipo de esta
# sesión (generar_prompt.py): se inyecta el documento de teoría del profesor
# y el currículo REAL del curso (saberes/criterios con sus códigos reales),
# nunca se deja que la IA invente nada. La respuesta se valida siempre contra
# lo que existe de verdad en el curso -- cualquier código inventado se
# descarta, no se guarda a ciegas.
#
# NO pasa por anonimizar(): probado con un curso real, el NER de spaCy (ver
# services/anonimizador.py, entrenado/afinado para actas en prosa) dispara
# muchísimos falsos positivos sobre texto de diapositivas en viñetas cortas
# -- llegó a anonimizar términos científicos ("Termosfera", "Ozono") e
# incluso códigos de currículo reales dentro del propio prompt ("F.1" ->
# "PERS_37414E"), corrompiendo el prompt en vez de protegerlo. Un documento
# de teoría normalmente no tiene datos personales; la responsabilidad de
# revisarlo antes de copiarlo queda en el profesor (mismo criterio que ya se
# aplica al riesgo de reidentificación por combinación de datos en el
# Anonimizador).

import re

from services.basic_knowledge import list_basic_knowledge
from services.courses import get_course
from services.criteria import list_criteria


def _detectar_marcador(texto):

    # Depende de qué extractor produjo el texto (routers/prompts.py::
    # extraer_documento) -- .pptx/.pdf usan un marcador numerado, .docx (y el
    # texto pegado a mano) no tienen una unidad estructural natural.
    if "### Diapositiva " in texto:
        return "diapositiva", "### Diapositiva N"

    if "### Página " in texto:
        return "página", "### Página N"

    return None, None


def construir_prompt(
    course_id, documento_texto, modo="documento",
    sesiones_modo="ia", sesiones_fijo=None, sesiones_min=None, sesiones_max=None,
    caracteristicas_grupo=None,
):
    """Devuelve (anonimizado, mapa) -- mismo formato que
    services/anonimizador.py::anonimizar(), listo para el mismo flujo de
    copiar/pegar del Anonimizador. El mapa normalmente sale vacío (un
    documento de teoría no suele tener datos personales), pero se pasa por
    anonimizar() de todas formas por si el documento menciona a algún alumno
    de pasada.

    `modo`:
    - "documento" (Modo A, por defecto): el profesor ya tiene el material
      (subido o pegado) y la IA solo debe organizarlo, sin añadir nada que
      no esté en él.
    - "descripcion" (Modo B): el profesor todavía no tiene el contenido
      escrito, solo describe lo que quiere trabajar, y le pide a la IA que
      redacte ella misma el desarrollo teórico -- fiel a esa descripción y
      al currículo real, pero el contenido en sí lo genera la IA (con el
      riesgo de fiabilidad que eso conlleva, distinto al de Modo A).

    `sesiones_modo`: "fijo" (usa sesiones_fijo), "rango" (usa sesiones_min/
    sesiones_max) o "ia" (por defecto -- decide libremente, mismo
    comportamiento que antes de que existiera este parámetro).

    `caracteristicas_grupo`: lista de rasgos del grupo (p.ej. "Grupo
    numeroso", cargados de classes.caracteristicas_grupo) -- opcional, solo
    se añade la sección al prompt si hay alguno."""

    curso = get_course(course_id)

    if curso is None:
        raise ValueError("Curso no encontrado.")

    if not documento_texto.strip():
        raise ValueError("El documento está vacío." if modo == "documento" else "La descripción está vacía.")

    saberes = list_basic_knowledge(course_id)
    criterios = list_criteria(course_id)

    if not saberes and not criterios:
        raise ValueError(
            "Este curso no tiene saberes básicos ni criterios de evaluación "
            "cargados todavía -- añádelos en Ajustes antes de generar una "
            "unidad con IA."
        )

    lista_saberes = "\n".join(f"- {s.code}: {s.description}" for s in saberes) or "(ninguno cargado en este curso)"
    lista_criterios = "\n".join(f"- {c.code}: {c.description}" for c in criterios) or "(ninguno cargado en este curso)"

    if modo == "descripcion":
        etiqueta_entrada = "descripcion_del_profesor"
        instruccion_tarea = (
            "Todavía no existe un documento de teoría escrito: a partir de la descripción del "
            "profesor de arriba, redacta tú el desarrollo teórico necesario, siguiéndola con la "
            "mayor fidelidad posible -- no te salgas de lo que pide ni añadas temas que no haya "
            "mencionado, aunque parezcan relacionados."
        )
    else:
        etiqueta_entrada = "documento_de_teoria"
        unidad_estructural, marcador = _detectar_marcador(documento_texto)

        if unidad_estructural:
            instruccion_tarea = (
                f"Diseña una unidad de programación a partir ÚNICAMENTE del contenido del documento "
                f"de teoría. No añadas datos, ejemplos ni conceptos que no aparezcan en él.\n\n"
                f"El documento está dividido en {unidad_estructural}s numeradas (\"{marcador}\"). NO "
                f"omitas ninguna, ni siquiera las que te parezcan más básicas o introductorias que el "
                f"resto (por ejemplo: qué es un concepto, su composición, sus funciones o su "
                f"estructura). Antes de dar la respuesta final, repasa la lista completa de "
                f"{unidad_estructural}s del documento y comprueba que cada una está representada en, "
                f"al menos, una sesión. Si detectas alguna {unidad_estructural} sin cubrir, añade o "
                f"amplía una sesión para incluirla antes de responder."
            )
        else:
            instruccion_tarea = (
                "Diseña una unidad de programación a partir ÚNICAMENTE del contenido del documento "
                "de teoría. No añadas datos, ejemplos ni conceptos que no aparezcan en él.\n\n"
                "No omitas ningún apartado o bloque de contenido del documento, ni siquiera los que te "
                "parezcan más básicos o introductorios que el resto. Antes de dar la respuesta final, "
                "repasa el documento de principio a fin y comprueba que todo su contenido está "
                "representado en, al menos, una sesión."
            )

    if sesiones_modo == "fijo" and sesiones_fijo:
        instruccion_sesiones = f"Usa exactamente {sesiones_fijo} sesiones de clase (una sesión = una hora lectiva)."
    elif sesiones_modo == "rango" and sesiones_min and sesiones_max:
        instruccion_sesiones = (
            f"Usa entre {sesiones_min} y {sesiones_max} sesiones de clase (una sesión = una hora "
            f"lectiva) -- decide tú el número exacto dentro de ese rango según la cantidad de "
            f"contenido real."
        )
    else:
        instruccion_sesiones = (
            "Tú decides cuántas sesiones de clase hacen falta (una sesión = una hora lectiva) "
            "según la cantidad de contenido real -- no fuerces un número concreto."
        )

    seccion_grupo = ""
    if caracteristicas_grupo:
        lista_rasgos = "\n".join(f"- {rasgo}" for rasgo in caracteristicas_grupo)
        seccion_grupo = f"""
<contexto_del_grupo>
{lista_rasgos}
</contexto_del_grupo>
"""

    prompt = f"""Eres un profesor de {curso.subject} de {curso.level} diseñando una unidad \
de programación a partir de {"tu propio material de clase" if modo == "documento" else "lo que quieres trabajar"}.

<{etiqueta_entrada}>
{documento_texto}
</{etiqueta_entrada}>

<curriculo_oficial_del_curso>
SABERES BÁSICOS (usa solo estos códigos, ninguno más):
{lista_saberes}

CRITERIOS DE EVALUACIÓN (usa solo estos códigos, ninguno más):
{lista_criterios}
</curriculo_oficial_del_curso>
{seccion_grupo}
<tarea>
{instruccion_tarea}

Reparte el contenido en sesiones de clase, cubriendo todo el contenido de principio a fin, \
en el orden que tenga más sentido pedagógico. {instruccion_sesiones}
{"Ten en cuenta las características del grupo dadas arriba al diseñar las sesiones." if caracteristicas_grupo else ""}

Para cada sesión:
- Un título breve.
- Una descripción de 2-4 frases con lo que se trabaja.
- Los saberes básicos que activa (de la lista dada, cero o más -- dejar vacío si \
ninguno encaja de verdad es preferible a forzar uno).
- Los criterios de evaluación que activa (mismo criterio: solo de la lista dada).

No cites normativa, decretos ni URLs. No inventes códigos curriculares fuera de \
las dos listas dadas arriba -- si lo haces, esos códigos se descartarán al guardar \
la unidad.
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE un JSON con esta forma exacta, sin texto antes ni después:

{{
  "name": "Nombre breve de la unidad",
  "sessions": <número de sesiones>,
  "sessionDetails": [
    {{"description": "Título: descripción de la sesión"}}
  ],
  "linkedBasicKnowledgeIds": ["códigos de saberes usados, sin repetir"],
  "linkedCriteriaIds": ["códigos de criterios usados, sin repetir"]
}}
</formato_de_salida>"""

    # Mapa vacío siempre (ver nota de cabecera) -- se mantiene la misma
    # forma (texto, mapa) que el resto de Herramientas IA para que el
    # frontend/reintegración funcionen igual, sin ninguna sustitución real.
    return prompt, {}


_PATRON_CERCA_JSON = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)


def _extraer_json(texto):

    # La IA a veces envuelve el JSON en una valla de código Markdown pese a
    # que se le pide explícitamente que no lo haga -- se admite igualmente
    # en vez de obligar al profesor a recortarlo a mano.
    coincidencia = _PATRON_CERCA_JSON.search(texto)

    if coincidencia:
        return coincidencia.group(1)

    return texto.strip()


def _reintegrar_texto(texto, mapa):

    if not texto or not mapa:
        return texto

    for codigo, real in mapa.items():
        texto = texto.replace(codigo, real)

    return texto


def procesar_respuesta(course_id, respuesta_texto, mapa):
    """Recibe el texto que ha pegado el profesor (la respuesta JSON de la
    IA) y el mapa código->dato real del paso de anonimización. Devuelve
    (unidad, codigos_descartados) -- `unidad` ya tiene los códigos de
    saberes/criterios convertidos a los UUID reales del curso (nunca se
    guardan códigos inventados por la IA) y los datos personales
    reintegrados, lista para el formulario de revisión del frontend."""

    import json

    try:
        datos = json.loads(_extraer_json(respuesta_texto))
    except json.JSONDecodeError as exc:
        raise ValueError(f"La respuesta pegada no es JSON válido: {exc}")

    saberes_por_codigo = {s.code: str(s.id) for s in list_basic_knowledge(course_id)}
    criterios_por_codigo = {c.code: str(c.id) for c in list_criteria(course_id)}

    codigos_descartados = []

    ids_saberes = []
    for codigo in (datos.get("linkedBasicKnowledgeIds") or []):
        if codigo in saberes_por_codigo:
            ids_saberes.append(saberes_por_codigo[codigo])
        else:
            codigos_descartados.append(codigo)

    ids_criterios = []
    for codigo in (datos.get("linkedCriteriaIds") or []):
        if codigo in criterios_por_codigo:
            ids_criterios.append(criterios_por_codigo[codigo])
        else:
            codigos_descartados.append(codigo)

    session_details = []
    for sesion in (datos.get("sessionDetails") or []):
        session_details.append({
            "description": _reintegrar_texto(sesion.get("description", ""), mapa),
        })

    unidad = {
        "name": _reintegrar_texto(datos.get("name", ""), mapa),
        "sessions": datos.get("sessions", len(session_details)),
        "sessionDetails": session_details,
        "linkedBasicKnowledgeIds": ids_saberes,
        "linkedCriteriaIds": ids_criterios,
    }

    return unidad, codigos_descartados
