import base64
import io
import re
from typing import Optional, TypedDict

import pdfplumber
from pdf2image import convert_from_bytes

from services.students import list_students

# Mismo patrón que el script de origen (extraer_fotos_alumnado.py): el
# código que aparece justo debajo de cada foto en el PDF de "Fotografías del
# alumnado por unidad" (Educastur) es el NIE (SAUCE) del alumno, no un ID
# interno de esta app -- se empareja directo contra students.nie.
_PATRON_CODIGO = re.compile(r"\d{5,9}")
_VENTANA_VERTICAL = 30
_MARGEN_HORIZONTAL = 15
_TOP_MINIMO_FOTO = 100


class FotoDetectada(TypedDict):
    codigo: str
    imagen_base64: str
    student_id: Optional[str]
    nombre_completo: Optional[str]
    ya_tiene_foto: bool


def _extraer_codigos_por_foto(pdf_bytes: bytes) -> list[list[dict]]:

    paginas = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:

        for pagina in pdf.pages:

            imagenes = [im for im in pagina.images if im["top"] > _TOP_MINIMO_FOTO]
            palabras = pagina.extract_words()

            filas: dict[float, list[dict]] = {}
            for im in imagenes:
                clave_fila = round(im["top"] / 5) * 5
                filas.setdefault(clave_fila, []).append(im)

            entradas = []
            for imagenes_fila in filas.values():
                abajo_fila = max(im["bottom"] for im in imagenes_fila)
                for im in imagenes_fila:
                    x0, x1 = im["x0"], im["x1"]
                    codigo = None
                    for palabra in palabras:
                        dentro_vertical = abajo_fila + 1 <= palabra["top"] <= abajo_fila + _VENTANA_VERTICAL
                        dentro_horizontal = x0 - _MARGEN_HORIZONTAL <= palabra["x0"] <= x1 + _MARGEN_HORIZONTAL
                        if dentro_vertical and dentro_horizontal and _PATRON_CODIGO.fullmatch(palabra["text"]):
                            codigo = palabra["text"]
                            break
                    entradas.append({"x0": x0, "x1": x1, "top": im["top"], "bottom": im["bottom"], "code": codigo})

            paginas.append(entradas)

    return paginas


def extraer_y_emparejar(pdf_bytes: bytes, dpi: int = 300) -> dict:
    """
    Extrae las fotos del PDF y empareja cada una con el alumno cuyo `nie`
    coincida con el código detectado. No sube nada -- el frontend decide,
    foto a foto, cuáles aplicar (reutilizando PUT /photos/{student_id}).
    """

    paginas_entradas = _extraer_codigos_por_foto(pdf_bytes)

    alumnos_por_nie = {s.nie: s for s in list_students() if s.nie}

    escala = dpi / 72.0
    vistos: set[str] = set()
    items: list[FotoDetectada] = []
    sin_codigo = 0

    for numero_pagina, entradas in enumerate(paginas_entradas):

        if not entradas:
            continue

        pagina_render = convert_from_bytes(
            pdf_bytes, dpi=dpi, first_page=numero_pagina + 1, last_page=numero_pagina + 1
        )[0]

        for entrada in entradas:

            codigo = entrada["code"]

            if codigo is None:
                sin_codigo += 1
                continue

            if codigo in vistos:
                continue
            vistos.add(codigo)

            caja = (
                int(entrada["x0"] * escala) - 2,
                int(entrada["top"] * escala) - 2,
                int(entrada["x1"] * escala) + 2,
                int(entrada["bottom"] * escala) + 2,
            )
            recorte = pagina_render.crop(caja)

            buffer = io.BytesIO()
            recorte.convert("RGB").save(buffer, format="JPEG", quality=90)
            imagen_base64 = base64.b64encode(buffer.getvalue()).decode("ascii")

            alumno = alumnos_por_nie.get(codigo)

            nombre_completo = None
            if alumno is not None:
                partes = [alumno.nombre, alumno.primer_apellido, alumno.segundo_apellido]
                nombre_completo = " ".join(p for p in partes if p) or None

            items.append({
                "codigo": codigo,
                "imagen_base64": imagen_base64,
                "student_id": str(alumno.id) if alumno else None,
                "nombre_completo": nombre_completo,
                "ya_tiene_foto": bool(alumno.foto_content_type) if alumno else False,
            })

    return {"items": items, "sin_codigo": sin_codigo}
