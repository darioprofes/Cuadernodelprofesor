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
# La columna "Inicio curso"/"Fin curso" (fechas administrativas
# únicas) queda fuera a propósito: la app usa "Inicio/Fin de
# clases" como academicYearStart/End (confirmado contra datos
# reales de producción).
#
# "Festivos" (nacional/autonómico) SÍ se extrae, pero no de esa
# columna de texto (que solo dice "Festivos nacionales"/"Festivos
# Asturias", sin fechas) -- se lee del COLOR de cada día en el
# dibujo del calendario (relleno rosa RGB 1.0/0.2/0.6, medido
# sobre el PDF real), correlacionando cada número de día con el
# mes al que pertenece por posición. Investigado a fondo: ninguna
# fuente de datos abiertos (Asturias, Gobierno de España) tiene
# publicado el curso siguiente a tiempo, y una regla calculada a
# mano (festivos fijos + Pascua) fue rechazada por el usuario --
# esto lee directamente el documento oficial, sin inventar nada.
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

# --- Festivos por color (dibujo del calendario, no la leyenda) ---

_MESES_CABECERA = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6,
    "JULIO": 7, "AGOSTO": 8, "SEPTIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
}

# Relleno rosa de un día festivo en el dibujo, medido sobre el PDF real
# (valores 0-1 tal como los da pdfplumber, no 0-255).
_COLOR_FESTIVO_PDF = (1.0, 0.2, 0.6)

# Por debajo de esto empieza la leyenda de abajo, ya no la rejilla de los
# 12 meses -- sin este límite el propio icono de color junto a la palabra
# "Festivos" de la leyenda se colaría como un día festivo falso.
_TOP_LIMITE_CALENDARIO = 440

# Desplazamiento entre la posición del texto de cabecera de cada mes
# ("SEPTIEMBRE" + "2026") y el área real de su rejilla de días, medido
# comparando las 4 tablas que pdfplumber sí reconoce bien con
# find_tables() contra la posición de sus cabeceras -- se aplica igual a
# los 12 meses porque la maquetación de la rejilla es uniforme.
_MES_DX0, _MES_DTOP, _MES_ANCHO, _MES_ALTO = -36.4, 13.13, 156, 98


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


def _cabeceras_de_mes(palabras):

    cabeceras = []

    for i, p in enumerate(palabras):

        # El mes se busca suelto (por diccionario, no como cadena fija tipo
        # "SEPTIEMBRE 2026") -- el año que le sigue tampoco se limita a
        # "20xx", cualquier número de 4 cifras vale, para no depender de
        # qué siglo/año concreto traiga el PDF de turno.
        mes = _MESES_CABECERA.get(p["text"].upper())

        if mes is None:
            continue

        anio = None

        for p2 in palabras[i:i + 2]:
            m = re.match(r"^(\d{4})$", p2["text"])
            if m:
                anio = int(m.group(1))
                break

        if anio is not None:
            cabeceras.append({"mes": mes, "anio": anio, "x0": p["x0"], "top": p["top"]})

    return cabeceras


def _cajas_de_mes(cabeceras):

    cajas = []

    for c in cabeceras:
        x0 = c["x0"] + _MES_DX0
        top = c["top"] + _MES_DTOP
        cajas.append({"mes": c["mes"], "anio": c["anio"], "caja": (x0, top, x0 + _MES_ANCHO, top + _MES_ALTO)})

    return cajas


def _mes_de_punto(cajas, cx, cy):

    for c in cajas:
        x0, top, x1, bottom = c["caja"]
        if x0 <= cx <= x1 and top <= cy <= bottom:
            return c

    return None


