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

import json
import re
import time
from collections import Counter

import json_repair

from services.basic_knowledge import list_basic_knowledge
from services.courses import get_course
from services.criteria import list_criteria
from services.enrollments import list_enrollments
from services.llm_client import (
    LimiteTasaGroq,
    PeticionDemasiadoGrandeGroq,
    generar_texto_groq,
    generar_texto_groq_por_partes,
)
from services.preferences import get_preferences
from services.programming_units import list_programming_units


# Combina los rasgos de estilo (teacher_profile) con las notas libres sobre
# el material (teacher_notes) en una única frase para inyectar en el prompt
# -- mismo criterio en las dos funciones que abren un prompt de SA
# (construir_prompt y _cabecera_prompt_parte), antes cada una lo montaba
# por su cuenta con el mismo código duplicado.
def _frase_perfil_docente():
    prefs = get_preferences()
    partes = []
    if prefs.teacher_profile:
        partes.append("tu estilo como docente: " + "; ".join(prefs.teacher_profile))
    if prefs.teacher_notes and prefs.teacher_notes.strip():
        partes.append("cómo prefieres el material que generas: " + prefs.teacher_notes.strip())
    return f" -- {' -- '.join(partes)} --" if partes else ""


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
    duracion_sesion_min=55,
    diagnostico_incluido=False, diagnostico_minutos=None,
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
      bloques del examen dentro de ese formato dado.

    El perfil docente (rasgos de estilo al enseñar, p.ej. "Cercano y
    motivador", "Prioriza la práctica sobre la teoría") se lee de
    Preferencias (services/preferences.py, fila única de toda la app) y se
    inyecta en la frase de apertura del prompt -- no es un parámetro de esta
    función porque, a diferencia del resto, no lo decide el profesor cada
    vez que genera una SA, sino una sola vez en Ajustes y se reutiliza
    siempre.

    `duracion_sesion_min`: no hay minutos reales guardados en el horario
    (los periodos son solo etiquetas tipo "1ª hora", sin duración) -- el
    profesor lo indica a mano en el wizard, 55 por defecto, y sustituye al
    "una sesión = una hora lectiva" que se usaba antes de fijo.

    `diagnostico_incluido`/`diagnostico_minutos`: si se activa, la primera
    sesión reserva esos minutos para una actividad de diagnóstico de
    conocimientos previos -- solo tiene sentido si hay SA anteriores en el
    curso (ver más abajo, situaciones_anteriores), que es de donde sale lo
    que se supone que el alumnado ya debería saber.

    Las SA anteriores del mismo curso (nombre, fecha de inicio si la
    tiene, contexto/situación de partida -- NUNCA los códigos de
    criterios/saberes que cubrieron, demasiado granulares para ser útiles
    aquí) se leen siempre de `list_programming_units` y se inyectan como
    contexto, tanto para evitar repetir contenido como para que el
    diagnóstico (si se pide) compruebe algo concreto de verdad."""

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

    # SA anteriores del curso -- solo nombre, fecha si la tiene y contexto en
    # lenguaje natural (nunca códigos de criterios/saberes, demasiado
    # granulares para dar una idea real de qué se trabajó). Sirve tanto para
    # no repetir contenido como base del diagnóstico de conocimientos
    # previos si se pide.
    unidades_anteriores = list_programming_units(course_id)
    if unidades_anteriores:
        lineas_anteriores = []
        for u in unidades_anteriores:
            fecha = f" ({u.start_date.strftime('%d/%m/%Y')})" if u.start_date else ""
            contexto = f": {u.context}" if u.context else ""
            lineas_anteriores.append(f"- {u.name}{fecha}{contexto}")
        seccion_sa_anteriores = (
            "\n<situaciones_de_aprendizaje_anteriores_del_curso>\n"
            "Ya se han dado estas situaciones de aprendizaje en este mismo curso, de más antigua a más "
            "reciente (o sin fecha si todavía no se ha fijado). Es lo que el alumnado ya debería saber -- "
            "no repitas este contenido, y tenlo en cuenta como base de lo que ya se ha trabajado:\n"
            + "\n".join(lineas_anteriores)
            + "\n</situaciones_de_aprendizaje_anteriores_del_curso>\n"
        )
    else:
        seccion_sa_anteriores = ""

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
        instruccion_sesiones = f"Usa exactamente {sesiones_fijo} sesiones de clase (una sesión = {duracion_sesion_min} minutos)."
    elif sesiones_modo == "rango" and sesiones_min and sesiones_max:
        instruccion_sesiones = (
            f"Usa entre {sesiones_min} y {sesiones_max} sesiones de clase (una sesión = "
            f"{duracion_sesion_min} minutos) -- decide tú el número exacto dentro de ese rango según "
            f"la cantidad de contenido real."
        )
    else:
        instruccion_sesiones = (
            f"Tú decides cuántas sesiones de clase hacen falta (una sesión = {duracion_sesion_min} "
            f"minutos) según la cantidad de contenido real -- no fuerces un número concreto."
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
            "final. Tampoco al revés: dentro de UNA misma sesión, no fuerces una etiqueta distinta "
            "por actividad solo por variar -- pocas actividades bien hiladas (p.ej. explicación breve, "
            "práctica guiada, aplicación, cierre) valen más que cambiar de dinámica en cada una; usa "
            "gamificación u otras metodologías vistosas solo cuando aporten algo real. Ten en cuenta "
            "también el esfuerzo real de preparación para el profesor: si vas a proponer varias "
            "actividades de un tipo que normalmente exige crear materiales propios (gamificación con "
            "tableros/cartas/fichas, ABP con documentación extensa, etc.), no te excedas en su número "
            "ni en la complejidad de esos materiales."
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
            f"ese producto final, dentro de esa situación -- cada sesión debería dejar algo (una idea, un "
            f"dato, una pieza) que las sesiones siguientes puedan reutilizar para montarlo, en vez de que "
            f"aparezca de la nada solo en la última sesión."
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
            "diseñadas arriba, no algo que no se haya visto en clase. Las preguntas concretas y sus puntos no "
            "se diseñan aquí -- el profesor genera después el instrumento del examen (con sus preguntas) desde "
            "Instrumentos de Evaluación, a partir de estos bloques."
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

    # Diagnóstico de conocimientos previos -- solo tiene sentido si hay algo
    # que diagnosticar, así que se apoya en seccion_sa_anteriores (si el
    # curso no tiene SA anteriores, no se avisa de nada raro, simplemente el
    # diagnóstico saldría genérico; es el profesor quien decide si lo pide).
    if diagnostico_incluido and diagnostico_minutos:
        instruccion_diagnostico = (
            f"\nLa PRIMERA sesión debe reservar sus primeros {diagnostico_minutos} minutos para una "
            "actividad de diagnóstico de conocimientos previos: comprueba lo que el alumnado ya debería "
            "saber de las situaciones de aprendizaje anteriores de este curso (ver más abajo si las hay). "
            "El resto de esa sesión y las siguientes se dedican al contenido nuevo de esta unidad.\n"
        )
    else:
        instruccion_diagnostico = ""

    frase_perfil = _frase_perfil_docente()

    prompt = f"""Eres un profesor de {curso.subject} de {curso.level}{frase_perfil} diseñando una situación \
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

IMPORTANTE, son dos listas de códigos DISTINTAS y NO se mezclan nunca: los saberes suelen tener formato \
LETRA.NÚMERO (p.ej. "A.1", "C.3") y los criterios NÚMERO.NÚMERO (p.ej. "1.1", "3.2"), pero el formato puede variar \
de un curso a otro -- lo que nunca cambia es que cada código pertenece a UNA sola de las dos listas de arriba. \
Todo campo "linkedCriteriaIds" va EXCLUSIVAMENTE con códigos de la lista de CRITERIOS DE EVALUACIÓN -- nunca con \
códigos de la lista de saberes, aunque parezcan relacionados con lo que se está evaluando. Antes de escribir cada \
código, comprueba en qué lista de arriba aparece tal cual.
{seccion_grupo}{seccion_diseno}{seccion_sa_anteriores}
<tarea>
{instruccion_tarea}

Antes de diseñar nada más, decide esto -- es lo que da sentido al resto:
{instruccion_producto}{instruccion_examen}
{instruccion_diagnostico}
Reparte el contenido en sesiones de clase, cubriendo todo el contenido de principio a fin, \
en el orden que tenga más sentido pedagógico. Cada sesión tiene que aportar de forma reconocible a la \
situación de partida decidida arriba -- no un desarrollo de contenido genérico que podría pertenecer a \
cualquier unidad sobre el tema. {instruccion_sesiones}
{"Ten en cuenta las características del grupo dadas arriba al diseñar las sesiones." if caracteristicas_grupo else ""}

Para cada sesión, repártela en una o más actividades siguiendo el diseño didáctico de arriba. \
Para cada actividad:
- Un título breve.
- El tipo de actividad (de los tipos dados).
- El agrupamiento: individual, parejas, pequeño_grupo o gran_grupo.
- Duración en minutos (deben sumar, aproximadamente, la duración de la sesión) -- cuenta el tiempo real de aula \
con alumnado real, no solo el trabajo intelectual puro: explicar la consigna, organizar agrupamientos, repartir \
y recoger materiales y las transiciones entre actividades también consumen minutos reales. No diseñes la sesión \
como si cada actividad se ejecutara al instante y sin fricción -- si el reparto queda demasiado ajustado, reduce \
el número de actividades en vez de comprimir estos tiempos.
- Recursos necesarios, si aplica.
- Una descripción real y desarrollada de la actividad -- {"aquí va el contenido teórico que redactes, no un resumen" if modo == "descripcion" else "fiel al documento"}.
- Los criterios de evaluación que activa (de la lista dada, cero o más -- solo si esta actividad concreta lo \
evidencia de verdad, no para dar cobertura o porque "encaje en general" con el tema).
- Una adaptación para atender a la diversidad del grupo, solo si esa actividad concreta lo necesita (deja el campo vacío si no).

Ojo, no basta con que los minutos cuadren: la CANTIDAD de trabajo que le pides al alumnado dentro de esa actividad \
tiene que caber de verdad en ese tiempo con alumnado real, no ideal -- construir y presentar varios productos, \
identificar muchos elementos, o completar varias tareas seguidas en pocos minutos es sobrecarga aunque la resta \
de minutos salga bien. Si una actividad pide demasiado para su duración, reduce lo que se pide (menos elementos, \
menos productos, menos exposiciones) en vez de solo ajustar el número de minutos.

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


def _parsear_json(texto):
    """json.loads normal, y si falla, json_repair como red de seguridad --
    las IA online (y a veces la propia Groq) devuelven JSON casi válido
    pero con fallos de formato habituales: comillas sin escapar dentro de
    una cadena larga (probado con un caso real: un título citado dentro de
    una "descripcion" rompía el JSON porque esa comilla interna cierra la
    cadena antes de tiempo para el parser), saltos de línea sin escapar,
    comas finales... json.loads(strict=False) ya cubre lo segundo, pero no
    las comillas sin escapar -- eso solo lo arregla json_repair. Se intenta
    primero el parseo normal (más rápido y más estricto, mejor si el JSON
    ya es válido) y solo se recurre a json_repair si hace falta."""

    try:
        return json.loads(texto, strict=False)
    except json.JSONDecodeError:
        return json_repair.loads(texto)


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
    revisión del frontend (mismo esquema que SessionActivity en types.ts)."""

    try:
        datos = _parsear_json(_extraer_json(respuesta_texto))
    except Exception as exc:
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
    bloques_examen = examen_datos.get("bloques") or []
    final_exam = {
        "incluido": bool(examen_datos.get("incluido")),
        "formato": examen_datos.get("formato") or None,
        "bloques": [
            {
                "descripcion": _reintegrar_texto(bloque.get("descripcion", ""), mapa),
                "linkedCriteriaIds": _mapear_criterios(bloque.get("linkedCriteriaIds")),
            }
            for bloque in bloques_examen
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


# ==========================================================
# Generación automática con Groq
# ==========================================================
#
# A diferencia del resto de este módulo (que arma un prompt para copiar y
# pegar en una IA online), esto llama DIRECTAMENTE a Groq -- mismo criterio
# ya aplicado en instrumento_evaluacion.py. La diferencia real con
# Instrumentos es el tamaño: una SA mete el currículo completo Y el
# documento de teoría entero en un único prompt, que fácilmente supera el
# límite REAL de la capa gratuita de Groq para gpt-oss-120b (8.000
# tokens/minuto, comprobado en las cabeceras de la propia API -- el código
# llevaba 6.000 puesto a ojo, más conservador de lo necesario; compartidos
# entre entrada y salida de TODAS las llamadas de ese minuto, no por
# llamada). Antes de generar, se estima el tamaño; si no cabe y el motivo
# es un documento largo (Modo A), se resume el documento con la propia
# Groq y se reintenta con la versión corta. Si aun así no cabe, se avisa
# con claridad -- para esos casos quedan la IA local (sin límite de
# tamaño, solo más lenta), la IA online, o el generador POR PARTES más
# abajo (generar_situacion_aprendizaje_por_partes_groq, boceto + una
# llamada por sesión) para quien prefiera esperar un poco más a cambio de
# quedarse en Groq.

PRESUPUESTO_TPM_GROQ = 8000
_MARGEN_SEGURIDAD_TPM = 7500


class SADemasiadoGrandeError(ValueError):
    """Como ValueError, pero distinguible por el router (y de ahí el
    frontend) sin tener que reconocer el mensaje en español -- para poder
    ofrecer el generador por partes como alternativa automáticamente en vez
    de solo mostrar un error de texto."""

    def __init__(self, estimado):
        self.estimado = estimado
        super().__init__(
            f"Esta situación de aprendizaje es demasiado grande para Groq en el nivel gratuito "
            f"(~{estimado} tokens estimados, el límite es {PRESUPUESTO_TPM_GROQ}/minuto)."
        )
# Tokens por sesión de sessionDetails -- calibrado contra una respuesta
# real (2 sesiones sin producto/examen -> ~1.369 tokens, unos 685/sesión;
# se redondea al alza para dejar margen). Una constante fija (probada
# primero, 3.500) resultó demasiado pesimista -- rechazaba de más SA
# pequeñas que en realidad sí cabían, confirmado probando la llamada real
# sin la comprobación previa.
_TOKENS_POR_SESION = 750
_TOKENS_BASE_SALIDA = 400  # name, context, linkedBasicKnowledgeIds/linkedCriteriaIds
_TOKENS_PRODUCTO = 300
_TOKENS_EXAMEN = 800  # bloques + preguntas con puntos


def estimar_tokens(texto):
    """Heurística simple (caracteres/4) -- Groq no expone aquí un
    tokenizador propio fácil de usar, y no hace falta más precisión que la
    necesaria para decidir con margen si un prompt cabe en el presupuesto
    de la capa gratuita."""

    return max(1, len(texto) // 4)


def _estimar_salida(sesiones_fijo, sesiones_max, producto_incluido, examen_incluido):
    """Nº de sesiones real si se fijó, el máximo del rango si se dio un
    rango, o una suposición conservadora (6) si se deja decidir a la IA."""

    num_sesiones = sesiones_fijo or sesiones_max or 6
    salida = _TOKENS_BASE_SALIDA + num_sesiones * _TOKENS_POR_SESION
    if producto_incluido:
        salida += _TOKENS_PRODUCTO
    if examen_incluido:
        salida += _TOKENS_EXAMEN
    return salida


def _resumir_documento_groq(documento_texto):
    """Resume el documento de teoría con la propia Groq -- solo se llama
    cuando el prompt completo no cabe en el presupuesto gratuito. Pide
    conservar TODOS los temas/apartados (ni uno menos), solo comprimidos,
    para no perder cobertura curricular real por el camino."""

    prompt_resumen = (
        "Resume el siguiente documento de teoría de forma MUY compacta pero fiel: conserva TODOS "
        "los temas o apartados que trata (ni uno menos), reduciendo cada uno a sus ideas clave en "
        "una o dos líneas. No añadas nada que no esté ya en el original -- el resultado se usará "
        "para diseñar una unidad didáctica real, tiene que seguir sirviendo como referencia fiel "
        "del contenido, no quedarse en una frase genérica.\n\n"
        f"<documento>\n{documento_texto}\n</documento>"
    )

    resumen = generar_texto_groq(prompt_resumen, max_tokens=1500)

    if resumen is None:
        raise ValueError("Groq no está disponible ahora mismo para resumir el documento.")

    return resumen


def generar_situacion_aprendizaje_groq(
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
    duracion_sesion_min=55,
    diagnostico_incluido=False, diagnostico_minutos=None,
):
    """Mismos argumentos que construir_prompt() (misma firma, se reenvían
    tal cual) -- arma el prompt, comprueba si cabe en Groq y, si no y hay
    margen para intentarlo, resume el documento y reintenta. Devuelve
    (unidad, codigos_descartados, documento_resumido).
    Lanza ValueError si no hay forma de que quepa, o si Groq no responde."""

    def _construir():
        return construir_prompt(
            course_id, documento_texto, modo,
            sesiones_modo, sesiones_fijo, sesiones_min, sesiones_max,
            caracteristicas_grupo,
            tipos_actividad, estructuras_cooperativas, actividades_obligatorias,
            estructura_sesion, estructura_sesion_detalle,
            progresion_autonomia,
            atencion_diversidad, atencion_diversidad_detalle,
            class_id,
            producto_incluido, producto_tipo,
            examen_incluido, examen_formato,
            duracion_sesion_min,
            diagnostico_incluido, diagnostico_minutos,
        )

    salida_estimada = _estimar_salida(sesiones_fijo, sesiones_max, producto_incluido, examen_incluido)

    prompt, mapa = _construir()
    estimado = estimar_tokens(prompt) + salida_estimada

    documento_resumido = False

    if estimado > _MARGEN_SEGURIDAD_TPM and modo == "documento":
        documento_texto = _resumir_documento_groq(documento_texto)
        prompt, mapa = _construir()
        estimado = estimar_tokens(prompt) + salida_estimada
        documento_resumido = True

    if estimado > _MARGEN_SEGURIDAD_TPM:
        raise SADemasiadoGrandeError(estimado)

    respuesta_texto = generar_texto_groq(prompt, max_tokens=4000)

    if respuesta_texto is None:
        raise ValueError(
            "Groq no está disponible ahora mismo. Inténtalo de nuevo, o usa la IA local o la IA online."
        )

    unidad, codigos_descartados = procesar_respuesta(course_id, respuesta_texto, mapa)

    return unidad, codigos_descartados, documento_resumido


# ==========================================================
# Generación POR PARTES con Groq (fallback cuando la de una sola vez no cabe)
# ==========================================================
#
# Probado contra datos reales (curso real de BYG 3º ESO, currículo real):
# una SA normal con 4-6 sesiones + producto + examen suma más de los 8.000
# tokens/minuto de la capa gratuita de Groq -- y un modelo con más
# presupuesto no lo arregla (groq/compound-mini anuncia 70K TPM pero en la
# práctica reparte el trabajo real al mismo gpt-oss-120b con su mismo tope
# de 8.000, y además corta la respuesta a mitad en generaciones largas de
# una sola vez -- probado, descartado).
#
# Trocear SOLO la salida (una llamada por sesión) no basta: el currículo
# completo del curso (saberes+criterios) y el documento de teoría son la
# parte que más pesa de la ENTRADA, y si se repiten sin reducir en cada
# llamada, la suma de varias llamadas "pequeñas" de sobra vuelve a agotar
# el cupo entre sí (confirmado con datos reales: fallaba paso a paso igual
# que la versión de una sola vez). Por eso el primer paso real no es el
# boceto, es construir_prompt_seleccion: UNA llamada que resume el
# documento (si es largo) y selecciona solo los códigos de saberes/
# criterios realmente relacionados con el tema, de entre TODOS los del
# curso -- ese currículo y documento ya reducidos son los que se reutilizan
# en el boceto y en todas las ampliaciones posteriores, no los originales.
#
# Después del paso de selección: un boceto (esqueleto -- títulos/tema/
# códigos de cada sesión, sin actividades todavía) y luego una llamada por
# sesión + una para el producto final + una para el examen final, cada una
# pequeña de sobra. Cada llamada por separado cabe sin problema; lo que
# puede agotar el cupo es la SUMA de varias seguidas -- por eso cada
# llamada usa generar_texto_groq_por_partes (distingue el 429 de cualquier
# otro fallo) y se reintenta UNA vez esperando el tiempo real que indica
# Groq (con margen, ver llm_client.py) antes de rendirse. Si un paso falla
# dos veces seguidas, se aborta toda la generación (no se guarda una SA a
# medias) y se avisa con claridad -- queda la vía de copiar/pegar en una IA
# online como alternativa.
#
# Deliberadamente NO repite todo el detalle de construir_prompt() (tipos de
# actividad con su descripción larga, estructuras cooperativas, progresión
# de autonomía palabra por palabra...) en cada llamada -- el boceto ya fija
# el reparto real de contenido y códigos por sesión, que es lo que de
# verdad protege la coherencia entre llamadas; las ampliaciones solo
# necesitan un resumen del estilo pedagógico pedido, no el texto completo.
# Si en el futuro se nota que esto se queda corto, es el sitio para
# extraerlo a un helper compartido con construir_prompt() en vez de
# duplicarlo entero.

# Un 429 (cupo agotado, de minuto o de día -- ver console.groq.com/docs/rate-limits)
# NO es un error nuestro: es cuestión de esperar el tiempo real que indica
# la propia Groq y reintentar, por mucho que sea (antes se abortaba a los
# 90s de espera indicada y tras 1 solo reintento -- pensado para una
# petición síncrona con alguien mirando la pantalla; ahora que esto corre
# en un trabajo de fondo, esperar horas si hace falta es aceptable). Lo
# único que de verdad debe abortar el paso es que la petición en sí sea
# demasiado grande para caber aunque el cupo esté completamente lleno (413,
# ver PeticionDemasiadoGrandeGroq en llm_client.py) -- eso no lo arregla
# ningún tiempo de espera. Este tope de espera ACUMULADA por paso es solo
# una válvula de seguridad para un fallo realmente patológico (Groq caído
# del todo, o algo que siempre devuelve una espera larga) -- en uso normal
# nunca debería alcanzarse.
_ESPERA_MAXIMA_ACUMULADA_SEGUNDOS = 24 * 3600

# Tamaño de cada tramo de espera cuando se duerme un rato largo (esperas de
# 429, sobre todo) -- comprobar la cancelación solo al principio y al final
# de una espera de 35 minutos dejaría el trabajo colgado ese tiempo entero
# aunque el usuario ya haya pulsado "Cancelar" en la cola de trabajos.
_TRAMO_ESPERA_CANCELABLE_SEGUNDOS = 5.0


class TrabajoCanceladoError(Exception):
    """El usuario ha cancelado este trabajo desde la cola (ver
    routers/prompts.py, POST /prompts/trabajos/{job_id}/cancelar) -- se
    lanza desde _dormir_cancelable o justo antes de cada paso del
    generador por partes, nunca a mitad de una llamada HTTP a Groq ya en
    marcha (esa se deja terminar, solo no se lanza la siguiente)."""


def _dormir_cancelable(segundos, debe_cancelar):
    fin = time.monotonic() + segundos
    while True:
        if debe_cancelar and debe_cancelar():
            raise TrabajoCanceladoError()
        restante = fin - time.monotonic()
        if restante <= 0:
            return
        time.sleep(min(restante, _TRAMO_ESPERA_CANCELABLE_SEGUNDOS))


def _resumen_estilo_didactico(
    tipos_actividad, estructura_sesion, estructura_sesion_detalle,
    progresion_autonomia, atencion_diversidad, atencion_diversidad_detalle,
):
    partes = []
    if tipos_actividad:
        # Con solo el nombre del tipo (sin su descripción de
        # _DESCRIPCIONES_TIPOS_ACTIVIDAD) la IA se queda en la etiqueta y el
        # resultado sale soso -- mismo problema ya documentado arriba para
        # construir_prompt(), que sí las incluye; esta versión (generador
        # por partes, la que se usa casi siempre en la práctica por los
        # límites de tasa de Groq) se había quedado corta.
        lista_tipos = "; ".join(
            f"{t} ({_DESCRIPCIONES_TIPOS_ACTIVIDAD[t]})" if t in _DESCRIPCIONES_TIPOS_ACTIVIDAD else t
            for t in tipos_actividad
        )
        partes.append(
            "Tipos de actividad disponibles (no hace falta usarlos todos en esta sesión): "
            + lista_tipos
            + ". No fuerces una etiqueta distinta por actividad -- pocas actividades bien hiladas "
            "(p.ej. explicación breve, práctica guiada, aplicación, cierre) valen más que cambiar de "
            "dinámica en cada una; usa gamificación u otras metodologías vistosas solo cuando aporten "
            "algo real a lo que se está trabajando, no por variar."
        )
    partes.append("Estructura de cada sesión: " + (estructura_sesion_detalle or _ETIQUETAS_ESTRUCTURA_SESION.get(estructura_sesion, _ETIQUETAS_ESTRUCTURA_SESION["ia"])))
    partes.append("Progresión de autonomía: " + _ETIQUETAS_PROGRESION.get(progresion_autonomia, _ETIQUETAS_PROGRESION["ia"]))
    partes.append("Atención a la diversidad: " + (atencion_diversidad_detalle or _ETIQUETAS_DIVERSIDAD.get(atencion_diversidad, _ETIQUETAS_DIVERSIDAD["diferenciadas"])))
    return " ".join(partes)


def _contexto_curriculo(course_id):

    curso = get_course(course_id)
    if curso is None:
        raise ValueError("Curso no encontrado.")

    saberes = list_basic_knowledge(course_id)
    criterios = list_criteria(course_id)
    if not saberes and not criterios:
        raise ValueError(
            "Este curso no tiene saberes básicos ni criterios de evaluación "
            "cargados todavía -- añádelos en Ajustes antes de generar una "
            "unidad con IA."
        )

    return curso, saberes, criterios


def _formatear_curriculo(saberes, criterios):
    lista_saberes = "\n".join(f"- {s.code}: {s.description}" for s in saberes) or "(ninguno cargado en este curso)"
    lista_criterios = "\n".join(f"- {c.code}: {c.description}" for c in criterios) or "(ninguno cargado en este curso)"
    return lista_saberes, lista_criterios


def _cabecera_prompt_parte(curso):
    frase_perfil = _frase_perfil_docente()
    return f"Eres un profesor de {curso.subject} de {curso.level}{frase_perfil}."


def _prefijo_compartido(curso, documento_texto, modo, lista_saberes, lista_criterios):
    """Bloque IDÉNTICO (mismo texto, mismo orden) al principio de boceto +
    cada ampliación de sesión/producto/examen de UNA misma generación --
    documento y currículo son lo más pesado de cada prompt y no cambian
    entre esas llamadas (ver el paso de selección/reducción más arriba).
    Al ir siempre en cabeza y ser byte a byte igual, Groq puede aplicar su
    caché de prompt (confirmado: por prefijo exacto desde el principio,
    2h de validez, los tokens cacheados no cuentan para el límite de
    tasa) -- la primera llamada de la tanda lo paga entero, las
    siguientes ya no. Si esto alguna vez deja de ir primero en alguna de
    las 4 funciones que lo usan, se pierde el caché para TODAS, no solo
    para esa -- cualquier cambio de orden rompe el prefijo compartido."""

    etiqueta_entrada = "documento_de_teoria" if modo == "documento" else "descripcion_del_profesor"

    return f"""{_cabecera_prompt_parte(curso)}

<{etiqueta_entrada}>
{documento_texto}
</{etiqueta_entrada}>

<curriculo_oficial_del_curso>
SABERES BÁSICOS (usa solo estos códigos, ninguno más):
{lista_saberes}

CRITERIOS DE EVALUACIÓN (usa solo estos códigos, ninguno más):
{lista_criterios}
</curriculo_oficial_del_curso>

IMPORTANTE, son dos listas de códigos DISTINTAS y NO se mezclan nunca: los saberes suelen tener formato \
LETRA.NÚMERO (p.ej. "A.1", "C.3") y los criterios NÚMERO.NÚMERO (p.ej. "1.1", "3.2"), pero el formato puede variar \
de un curso a otro -- lo que nunca cambia es que cada código pertenece a UNA sola de las dos listas de arriba. \
Todo campo "linkedCriteriaIds" (a nivel de unidad, sesión, actividad, producto o examen) va EXCLUSIVAMENTE con \
códigos de la lista de CRITERIOS DE EVALUACIÓN -- nunca con códigos de la lista de saberes, aunque parezcan \
relacionados con lo que se está evaluando. Antes de escribir cada código, comprueba en qué lista de arriba \
aparece tal cual."""


def _prefijo_con_esqueleto(curso, documento_texto, modo, lista_saberes, lista_criterios, boceto):
    """Extiende _prefijo_compartido con el esqueleto ya fijado (contexto +
    lista de sesiones) para las tres ampliaciones que lo necesitan --
    sesión, producto y examen. El marcador de "qué sesión toca ahora" NO
    puede ir aquí (rompería el prefijo idéntico entre una sesión y la
    siguiente, invalidando el caché para todas) -- construir_prompt_ampliar_sesion
    lo añade aparte, al final de su propio prompt."""

    resumen_sesiones = "\n".join(f"{i + 1}. {s['titulo']} -- {s['tema']}" for i, s in enumerate(boceto["sessions"]))
    return f"""{_prefijo_compartido(curso, documento_texto, modo, lista_saberes, lista_criterios)}

Ya se fijó el esqueleto de esta situación de aprendizaje (contexto: "{boceto['context']}") -- NO lo cambies:
{resumen_sesiones}"""


def construir_prompt_seleccion(documento_texto, modo, lista_saberes, lista_criterios):
    """Paso 0 (de verdad el primero) del generador por partes: reduce lo
    que se repetirá en TODAS las llamadas siguientes -- resume el documento
    si es largo (modo "documento"; en modo "descripcion" ya es corto por
    naturaleza, no hace falta) y selecciona, de entre TODOS los códigos del
    curso, solo los relacionados con este tema. Sin esto, cada llamada
    posterior (boceto + una por sesión + producto + examen) repetiría el
    currículo y el documento completos, y la suma de varias llamadas
    "pequeñas" agota el mismo cupo de 8.000 t/min que la generación de una
    sola vez -- confirmado con datos reales, ver el bloque de comentarios
    de más arriba."""

    etiqueta_entrada = "documento_de_teoria" if modo == "documento" else "descripcion_del_profesor"

    if modo == "documento":
        instruccion_resumen = (
            "1. Si el documento es largo, resúmelo de forma MUY compacta pero fiel: conserva TODOS los temas o "
            "apartados que trata (ni uno menos), reducidos a sus ideas clave en una o dos líneas cada uno. Si ya "
            "es corto, devuélvelo tal cual, sin resumir.\n"
        )
        campo_resumen = '  "documentoResumido": "...",\n'
        num_tarea_codigos = "2"
    else:
        instruccion_resumen = ""
        campo_resumen = ""
        num_tarea_codigos = "1"

    return f"""Eres un asistente que prepara el material para diseñar una situación de aprendizaje -- NO la diseñes \
tú todavía, solo prepara el contexto.

<{etiqueta_entrada}>
{documento_texto}
</{etiqueta_entrada}>

<saberes_basicos_del_curso>
{lista_saberes}
</saberes_basicos_del_curso>

<criterios_evaluacion_del_curso>
{lista_criterios}
</criterios_evaluacion_del_curso>

Tareas:
{instruccion_resumen}{num_tarea_codigos}. De las listas de arriba, selecciona SOLO los códigos realmente relacionados \
con el contenido de {etiqueta_entrada} -- los que tendría sentido trabajar en una situación de aprendizaje sobre \
este tema. Sé generoso si hay duda razonable, pero no incluyas códigos sin relación real. No inventes códigos que \
no estén en las listas de arriba.

Devuelve ÚNICAMENTE un JSON, sin texto antes ni después:
{{
{campo_resumen}  "codigosSaberes": ["códigos seleccionados"],
  "codigosCriterios": ["códigos seleccionados"]
}}"""


def construir_prompt_boceto(
    curso, lista_saberes, lista_criterios, documento_texto, modo="documento",
    sesiones_modo="ia", sesiones_fijo=None, sesiones_min=None, sesiones_max=None,
    caracteristicas_grupo=None,
    producto_incluido=True, producto_tipo=None,
    examen_incluido=False, examen_formato=None,
    duracion_sesion_min=55,
):
    """Primer paso del generador por partes: el esqueleto -- título/tema/
    códigos de cada sesión, sin actividades. Aquí se decide toda la
    coherencia global (qué toca cada sesión, en qué orden); las ampliaciones
    posteriores ya no pueden cambiar esto, solo rellenar detalle dentro.
    Recibe curso/lista_saberes/lista_criterios ya resueltos (no course_id)
    porque el orquestador los reduce primero con construir_prompt_seleccion
    -- ver el bloque de comentarios sobre la generación por partes."""

    if not documento_texto.strip():
        raise ValueError("El documento está vacío." if modo == "documento" else "La descripción está vacía.")

    if sesiones_modo == "fijo" and sesiones_fijo:
        instruccion_sesiones = f"Usa exactamente {sesiones_fijo} sesiones."
    elif sesiones_modo == "rango" and sesiones_min and sesiones_max:
        instruccion_sesiones = f"Usa entre {sesiones_min} y {sesiones_max} sesiones -- decide tú el número exacto según la cantidad de contenido real."
    else:
        instruccion_sesiones = "Tú decides cuántas sesiones hacen falta según la cantidad de contenido real."

    seccion_grupo = ""
    if caracteristicas_grupo:
        seccion_grupo = "\n<contexto_del_grupo>\n" + "\n".join(f"- {r}" for r in caracteristicas_grupo) + "\n</contexto_del_grupo>\n"

    instruccion_fuente = (
        "a partir ÚNICAMENTE del documento de teoría de abajo -- no añadas datos, ejemplos ni conceptos "
        "que no aparezcan en él. No omitas ningún apartado."
        if modo == "documento" else
        "a partir de la descripción del profesor de abajo -- tú redactarás el desarrollo teórico en las "
        "ampliaciones posteriores, aquí solo decide el reparto por sesiones."
    )

    bloque_producto = (
        f'"finalProduct": {{"tipo": "{producto_tipo or "elige un tipo adecuado"}", "linkedCriteriaIds": [...]}},'
        if producto_incluido else '"finalProduct": null,'
    )
    bloque_examen = (
        f'"finalExam": {{"formato": "{examen_formato}", "linkedCriteriaIds": [...]}},'
        if examen_incluido else '"finalExam": null,'
    )

    prompt = f"""{_prefijo_compartido(curso, documento_texto, modo, lista_saberes, lista_criterios)}

Diseña SOLO el ESQUELETO de una situación de aprendizaje, {instruccion_fuente} {instruccion_sesiones} \
(cada sesión de {duracion_sesion_min} minutos). NO desarrolles actividades todavía -- eso se hará después, sesión a sesión.
{seccion_grupo}
Antes de repartir las sesiones, decide una SITUACIÓN DE PARTIDA (escenario, problema o pregunta real que dé \
propósito a la unidad){" y, si corresponde, el tipo de producto final" if producto_incluido else ""}. \
No inventes códigos curriculares fuera de las listas de arriba.
{"Al repartir las sesiones, piensa el orden como una CONSTRUCCIÓN PROGRESIVA hacia el producto final -- cada "
 "sesión debería dejar algo (una idea, un dato, una pieza) que las sesiones de ampliación posteriores puedan "
 "reutilizar para montarlo, en vez de que el producto final aparezca de la nada solo en la última sesión." if producto_incluido else ""}

Devuelve ÚNICAMENTE un JSON con esta forma, sin texto antes ni después:
{{
  "name": "Nombre breve de la unidad",
  "context": "La situación de partida",
  {bloque_producto}
  {bloque_examen}
  "sessions": [
    {{"titulo": "Título de la sesión", "tema": "de qué trata, en una frase", "linkedCriteriaIds": ["códigos de CRITERIOS que toca, nunca de saberes"]}}
  ],
  "linkedBasicKnowledgeIds": ["códigos de saberes usados en conjunto"],
  "linkedCriteriaIds": ["códigos de criterios usados en conjunto, nunca de saberes"]
}}"""

    return prompt


def construir_prompt_ampliar_sesion(
    curso, lista_saberes, lista_criterios, boceto, indice_sesion, documento_texto, modo,
    tipos_actividad=None, estructuras_cooperativas=None, actividades_obligatorias=None,
    estructura_sesion="ia", estructura_sesion_detalle=None,
    progresion_autonomia="ia",
    atencion_diversidad="diferenciadas", atencion_diversidad_detalle=None,
    class_id=None,
    duracion_sesion_min=55,
    diagnostico_incluido=False, diagnostico_minutos=None,
):
    """Segundo paso (una llamada por sesión): recibe el boceto ya fijado
    (no lo cambia, solo lo consulta para no repetirse ni salirse de lo que
    le toca a esta sesión) y desarrolla sus actividades completas."""

    sesion = boceto["sessions"][indice_sesion]

    estilo = _resumen_estilo_didactico(
        tipos_actividad, estructura_sesion, estructura_sesion_detalle,
        progresion_autonomia, atencion_diversidad, atencion_diversidad_detalle,
    )

    partes_extra = []
    if estructuras_cooperativas:
        partes_extra.append("Estructuras cooperativas preferidas: " + ", ".join(estructuras_cooperativas) + ".")
    if actividades_obligatorias:
        lineas = [
            f"- {a['texto']}" + (f" (en la sesión {a['sesion']})" if a.get("sesion") else "")
            for a in actividades_obligatorias if a.get("texto", "").strip()
        ]
        if lineas:
            partes_extra.append("Actividades concretas que debes incluir SÍ o SÍ si le tocan a esta sesión:\n" + "\n".join(lineas))

    adaptaciones_neae = resumir_adaptaciones_neae(class_id)
    if adaptaciones_neae:
        partes_extra.append(
            "Adaptaciones NEAE del grupo (agregadas, sin identificar a nadie -- indica una variante en el "
            "campo \"adaptacion\" de una actividad solo si la necesita, vacío si no):\n"
            + "\n".join(f"- {a}" for a in adaptaciones_neae)
        )

    instruccion_diagnostico = ""
    if diagnostico_incluido and diagnostico_minutos and indice_sesion == 0:
        instruccion_diagnostico = (
            f"\nEsta es la PRIMERA sesión: reserva sus primeros {diagnostico_minutos} minutos para diagnosticar "
            "conocimientos previos (lo que el alumnado ya debería saber de situaciones de aprendizaje anteriores "
            "de este curso, si las hay). El resto se dedica al contenido nuevo.\n"
        )

    # Orden pensado para el caché de prompt de Groq, no solo por claridad:
    # todo lo de aquí abajo hasta el marcador "AHORA, desarrolla..." es
    # BYTE A BYTE IGUAL en las N llamadas de sesión de una misma generación
    # (estilo, estructuras, duración, criterios...) -- antes iba justo
    # DESPUÉS de "Desarrolla la sesión {indice_sesion}", que cambia en cada
    # llamada y rompía el prefijo cacheable ahí mismo, aunque todo el resto
    # fuera idéntico. Con esto detrás del prefijo compartido (y lo que sí
    # cambia -- qué sesión toca, el diagnóstico de la sesión 1 -- al final,
    # justo antes del esquema de salida) el tramo cacheable es mucho más
    # largo, sin quitar ni reescribir ninguna instrucción.
    instrucciones_comunes = f"""Estilo pedagógico pedido: {estilo}
{chr(10).join(partes_extra)}

Para cada actividad: título breve, tipo, agrupamiento (individual, parejas, pequeño_grupo o gran_grupo), duración en \
minutos (deben sumar aproximadamente {duracion_sesion_min} -- cuenta el tiempo real de aula con alumnado real, no \
solo el trabajo intelectual puro: explicar la consigna, organizar agrupamientos, repartir y recoger materiales y \
las transiciones entre actividades también consumen minutos reales; si el reparto queda demasiado ajustado, \
reduce el número de actividades en vez de comprimir estos tiempos), recursos si aplica, una descripción real y \
desarrollada \
({"aquí va el contenido teórico que redactes, no un resumen" if modo == "descripcion" else "fiel al documento"}), los \
criterios que activa (de la lista dada, cero o más -- solo si esta actividad concreta lo evidencia de verdad, \
no para dar cobertura o porque "encaje en general" con el tema) y una adaptación de diversidad solo si esa \
actividad la necesita. No inventes códigos curriculares fuera de la lista.

Ojo, no basta con que los minutos cuadren: la CANTIDAD de trabajo que le pides al alumnado dentro de esa actividad \
tiene que caber de verdad en ese tiempo con alumnado real, no ideal -- construir y presentar varios productos, \
identificar muchos elementos, o completar varias tareas seguidas en pocos minutos es sobrecarga aunque la resta \
de minutos salga bien. Si una actividad pide demasiado para su duración, reduce lo que se pide (menos elementos, \
menos productos, menos exposiciones) en vez de solo ajustar el número de minutos."""

    prompt = f"""{_prefijo_con_esqueleto(curso, documento_texto, modo, lista_saberes, lista_criterios, boceto)}

{instrucciones_comunes}

AHORA, desarrolla EN DETALLE la sesión {indice_sesion + 1} de la lista de arriba: "{sesion['titulo']}" \
({duracion_sesion_min} minutos), repartida en una o más actividades siguiendo todo lo anterior. Debe encajar con \
el resto de sesiones ya fijadas -- no repitas contenido de otra sesión ni te salgas del tema que le toca a esta. \
Tiene que verse claramente cómo esta sesión aporta a la situación de partida fijada arriba (contexto) -- no \
actividades sueltas que podrían pertenecer a cualquier unidad sobre este tema.
{instruccion_diagnostico}
Devuelve ÚNICAMENTE un JSON con esta forma, sin texto antes ni después:
{{
  "titulo": "{sesion['titulo']}",
  "actividades": [
    {{
      "titulo": "Título de la actividad", "tipo": "Tipo", "agrupamiento": "individual | parejas | pequeño_grupo | gran_grupo",
      "duracionMin": <minutos>, "recursos": ["recurso 1"], "descripcion": "Descripción real y desarrollada",
      "linkedCriteriaIds": ["códigos de CRITERIOS, nunca de saberes"], "adaptacion": "o cadena vacía"
    }}
  ]
}}"""

    return prompt


def construir_prompt_ampliar_producto(curso, lista_saberes, lista_criterios, boceto, documento_texto, modo):

    prompt = f"""{_prefijo_con_esqueleto(curso, documento_texto, modo, lista_saberes, lista_criterios, boceto)}

El profesor ya decidió el PRODUCTO FINAL: tipo "{boceto['finalProduct']['tipo']}", evidencia los códigos \
{boceto['finalProduct']['linkedCriteriaIds']}. Redacta su descripción completa, coherente con la situación de \
partida y con lo que se trabaja en las sesiones de arriba.

Devuelve ÚNICAMENTE un JSON: {{"descripcion": "Descripción completa del producto final"}}"""

    return prompt


def construir_prompt_ampliar_examen(curso, lista_saberes, lista_criterios, boceto, documento_texto, modo, examen_formato):

    descripcion_formato = _DESCRIPCIONES_FORMATO_EXAMEN.get(examen_formato)
    formato_con_descripcion = f"{examen_formato} ({descripcion_formato})" if descripcion_formato else examen_formato
    prompt = f"""{_prefijo_con_esqueleto(curso, documento_texto, modo, lista_saberes, lista_criterios, boceto)}

El profesor ya decidió el EXAMEN FINAL: formato "{formato_con_descripcion}", evidencia los códigos \
{boceto['finalExam']['linkedCriteriaIds']}. Diseña sus bloques (uno o más): cada bloque describe qué evalúa y \
qué criterios activa (de la lista dada). Debe evaluar contenido realmente trabajado en las sesiones de arriba, \
no algo que no se haya visto en clase. Las preguntas concretas y sus puntos no se diseñan aquí -- el profesor \
genera después el instrumento del examen (con sus preguntas) desde Instrumentos de Evaluación, a partir de \
estos bloques.

Devuelve ÚNICAMENTE un JSON: {{"bloques": [{{"descripcion": "Qué evalúa", "linkedCriteriaIds": ["códigos de criterios, nunca de saberes"]}}]}}"""

    return prompt


_MAX_REINTENTOS_FORMATO = 1


class _LimitadorTasa:
    """Limitador de tasa deslizante local a UNA generación por partes.
    Reducir el tamaño de cada llamada (ver construir_prompt_seleccion) no
    basta por sí solo -- Groq comparte el cupo de 8.000 t/min entre TODAS
    las llamadas de ese minuto, y el orquestador antes las lanzaba seguidas
    sin ningún espaciado; la suma de varias llamadas "pequeñas" dentro de
    la misma ventana de 60s puede agotar igualmente el cupo (confirmado:
    fallaba paso a paso igual que la generación de una sola vez).

    Cada entrada del historial arranca como una RESERVA (el techo pedido,
    prompt + max_tokens) y se CORRIGE por el consumo real en cuanto se
    conoce la respuesta (ver corregir()) -- ni puramente reservas (demasiado
    conservador: confirmado en real que casi todas las llamadas de sesión
    se quedan muy por debajo de su techo -- p.ej. selección+boceto sumaban
    8.075 reservados cuando Groq, con datos reales, solo había consumido
    3.014) ni puramente consumo real sin más (demasiado optimista: probado
    también en real, Groq rechazó una llamada aunque el consumo real
    acumulado quedaba muy por debajo del margen -- el hueco era no haber
    reservado nada para la propia llamada que se estaba a punto de lanzar,
    que Groq sí cuenta contra su techo pedido antes de saber cuánto va a
    generar de verdad). Reservar-y-corregir cubre los dos casos: la llamada
    en vuelo siempre cuenta por su techo (como hace Groq), pero en cuanto
    se sabe lo que costó de verdad dejamos de arrastrar ese sobrecoste para
    las esperas siguientes."""

    def __init__(self, presupuesto=_MARGEN_SEGURIDAD_TPM):
        self._historial = []  # [(timestamp_monotonic, tokens)]
        self._presupuesto = presupuesto

    def reservar(self, tokens_estimados, on_progreso, etiqueta=None):
        """Espera si hace falta y RESERVA por adelantado el coste estimado
        de la llamada que se va a lanzar (prompt + max_tokens, el techo
        pedido) -- no el consumo real posterior, todavía desconocido en
        este momento (ver corregir()). Devuelve la marca de tiempo de la
        reserva, a pasar a corregir() en cuanto se conozca la respuesta."""

        ahora = time.monotonic()
        self._historial = [(t, tok) for t, tok in self._historial if ahora - t < 60]
        consumido = sum(tok for _, tok in self._historial)
        exceso = consumido + tokens_estimados - self._presupuesto
        if exceso > 0:
            # No hace falta esperar a que caduque la reserva MÁS antigua de
            # todas -- basta con que caduquen las justas (de más antigua a
            # más nueva) para cubrir el exceso. self._historial ya está en
            # orden cronológico (siempre se añade al final).
            liberado = 0
            objetivo = None
            for t, tok in self._historial:
                liberado += tok
                if liberado >= exceso:
                    objetivo = t
                    break
            if objetivo is not None:
                espera = 60 - (ahora - objetivo) + 1.0
                if espera > 0:
                    prefijo = f"{etiqueta}: " if etiqueta else ""
                    on_progreso(
                        f"{prefijo}espaciando las llamadas para no agotar el cupo de Groq, esperando {espera:.0f}s...",
                        time.time() + espera,
                    )
                    time.sleep(espera)
                    ahora = time.monotonic()
                    self._historial = [(t, tok) for t, tok in self._historial if ahora - t < 60]
        self._historial.append((ahora, tokens_estimados))
        return ahora

    def corregir(self, marca, tokens_reales):
        """Sustituye la reserva (el techo pedido) de la entrada `marca` por
        lo que de verdad costó la llamada -- 0 si Groq la rechazó sin
        procesarla (429/413, confirmado en real que un rechazo no consume
        cupo: la respuesta de error nunca trae `usage`, y cobrar cómputo
        real que nunca se ejecutó no tendría sentido para Groq). Si `marca`
        ya no está en el historial (caducó, pasados los 60s), no hace nada
        -- ya no pesa en ninguna cuenta futura de todas formas."""

        self._historial = [
            (t, tokens_reales) if t == marca else (t, tok)
            for t, tok in self._historial
        ]


def _llamar_y_parsear(prompt, max_tokens, campos_requeridos, on_progreso, limitador, etiqueta, validador=None, debe_cancelar=None):
    """Llama a Groq para un paso del generador por partes y devuelve el
    JSON ya parseado y comprobado -- no solo la llamada, también que la
    respuesta tenga la forma esperada. Dos motivos de reintento distintos,
    cada uno con su propio contador (que se agote uno no consume el margen
    del otro):

    - Límite de tasa (429, cupo agotado -- de minuto o de día, no hay forma
      de distinguirlos salvo por lo larga que sea la espera): SIEMPRE se
      espera el tiempo real que indica Groq en el propio mensaje de error
      (con margen, ver llm_client.py) y se reintenta -- no es un fallo
      nuestro, es haber lanzado la petición antes de tener cupo, así que no
      cuenta contra ningún límite de intentos. Solo aborta si la espera
      ACUMULADA en este paso supera _ESPERA_MAXIMA_ACUMULADA_SEGUNDOS (una
      válvula de seguridad para un fallo patológico, no una situación
      esperable). Avisa por `on_progreso` en cada espera (pedido explícito:
      que se note en pantalla, no una espera muda).
    - Petición demasiado grande (413): Groq rechaza la petición aunque el
      cupo esté completamente libre, porque ella sola ya supera el límite
      por minuto -- a diferencia del 429, ningún tiempo de espera lo
      arregla, así que aborta el paso de inmediato sin reintentar.
    - Respuesta con 200 pero JSON inválido, sin alguno de
      `campos_requeridos`, o que no pasa `validador(datos)` si se da uno
      (comprobación más fina que "el campo existe", p.ej. que cada sesión
      del boceto traiga título y tema -- `validador` devuelve un mensaje de
      qué falta, o None si todo está bien). Probado en real con
      groq/compound-mini: a veces corta la respuesta a mitad sin avisar con
      ningún error, sobre todo en pasos de salida larga -- confirmado que
      puede pasar aunque aquí se llame a gpt-oss-120b directo, no solo con
      ese envoltorio. Se reintenta la llamada entera sin esperar -- no tiene
      sentido esperar por esto, no es un problema de cupo.

    `limitador` espacia la llamada ANTES de lanzarla si hace falta (ver
    _LimitadorTasa) -- distinto del reintento por 429, que reacciona
    DESPUÉS de que Groq ya haya rechazado la llamada. `etiqueta` (p.ej.
    "boceto", "sesión 2 de 5") es solo para el log del contenedor -- para
    poder saber, si algo falla, exactamente qué paso era y cuánto pesaba su
    prompt (ver también [groq] uso: en llm_client.py, el desglose real de
    la respuesta).

    Lanza ValueError si se agotan los reintentos de cualquiera de los dos,
    o si Groq no responde."""

    espera_acumulada = 0.0
    intentos_formato = 0
    while True:
        if debe_cancelar and debe_cancelar():
            raise TrabajoCanceladoError()
        marca = limitador.reservar(estimar_tokens(prompt) + max_tokens, on_progreso, etiqueta)
        print(f"[sa-por-partes] {etiqueta}: prompt~{estimar_tokens(prompt)} tokens, max_tokens={max_tokens}", flush=True)
        try:
            texto, tokens_usados = generar_texto_groq_por_partes(prompt, max_tokens=max_tokens)
        except PeticionDemasiadoGrandeGroq as exc:
            limitador.corregir(marca, 0)
            raise ValueError(
                f"El paso \"{etiqueta}\" manda una petición demasiado grande para Groq, aunque el cupo esté "
                f"completamente libre ({exc}) -- ningún tiempo de espera lo arregla, hay que reducir lo que "
                "se manda en ese paso."
            )
        except LimiteTasaGroq as exc:
            limitador.corregir(marca, 0)
            espera_acumulada += exc.segundos_espera
            if espera_acumulada > _ESPERA_MAXIMA_ACUMULADA_SEGUNDOS:
                raise ValueError(
                    f"Groq lleva más de {_ESPERA_MAXIMA_ACUMULADA_SEGUNDOS / 3600:.0f}h seguidas sin liberar "
                    f"cupo en el paso \"{etiqueta}\" -- prueba más tarde, o usa la IA local o la IA online "
                    "(copiar/pegar) para esta situación de aprendizaje."
                )
            on_progreso(
                f"{etiqueta}: límite de Groq alcanzado, esperando {exc.segundos_espera:.0f}s antes de reintentar...",
                time.time() + exc.segundos_espera,
            )
            _dormir_cancelable(exc.segundos_espera, debe_cancelar)
            continue

        limitador.corregir(marca, tokens_usados)

        if texto is None:
            raise ValueError("Groq no está disponible ahora mismo.")

        try:
            datos = _parsear_json(_extraer_json(texto))
            faltantes = [campo for campo in campos_requeridos if not datos.get(campo)]
            if faltantes:
                raise ValueError(f"faltan campos: {', '.join(faltantes)}")
            if validador:
                problema = validador(datos)
                if problema:
                    raise ValueError(problema)
        except (json.JSONDecodeError, ValueError, KeyError, TypeError, AttributeError) as exc:
            # Acotado a explícitamente estos tipos (en vez de Exception a
            # secas) -- un except demasiado amplio aquí puede disfrazar un
            # bug real del propio `validador` (p.ej. sumar puntos sobre un
            # tipo inesperado) como si Groq hubiera devuelto JSON mal
            # formado, gastando el reintento y mostrando un mensaje que no
            # tiene nada que ver con el error real. Se registra igualmente
            # para poder verlo en el log si el reintento tampoco lo arregla.
            print(f"[sa-por-partes] {etiqueta}: fallo de formato/validación -- {exc!r}", flush=True)
            if intentos_formato >= _MAX_REINTENTOS_FORMATO:
                raise ValueError(
                    "Groq ha devuelto una respuesta incompleta o mal formada dos veces seguidas en uno de los "
                    "pasos -- usa la IA local o la IA online (copiar/pegar) para esta situación de aprendizaje."
                )
            intentos_formato += 1
            on_progreso("La respuesta de este paso no tenía el formato esperado, reintentando...")
            continue

        return datos


# Margen de entrada antes del paso de selección: si documento+currículo por
# sí solos ya rondan esto, mandarlos juntos en la misma llamada (documento
# completo + currículo completo) puede reventar el cupo igual que la
# versión de una sola vez -- se resume el documento SOLO primero (llamada
# pequeña, sin currículo) y solo entonces se junta con el currículo
# completo para elegir códigos. Deja margen para la propia instrucción del
# paso de selección y su salida (~2000 tokens máx).
_MARGEN_ENTRADA_SELECCION = _MARGEN_SEGURIDAD_TPM - 2500

# Margen para el PREFIJO COMPARTIDO ya reducido (documento + currículo tras
# el paso de selección) antes de lanzar boceto/sesiones/producto/examen --
# la selección reduce el currículo a los códigos relevantes y resume el
# documento si hacía falta, pero nunca se había comprobado que el
# RESULTADO de esa reducción quepa de verdad. Sin esto, un curso con
# currículo muy grande podría seguir sin caber y no se sabría hasta que
# fallase a mitad de sesión. Deja margen para la parte que varía en cada
# llamada (instrucciones propias + salida, hasta 2.500 tokens en el caso
# más grande, el de una sesión) -- más ajustado que _MARGEN_ENTRADA_SELECCION
# porque aquí ya no hace falta presupuesto para la propia llamada de
# selección.
_MARGEN_PREFIJO_REDUCIDO = _MARGEN_SEGURIDAD_TPM - 3000

# Groq rechaza de plano (413, "Request too large") una única llamada cuyo
# prompt + max_tokens supere los 8.000 -- confirmado con un caso real: un
# documento de teoría de ~11.000 tokens mandado entero para resumir, con el
# cupo del minuto completamente libre (nada que ver con TPM/TPD agotados,
# es esta UNA llamada la que ya no cabe por sí sola). Deja margen para el
# propio envoltorio del prompt (~200 tokens) y la salida (1.500).
_MAX_TOKENS_ENTRADA_RESUMEN = 5500


def _trocear_documento(documento_texto, max_tokens_por_trozo):
    """Divide documento_texto en trozos que quepan de sobra en una sola
    llamada, cortando por párrafos (o líneas, si hace falta) en vez de a
    ciegas por número de caracteres -- mismo criterio char/4 que
    estimar_tokens(), no hace falta más precisión que esa aquí."""

    max_caracteres = max_tokens_por_trozo * 4
    if len(documento_texto) <= max_caracteres:
        return [documento_texto]

    trozos = []
    resto = documento_texto
    while len(resto) > max_caracteres:
        corte = resto.rfind('\n\n', 0, max_caracteres)
        if corte == -1:
            corte = resto.rfind('\n', 0, max_caracteres)
        if corte == -1:
            corte = max_caracteres
        trozos.append(resto[:corte])
        resto = resto[corte:]
    if resto.strip():
        trozos.append(resto)
    return trozos


def _resumir_fragmento_documento(texto, on_progreso, limitador, etiqueta, debe_cancelar=None):
    """Resume UN fragmento (documento entero, o un trozo de uno muy largo
    -- ver _resumir_documento_por_partes) con el mismo mecanismo de
    reintento/espera-real-de-Groq y de espaciado (_LimitadorTasa) que el
    resto del generador por partes (_llamar_y_parsear) -- no reutiliza esa
    función tal cual porque esta llamada no devuelve JSON, solo texto."""

    prompt_resumen = (
        "Resume el siguiente documento de teoría (o fragmento de uno) de forma MUY compacta pero "
        "fiel: conserva TODOS los temas o apartados que trata (ni uno menos), reduciendo cada uno a "
        "sus ideas clave en una o dos líneas. No añadas nada que no esté ya en el original -- el "
        "resultado se usará para diseñar una unidad didáctica real, tiene que seguir sirviendo como "
        "referencia fiel del contenido, no quedarse en una frase genérica.\n\n"
        f"<documento>\n{texto}\n</documento>"
    )

    espera_acumulada = 0.0
    while True:
        if debe_cancelar and debe_cancelar():
            raise TrabajoCanceladoError()
        marca = limitador.reservar(estimar_tokens(prompt_resumen) + 1500, on_progreso, etiqueta)
        print(f"[sa-por-partes] {etiqueta}: prompt~{estimar_tokens(prompt_resumen)} tokens, max_tokens=1500", flush=True)
        try:
            resumen, tokens_usados = generar_texto_groq_por_partes(prompt_resumen, max_tokens=1500)
        except PeticionDemasiadoGrandeGroq as exc:
            limitador.corregir(marca, 0)
            raise ValueError(
                f"El resumen del documento (\"{etiqueta}\") es demasiado grande para Groq aunque el cupo esté "
                f"completamente libre ({exc}) -- ningún tiempo de espera lo arregla, hay que trocear el "
                "documento en fragmentos más pequeños."
            )
        except LimiteTasaGroq as exc:
            limitador.corregir(marca, 0)
            espera_acumulada += exc.segundos_espera
            if espera_acumulada > _ESPERA_MAXIMA_ACUMULADA_SEGUNDOS:
                raise ValueError(
                    f"Groq lleva más de {_ESPERA_MAXIMA_ACUMULADA_SEGUNDOS / 3600:.0f}h seguidas sin liberar "
                    f"cupo resumiendo el documento (\"{etiqueta}\") -- prueba más tarde, o usa la IA local o la "
                    "IA online (copiar/pegar) para esta situación de aprendizaje."
                )
            on_progreso(
                f"{etiqueta}: límite de Groq alcanzado, esperando {exc.segundos_espera:.0f}s antes de reintentar...",
                time.time() + exc.segundos_espera,
            )
            _dormir_cancelable(exc.segundos_espera, debe_cancelar)
            continue

        limitador.corregir(marca, tokens_usados)

        if resumen is None:
            raise ValueError("Groq no está disponible ahora mismo para resumir el documento.")
        return resumen


def _resumir_documento_por_partes(documento_texto, on_progreso, limitador, debe_cancelar=None, prefijo_paso="resumen documento"):
    """Resume el documento completo -- si es tan largo que ni siquiera cabe
    en UNA llamada (ver _MAX_TOKENS_ENTRADA_RESUMEN), lo trocea primero y
    resume cada trozo por separado, uniendo los resúmenes parciales al
    final. Para la mayoría de documentos reales esto es un solo trozo (el
    caso normal, sin cambios de comportamiento). `prefijo_paso` es la
    etiqueta numerada que devuelve _paso() en el orquestador ("paso X/Y
    (resumen documento)") -- se reutiliza tal cual (o con el "parte X de Y"
    añadido) para que los avisos de dentro de este paso también lleven el
    número, en vez de una etiqueta suelta sin numerar."""

    trozos = _trocear_documento(documento_texto, _MAX_TOKENS_ENTRADA_RESUMEN)
    if len(trozos) == 1:
        return _resumir_fragmento_documento(trozos[0], on_progreso, limitador, prefijo_paso, debe_cancelar)

    resumenes = []
    for i, trozo in enumerate(trozos):
        if debe_cancelar and debe_cancelar():
            raise TrabajoCanceladoError()
        etiqueta = f"{prefijo_paso}, parte {i + 1} de {len(trozos)}"
        on_progreso(f"{etiqueta}: resumiendo...")
        resumenes.append(_resumir_fragmento_documento(trozo, on_progreso, limitador, etiqueta, debe_cancelar))
    return "\n\n".join(resumenes)


def generar_situacion_aprendizaje_por_partes_groq(
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
    duracion_sesion_min=55,
    diagnostico_incluido=False, diagnostico_minutos=None,
    on_progreso=None,
    debe_cancelar=None,
):
    """Genera una situación de aprendizaje EN VARIAS LLAMADAS pequeñas
    (boceto + una por sesión + producto + examen) en vez de una sola --
    fallback para cuando generar_situacion_aprendizaje_groq() avisa de que
    no cabe en el presupuesto de la capa gratuita de Groq. `on_progreso`
    (opcional) se llama con un mensaje de texto en cada paso, para que
    quien la use (el job en segundo plano del router) pueda mostrar
    progreso real en vez de una espera ciega. `debe_cancelar` (opcional,
    sin argumentos, devuelve bool) se comprueba entre pasos y durante
    cualquier espera larga (ver _dormir_cancelable) -- si devuelve True se
    lanza TrabajoCanceladoError de inmediato, dejando terminar la llamada a
    Groq que ya estuviera en marcha pero sin lanzar la siguiente.

    Devuelve (unidad, codigos_descartados) -- mismo formato que
    procesar_respuesta(), lista para guardar igual. Lanza ValueError si
    algún paso agota sus reintentos, o TrabajoCanceladoError si se cancela
    a mitad."""

    def _comprobar_cancelacion():
        if debe_cancelar and debe_cancelar():
            raise TrabajoCanceladoError()

    # `_espera_hasta` (segundo argumento, opcional) es un timestamp Unix
    # (time.time(), NO time.monotonic() -- tiene que significar algo fuera
    # de este proceso) para que quien reciba el aviso pueda pintar una
    # cuenta atrás real en vez de solo un texto estático con el segundero
    # parado ("esperando 55s..." que se queda ahí escrito 55 segundos
    # enteros) -- ver TrabajosIAPanel.tsx. None en cualquier aviso que no
    # sea una espera (la inmensa mayoría).
    aviso = on_progreso or (lambda _mensaje, _espera_hasta=None: None)
    limitador = _LimitadorTasa()

    curso, saberes, criterios = _contexto_curriculo(course_id)
    lista_saberes_completa, lista_criterios_completa = _formatear_curriculo(saberes, criterios)

    estimado_entrada_seleccion = (
        estimar_tokens(documento_texto) + estimar_tokens(lista_saberes_completa) + estimar_tokens(lista_criterios_completa)
    )
    necesita_resumen_previo = modo == "documento" and estimado_entrada_seleccion > _MARGEN_ENTRADA_SELECCION

    # Numeración de fases ("Paso X/Y: ...") para que se vea de un vistazo
    # por dónde va un trabajo en segundo plano sin tener el asistente
    # abierto (ver TrabajosIAPanel.tsx) -- el número de sesiones (la parte
    # más grande del total) no se sabe hasta que responde el boceto, así
    # que el total arranca sin contarlas y se corrige justo después (ver
    # más abajo). Los avisos de DENTRO de un paso (espera por 429, resumen
    # del documento por partes...) siguen usando `aviso` directo, sin
    # numerar -- son detalle de un paso, no un paso más.
    progreso = {
        "actual": 0,
        "total": (1 if necesita_resumen_previo else 0) + 2 + (1 if producto_incluido else 0) + (1 if examen_incluido else 0),
    }

    def _paso(mensaje, etiqueta_corta):
        # Devuelve una etiqueta que YA lleva el número de paso incorporado
        # -- se pasa tal cual a _llamar_y_parsear/_resumir_documento_por_partes
        # para que también la usen los mensajes de DENTRO de ese paso
        # (espera por 429, espaciado de llamadas...). Antes esos mensajes
        # usaban una etiqueta corta suelta ("sesión 2 de 4") sin el "Paso
        # X/Y" -- confirmado en real: en cuanto tocaba esperar (algo
        # frecuente, no la excepción), el progreso visible en el panel
        # volvía a la etiqueta sin numerar, perdiendo justo la referencia
        # de conjunto que se pedía.
        progreso["actual"] += 1
        numero = f"{progreso['actual']}/{progreso['total']}"
        aviso(f"Paso {numero}: {mensaje}")
        return f"paso {numero} ({etiqueta_corta})"

    if necesita_resumen_previo:
        etiqueta = _paso("El documento es largo, resumiéndolo antes de continuar...", "resumen documento")
        documento_texto = _resumir_documento_por_partes(documento_texto, aviso, limitador, debe_cancelar, etiqueta)

    _comprobar_cancelacion()
    etiqueta = _paso("Seleccionando los elementos curriculares relevantes...", "selección")
    prompt_seleccion = construir_prompt_seleccion(documento_texto, modo, lista_saberes_completa, lista_criterios_completa)

    def _validar_seleccion(datos):
        if not isinstance(datos.get("codigosSaberes"), list) or not isinstance(datos.get("codigosCriterios"), list):
            return "faltan las listas de códigos seleccionados"
        return None

    seleccion = _llamar_y_parsear(
        prompt_seleccion, 2000, [], aviso, limitador, etiqueta,
        validador=_validar_seleccion, debe_cancelar=debe_cancelar,
    )

    codigos_saberes = set(seleccion.get("codigosSaberes") or [])
    codigos_criterios = set(seleccion.get("codigosCriterios") or [])
    saberes_reducidos = [s for s in saberes if s.code in codigos_saberes] or saberes
    criterios_reducidos = [c for c in criterios if c.code in codigos_criterios] or criterios
    lista_saberes, lista_criterios = _formatear_curriculo(saberes_reducidos, criterios_reducidos)

    if modo == "documento":
        documento_texto = (seleccion.get("documentoResumido") or "").strip() or documento_texto

    estimado_prefijo_reducido = (
        estimar_tokens(_cabecera_prompt_parte(curso)) + estimar_tokens(documento_texto)
        + estimar_tokens(lista_saberes) + estimar_tokens(lista_criterios)
    )
    if estimado_prefijo_reducido > _MARGEN_PREFIJO_REDUCIDO:
        raise ValueError(
            f"Incluso reduciendo el currículo y el documento, esta situación de aprendizaje sigue siendo "
            f"demasiado grande para Groq (~{estimado_prefijo_reducido} tokens estimados solo de contexto, el "
            f"límite es {PRESUPUESTO_TPM_GROQ}/minuto) -- usa la IA local o la IA online (copiar/pegar) para "
            f"esta situación de aprendizaje."
        )

    _comprobar_cancelacion()
    etiqueta = _paso("Diseñando el esqueleto de la situación de aprendizaje...", "boceto")
    prompt_boceto = construir_prompt_boceto(
        curso, lista_saberes, lista_criterios, documento_texto, modo,
        sesiones_modo, sesiones_fijo, sesiones_min, sesiones_max,
        caracteristicas_grupo,
        producto_incluido, producto_tipo,
        examen_incluido, examen_formato,
        duracion_sesion_min,
    )
    def _validar_boceto(datos):
        for i, sesion in enumerate(datos.get("sessions") or []):
            if not sesion.get("titulo") or not sesion.get("tema"):
                return f"la sesión {i + 1} del esqueleto no trae título o tema"
        return None

    boceto = _llamar_y_parsear(
        prompt_boceto, 2000, ["sessions"], aviso, limitador, etiqueta,
        validador=_validar_boceto, debe_cancelar=debe_cancelar,
    )

    num_sesiones = len(boceto.get("sessions") or [])
    if num_sesiones == 0:
        raise ValueError("Groq no ha devuelto ninguna sesión en el esqueleto -- inténtalo de nuevo.")

    # Hasta aquí el total no contaba las sesiones (no se sabía cuántas
    # habría) -- se corrige ahora que el boceto ya lo dice.
    progreso["total"] += num_sesiones

    session_details = []
    for i in range(num_sesiones):
        _comprobar_cancelacion()
        etiqueta = _paso(f"Generando sesión {i + 1} de {num_sesiones}...", f"sesión {i + 1} de {num_sesiones}")
        prompt_sesion = construir_prompt_ampliar_sesion(
            curso, lista_saberes, lista_criterios, boceto, i, documento_texto, modo,
            tipos_actividad, estructuras_cooperativas, actividades_obligatorias,
            estructura_sesion, estructura_sesion_detalle,
            progresion_autonomia,
            atencion_diversidad, atencion_diversidad_detalle,
            class_id,
            duracion_sesion_min,
            diagnostico_incluido, diagnostico_minutos,
        )
        session_details.append(_llamar_y_parsear(
            prompt_sesion, 2500, ["actividades"], aviso, limitador, etiqueta,
            debe_cancelar=debe_cancelar,
        ))

    final_product = {"incluido": False, "tipo": None, "descripcion": None, "linkedCriteriaIds": []}
    if producto_incluido and boceto.get("finalProduct"):
        _comprobar_cancelacion()
        etiqueta = _paso("Redactando el producto final...", "producto")
        prompt_producto = construir_prompt_ampliar_producto(curso, lista_saberes, lista_criterios, boceto, documento_texto, modo)
        datos_producto = _llamar_y_parsear(
            prompt_producto, 1000, ["descripcion"], aviso, limitador, etiqueta, debe_cancelar=debe_cancelar,
        )
        final_product = {
            "incluido": True,
            "tipo": boceto["finalProduct"]["tipo"],
            "descripcion": datos_producto.get("descripcion", ""),
            "linkedCriteriaIds": boceto["finalProduct"].get("linkedCriteriaIds", []),
        }

    final_exam = {"incluido": False, "formato": None, "bloques": []}
    if examen_incluido and boceto.get("finalExam"):
        _comprobar_cancelacion()
        etiqueta = _paso("Diseñando el examen final...", "examen")
        prompt_examen = construir_prompt_ampliar_examen(
            curso, lista_saberes, lista_criterios, boceto, documento_texto, modo, examen_formato,
        )
        datos_examen = _llamar_y_parsear(
            prompt_examen, 2000, ["bloques"], aviso, limitador, etiqueta, debe_cancelar=debe_cancelar,
        )
        final_exam = {
            "incluido": True,
            "formato": examen_formato,
            "bloques": datos_examen.get("bloques", []),
        }

    datos_completos = {
        "name": boceto.get("name", ""),
        "context": boceto.get("context", ""),
        "finalProduct": final_product,
        "finalExam": final_exam,
        "sessions": num_sesiones,
        "sessionDetails": session_details,
        "linkedBasicKnowledgeIds": boceto.get("linkedBasicKnowledgeIds", []),
        "linkedCriteriaIds": boceto.get("linkedCriteriaIds", []),
    }

    aviso("Comprobando los códigos curriculares...")
    return procesar_respuesta(course_id, json.dumps(datos_completos), {})
