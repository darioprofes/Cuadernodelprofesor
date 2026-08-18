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
#
# Las adaptaciones NEAE del grupo (Bloque 2) son la única excepción: SÍ son
# datos personales reales. Se resuelve agregando por tipo (recuento de
# etiquetas ACNEAE de enrollments, nunca nombres ni texto libre de
# neae_detalle/medidas_educativas) -- nunca hay una cadena de texto propia de
# un alumno concreto que anonimizar, así que no hace falta pasar esto por el
# Anonimizador tampoco.

import re
from collections import Counter

from services.basic_knowledge import list_basic_knowledge
from services.courses import get_course
from services.criteria import list_criteria
from services.enrollments import list_enrollments


def _detectar_marcador(texto):

    # Depende de qué extractor produjo el texto (routers/prompts.py::
    # extraer_documento) -- .pptx/.pdf usan un marcador numerado, .docx (y el
    # texto pegado a mano) no tienen una unidad estructural natural.
    if "### Diapositiva " in texto:
        return "diapositiva", "### Diapositiva N"

    if "### Página " in texto:
        return "página", "### Página N"

    return None, None


def resumir_adaptaciones_neae(class_id):
    """Recuento de etiquetas ACNEAE en la clase, sin identificar a nadie
    (nunca nombres, nunca el texto libre de neae_detalle/medidas_educativas
    -- solo la etiqueta cerrada que ya se marca en Clases y Alumnado)."""

    if not class_id:
        return []

    matriculas = list_enrollments(class_id)
    contador = Counter()

    for matricula in matriculas:
        for etiqueta in matricula.acneae:
            contador[etiqueta] += 1

    return [
        f"{n} alumno{'s' if n > 1 else ''} con {etiqueta}"
        for etiqueta, n in sorted(contador.items())
    ]


# Descripción breve de qué distingue de verdad a cada tipo de actividad --
# sin esto la IA se queda en la etiqueta y el resultado sale soso (probado
# en real: "Gamificación" sin más dio actividades normales con una etiqueta
# de juego encima, no mecánicas de juego reales). Solo cubre las opciones
# predefinidas del frontend -- un tipo "Otro" escrito a mano por el
# profesor se manda tal cual, sin descripción añadida.
_DESCRIPCIONES_TIPOS_ACTIVIDAD = {
    "Exposición/explicación docente": "el profesorado presenta y desarrolla el contenido de forma directa, con espacio para preguntas.",
    "Trabajo individual": "el alumnado trabaja de forma autónoma, a su propio ritmo, con un resultado propio.",
    "Trabajo cooperativo/grupal": "el alumnado trabaja en grupos pequeños con roles o estructura definida, donde el resultado depende de la contribución de todos.",
    "Debate/coloquio": "confrontación argumentada de puntos de vista sobre una cuestión, moderada por el profesorado.",
    "Aprendizaje basado en proyectos (ABP)": "el alumnado investiga y produce un resultado tangible a lo largo de varias sesiones, en torno a un reto o pregunta real.",
    "Gamificación": "mecánicas de juego genuinas (puntos, niveles, retos, misiones, recompensas, competición sana) que hagan la actividad realmente divertida -- no basta con ponerle una etiqueta de \"juego\" a una tarea normal.",
    "Uso de TIC/herramientas digitales": "herramientas digitales (apps, plataformas online, simuladores...) como parte central de la actividad, no solo de apoyo.",
    "Aprendizaje-servicio": "un proyecto que combina aprendizaje curricular con un servicio real a la comunidad.",
    "Práctica de laboratorio/taller": "manipulación directa de materiales o instrumentos para observar, experimentar o construir algo.",
    "Role-play/simulación": "el alumnado representa un papel o simula una situación real para vivenciarla.",
    "Rutinas y destrezas de pensamiento": "estructuras breves y repetibles (p.ej. \"veo-pienso-me pregunto\") que guían el pensamiento crítico o creativo sobre un contenido.",
    "Aula invertida (flipped classroom)": "el alumnado conoce el contenido ANTES de la sesión (vídeo, lectura, web...) de forma autónoma en casa, y la sesión se dedica a aplicar, practicar o resolver dudas sobre ese contenido -- no a explicarlo por primera vez. Solo tiene sentido si el material de casa introduce algo genuinamente nuevo que no se haya explicado ya en una sesión anterior; no la uses como repaso de algo que ya se dio en clase.",
    "Salida de aula o de centro": "actividad que se realiza fuera del aula habitual (otro espacio del centro, o una salida al exterior).",
}


