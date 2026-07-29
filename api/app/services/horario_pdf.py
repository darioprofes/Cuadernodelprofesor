# ==========================================================
# Importación desde el "Horario individual del profesorado"
# oficial (Principado de Asturias, PA_InsHorIndProf.rdf y
# formatos equivalentes de otras administraciones con la misma
# estructura de tabla: Día | Horas | Actividad | Materia |
# Enseñanza | Unidad | Dependencia).
# ==========================================================

import io
import os
import re

DIAS_PDF = {"L": 0, "M": 1, "X": 2, "J": 3, "V": 4}


def _limpio(valor):

    if valor is None:
        return ""

    return str(valor).strip()


def _parsear_rango_horas_pdf(texto):

    # Mismo criterio tolerante a guiones que la importación CSV: el PDF
    # suele usar un guion normal ("8:15-9:10"), pero por si acaso.
    partes = re.split(r"\s*[-‐-―−]\s*", texto.strip())

    if len(partes) != 2:
        return None, None

    return partes[0].strip(), partes[1].strip()


def _a_minutos(hhmm):

    h, m = hhmm.split(":")

    return int(h) * 60 + int(m)


def _completar_franjas_libres(filas):

    # El PDF no imprime fila alguna para una franja sin ninguna actividad
    # asignada en un día concreto: ni la propia franja horaria aparece en la
    # tabla (p.ej. el hueco del recreo, que no tiene fila en ningún día).
    # Se reconstruye la rejilla real de franjas del horario (unión de las
    # horas que sí aparecen en cualquier día, más los huecos entre franjas
    # consecutivas) y se rellena, sin nombre por defecto, cualquier franja de
    # esa rejilla que falte en un día que ya tiene alguna franja (no se
    # inventan días enteros sin ninguna fila, por si ese día simplemente no
    # es lectivo).

    franjas_reales = sorted(
        {(f["hora_inicio"], f["hora_fin"]) for f in filas},
        key=lambda p: _a_minutos(p[0])
    )

    rejilla = list(franjas_reales)

    for (_, fin_a), (ini_b, _) in zip(franjas_reales, franjas_reales[1:]):
        if _a_minutos(fin_a) < _a_minutos(ini_b):
            rejilla.append((fin_a, ini_b))

    rejilla.sort(key=lambda p: _a_minutos(p[0]))

    franjas_por_dia = {}

    for f in filas:
        franjas_por_dia.setdefault(f["dia"], set()).add((f["hora_inicio"], f["hora_fin"]))

    for dia, ocupadas in franjas_por_dia.items():
        for hora_inicio, hora_fin in rejilla:
            if (hora_inicio, hora_fin) not in ocupadas:
                filas.append({
                    "dia": dia,
                    "hora_inicio": hora_inicio,
                    "hora_fin": hora_fin,
                    "grupo": None,
                    "asignatura": "",
                    "aula": None,
                    "ensenanza": None
                })

    return filas


def _fusionar_codigos_grupo(codigos):

    # Varias "Unidad" en la misma hora/día/materia son un único grupo
    # combinado (p.ej. una clase de ámbito con alumnado mezclado de S4B y
    # S4D): se fusionan en un solo código en vez de crear una franja por
    # cada uno. Regla: prefijo común + letras distintas que le siguen,
    # ordenadas ("S4B"+"S4D" -> "S4BD"). El profesor puede renombrar luego
    # el grupo a mano si quiere un nombre más descriptivo.
    codigos_unicos = []

    for codigo in codigos:
        if codigo and codigo not in codigos_unicos:
            codigos_unicos.append(codigo)

    if not codigos_unicos:
        return None

    if len(codigos_unicos) == 1:
        return codigos_unicos[0]

    prefijo = os.path.commonprefix(codigos_unicos)
    sufijos = [codigo[len(prefijo):] for codigo in codigos_unicos]

    if prefijo and all(sufijos):
        return prefijo + "".join(sorted(sufijos))

    return "+".join(codigos_unicos)


