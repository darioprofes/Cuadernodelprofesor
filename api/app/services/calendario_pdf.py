# ==========================================================
# Importación desde el "Calendario escolar" oficial (Principado
# de Asturias, resolución anual de la Consejería de Educación):
# extrae del cuadro de leyenda al pie del PDF las fechas de
# inicio/fin de clases (por enseñanza), días no lectivos y
# periodos de vacaciones.
#
# A diferencia de horario_pdf.py, aquí NO sirve
# pagina.extract_tables(): esa tabla de leyenda solo devuelve la
# fila de cabecera, sin las filas de datos debajo (pdfplumber no
# detecta bordes en esa zona). Se reconstruyen las columnas a
# mano por posición (x0) de cada palabra con extract_words(),
# usando las coordenadas medidas sobre el PDF real del curso
# 2026-2027 -- si Educastur cambia la maquetación en años
# futuros, estos rangos de x0 podrían necesitar un ajuste.
#
# Las columnas "Inicio curso"/"Fin curso" (fechas administrativas
# únicas) y "Festivos" (sin fechas, solo "Festivos
# nacionales"/"Festivos Asturias" como texto) quedan fuera a
# propósito: la app usa "Inicio/Fin de clases" como
# academicYearStart/End (confirmado contra datos reales de
# producción), y los festivos nacionales/autonómicos concretos no
# existen como texto en el PDF, solo como color en el dibujo del
# calendario -- se siguen añadiendo a mano.
# ==========================================================

import io
import re

MESES_PDF = {
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12,
}

RE_FECHA_PDF = re.compile(r"^(\d{1,2})-?([A-Z]{3})(\d{2})$")

# Cabecera real de la leyenda -- ancla para localizar su altura (top) en la
# página, igual que horario_pdf.py ancla por la celda "Día".
_PALABRAS_CABECERA = {"Inicio", "curso", "clases", "Fin", "No", "lectivo", "Vacaciones", "Festivos"}

# Bandas de x0 (puntos PDF) medidas sobre el calendario real 2026-2027:
# cada columna tiene una sub-banda de fecha y, en Inicio/Fin de clases, una
# sub-banda de etiqueta (la enseñanza a la que aplica esa fecha) a su
# derecha, con el texto a veces envuelto en 2 líneas.
_COL_INICIO_CLASES = (95, 135, 270)   # (x0 mínimo, fin sub-banda fecha, fin sub-banda etiqueta)
_COL_FIN_CLASES = (270, 315, 435)
_COL_NO_LECTIVO = (520, 600)
_COL_VACACIONES = (600, 725)

# Justo debajo de la leyenda viene "Educación Infantil 0-3 años: ver
# calendario de EEI 0-3 años", que cae dentro del rango x de
# Vacaciones/Festivos -- sin este límite se colaría como un festivo falso.
_TOP_LIMITE_INFERIOR = 502


def _fecha_iso(dia, mes_abrev, aa):

    mes = MESES_PDF.get(mes_abrev)

    if mes is None:
        return None

    anio = 2000 + int(aa)

    return f"{anio:04d}-{mes:02d}-{int(dia):02d}"


def _parsear_token_fecha(texto):

    m = RE_FECHA_PDF.match(texto)

    if not m:
        return None

    dia, mes_abrev, aa = m.groups()

    return _fecha_iso(dia, mes_abrev, aa)


def _mes_de_iso(fecha_iso):

    return int(fecha_iso[5:7])


def _palabras_columna(palabras, x0_min, x0_max):

    return sorted(
        (p for p in palabras if x0_min <= p["x0"] < x0_max),
        key=lambda p: (round(p["top"], 1), p["x0"])
    )


def _parsear_inicio_fin_clases(palabras, columna):

    # Cada palabra en la sub-banda de fecha abre un registro nuevo; las
    # palabras siguientes en la sub-banda de etiqueta (posiblemente en 2
    # líneas envueltas, p.ej. "FP+Art." / "Sup.+Art." / "Prof." /
    # "AAPP/Diseño+Dep.") se acumulan en ese registro hasta la próxima fecha.
    x0_min, fin_fecha, fin_etiqueta = columna
    palabras_col = _palabras_columna(palabras, x0_min, fin_etiqueta)

    registros = []
    actual = None

    for p in palabras_col:
        es_fecha = x0_min <= p["x0"] < fin_fecha and RE_FECHA_PDF.match(p["text"])

        if es_fecha:
            if actual and actual["fecha"]:
                registros.append(actual)
            actual = {"fecha": _parsear_token_fecha(p["text"]), "etiqueta": ""}
        elif actual is not None and fin_fecha <= p["x0"] < fin_etiqueta:
            actual["etiqueta"] = (actual["etiqueta"] + " " + p["text"]).strip()

    if actual and actual["fecha"]:
        registros.append(actual)

    return registros


