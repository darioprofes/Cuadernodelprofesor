# ==========================================================
# Extracción de .pdf a texto (Generador de prompts — Unidad de programación)
# ==========================================================
#
# Texto general por página, con marcador "### Página N" -- distinto de
# services/horario_pdf.py, que busca una tabla concreta (el horario oficial),
# no texto libre. Aquí el documento es de teoría, no tiene estructura fija.

import io

import pdfplumber


def extraer_texto_pdf(contenido_bytes):
    """Devuelve (texto, num_paginas). Un PDF escaneado (sin capa de texto) da
    páginas vacías o casi vacías -- el router avisa de "texto escaso" en vez
    de fallar en silencio, en lugar de intentar aquí mismo un OCR que esta
    herramienta no lleva."""

    bloques = []

    with pdfplumber.open(io.BytesIO(contenido_bytes)) as pdf:

        num_paginas = len(pdf.pages)

        for i, pagina in enumerate(pdf.pages, start=1):
            texto = (pagina.extract_text() or "").strip()
            bloques.append(f"### Página {i}\n{texto}")

    return "\n\n".join(bloques), num_paginas