def _parsear_festivos(pagina, palabras):

    # Cuando la fecha original cae en domingo, el calendario traslada su
    # observancia al lunes siguiente y colorea AMBOS días -- el domingo
    # con un simple contorno, el lunes trasladado con relleno completo. El
    # margen ajustado de `hay_rosa_bajo` solo detecta color pegado al
    # propio número del día, así que en la práctica solo coge el lunes
    # trasladado (el domingo, ya no lectivo de por sí, queda fuera sin
    # necesidad de distinguir contorno de relleno a propósito).
    cabeceras = _cabeceras_de_mes(palabras)
    cajas = _cajas_de_mes(cabeceras)
    rects_rosa = [
        r for r in pagina.rects
        if r.get("non_stroking_color") == _COLOR_FESTIVO_PDF and r["top"] < _TOP_LIMITE_CALENDARIO
    ]

    def hay_rosa_bajo(x0, top, x1, bottom, margen=1.5):
        return any(
            r["x0"] <= x1 + margen and x0 - margen <= r["x1"]
            and r["top"] <= bottom + margen and top - margen <= r["bottom"]
            for r in rects_rosa
        )

    festivos = []

    for p in palabras:

        if not re.match(r"^\d{1,2}$", p["text"]):
            continue

        cx, cy = (p["x0"] + p["x1"]) / 2, (p["top"] + p["bottom"]) / 2
        caja = _mes_de_punto(cajas, cx, cy)

        if not caja:
            continue

        if hay_rosa_bajo(p["x0"], p["top"], p["x1"], p["bottom"]):
            fecha = f"{caja['anio']:04d}-{caja['mes']:02d}-{int(p['text']):02d}"
            festivos.append({"nombre": "Festivo nacional/autonómico", "fechaInicio": fecha, "fechaFin": fecha})

    festivos.sort(key=lambda f: f["fechaInicio"])

    return festivos


def extraer_calendario_pdf(contenido_bytes):

    import pdfplumber

    errores = []

    with pdfplumber.open(io.BytesIO(contenido_bytes)) as pdf:

        if not pdf.pages:
            return {"inicioClases": [], "finClases": [], "noLectivo": [], "vacaciones": [], "festivos": []}, errores

        pagina = pdf.pages[0]
        palabras = pagina.extract_words(use_text_flow=False, keep_blank_chars=False)

        palabras_cabecera = [p for p in palabras if p["text"] in _PALABRAS_CABECERA]

        if not palabras_cabecera:
            errores.append("No se ha encontrado la tabla de leyenda del calendario en el PDF (¿es el documento oficial correcto?).")
            return {"inicioClases": [], "finClases": [], "noLectivo": [], "vacaciones": [], "festivos": []}, errores

        top_cabecera = min(p["top"] for p in palabras_cabecera)
        zona = [p for p in palabras if top_cabecera - 2 <= p["top"] < _TOP_LIMITE_INFERIOR]

        # Necesita `pagina.rects` (color de cada celda) -- por eso se calcula
        # aquí dentro, antes de que se cierre el documento.
        festivos = _parsear_festivos(pagina, palabras)

    resultado = {
        "inicioClases": _parsear_inicio_fin_clases(zona, _COL_INICIO_CLASES),
        "finClases": _parsear_inicio_fin_clases(zona, _COL_FIN_CLASES),
        "noLectivo": _parsear_no_lectivo(zona),
        "vacaciones": _parsear_vacaciones(zona, errores),
        "festivos": festivos,
    }

    if not resultado["inicioClases"] and not resultado["finClases"]:
        # La causa más probable, comprobada contra el PDF vertical real de
        # Educastur: las columnas de la leyenda están calibradas para el
        # ancho de la página apaisada (horizontal) -- en la versión
        # vertical caen en otro sitio y no se reconoce nada de esta parte
        # (aunque los festivos por color sí suelen seguir saliendo bien).
        errores.append(
            "No se han reconocido fechas de inicio/fin de clases en el PDF. "
            "Asegúrate de usar la versión APAISADA (horizontal) del calendario oficial, no la vertical -- "
            "si ya lo es, revisa estas fechas a mano."
        )

    return resultado, errores
