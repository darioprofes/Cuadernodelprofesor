# ==========================================================
# Generador de prompt: Adaptación de material (NEAE / repetidores /
# programas específicos)
# ==========================================================
#
# A diferencia del resto de generadores, el texto de entrada YA viene
# anonimizado -- el profesor pasa primero el material + las características
# del alumno por el Anonimizador (ver routers/ai_tools.py) y revisa el
# resultado antes de llegar aquí (decisión explícita del usuario: los datos
# NEAE/PTI de un alumno concreto son sensibles, así que ni siquiera la vía
# Groq/IA local los ve en crudo). Este módulo nunca anonimiza ni reintegra
# nada -- solo genera texto libre a partir de lo que ya le llega limpio.
#
# No devuelve una estructura JSON con forma fija como situacion_aprendizaje.py
# o instrumento_evaluacion.py -- el resultado es el material re-redactado en
# texto/Markdown plano, así que se parece más a _resumir_documento_groq()
# (resumen de texto libre) que a esos dos.

from services.llm_client import generar_texto, generar_texto_groq


def construir_prompt(material_anonimizado: str, notas_alumno_anonimizadas: str) -> str:
    """`material_anonimizado` -- el material/actividad/instrumento de
    origen, ya anonimizado y revisado por el profesor. `notas_alumno_anonimizadas`
    -- características NEAE + indicaciones del PTI de ESE alumno (también
    ya anonimizadas), lo que define cómo adaptar el material. Se deja como
    función separada del resto (no hay paso de copiar/pegar en las vías
    Groq/local) para poder inspeccionarla/probarla suelta, igual que el
    resto de generadores."""

    return f"""Eres un profesor de apoyo especializado en adaptar materiales didácticos para \
alumnado con necesidades específicas de apoyo educativo (NEAE), alumnado repetidor o con \
programas específicos.

<material_original>
{material_anonimizado}
</material_original>

<indicaciones_para_ti_sobre_como_adaptar>
Esto NO son peticiones del alumno ni contenido de la tarea -- son pautas dirigidas A TI, el \
profesor de apoyo, para que decidas CÓMO reescribir <material_original>. No cites estas \
indicaciones, no las repitas, no las conviertas en parte del enunciado ni en algo que el alumno \
lea: son información de fondo tuya, invisible para él.

{notas_alumno_anonimizadas}
</indicaciones_para_ti_sobre_como_adaptar>

<tarea>
<material_original> es un enunciado/actividad TODAVÍA SIN HACER que el alumno va a recibir \
directamente, tal cual escribas tu respuesta -- no es un encargo para que OTRA persona (el \
alumno, otro profesor...) haga la adaptación, LA ADAPTACIÓN LA HACES TÚ AHORA MISMO, en tu \
respuesta, usando <indicaciones_para_ti_sobre_como_adaptar> solo como guía de trabajo, nunca \
como texto a incluir. Escribe el resultado exactamente en la misma forma que el original (un \
enunciado de actividad, una pregunta de examen, un texto explicativo...) -- nunca una lista de \
instrucciones sobre cómo adaptarlo, ni una explicación de qué cambios has hecho, ni una frase \
dirigida a "el alumno" o "el profesor" pidiendo que alguien haga algo con el material. El alumno \
debe leer el resultado y ponerse directamente a trabajar en él, sin enterarse de que ha sido \
adaptado para él -- no menciones NEAE, necesidades, diagnósticos ni el PTI en el texto que \
entregues.

Dos límites igual de importantes:
1. NO resuelvas ni completes la tarea tú: no rellenes tablas con respuestas, no contestes las \
   preguntas que plantea, no hagas tú el procedimiento/experimento/ejercicio descrito. El alumno \
   debe seguir teniendo que hacer exactamente la misma tarea de fondo (las mismas preguntas, los \
   mismos pasos, el mismo objetivo de aprendizaje) -- una tabla para rellenar sigue vacía en tu \
   resultado.
2. Ajusta SOLO cómo se plantea: vocabulario más sencillo, frases más cortas, instrucciones más \
   estructuradas (p.ej. en pasos numerados), o el formato si hace falta (p.ej. una tabla en vez \
   de un párrafo largo). Si toca añadir apoyo visual, INSÉRTALO tú mismo directamente en el \
   texto -- un emoji o pictograma junto a cada paso (p.ej. "💧 Mide la humedad del suelo") -- en \
   vez de escribir una instrucción sobre ello (nunca frases como "usa un pictograma de 💧" o \
   "añade aquí un icono"): el propio emoji ya es el apoyo visual, no algo que el alumno tenga que \
   buscar o poner él.

No inventes datos personales nuevos (nombres, edades, diagnósticos...) que no estén ya en \
<indicaciones_para_ti_sobre_como_adaptar>. Si aparecen códigos como PERS_XXXXXX o GRUPO_XXXXXX, son anonimización \
real de datos personales -- déjalos EXACTAMENTE igual en el resultado, no los traduzcas ni los \
elimines.
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE el enunciado ya adaptado, listo para entregar al alumno tal cual, en texto/ \
Markdown plano -- sin explicaciones antes ni después, sin envolverlo en bloques de código, sin \
ninguna respuesta/solución/dato relleno que el alumno tenga que aportar él mismo, y sin ninguna \
mención a que el texto ha sido adaptado o a las necesidades del alumno.
</formato_de_salida>"""


def generar_adaptacion(material_anonimizado: str, notas_alumno_anonimizadas: str) -> str:
    """Vía IA local (ia-server). Lanza ValueError si no está disponible."""

    prompt = construir_prompt(material_anonimizado, notas_alumno_anonimizadas)

    respuesta = generar_texto(prompt, max_tokens=4000)

    if respuesta is None:
        raise ValueError(
            "El servidor de IA local no está disponible ahora mismo. Inténtalo de nuevo en unos "
            "minutos, o usa la opción de IA online."
        )

    return respuesta.strip()


def generar_adaptacion_groq(material_anonimizado: str, notas_alumno_anonimizadas: str) -> str:
    """Vía Groq. Lanza ValueError si no hay clave configurada o Groq no
    responde."""

    prompt = construir_prompt(material_anonimizado, notas_alumno_anonimizadas)

    respuesta = generar_texto_groq(prompt, max_tokens=4000)

    if respuesta is None:
        raise ValueError(
            "Groq no está disponible ahora mismo (o falta configurar la clave). Inténtalo de "
            "nuevo, o usa la IA local o la IA online."
        )

    return respuesta.strip()
