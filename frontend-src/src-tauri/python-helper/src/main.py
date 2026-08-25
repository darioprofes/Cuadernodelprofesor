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
    "educastur-sincronizar": cmd_educastur_sincronizar,
}


def main():

    if len(sys.argv) < 2 or sys.argv[1] not in COMANDOS:
        print(
            json.dumps({"error": f"Comando desconocido -- usa uno de: {', '.join(COMANDOS)}"}),
            file=sys.stderr,
        )
        sys.exit(1)

    comando = sys.argv[1]

    try:
        resultado = COMANDOS[comando](sys.argv[2:])
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(resultado, ensure_ascii=False))


if __name__ == "__main__":
    main()
