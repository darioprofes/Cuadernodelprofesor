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

IASERVER_VISION_URL = os.environ.get("IASERVER_VISION_URL", "http://192.168.10.116:8081")

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