_ETIQUETAS_ESTRUCTURA_SESION = {
    "inicio_desarrollo_cierre": "Inicio-motivación / Desarrollo / Cierre-síntesis en cada sesión.",
    "ia": "Decide tú la estructura interna de cada sesión, la que tenga más sentido pedagógico.",
}

_ETIQUETAS_PROGRESION = {
    "creciente": "Creciente -- de más guiado al principio a más autónomo hacia el final.",
    "constante": "Constante -- el mismo nivel de guía en todas las sesiones.",
    "ia": "Decide tú la progresión de autonomía que tenga más sentido.",
}

_ETIQUETAS_DIVERSIDAD = {
    "diferenciadas": "Actividades diferenciadas de refuerzo/ampliación cuando corresponda.",
    "unica": "Una única vía de trabajo para todo el grupo.",
}

# Descripción de qué distingue a cada formato de examen predefinido -- sin
# esto la etiqueta sola es ambigua (probado en real: "Preguntas de
# desarrollo/abiertas" se entendió como redacciones extensas cuando lo que
# el profesor quería eran preguntas concretas de respuesta breve). Solo
# cubre las opciones predefinidas del frontend -- un formato "Otro" escrito
# a mano por el profesor se manda tal cual, sin descripción añadida.
_DESCRIPCIONES_FORMATO_EXAMEN = {
    "Test (opción múltiple)": "cada pregunta tiene varias opciones cerradas y el alumnado elige una.",
    "Preguntas cortas": "preguntas concretas de respuesta breve -- una frase o, como mucho, un párrafo corto. NO son preguntas de desarrollo ni piden una redacción extensa.",
    "Preguntas de desarrollo/abiertas": "preguntas que requieren una respuesta argumentada y extensa, relacionando varias ideas -- no una respuesta breve.",
    "Mixto (test + desarrollo)": "combina preguntas de test (opción múltiple) con preguntas de desarrollo en el mismo examen.",
    "Prueba práctica/de aplicación": "el alumnado aplica lo aprendido a un caso, cálculo o problema concreto, no preguntas de memoria.",
    "Oral": "el alumnado responde de palabra, no por escrito.",
}


