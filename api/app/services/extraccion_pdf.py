# ==========================================================
# Extracción de .pdf a texto (Generador de prompts — Unidad de programación)
# ==========================================================
#
# Texto general por página, con marcador "### Página N" -- distinto de
# services/horario_pdf.py, que busca una tabla concreta (el horario oficial),
# no texto libre. Aquí el documento es de teoría, no tiene estructura fija.

import io
import re

import pdfplumber

from services.llm_client import transcribir_imagen

# Un documento de teoría real no debería acercarse a esto -- pensado para
# cortar pronto normativas/libros enteros subidos por error. Probado en
# real: un PDF de 543 páginas tardó varios minutos y llegó a consumir una
# parte notable de la RAM del servidor (4 GiB compartidos entre 13
# contenedores) antes de que nginx cortara la petición por timeout.
_MAX_PAGINAS = 150

# Por debajo de esto, caracteres de texto extraído en la página, se considera
# candidata a "probablemente escaneada" y se intenta el fallback de visión.
_UMBRAL_CARACTERES_PAGINA = 40

# Cada página con IA de visión tarda ~15-20s (probado real) -- un límite bajo
# a propósito para no convertir la subida de un libro entero escaneado en una
# petición de varios minutos. Por encima de esto se corta y se avisa, en vez
# de tirar adelante en silencio.
_MAX_PAGINAS_VISION = 20

# Cuando la fuente del PDF no mapea un glifo a Unicode (típicamente viñetas
# de lista, "•"), pdfplumber lo deja tal cual como "(cid:114)(cid:1)" en vez
# del carácter real -- no hay forma de recuperar qué símbolo era sin el mapa
# de la fuente. Se normaliza a un guion de viñeta en vez de mandarle a la IA
# ese texto sin sentido.
_PATRON_CID = re.compile(r"(?:\(cid:\d+\))+")


def _limpiar_glifos_no_mapeados(texto):

    return _PATRON_CID.sub("- ", texto)


def extraer_texto_pdf(contenido_bytes):
    """Devuelve (texto, num_paginas, paginas_con_vision, paginas_vision_fallida).

    Las páginas con muy poco texto (probable escaneado) se intentan releer
    con el modelo de visión del ia-server -- si no está disponible, se deja
    el texto escaso original y esa página se reporta en
    paginas_vision_fallida para que el router avise al profesor."""

    with pdfplumber.open(io.BytesIO(contenido_bytes)) as pdf:

        num_paginas = len(pdf.pages)

        if num_paginas > _MAX_PAGINAS:
            raise ValueError(
                f"El PDF tiene {num_paginas} páginas (máximo admitido: {_MAX_PAGINAS}). "
                f"Esta herramienta es para documentos de teoría, no para normativas o libros completos."
            )

        textos = [_limpiar_glifos_no_mapeados((pagina.extract_text() or "").strip()) for pagina in pdf.pages]
        indices_escasos = [i for i, texto in enumerate(textos) if len(texto) < _UMBRAL_CARACTERES_PAGINA]

        if len(indices_escasos) > _MAX_PAGINAS_VISION:
            raise ValueError(
                f"El PDF tiene {len(indices_escasos)} páginas con muy poco texto (probablemente "
                f"escaneadas) -- demasiadas para releerlas con IA de visión en esta herramienta "
                f"(máximo {_MAX_PAGINAS_VISION}). Sube solo las páginas que necesites, o pasa el "
                f"documento por un OCR aparte antes de subirlo."
            )

        paginas_con_vision = []
        paginas_vision_fallida = []

        for i in indices_escasos:
            try:
                imagen = pdf.pages[i].to_image(resolution=200).original
                buffer = io.BytesIO()
                imagen.save(buffer, format="PNG")
                resultado = transcribir_imagen(buffer.getvalue(), mime_type="image/png")
            except Exception:
                resultado = None

            if resultado:
                textos[i] = resultado
                paginas_con_vision.append(i + 1)
            else:
                paginas_vision_fallida.append(i + 1)

    bloques = [f"### Página {i + 1}\n{texto}" for i, texto in enumerate(textos)]

    return "\n\n".join(bloques), num_paginas, paginas_con_vision, paginas_vision_fallida
