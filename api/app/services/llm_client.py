# ==========================================================
# Cliente del modelo de visión del ia-server (fallback OCR)
# ==========================================================
#
# Usado solo cuando la extracción normal de texto (docx/pptx/pdf) encuentra
# una página o diapositiva con muy poco texto -- probable señal de que es una
# imagen/escaneado sin capa de texto. Gemma 4 E4B es nativamente multimodal
# si se le añade su propio archivo --mmproj; el ia-server corre una única
# instancia (puerto 8081) que sirve tanto texto como visión -- no hace falta
# una instancia aparte de solo texto, este mismo cliente valdría para
# generadores futuros que necesiten IA local sin imágenes de por medio.
#
# Nunca es fatal si el ia-server no responde: quien llame se queda con el
# texto escaso original y avisa al profesor, en vez de romper la extracción
# entera por un servidor de visión caído.

import base64
import os

import requests

IASERVER_VISION_URL = os.environ.get("IASERVER_VISION_URL", "http://192.168.10.13:8081")

# ==========================================================
# Cliente de Groq (API remota, gratuita/casi gratuita, con retención cero
# activada en el panel de Groq) -- tercera vía junto al ia-server local y
# al copiar/pegar en una IA online, para cuando el ia-server va lento.
# Mismo criterio de "nunca fatal" que el resto de este módulo: si no hay
# clave configurada o Groq no responde, se devuelve None y quien llame cae
# a las otras vías, nunca rompe la petición entera.
# ==========================================================

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")


def groq_disponible():
    """A diferencia de esta_disponible() (ia-server local), no hace una
    petición de comprobación -- Groq es un servicio remoto de pago por uso
    con límite de peticiones/minuto, así que una comprobación de estado en
    cada carga de página gastaría cuota sin necesidad. Basta con saber si
    hay clave configurada."""

    return bool(GROQ_API_KEY)


def generar_texto_groq(prompt, max_tokens=3000):
    """Igual que generar_texto() pero contra la API de Groq en vez del
    ia-server local -- mismo formato de petición (compatible con OpenAI),
    mismo contrato de devolver None si algo falla en vez de lanzar."""

    if not GROQ_API_KEY:
        return None

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}

    try:
        respuesta = requests.post(GROQ_URL, json=payload, headers=headers, timeout=30)
        respuesta.raise_for_status()
        return respuesta.json()["choices"][0]["message"]["content"].strip()
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None

_INSTRUCCION_TRANSCRIPCION = (
    "Transcribe fielmente todo el texto legible de esta imagen, tal cual aparece, "
    "sin resumir ni interpretar ni traducir. Si hay una tabla, represéntala en "
    "Markdown. Si no hay texto legible, describe en una frase qué se ve."
)


def transcribir_imagen(imagen_bytes, mime_type="image/png"):
    """Devuelve el texto transcrito por el modelo de visión, o None si el
    ia-server no está disponible o responde algo inesperado."""

    b64 = base64.b64encode(imagen_bytes).decode("ascii")

    payload = {
        "model": "gemma-4-E4B",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": _INSTRUCCION_TRANSCRIPCION},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
            ],
        }],
        "max_tokens": 1000,
    }

    try:
        respuesta = requests.post(f"{IASERVER_VISION_URL}/v1/chat/completions", json=payload, timeout=90)
        respuesta.raise_for_status()
        return respuesta.json()["choices"][0]["message"]["content"].strip()
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None


def esta_disponible():
    """Comprobación rápida y barata (timeout corto) de si el ia-server
    responde ahora mismo -- para que el frontend pueda ocultar/desactivar
    los botones de "Generar con IA local" en vez de dejar que el profesor
    espere un minuto para enterarse de que está caído (ver
    services/prompts/instrumento_evaluacion.py y el wizard de SA)."""

    try:
        respuesta = requests.get(f"{IASERVER_VISION_URL}/v1/models", timeout=3)
        return respuesta.status_code == 200
    except requests.RequestException:
        return False


def generar_texto(prompt, max_tokens=3000):
    """Función genérica de texto (sin imagen) para generadores que llaman
    al ia-server directamente en vez del flujo de copiar/pegar en una IA
    online (ver services/prompts/instrumento_evaluacion.py, primer caso).
    Reutiliza la misma instancia/puerto que transcribir_imagen() -- el
    ia-server sirve texto y visión desde el mismo proceso, no hace falta
    una URL aparte. Devuelve None si no está disponible, mismo criterio de
    "nunca fatal" que el resto de este módulo."""

    payload = {
        "model": "gemma-4-E4B",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }

    try:
        respuesta = requests.post(f"{IASERVER_VISION_URL}/v1/chat/completions", json=payload, timeout=120)
        respuesta.raise_for_status()
        return respuesta.json()["choices"][0]["message"]["content"].strip()
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None