def extraer_filas_pdf(contenido_bytes):

    import pdfplumber

    filas_extraidas = []
    errores = []

    with pdfplumber.open(io.BytesIO(contenido_bytes)) as pdf:

        for pagina in pdf.pages:

            for tabla in pagina.extract_tables():

                # Localizar la fila de cabecera real ("Día" en la primera
                # celda): el documento tiene cuadros de datos del centro y
                # firmas alrededor que también pueden salir como "tabla".
                idx_cabecera = None

                for i, fila in enumerate(tabla):

                    if fila and _limpio(fila[0]) == "Día":
                        idx_cabecera = i
                        break

                if idx_cabecera is None:
                    continue

                dia_actual = None
                periodo_actual = None

                def _flush():

                    nonlocal periodo_actual

                    if periodo_actual is None:
                        return

                    p = periodo_actual
                    periodo_actual = None

                    dia_num = DIAS_PDF.get(p["dia"])

                    if dia_num is None:
                        errores.append(f"Día no reconocido en el PDF: '{p['dia']}'")
                        return

                    hora_inicio, hora_fin = _parsear_rango_horas_pdf(p["horas"])

                    if hora_inicio is None:
                        errores.append(f"Horas no reconocidas en el PDF: '{p['horas']}'")
                        return

                    # Sin "Materia" ni "Actividad" es una franja libre (hora
                    # sin docencia ni guardia asignada) tal cual la marca el
                    # PDF oficial: se conserva como tal en vez de descartarla,
                    # para que quede reflejada en el horario importado — pero
                    # sin nombre por defecto (el profesor decide si le pone
                    # uno, p.ej. "Recreo", desde Ajustes → Cursos y Materias).
                    asignatura = p["materia"] or p["actividad"] or ""

                    if p["unidades"]:
                        grupo_nombre = _fusionar_codigos_grupo(p["unidades"])
                        aula = next((a for a in p["aulas"] if a), None)
                        # Varias "Unidad" fusionadas en un grupo comparten la
                        # misma "Enseñanza" (es la misma clase impartida en
                        # conjunto); basta con la primera no vacía.
                        ensenanza = next((e for e in p["ensenanzas"] if e), None)
                    else:
                        grupo_nombre = None
                        aula = p["aula_principal"] or None
                        ensenanza = None

                    filas_extraidas.append({
                        "dia": dia_num,
                        "hora_inicio": hora_inicio,
                        "hora_fin": hora_fin,
                        "grupo": grupo_nombre,
                        "asignatura": asignatura,
                        "aula": aula,
                        "ensenanza": ensenanza
                    })

                for fila in tabla[idx_cabecera + 1:]:

                    celdas = [_limpio(c) for c in fila[:7]]

                    while len(celdas) < 7:
                        celdas.append("")

                    dia, horas, actividad, materia, ensenanza, unidad, dependencia = celdas

                    dia_actual = dia or dia_actual

                    es_inicio_periodo = bool(horas)

                    if es_inicio_periodo:

                        _flush()

                        periodo_actual = {
                            "dia": dia_actual,
                            "horas": horas,
                            "materia": materia,
                            "actividad": actividad,
                            "unidades": [],
                            "aulas": [],
                            "ensenanzas": [],
                            "aula_principal": dependencia
                        }

                    if periodo_actual is None:
                        continue

                    # Red de seguridad: una fila de continuación (no abre
                    # periodo) que no aporta nada propio (ni grupo, ni
                    # aula, ni materia distinta) es puro relleno visual de
                    # la tabla del PDF, no una franja real — se ignora.
                    if not es_inicio_periodo and not (unidad or dependencia or materia):
                        continue

                    if unidad:
                        periodo_actual["unidades"].append(unidad)
                        periodo_actual["aulas"].append(dependencia)
                        periodo_actual["ensenanzas"].append(ensenanza)

                _flush()

    filas_extraidas = _completar_franjas_libres(filas_extraidas)

    return filas_extraidas, errores
