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

# Un documento de teoría real no debería acercarse a esto -- pensado para
# cortar pronto normativas/libros enteros subidos por error. Probado en
# real: un PDF de 543 páginas tardó varios minutos y llegó a consumir una
# parte notable de la RAM del servidor (4 GiB compartidos entre 13
# contenedores) antes de que nginx cortara la petición por timeout.
_MAX_PAGINAS = 150

# Cuando la fuente del PDF no mapea un glifo a Unicode (típicamente viñetas
# de lista, "•"), pdfplumber lo deja tal cual como "(cid:114)(cid:1)" en vez
# del carácter real -- no hay forma de recuperar qué símbolo era sin el mapa
# de la fuente. Se normaliza a un guion de viñeta en vez de mandarle a la IA
# ese texto sin sentido.
_PATRON_CID = re.compile(r"(?:\(cid:\d+\))+")


def _limpiar_glifos_no_mapeados(texto):

    return _PATRON_CID.sub("- ", texto)


def extraer_texto_pdf(contenido_bytes):
    """Devuelve (texto, num_paginas). Un PDF escaneado (sin capa de texto) da
    páginas vacías o casi vacías -- el router avisa de "texto escaso" en vez
    de fallar en silencio, en lugar de intentar aquí mismo un OCR que esta
    herramienta no lleva."""

    bloques = []

    with pdfplumber.open(io.BytesIO(contenido_bytes)) as pdf:

        num_paginas = len(pdf.pages)

        if num_paginas > _MAX_PAGINAS:
            raise ValueError(
                f"El PDF tiene {num_paginas} páginas (máximo admitido: {_MAX_PAGINAS}). "
                f"Esta herramienta es para documentos de teoría, no para normativas o libros completos."
            )

        for i, pagina in enumerate(pdf.pages, start=1):
            texto = _limpiar_glifos_no_mapeados((pagina.extract_text() or "").strip())
            bloques.append(f"### Página {i}\n{texto}")

    return "\n\n".join(bloques), num_paginas
