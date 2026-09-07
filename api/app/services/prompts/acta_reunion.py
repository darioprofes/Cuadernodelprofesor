# ==========================================================
# Generador de prompt: Acta de una reunión
# ==========================================================
#
# A diferencia del resto de generadores, el texto de entrada YA viene
# anonimizado -- el profesor pasa primero sus notas (pestaña "Notas" de la
# reunión) por el Anonimizador y revisa el resultado antes de llegar aquí
# (mismo criterio que adaptacion_material.py con las notas NEAE de un
# alumno). Este módulo nunca anonimiza ni reintegra nada -- solo redacta el
# acta a partir de lo que ya le llega limpio.
#
# Deliberadamente NO se manda ni la fecha ni "con quién" a la IA: el propio
# Anonimizador ya avisa (ver AiToolsView.tsx) de que una combinación de datos
# -- tipo + fecha + detalles -- puede identificar a alguien aunque no
# aparezca ningún nombre. El profesor añade fecha/con quién él mismo al
# revisar el acta generada (ya los tiene en la cabecera de la reunión). Solo
# se manda el `tipo` (una de un puñado de categorías cerradas, no identifica
# a nadie por sí solo) para que la IA sepa qué clase de reunión es.

from services.llm_client import generar_texto, generar_texto_groq

_TIPO_LABEL = {
    "tutoria": "Tutoría",
    "r_tutores": "Coordinación de tutores",
    "departamento": "Reunión de departamento",
    "familia": "Reunión con familia",
    "otras": "Reunión",
}


def construir_prompt(tipo: str, notas_anonimizadas: str) -> str:
    """`tipo` -- una de las categorías cerradas de reunión (ver _TIPO_LABEL).
    `notas_anonimizadas` -- las notas de la reunión, ya anonimizadas y
    revisadas por el profesor. Se deja como función separada del resto (no
    hay paso de copiar/pegar en las vías Groq/local) para poder
    inspeccionarla/probarla suelta, igual que el resto de generadores."""

    tipo_label = _TIPO_LABEL.get(tipo, "Reunión")

    return f"""Eres un profesor redactando el acta formal de una reunión a partir de sus notas tomadas \
a mano durante la propia reunión.

<tipo_de_reunion>
{tipo_label}
</tipo_de_reunion>

<notas>
{notas_anonimizadas}
</notas>

<tarea>
Redacta el acta de esta reunión a partir de <notas>, en un tono formal y ordenado, propio de un \
documento de centro educativo. Estructura el acta en estos apartados, solo cuando haya contenido \
real en las notas para ese apartado (omite el apartado entero si no hay nada que poner en él, no \
inventes contenido para rellenarlo):

1. **Desarrollo**: resumen ordenado y redactado en prosa de lo tratado en la reunión, a partir de \
   las notas -- no una simple lista de las notas tal cual, sino una redacción fluida y profesional.
2. **Acuerdos**: los acuerdos o decisiones tomadas, en una lista.
3. **Seguimiento**: las tareas o compromisos pendientes de revisar más adelante, en una lista.

No inventes datos, nombres, fechas ni decisiones que no estén ya, explícita o implícitamente, en \
<notas> -- si las notas son escuetas, el acta debe serlo también en vez de rellenarse con relleno \
genérico. Si aparecen códigos como PERS_XXXXXX o GRUPO_XXXXXX, son anonimización real de datos \
personales -- déjalos EXACTAMENTE igual en el resultado, no los traduzcas ni los elimines ni los \
sustituyas por ningún nombre inventado.
</tarea>

<formato_de_salida>
Devuelve ÚNICAMENTE el acta ya redactada, en Markdown, lista para guardar tal cual -- sin \
explicaciones antes ni después, sin envolverla en bloques de código, sin repetir el tipo de \
reunión como título (ya se muestra aparte), sin fecha ni asistentes (el profesor los añade él \
mismo, no están en <notas>).
</formato_de_salida>"""


def generar_acta(tipo: str, notas_anonimizadas: str) -> str:
    """Vía IA local (ia-server). Lanza ValueError si no está disponible."""

    prompt = construir_prompt(tipo, notas_anonimizadas)

    respuesta = generar_texto(prompt, max_tokens=3000)

    if respuesta is None:
        raise ValueError(
            "El servidor de IA local no está disponible ahora mismo. Inténtalo de nuevo en unos "
            "minutos, o usa la opción de IA online."
        )

    return respuesta.strip()


def generar_acta_groq(tipo: str, notas_anonimizadas: str) -> str:
    """Vía Groq. Lanza ValueError si no hay clave configurada o Groq no
    responde."""

    prompt = construir_prompt(tipo, notas_anonimizadas)

    respuesta = generar_texto_groq(prompt, max_tokens=3000)

    if respuesta is None:
        raise ValueError(
            "Groq no está disponible ahora mismo (o falta configurar la clave). Inténtalo de "
            "nuevo, o usa la IA local o la IA online."
        )

    return respuesta.strip()
