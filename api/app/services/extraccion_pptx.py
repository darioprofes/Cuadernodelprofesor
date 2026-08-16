# ==========================================================
# Extracción de .pptx a texto (Generador de prompts — Unidad de programación)
# ==========================================================
#
# Un marcador "### Diapositiva N" por diapositiva, mismo criterio que ya se
# validó dos veces con datos reales en el prototipo de esta sesión
# (generar_prompt.py / atmosfera.txt): la instrucción del prompt le pide a la
# IA que revise diapositiva a diapositiva antes de responder, así que el
# marcador tiene que ser inequívoco y constante.
#
# No recorre shapes agrupados (GroupShape) -- mismo criterio de alcance que
# services/extraccion_docx.py con encabezados/pies de página: cubre el caso
# real (texto y tablas sueltas en la diapositiva), no cada rincón posible del
# formato.

import io

from pptx import Presentation


def _celda_a_texto(cell):

    return cell.text.strip()


def _tabla_a_markdown(table):

    filas_md = []

    for i, row in enumerate(table.rows):
        celdas = [_celda_a_texto(cell).replace("|", "\\|").replace("\n", " ") for cell in row.cells]
        filas_md.append("| " + " | ".join(celdas) + " |")

        if i == 0:
            filas_md.append("| " + " | ".join(["---"] * len(celdas)) + " |")

    return "\n".join(filas_md)


def extraer_texto_pptx(contenido_bytes):
    """Devuelve (texto, num_diapositivas). `num_diapositivas` sirve para la
    heurística de "texto escaso" del router (texto/diapositiva muy bajo suele
    indicar diapositivas hechas de imágenes, no de texto)."""

    presentacion = Presentation(io.BytesIO(contenido_bytes))
    bloques = []

    for i, diapositiva in enumerate(presentacion.slides, start=1):

        partes = []

        for shape in diapositiva.shapes:

            if shape.has_text_frame:
                texto = shape.text_frame.text.strip()
                if texto:
                    partes.append(texto)

            elif shape.has_table:
                partes.append(_tabla_a_markdown(shape.table))

        if diapositiva.has_notes_slide:
            notas = diapositiva.notes_slide.notes_text_frame.text.strip()
            if notas:
                partes.append(f"(Notas del orador: {notas})")

        bloques.append(f"### Diapositiva {i}\n" + "\n\n".join(partes))

    return "\n\n".join(bloques), len(presentacion.slides)