def _parsear_no_lectivo(palabras):

    # Patrones vistos en el PDF real: fecha suelta ("30-OCT26") o combo de
    # 2 días "N y D-MES-AA" ("3 y 4-NOV26") -- el primer número toma el
    # mes/año del segundo token completo.
    palabras_col = _palabras_columna(palabras, *_COL_NO_LECTIVO)

    registros = []
    i = 0

    while i < len(palabras_col):
        texto = palabras_col[i]["text"]

        if RE_FECHA_PDF.match(texto):
            fecha = _parsear_token_fecha(texto)
            registros.append({"nombre": "Día no lectivo", "fechaInicio": fecha, "fechaFin": fecha})
            i += 1
        elif (texto.isdigit() and i + 2 < len(palabras_col)
              and palabras_col[i + 1]["text"] == "y" and RE_FECHA_PDF.match(palabras_col[i + 2]["text"])):
            fecha_fin = _parsear_token_fecha(palabras_col[i + 2]["text"])
            fecha_inicio = f"{fecha_fin[:4]}-{fecha_fin[5:7]}-{int(texto):02d}"
            registros.append({"nombre": "Días no lectivos", "fechaInicio": fecha_inicio, "fechaFin": fecha_fin})
            i += 3
        else:
            i += 1

    return registros


def _nombre_vacaciones(fecha_inicio_iso):

    mes = _mes_de_iso(fecha_inicio_iso)

    if mes in (12, 1):
        return "Vacaciones de Navidad"

    if mes in (3, 4):
        return "Vacaciones de Semana Santa"

    if mes in (6, 7, 8):
        return "Vacaciones de verano"

    return "Vacaciones"


def _parsear_vacaciones(palabras, errores):

    # Patrones vistos: rango completo ("23-DIC26 a 10-ENE27"), rango
    # abreviado sin mes en el primer día ("22 a 28-MAR27" -- toma mes/año
    # del segundo token) y rango abierto ("1-JUL27 hasta el inicio del
    # curso 27-28": sin fecha de fin exacta, se avisa en errores en vez de
    # inventarla). Un token que empieza por "+" (p.ej. "+2 días calendario
    # laboral municipal") es una nota suelta, no una fecha nueva.
    palabras_col = _palabras_columna(palabras, *_COL_VACACIONES)

    registros = []
    i = 0

    while i < len(palabras_col):
        texto = palabras_col[i]["text"]

        if texto.startswith("+"):
            i += 1
            continue

        es_inicio_completo = RE_FECHA_PDF.match(texto)
        es_inicio_abreviado = texto.isdigit()
        hay_rango = (
            (es_inicio_completo or es_inicio_abreviado)
            and i + 2 < len(palabras_col)
            and palabras_col[i + 1]["text"] == "a"
            and RE_FECHA_PDF.match(palabras_col[i + 2]["text"])
        )

        if hay_rango:
            fecha_fin = _parsear_token_fecha(palabras_col[i + 2]["text"])
            if es_inicio_completo:
                fecha_inicio = _parsear_token_fecha(texto)
            else:
                fecha_inicio = f"{fecha_fin[:4]}-{fecha_fin[5:7]}-{int(texto):02d}"
            registros.append({"nombre": _nombre_vacaciones(fecha_inicio), "fechaInicio": fecha_inicio, "fechaFin": fecha_fin})
            i += 3
        elif es_inicio_completo and i + 1 < len(palabras_col) and palabras_col[i + 1]["text"] == "hasta":
            fecha_inicio = _parsear_token_fecha(texto)
            registros.append({"nombre": _nombre_vacaciones(fecha_inicio), "fechaInicio": fecha_inicio, "fechaFin": None})
            errores.append(
                f"{_nombre_vacaciones(fecha_inicio)}: el PDF no da fecha de fin exacta "
                "(depende del calendario del curso siguiente) — complétala a mano."
            )
            i += 1
            # El resto de la frase abierta ("hasta el inicio del curso
            # 27-28") no aporta más fechas -- se salta hasta el próximo
            # token que sí parezca el inicio de un dato nuevo.
            while i < len(palabras_col) and not RE_FECHA_PDF.match(palabras_col[i]["text"]) and not palabras_col[i]["text"].startswith("+"):
                i += 1
        else:
            i += 1

    return registros


def extraer_calendario_pdf(contenido_bytes):

    import pdfplumber

    errores = []

    with pdfplumber.open(io.BytesIO(contenido_bytes)) as pdf:

        if not pdf.pages:
            return {"inicioClases": [], "finClases": [], "noLectivo": [], "vacaciones": []}, errores

        pagina = pdf.pages[0]
        palabras = pagina.extract_words(use_text_flow=False, keep_blank_chars=False)

        palabras_cabecera = [p for p in palabras if p["text"] in _PALABRAS_CABECERA]

        if not palabras_cabecera:
            errores.append("No se ha encontrado la tabla de leyenda del calendario en el PDF (¿es el documento oficial correcto?).")
            return {"inicioClases": [], "finClases": [], "noLectivo": [], "vacaciones": []}, errores

        top_cabecera = min(p["top"] for p in palabras_cabecera)
        zona = [p for p in palabras if top_cabecera - 2 <= p["top"] < _TOP_LIMITE_INFERIOR]

    resultado = {
        "inicioClases": _parsear_inicio_fin_clases(zona, _COL_INICIO_CLASES),
        "finClases": _parsear_inicio_fin_clases(zona, _COL_FIN_CLASES),
        "noLectivo": _parsear_no_lectivo(zona),
        "vacaciones": _parsear_vacaciones(zona, errores),
    }

    if not resultado["inicioClases"] and not resultado["finClases"]:
        errores.append("No se han reconocido fechas de inicio/fin de clases en el PDF -- revísalas a mano.")

    return resultado, errores
