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
import re

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


def _log_limites_groq(respuesta):
    """Imprime en el log del contenedor (docker logs profe-api) el cupo
    REAL que devuelve Groq en la cabecera de CADA respuesta (éxito o
    error) -- no hay panel propio para verlo y el de Groq no distingue
    consumo por app, así que esto es lo único fiable para saber en qué
    momento del día se está sin tener que especular ni abrir su web. No
    usa el módulo logging porque el resto del backend tampoco lo usa (solo
    el logging propio de uvicorn) -- print(flush=True) va a la misma
    salida que ese log."""

    h = respuesta.headers
    print(
        f"[groq] status={respuesta.status_code} modelo={GROQ_MODEL} "
        f"tokens(limite/quedan/reinicio)={h.get('x-ratelimit-limit-tokens')}/"
        f"{h.get('x-ratelimit-remaining-tokens')}/{h.get('x-ratelimit-reset-tokens')} "
        f"peticiones(limite/quedan/reinicio)={h.get('x-ratelimit-limit-requests')}/"
        f"{h.get('x-ratelimit-remaining-requests')}/{h.get('x-ratelimit-reset-requests')}",
        flush=True,
    )
    if respuesta.status_code != 200:
        # También en 429: probado con datos reales que un 429 puede darse
        # con las cabeceras de tokens/minuto Y de peticiones/día mostrando
        # cupo completo (nada consumido) -- esas dos son las únicas
        # dimensiones con cabecera propia, así que si el rechazo es por
        # otra cosa (p.ej. tokens/día, que Groq no expone en cabecera), el
        # cuerpo del error es la única forma de verlo.
        print(f"[groq] cuerpo del error: {respuesta.text[:500]}", flush=True)