def construir_prompt(
    course_id, documento_texto, modo="documento",
    sesiones_modo="ia", sesiones_fijo=None, sesiones_min=None, sesiones_max=None,
    caracteristicas_grupo=None,
    tipos_actividad=None, estructuras_cooperativas=None, actividades_obligatorias=None,
    estructura_sesion="ia", estructura_sesion_detalle=None,
    progresion_autonomia="ia",
    atencion_diversidad="diferenciadas", atencion_diversidad_detalle=None,
    class_id=None,
    producto_incluido=True, producto_tipo=None,
    examen_incluido=False, examen_formato=None,
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
      riesgo de fiabilidad que eso conlleva, distinto al de Modo A). Ese
      contenido generado vive ahora en la descripción de cada actividad
      (Bloque 2), no se pierde como en el esquema plano anterior.

    `sesiones_modo`: "fijo" (usa sesiones_fijo), "rango" (usa sesiones_min/
    sesiones_max) o "ia" (decide libremente).

    `caracteristicas_grupo`: lista de rasgos del grupo (p.ej. "Grupo
    numeroso", cargados de classes.caracteristicas_grupo) -- opcional.

    Bloque 2 (Diseño didáctico):
    - `tipos_actividad`: lista de categorías elegidas (texto libre, admite
      "Otro" ya expandido por el frontend).
    - `estructuras_cooperativas`: lista de estructuras cooperativas
      preferidas -- solo se añade al prompt si no está vacía.
    - `actividades_obligatorias`: lista de {"texto": str, "sesion":
      int|None} -- actividades concretas que el profesor quiere sí o sí,
      con sesión opcional.
    - `estructura_sesion`/`estructura_sesion_detalle`,
      `progresion_autonomia`: ver los diccionarios de arriba.
    - `atencion_diversidad`/`atencion_diversidad_detalle`: ver diccionario
      de arriba.
    - `class_id`: si se da, se resumen sus adaptaciones NEAE agregadas
      (ver resumir_adaptaciones_neae) y se piden variantes/adaptaciones por
      actividad cuando corresponda.

    `producto_incluido`: a diferencia de como funcionaba antes (la IA
    siempre generaba un producto final), ahora también es opcional -- un
    toggle en el wizard, preseleccionado a True porque casi siempre tiene
    sentido, pero el profesor puede desmarcarlo.
    `producto_tipo`: igual que `examen_formato`, el profesor lo elige de una
    lista cerrada en el frontend (Infografía, Vídeo, Dossier...) antes de
    generar -- la IA ya no decide el tipo de producto final, solo su
    descripción y qué criterios evidencia.

    Bloque 3 (Evaluación -- examen final):
    - `examen_incluido`: a diferencia del producto final (que la IA siempre
      genera), el examen es opcional -- lo decide el profesor con un toggle
      en el wizard, no la IA.
    - `examen_formato`: el profesor lo elige de una lista cerrada en el
      frontend (Test, Preguntas abiertas, Mixto...) antes de generar -- aquí
      llega ya resuelto a texto, la IA no lo decide, solo diseña los
      bloques del examen dentro de ese formato dado."""

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
            "mencionado, aunque parezcan relacionados. Reparte ese desarrollo teórico entre las "
            "descripciones de las actividades (ver formato de salida) -- no lo resumas, ese es el "
            "contenido real que el profesor usará en clase."
        )
    else:
        etiqueta_entrada = "documento_de_teoria"
        unidad_estructural, marcador = _detectar_marcador(documento_texto)

        if unidad_estructural:
            instruccion_tarea = (
                f"Diseña una situación de aprendizaje a partir ÚNICAMENTE del contenido del documento "
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
                "Diseña una situación de aprendizaje a partir ÚNICAMENTE del contenido del documento "
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
        seccion_grupo = f"\n<contexto_del_grupo>\n{lista_rasgos}\n</contexto_del_grupo>\n"

    # ---- Bloque 2: diseño didáctico ----

    partes_diseno = []

    if tipos_actividad:
        lista_tipos = "\n".join(
            f"- {t}: {_DESCRIPCIONES_TIPOS_ACTIVIDAD[t]}" if t in _DESCRIPCIONES_TIPOS_ACTIVIDAD else f"- {t}"
            for t in tipos_actividad
        )
        partes_diseno.append(
            "Tipos de actividad a utilizar:\n" + lista_tipos
            + "\n\nRepártelos de forma equilibrada entre las sesiones -- no concentres casi todas "
            "las actividades en uno de estos tipos dejando los demás como algo residual o solo al "
            "final. Ten en cuenta también el esfuerzo real de preparación para el profesor: si vas "
            "a proponer varias actividades de un tipo que normalmente exige crear materiales propios "
            "(gamificación con tableros/cartas/fichas, ABP con documentación extensa, etc.), no te "
            "excedas en su número ni en la complejidad de esos materiales."
        )

    if estructuras_cooperativas:
        partes_diseno.append(
            "Estructuras cooperativas preferidas (si usas trabajo cooperativo):\n"
            + "\n".join(f"- {e}" for e in estructuras_cooperativas)
        )

    if actividades_obligatorias:
        lineas = []
        for act in actividades_obligatorias:
            texto = act.get("texto", "").strip()
            if not texto:
                continue
            sesion = act.get("sesion")
            lineas.append(f"- {texto}" + (f" (en la sesión {sesion})" if sesion else " (tú decides en qué sesión encaja)"))
        if lineas:
            partes_diseno.append("Actividades concretas que debes incluir SÍ o SÍ:\n" + "\n".join(lineas))

    partes_diseno.append(f"Estructura interna de cada sesión: {estructura_sesion_detalle or _ETIQUETAS_ESTRUCTURA_SESION.get(estructura_sesion, _ETIQUETAS_ESTRUCTURA_SESION['ia'])}")
    partes_diseno.append(f"Progresión de autonomía a lo largo de las sesiones: {_ETIQUETAS_PROGRESION.get(progresion_autonomia, _ETIQUETAS_PROGRESION['ia'])}")
    partes_diseno.append(f"Atención a la diversidad: {atencion_diversidad_detalle or _ETIQUETAS_DIVERSIDAD.get(atencion_diversidad, _ETIQUETAS_DIVERSIDAD['diferenciadas'])}")

    adaptaciones_neae = resumir_adaptaciones_neae(class_id)
    if adaptaciones_neae:
        partes_diseno.append(
            "Adaptaciones NEAE presentes en el grupo (agregadas, sin identificar a nadie -- "
            "cuando una actividad necesite una variante para este alumnado, indícala en su campo "
            "\"adaptacion\", vacío si esa actividad no necesita ninguna):\n"
            + "\n".join(f"- {a}" for a in adaptaciones_neae)
        )

    seccion_diseno = "\n<diseno_didactico>\n" + "\n\n".join(partes_diseno) + "\n</diseno_didactico>\n"

    # ---- Bloque 3: producto final (opcional, preseleccionado a True porque
    # casi siempre tiene sentido) y examen final (opcional, sin preseleccionar)
    if producto_incluido:
        instruccion_producto = (
            f"1. Una SITUACIÓN DE PARTIDA: un escenario, problema o pregunta real y motivadora que dé "
            f"propósito a toda la unidad (no una lista de contenidos, sino algo que el alumnado pueda "
            f"reconocer como relevante).\n"
            f"2. Un PRODUCTO FINAL{f' de tipo \"{producto_tipo}\" (ya elegido por el profesor)' if producto_tipo else ''}: "
            f"qué va a producir o conseguir el alumnado al terminar la unidad que demuestre lo aprendido, "
            f"coherente con esa situación de partida -- no algo añadido al final sin relación con ella.\n\n"
            f"El resto de la unidad (sesiones y actividades) tiene que construir progresivamente hacia "
            f"ese producto final, dentro de esa situación."
        )
        bloque_final_product_json = (
            '"finalProduct": {\n'
            '    "incluido": true,\n'
            f'''    "tipo": "{producto_tipo or 'Tipo de producto (p.ej. Infografía, Vídeo, Maqueta, Dossier, Exposición oral...)'}",\n'''
            '    "descripcion": "Descripción del producto final, coherente con la situación de partida",\n'
            '    "linkedCriteriaIds": ["códigos de criterios que evidencia el producto"]\n'
            '  },'
        )
    else:
        instruccion_producto = (
            "Una SITUACIÓN DE PARTIDA: un escenario, problema o pregunta real y motivadora que dé "
            "propósito a toda la unidad (no una lista de contenidos, sino algo que el alumnado pueda "
            "reconocer como relevante). El profesor ha decidido que esta unidad NO termina en un "
            "producto final tangible -- no propongas ninguno.\n\n"
            "El resto de la unidad (sesiones y actividades) tiene que construir progresivamente dentro "
            "de esa situación."
        )
        bloque_final_product_json = '"finalProduct": {"incluido": false, "tipo": null, "descripcion": null, "linkedCriteriaIds": []},'

    # ---- Bloque 3: examen final (opcional, a diferencia del producto final)
    # -- el profesor decide con un toggle si lo quiere y elige el formato de
    # una lista cerrada en el frontend; la IA solo diseña los bloques dentro
    # de ese formato ya dado, nunca decide si hay examen o no.
    if examen_incluido:
        descripcion_formato = _DESCRIPCIONES_FORMATO_EXAMEN.get(examen_formato)
        formato_con_descripcion = f"{examen_formato} ({descripcion_formato})" if descripcion_formato else examen_formato
        instruccion_examen = (
            f"\n\nEl profesor quiere que la unidad incluya un EXAMEN FINAL con formato \"{formato_con_descripcion}\". "
            "Diseña sus bloques (uno o más): cada bloque describe qué evalúa y qué criterios de evaluación "
            "activa (de la lista dada). El examen debe evaluar contenido realmente trabajado en las sesiones "
            "diseñadas arriba, no algo que no se haya visto en clase."
        )
        bloque_final_exam_json = (
            '"finalExam": {\n'
            '    "incluido": true,\n'
            f'    "formato": "{examen_formato}",\n'
            '    "bloques": [\n'
            '      {\n'
            '        "descripcion": "Qué evalúa este bloque del examen",\n'
            '        "linkedCriteriaIds": ["códigos de criterios que activa este bloque"]\n'
            '      }\n'
            '    ]\n'
            '  },'
        )
    else:
        instruccion_examen = ""
        bloque_final_exam_json = '"finalExam": {"incluido": false, "formato": null, "bloques": []},'

    prompt = f"""Eres un profesor de {curso.subject} de {curso.level} diseñando una situación \
de aprendizaje a partir de {"tu propio material de clase" if modo == "documento" else "lo que quieres trabajar"}.

<{etiqueta_entrada}>
{documento_texto}
</{etiqueta_entrada}>

<curriculo_oficial_del_curso>
SABERES BÁSICOS (usa solo estos códigos, ninguno más):
{lista_saberes}

CRITERIOS DE EVALUACIÓN (usa solo estos códigos, ninguno más):
{lista_criterios}
</curriculo_oficial_del_curso>
{seccion_grupo}{seccion_diseno}
<tarea>
{instruccion_tarea}

Antes de diseñar nada más, decide esto -- es lo que da sentido al resto:
{instruccion_producto}{instruccion_examen}

Reparte el contenido en sesiones de clase, cubriendo todo el contenido de principio a fin, \
en el orden que tenga más sentido pedagógico. {instruccion_sesiones}
{"Ten en cuenta las características del grupo dadas arriba al diseñar las sesiones." if caracteristicas_grupo else ""}

Para cada sesión, repártela en una o más actividades siguiendo el diseño didáctico de arriba. \
Para cada actividad:
- Un título breve.
- El tipo de actividad (de los tipos dados).
- El agrupamiento: individual, parejas, pequeño_grupo o gran_grupo.
- Duración en minutos (deben sumar, aproximadamente, la duración de la sesión).
- Recursos necesarios, si aplica.
- Una descripción real y desarrollada de la actividad -- {"aquí va el contenido teórico que redactes, no un resumen" if modo == "descripcion" else "fiel al documento"}.
- Los criterios de evaluación que activa (de la lista dada, cero o más).
- Una adaptación para atender a la diversidad del grupo, solo si esa actividad concreta lo necesita (deja el campo vacío si no).

Además, para la unidad completa:
- Los saberes básicos que activa en conjunto (de la lista dada, cero o más -- dejar vacío si \
ninguno encaja de verdad es preferible a forzar uno).
- Los criterios de evaluación que activa en conjunto (mismo criterio: solo de la lista dada).
{"- Los criterios de evaluación que evidencia el producto final (de la lista dada, cero o más)." if producto_incluido else ""}

No cites normativa, decretos ni URLs. No inventes códigos curriculares fuera de \
las dos listas dadas arriba -- si lo haces, esos códigos se descartarán al guardar \
la unidad.
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE un JSON con esta forma exacta, sin texto antes ni después:

{{
  "name": "Nombre breve de la unidad",
  "context": "La situación de partida: el escenario, problema o pregunta real que da sentido a la unidad",
  {bloque_final_product_json}
  {bloque_final_exam_json}
  "sessions": <número de sesiones>,
  "sessionDetails": [
    {{
      "titulo": "Título de la sesión",
      "actividades": [
        {{
          "titulo": "Título de la actividad",
          "tipo": "Tipo de actividad",
          "agrupamiento": "individual | parejas | pequeño_grupo | gran_grupo",
          "duracionMin": <minutos>,
          "recursos": ["recurso 1", "recurso 2"],
          "descripcion": "Descripción real y desarrollada de la actividad",
          "linkedCriteriaIds": ["códigos de criterios que activa esta actividad"],
          "adaptacion": "Adaptación para la diversidad, o cadena vacía si no aplica"
        }}
      ]
    }}
  ],
  "linkedBasicKnowledgeIds": ["códigos de saberes usados en conjunto, sin repetir"],
  "linkedCriteriaIds": ["códigos de criterios usados en conjunto, sin repetir"]
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
    saberes/criterios (a nivel de unidad Y de cada actividad) convertidos a
    los UUID reales del curso (nunca se guardan códigos inventados por la
    IA) y los datos personales reintegrados, lista para el formulario de
    revisión del frontend (mismo esquema que SessionActivity en
    types.ts)."""

    import json

    try:
        datos = json.loads(_extraer_json(respuesta_texto))
    except json.JSONDecodeError as exc:
        raise ValueError(f"La respuesta pegada no es JSON válido: {exc}")

    saberes_por_codigo = {s.code: str(s.id) for s in list_basic_knowledge(course_id)}
    criterios_por_codigo = {c.code: c for c in list_criteria(course_id)}

    codigos_descartados = []
    # Un criterio ya trae su competencia específica real (competence_id,
    # FK de verdad) -- se deriva de ahí en vez de adivinar por el prefijo
    # del código, así que cualquier criterio que la IA active marca también
    # su competencia, sin que la IA tenga que proponerla ella misma.
    competencias_usadas = set()

    def _mapear_criterios(codigos):
        ids = []
        for codigo in (codigos or []):
            criterio = criterios_por_codigo.get(codigo)
            if criterio:
                ids.append(str(criterio.id))
                competencias_usadas.add(str(criterio.competence_id))
            else:
                codigos_descartados.append(codigo)
        return ids

    ids_saberes = []
    for codigo in (datos.get("linkedBasicKnowledgeIds") or []):
        if codigo in saberes_por_codigo:
            ids_saberes.append(saberes_por_codigo[codigo])
        else:
            codigos_descartados.append(codigo)

    ids_criterios = _mapear_criterios(datos.get("linkedCriteriaIds"))

    session_details = []
    for sesion in (datos.get("sessionDetails") or []):

        actividades = []
        for act in (sesion.get("actividades") or []):
            actividades.append({
                "titulo": _reintegrar_texto(act.get("titulo", ""), mapa),
                "tipo": act.get("tipo") or None,
                "agrupamiento": act.get("agrupamiento") or None,
                "duracionMin": act.get("duracionMin"),
                "recursos": act.get("recursos") or [],
                "descripcion": _reintegrar_texto(act.get("descripcion", ""), mapa),
                "linkedCriteriaIds": _mapear_criterios(act.get("linkedCriteriaIds")),
                "adaptacion": _reintegrar_texto(act.get("adaptacion") or "", mapa) or None,
            })

        # Compatibilidad con respuestas que aún trajeran el esquema plano
        # antiguo ("description" suelto, sin "actividades") -- se envuelve
        # como una única actividad genérica en vez de descartar la sesión.
        if not actividades and sesion.get("description"):
            actividades = [{
                "titulo": "", "tipo": None, "agrupamiento": None, "duracionMin": None,
                "recursos": [], "descripcion": _reintegrar_texto(sesion["description"], mapa),
                "linkedCriteriaIds": [], "adaptacion": None,
            }]

        session_details.append({
            "titulo": _reintegrar_texto(sesion.get("titulo", ""), mapa),
            "actividades": actividades,
        })

    producto_datos = datos.get("finalProduct") or {}
    final_product = {
        "incluido": bool(producto_datos.get("incluido")),
        "tipo": producto_datos.get("tipo") or None,
        "descripcion": _reintegrar_texto(producto_datos.get("descripcion", ""), mapa) or None,
        "linkedCriteriaIds": _mapear_criterios(producto_datos.get("linkedCriteriaIds")),
    }

    # A diferencia del producto (que la IA siempre genera), el examen es
    # opcional -- "incluido" ya viene decidido por el toggle del profesor en
    # el prompt (ver construir_prompt), aquí solo se parsea lo que haya
    # devuelto la IA dentro de ese acuerdo.
    examen_datos = datos.get("finalExam") or {}
    final_exam = {
        "incluido": bool(examen_datos.get("incluido")),
        "formato": examen_datos.get("formato") or None,
        "bloques": [
            {
                "descripcion": _reintegrar_texto(bloque.get("descripcion", ""), mapa),
                "linkedCriteriaIds": _mapear_criterios(bloque.get("linkedCriteriaIds")),
            }
            for bloque in (examen_datos.get("bloques") or [])
        ],
    }

    unidad = {
        "name": _reintegrar_texto(datos.get("name", ""), mapa),
        "context": _reintegrar_texto(datos.get("context", ""), mapa),
        "sessions": datos.get("sessions", len(session_details)),
        "sessionDetails": session_details,
        "finalProduct": final_product,
        "finalExam": final_exam,
        "linkedBasicKnowledgeIds": ids_saberes,
        "linkedCriteriaIds": ids_criterios,
        # Derivadas de los criterios realmente usados (ver competencias_usadas
        # arriba) -- la IA nunca las propone directamente.
        "linkedSpecificCompetenceIds": sorted(competencias_usadas),
    }

    return unidad, codigos_descartados
