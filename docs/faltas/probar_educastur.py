"""
Prueba manual del cliente de Educastur. Pide credenciales por consola
(no las escribe en ningún sitio) y va imprimiendo cada paso para poder
ver en cuál falla si algo no funciona como se espera.

Uso:
    python probar_educastur.py
"""

import getpass
import json
from datetime import date

from educastur_client import EducasturClient, EducasturError


def main():
    usuario = input("Usuario Educastur: ")
    contrasena = getpass.getpass("Contraseña: ")

    cliente = EducasturClient()

    print("\n--- 1. Login ---")
    try:
        tokens = cliente.login(usuario, contrasena)
    except EducasturError as e:
        print(f"FALLO en login: {e}")
        return
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token")
    print("OK — access_token obtenido (no se muestra por seguridad)")

    print("\n--- 2. obtener_datos_empleado() ---")
    try:
        datos_empleado = cliente.obtener_datos_empleado(access_token)
        print(json.dumps(datos_empleado, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"FALLO: {e}")
        cliente.logout(refresh_token)
        return

    ids = cliente.resolver_ids_empleado(datos_empleado)
    id_empleado = ids["id_empleado"]
    id_centro = ids["id_centro"]
    id_perfil = ids["id_perfil"]
    print(f"\nidEmpleado={id_empleado} idCentro={id_centro} idPerfil={id_perfil}")

    if not all([id_empleado, id_centro, id_perfil]):
        print("\nOJO: falta algún ID — revisa el JSON de arriba para ver bajo qué "
              "clave viene realmente (puede que el nombre no sea exactamente el esperado).")
        cliente.logout(refresh_token)
        return

    print("\n--- 3. obtener_tramos() para hoy ---")
    hoy = date.today().isoformat()
    try:
        tramos = cliente.obtener_tramos(access_token, id_empleado, id_centro, hoy)
        print(json.dumps(tramos, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"FALLO: {e}")
        cliente.logout(refresh_token)
        return

    if not tramos:
        print("\nNo hay tramos para hoy — normal si es festivo/fin de semana. "
              "Prueba con otra fecha si quieres seguir probando buscar_alumnos.")
        cliente.logout(refresh_token)
        return

    print("\n--- 4. buscar_alumnos() del primer tramo ---")
    id_tramo = tramos[0]["idTramo"]
    try:
        alumnos = cliente.buscar_alumnos(access_token, hoy, id_tramo, id_empleado, id_perfil, id_centro)
        print(json.dumps(alumnos, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"FALLO: {e}")
        cliente.logout(refresh_token)
        return

    print("\n--- 5. logout() ---")
    cliente.logout(refresh_token)
    print("OK — sesión cerrada")

    print("\nTodo lo de solo-lectura ha funcionado. NO se ha llamado a "
          "procesar_falta() en esta prueba a propósito, para no marcar faltas "
          "reales sin querer — pruébalo aparte y a mano cuando quieras.")


if __name__ == "__main__":
    main()