def _log_uso_groq(cuerpo):
    """Complementa _log_limites_groq: esa mira las cabeceras (cupo
    restante, ventana deslizante, mezcla el efecto de llamadas próximas
    entre sí), esta mira el cuerpo de ESTA respuesta en concreto -- cuántos
    tokens de entrada, salida, y cuántos de esos de entrada vinieron
    gratis del caché (usage.prompt_tokens_details.cached_tokens). Para
    poder ver, llamada a llamada, si el prefijo compartido (ver
    situacion_aprendizaje.py) está siendo reutilizado de verdad o no."""

    uso = cuerpo.get("usage") or {}
    cached = (uso.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
    print(
        f"[groq] uso: prompt={uso.get('prompt_tokens')} (cacheados={cached}) "
        f"salida={uso.get('completion_tokens')} total={uso.get('total_tokens')}",
        flush=True,
    )


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
        _log_limites_groq(respuesta)
        respuesta.raise_for_status()
        cuerpo = respuesta.json()
        _log_uso_groq(cuerpo)
        return cuerpo["choices"][0]["message"]["content"].strip()
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None


class LimiteTasaGroq(Exception):
    """Groq devolvió 429 (límite de tokens/minuto agotado). A diferencia de
    generar_texto_groq (que traga cualquier fallo y devuelve None), el
    generador por partes de situación de aprendizaje necesita distinguir
    esto de un fallo cualquiera para poder esperar y reintentar -- por eso
    lleva el tiempo de espera real que indica la propia Groq en vez de una
    espera fija a ciegas (medido en pruebas reales: unos segundos, casi
    nunca el minuto completo que sugeriría pensar en ventanas fijas)."""

    def __init__(self, segundos_espera):
        self.segundos_espera = segundos_espera
        super().__init__(f"Límite de tasa de Groq alcanzado, reintentar en {segundos_espera:.1f}s")


class PeticionDemasiadoGrandeGroq(Exception):
    """Groq devolvió 413 (la petición, ella sola, ya supera el cupo por
    minuto aunque esté completamente lleno -- confirmado con un caso real:
    "Request too large... Requested 10953" con el cupo mostrando 8000/8000
    disponibles). A diferencia de LimiteTasaGroq (429, un problema de
    CUÁNTO CUPO QUEDA que se arregla esperando), esto es un problema de
    TAMAÑO DE LA PROPIA PETICIÓN -- ningún tiempo de espera lo arregla,
    solo reducir lo que se manda. El orquestador debe abortar ese paso (o
    trocearlo más, si ese paso en concreto tiene cómo) en vez de
    reintentar esperando como con un 429."""

    def __init__(self, mensaje):
        super().__init__(mensaje)


def _parsear_tiempo_groq(texto):
    """Convierte '2.262s', '5m45.6s', '5h23m10s' o '1ms' (formato de las
    cabeceras x-ratelimit-reset-* de Groq) a segundos (float). None si no
    hace match. Groq tiene cupos por minuto (TPM) Y por día (RPD/TPD, ver
    situacion_aprendizaje.py) -- si se agota el diario, el reset puede ser
    de horas, no solo minutos/segundos como en el caso habitual. '1ms'
    (milisegundos) se vio en un caso real con el cupo de minuto Y de
    peticiones/día mostrando lleno a la vez -- probablemente el rechazo
    era por otra dimensión sin cabecera propia (tokens/día), y el "reset"
    de 1ms no tiene relación real con cuándo se resolvería eso."""

    texto = texto.strip()

    m_ms = re.match(r"^(\d+)ms$", texto)
    if m_ms:
        return int(m_ms.group(1)) / 1000.0

    m = re.match(r"^(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s$", texto)
    if not m:
        return None
    horas = int(m.group(1)) if m.group(1) else 0
    minutos = int(m.group(2)) if m.group(2) else 0
    return horas * 3600 + minutos * 60 + float(m.group(3))


_PATRON_ESPERA_MENSAJE = re.compile(r"try again in ((?:\d+h)?(?:\d+m)?[\d.]+s|\d+ms)")


def _extraer_espera_de_mensaje_429(respuesta):
    """Groq pone el tiempo de espera REAL en el texto del mensaje de
    error (p.ej. "...on tokens per day (TPD): Limit 200000, Used 197174, "
    "Requested 7799. Please try again in 35m48.336s...") -- probado con un
    caso real donde la cabecera x-ratelimit-reset-tokens mostraba "1ms"
    (irrelevante, esa cabecera solo cubre el cupo de MINUTO) mientras el
    rechazo real era por el cupo de TOKENS POR DÍA, que no tiene cabecera
    propia. Sin esto, un 429 por cupo diario se trataba como si fuera de
    minuto: esperaba unos segundos, reintentaba, y volvía a fallar contra
    el mismo muro. None si el cuerpo no es JSON o no trae ese texto."""

    try:
        mensaje = (respuesta.json().get("error") or {}).get("message", "")
    except ValueError:
        return None
    coincidencia = _PATRON_ESPERA_MENSAJE.search(mensaje)
    if not coincidencia:
        return None
    return _parsear_tiempo_groq(coincidencia.group(1))


def generar_texto_groq_por_partes(prompt, max_tokens=3000):
    """Como generar_texto_groq, pero para el generador POR PARTES de
    situación de aprendizaje (ver services/prompts/situacion_aprendizaje.py)
    -- varias llamadas seguidas SÍ pueden topar con el límite de 8.000
    tokens/minuto de Groq aunque cada una por separado quepa de sobra
    (confirmado con datos reales: boceto+sesiones+producto+examen de una SA
    normal suman más de eso). En vez de devolver None sin más, levanta
    LimiteTasaGroq con el tiempo de espera real para que el orquestador
    pueda esperar y reintentar ese paso -- solo ese, no toda la generación.

    Devuelve (texto, tokens_usados) -- tokens_usados es total_tokens MENOS
    los servidos desde caché (usage.prompt_tokens_details.cached_tokens,
    que no cuentan para el límite de tasa), para que el orquestador espacie
    las llamadas siguientes según el coste REAL de cupo, no el bruto."""

    if not GROQ_API_KEY:
        return None, None

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}

    try:
        respuesta = requests.post(GROQ_URL, json=payload, headers=headers, timeout=30)
        _log_limites_groq(respuesta)
        if respuesta.status_code == 413:
            try:
                mensaje = (respuesta.json().get("error") or {}).get("message", "Petición demasiado grande para Groq.")
            except ValueError:
                mensaje = "Petición demasiado grande para Groq."
            raise PeticionDemasiadoGrandeGroq(mensaje)
        if respuesta.status_code == 429:
            # El mensaje del error es más fiable que la cabecera: esta
            # última solo cubre el cupo de MINUTO, y si el rechazo real es
            # por el cupo de tokens/día (sin cabecera propia, ver
            # _extraer_espera_de_mensaje_429) mostraría un valor irrelevante.
            segundos = _extraer_espera_de_mensaje_429(respuesta)
            if segundos is None:
                segundos = _parsear_tiempo_groq(respuesta.headers.get("x-ratelimit-reset-tokens", ""))
            # Margen de seguridad sobre el tiempo que indica Groq (pedido
            # explícito): esperar justo lo indicado deja el reintento al
            # filo del refresco del cupo, y una petición real (más lenta
            # que la comprobación) puede toparse otra vez con el límite.
            raise LimiteTasaGroq((segundos + 5.0) if segundos is not None else 15.0)
        respuesta.raise_for_status()
        cuerpo = respuesta.json()
        _log_uso_groq(cuerpo)
        texto = cuerpo["choices"][0]["message"]["content"].strip()
        uso = cuerpo.get("usage") or {}
        total_tokens = uso.get("total_tokens")
        # Los tokens servidos desde el caché de prompt de Groq NO cuentan
        # para el límite de tasa (confirmado en su documentación) -- se
        # restan aquí para que _LimitadorTasa (situacion_aprendizaje.py)
        # espacie las llamadas según el coste REAL de cupo, no el bruto.
        # Sin esto, una vez el prefijo compartido está caliente (ver
        # construir_prompt_seleccion y _prefijo_compartido), el limitador
        # seguiría haciendo esperar de más por tokens que ya salen gratis.
        cached_tokens = (uso.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
        tokens_reales = (total_tokens - cached_tokens) if total_tokens is not None else None
        return texto, tokens_reales
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None, None

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
