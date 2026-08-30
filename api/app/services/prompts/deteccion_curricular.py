# ==========================================================
# Generador de prompt: Detección de elementos curriculares movilizados
# ==========================================================
#
# El profesor pega/sube un documento ya escrito (apuntes, descripción de
# actividades...) y la IA anota DENTRO del propio documento qué elementos
# curriculares (criterios de evaluación, saberes básicos, competencias
# específicas, competencias clave/descriptores) moviliza cada pasaje --
# mismo principio que sugerir_criterios_groq en instrumento_evaluacion.py
# (lista cerrada de códigos reales del curso, nunca se deja inventar),
# ampliado a los 4 tipos y reformulado como "anota en el sitio" en vez de
# "devuélveme solo una lista". Sin datos personales de por medio -- no pasa
# por el Anonimizador en ningún punto, a diferencia de adaptacion_material.py.

import re

from services.basic_knowledge import list_basic_knowledge
from services.competences import list_competences
from services.courses import get_course
from services.criteria import list_criteria
from services.key_competences import list_key_competences
from services.llm_client import generar_texto, generar_texto_groq

_ETIQUETA_TIPO = {
    "criterios": "Criterios de evaluación",
    "saberes": "Saberes básicos",
    "competencias_especificas": "Competencias específicas",
    "competencias_clave": "Competencias clave / descriptores operativos",
}

_ETIQUETA_SECCION = {
    "criterios": "criterios_de_evaluacion",
    "saberes": "saberes_basicos",
    "competencias_especificas": "competencias_especificas",
    "competencias_clave": "competencias_clave",
}


def _elementos_por_tipo(course_id, tipo):
    """Devuelve la lista real de elementos curriculares de un tipo, cada uno
    como (id, code, description) -- misma forma para los 4 tipos, aunque
    vengan de tablas/servicios distintos."""

    if tipo == "criterios":
        return [(str(c.id), c.code, c.description) for c in list_criteria(course_id)]
    if tipo == "saberes":
        return [(str(s.id), s.code, s.description) for s in list_basic_knowledge(course_id)]
    if tipo == "competencias_especificas":
        return [(str(c.id), c.code, c.description) for c in list_competences(course_id)]
    if tipo == "competencias_clave":
        # Las competencias clave son globales (sin course_id) -- se listan
        # todas, y se aplanan también sus descriptores operativos como
        # elementos detectables aparte, cada uno con su propio código real.
        elementos = []
        for kc in list_key_competences():
            elementos.append((str(kc.id), kc.code, kc.description))
            for d in kc.descriptors:
                elementos.append((str(d.id), d.code, d.description))
        return elementos
    raise ValueError(f"Tipo de elemento curricular desconocido: {tipo}")


