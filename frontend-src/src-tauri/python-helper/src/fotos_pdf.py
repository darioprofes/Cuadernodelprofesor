import base64
import io
import re
from typing import Optional, TypedDict

import pdfplumber
import pypdfium2 as pdfium

# Copia manual de api/app/services/fotos_pdf.py (backend web) -- misma
# lógica de detección/recorte, con dos adaptaciones documentadas junto a
# cada una:
# 1. No hay `services.students.list_students` en el sidecar (no toca la
#    base de datos, ver services/educastur_orchestrator.py para el mismo
#    criterio): el listado de alumnado llega ya resuelto por stdin
#    (`alumnos`), Rust es quien lo consulta antes de invocar este módulo.
# 2. `pdf2image` (backend web) usa Poppler, un binario externo que habría
#    que instalar/distribuir aparte en Windows -- se sustituye por
#    `pypdfium2`, que trae la librería nativa de PDFium ya empaquetada en
#    el propio wheel (sin dependencia externa, igual de sencillo de
#    congelar con PyInstaller que el resto de dependencias de este
#    sidecar). `pypdfium2` con `scale=dpi/72` renderiza la página con el
#    mismo origen (esquina superior izquierda) y la misma orientación
#    visual que pdf2image, así que el resto de la geometría (coordenadas
#    de pdfplumber, caja de recorte) es idéntica a la versión web.
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


def extraer_y_emparejar(pdf_bytes: bytes, alumnos: list[dict], dpi: int = 300) -> dict:
    """
    Extrae las fotos del PDF y empareja cada una con el alumno cuyo `nie`
    coincida con el código detectado. No sube nada -- el frontend decide,
    foto a foto, cuáles aplicar (reutilizando el comando Tauri
    set_student_photo). `alumnos` ya viene con exactamente los campos que
    hacen falta (id, nie, nombre, primerApellido, segundoApellido,
    yaTieneFoto), resueltos por Rust antes de llamar.
    """

    paginas_entradas = _extraer_codigos_por_foto(pdf_bytes)

    alumnos_por_nie = {a["nie"]: a for a in alumnos if a.get("nie")}

    escala = dpi / 72.0
    vistos: set[str] = set()
    items: list[FotoDetectada] = []
    sin_codigo = 0

    pdf_render = pdfium.PdfDocument(pdf_bytes)

    for numero_pagina, entradas in enumerate(paginas_entradas):

        if not entradas:
            continue

        pagina_render = pdf_render[numero_pagina].render(scale=escala).to_pil()

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
                partes = [alumno.get("nombre"), alumno.get("primerApellido"), alumno.get("segundoApellido")]
                nombre_completo = " ".join(p for p in partes if p) or None

            items.append({
                "codigo": codigo,
                "imagen_base64": imagen_base64,
                "student_id": alumno["id"] if alumno else None,
                "nombre_completo": nombre_completo,
                "ya_tiene_foto": bool(alumno.get("yaTieneFoto")) if alumno else False,
            })

    pdf_render.close()

    return {"items": items, "sin_codigo": sin_codigo}
