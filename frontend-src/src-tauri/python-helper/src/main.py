# ==========================================================
# python-helper -- sidecar de la versión de escritorio (Tauri)
# ==========================================================
#
# Único ejecutable con varios subcomandos (mismo criterio que
# services::api_request en el lado Rust: un despachador genérico en vez
# de un binario por función) para las partes que dependen de librerías
# Python sin equivalente razonable en Rust -- pdfplumber para importar el
# horario en PDF, más adelante spaCy para el Anonimizador. Se compila con
# PyInstaller en modo --onedir (carpeta ya desempaquetada, sin coste de
# autoextracción en cada arranque) y se instala como recurso de Tauri, no
# como sidecar "externalBin" (ese mecanismo espera un único fichero).
#
# Contrato de cada subcomando: recibe sus argumentos por la línea de
# comandos, imprime un único JSON a stdout y termina con código 0 si todo
# fue bien. Cualquier fallo se imprime como {"error": "..."} a stderr con
# código de salida 1 -- nunca una traza de Python cruda, que el lado Rust
# no sabría interpretar.
#
# pdfplumber cubre tanto importar-horario como importar-calendario (el
# calendario escolar oficial en PDF, ver calendario_pdf.py).

import json
import sys


def cmd_importar_horario(args):
    """importar-horario -- lee los bytes del PDF por stdin (no una ruta de
    fichero: evita crear y limpiar un temporal, mismo criterio que ya usa
    set_student_photo en Rust para pasar bytes directamente). Devuelve
    {"filas": [...], "errores": [...]}, mismo formato que ya devuelve el
    backend web (POST /horario/importar-pdf, ver
    api/app/routers/horario.py)."""

    from horario_pdf import extraer_filas_pdf

    contenido = sys.stdin.buffer.read()

    filas, errores = extraer_filas_pdf(contenido)

    return {"filas": filas, "errores": errores}


def cmd_importar_calendario(args):
    """importar-calendario -- lee los bytes del PDF del calendario escolar
    oficial por stdin (mismo criterio que importar-horario: bytes crudos,
    no una ruta de fichero). Devuelve {inicioClases, finClases, noLectivo,
    vacaciones, festivos, errores}, mismo formato que ya devuelve el
    backend web (POST /calendario/importar-pdf, ver
    api/app/routers/calendario.py)."""

    from calendario_pdf import extraer_calendario_pdf

    contenido = sys.stdin.buffer.read()

    resultado, errores = extraer_calendario_pdf(contenido)

    return {**resultado, "errores": errores}


def cmd_educastur_sincronizar(args):
    """educastur-sincronizar -- lee por stdin un JSON con credenciales +
    las faltas ya resueltas por Rust (ver educastur_orchestrator.py para
    el contrato exacto). NO toca ninguna base de datos -- Rust es quien
    consulta qué está pendiente antes de llamar, y quien escribe los
    resultados después."""

    from educastur_orchestrator import sincronizar

    datos = json.loads(sys.stdin.buffer.read())

    return sincronizar(datos)


COMANDOS = {
    "importar-horario": cmd_importar_horario,
    "importar-calendario": cmd_importar_calendario,
    "educastur-sincronizar": cmd_educastur_sincronizar,
}


def _escribir_json(stream, payload):
    """Escribe JSON como bytes UTF-8 directamente al stream binario
    (sys.stdout.buffer / sys.stderr.buffer), NUNCA por print()/sys.stdout
    de texto: en Windows, un proceso lanzado sin consola propia (como lo
    lanza Rust, con los tres stdio redirigidos por tubería) hace que
    Python elija la codificación de sys.stdout por la página de códigos
    del sistema (cp1252 en Windows en español) en vez de UTF-8 -- con
    ensure_ascii=False, cualquier tilde/ñ en el horario (materias, aulas)
    se escribía entonces mal codificada, y Rust (serde_json::from_slice,
    que exige UTF-8 estricto) fallaba con "invalid unicode code point".
    Escribir el bytes ya codificados a mano evita depender de esa
    codificación implícita por completo.
    """
    stream.buffer.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def main():

    if len(sys.argv) < 2 or sys.argv[1] not in COMANDOS:
        _escribir_json(sys.stderr, {"error": f"Comando desconocido -- usa uno de: {', '.join(COMANDOS)}"})
        sys.exit(1)

    comando = sys.argv[1]

    try:
        resultado = COMANDOS[comando](sys.argv[2:])
    except Exception as exc:
        _escribir_json(sys.stderr, {"error": str(exc)})
        sys.exit(1)

    _escribir_json(sys.stdout, resultado)


if __name__ == "__main__":
    main()