def construir_prompt(course_id, documento, tipos):
    """`tipos` -- subconjunto no vacío de _ETIQUETA_TIPO.keys(). Devuelve el
    prompt como función separada del resto (no hay paso de copiar/pegar en
    las vías Groq/local) para poder inspeccionarlo/probarlo suelto, igual
    que el resto de generadores."""

    if not tipos:
        raise ValueError("Elige al menos un tipo de elemento curricular a detectar.")

    curso = get_course(course_id)
    if curso is None:
        raise ValueError("Curso no encontrado.")

    secciones = []
    for tipo in tipos:
        elementos = _elementos_por_tipo(course_id, tipo)
        if not elementos:
            continue
        etiqueta_seccion = _ETIQUETA_SECCION[tipo]
        lista = "\n".join(f"- {code}: {description}" for _id, code, description in elementos)
        secciones.append(f"<{etiqueta_seccion}>\n{lista}\n</{etiqueta_seccion}>")

    if not secciones:
        raise ValueError(
            "Este curso no tiene cargado ningún elemento curricular de los tipos elegidos -- "
            "añádelos en Ajustes antes de usar esta herramienta."
        )

    etiquetas_elegidas = ", ".join(_ETIQUETA_TIPO[t] for t in tipos)

    return f"""Eres un profesor de {curso.subject} de {curso.level} revisando un documento propio \
(apuntes, descripción de actividades...) para identificar qué elementos curriculares moviliza de \
verdad, de estos tipos: {etiquetas_elegidas}.

<documento>
{documento}
</documento>

{chr(10).join(secciones)}

<tarea>
Devuelve el MISMO documento, sin resumirlo ni reescribirlo (puedes ajustar puntuación mínima si \
hace falta para insertar una anotación con claridad, pero el contenido y el orden se mantienen \
igual) -- inserta una anotación justo después de cada pasaje que trabaje de verdad un elemento de \
las listas de arriba, con el formato EXACTO [[código]] (doble corchete, así lo distingues de un \
enlace Markdown normal). Usa SOLO los códigos de las listas dadas -- no inventes ninguno fuera de \
ellas, si un código no existe se descartará al procesar tu respuesta. No hace falta anotar todos \
los elementos de las listas, solo los que el documento trabaje de verdad -- no fuerces relaciones \
que no existan. Un mismo pasaje puede llevar varias anotaciones seguidas si moviliza más de un \
elemento, p.ej. "...miden la humedad del suelo [[2.3]][[B.4]]...".
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE el documento anotado en texto/Markdown plano, sin explicaciones antes ni \
después, sin envolverlo en bloques de código.
</formato_de_salida>"""


_PATRON_ANOTACION = re.compile(r"\[\[([^\[\]]+)\]\]")


def procesar_respuesta(course_id, tipos, documento_anotado):
    """Valida las anotaciones [[código]] del documento devuelto por la IA
    contra los elementos curriculares reales del curso y devuelve
    (documento_anotado, elementos, codigos_descartados) -- `elementos` es
    un dict tipo -> [{"id","code","description"}, ...] (sin duplicados,
    orden de aparición en el documento), con el id real de cada uno para
    poder aplicarlo directamente (p.ej. a una tarea del cuaderno) sin una
    vuelta extra a la base de datos."""

    codigo_a_elemento = {}
    for tipo in tipos:
        for elem_id, code, description in _elementos_por_tipo(course_id, tipo):
            codigo_a_elemento[code] = (tipo, elem_id, code, description)

    elementos = {tipo: [] for tipo in tipos}
    ids_vistos = set()
    codigos_descartados = []

    for match in _PATRON_ANOTACION.finditer(documento_anotado):
        codigo = match.group(1).strip()
        encontrado = codigo_a_elemento.get(codigo)
        if encontrado is None:
            if codigo not in codigos_descartados:
                codigos_descartados.append(codigo)
            continue
        tipo, elem_id, code, description = encontrado
        if elem_id in ids_vistos:
            continue
        ids_vistos.add(elem_id)
        elementos[tipo].append({"id": elem_id, "code": code, "description": description})

    return documento_anotado, elementos, codigos_descartados


def detectar_elementos(course_id, documento, tipos):
    """Vía IA local (ia-server). Lanza ValueError si no está disponible."""

    prompt = construir_prompt(course_id, documento, tipos)

    respuesta = generar_texto(prompt, max_tokens=4000)

    if respuesta is None:
        raise ValueError(
            "El servidor de IA local no está disponible ahora mismo. Inténtalo de nuevo en unos "
            "minutos, o usa la opción de IA online."
        )

    return procesar_respuesta(course_id, tipos, respuesta.strip())


def detectar_elementos_groq(course_id, documento, tipos):
    """Vía Groq. Lanza ValueError si no hay clave configurada o Groq no
    responde."""

    prompt = construir_prompt(course_id, documento, tipos)

    respuesta = generar_texto_groq(prompt, max_tokens=4000)

    if respuesta is None:
        raise ValueError(
            "Groq no está disponible ahora mismo (o falta configurar la clave). Inténtalo de "
            "nuevo, o usa la IA local o la IA online."
        )

    return procesar_respuesta(course_id, tipos, respuesta.strip())
