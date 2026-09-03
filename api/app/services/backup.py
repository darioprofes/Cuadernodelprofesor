import base64
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from psycopg.types.json import Json

from services.db import get_conn

# Todas las tablas "reales" del sistema (todo lo que sobrevivió a la Fase 6 —
# app_db/app_db_history/student_photos, forma vieja, ya no existen). Orden
# deliberado: padres antes que hijos, para que import_all() pueda insertar
# en este mismo orden sin violar ninguna FK. El TRUNCATE de export/import no
# necesita este orden (CASCADE lo resuelve), pero el INSERT sí.
_TABLES_IN_DEPENDENCY_ORDER = [
    "app_preferences",
    "educastur_config",
    "shortcuts",
    # academic_years va ANTES que students -- students.imported_academic_year_id
    # (migración 0011) es un FK a academic_years, y sin este orden el INSERT
    # de students fallaba con ForeignKeyViolation en cuanto ese campo no
    # estuviera vacío (confirmado en real, restaurando una copia con
    # alumnado ya importado de Educastur).
    "academic_years",
    "students",
    "key_competences",
    "operational_descriptors",
    "courses",
    "specific_competences",
    "specific_competence_descriptors",
    "evaluation_criteria",
    "basic_knowledge",
    "programming_units",
    "evaluation_tools",
    "evaluation_periods",
    "academic_year_courses",
    "classes",
    "enrollments",
    "absences",
    "categories",
    "assignments",
    "grades",
    "journal_entries",
    "tasks",
    "meetings",
    "agenda_notes",
]


def _to_jsonable(value: Any) -> Any:

    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)

    if isinstance(value, (datetime, date, time)):
        return value.isoformat()

    if isinstance(value, (memoryview, bytes)):
        # BYTEA (students.foto): se quedaba fuera a propósito para no
        # hinchar el backup de texto -- pero eso rompía la promesa real de
        # "Exportar" + "Restablecer Aplicación" + "Importar": el alumnado
        # volvía sin fotos, no exactamente como estaba. A este tamaño de
        # datos (sin fotos ya son unos cientos de KB; con fotos, unos pocos
        # MB) no compensa el ahorro -- se codifica en base64 igual que
        # cualquier otro campo, ver _bytea_columns/import_all más abajo
        # para la reconstrucción a bytes reales al importar. psycopg puede
        # devolver un BYTEA como memoryview o como bytes según el contexto
        # -- confirmado en real: aquí llegaba como bytes y el isinstance
        # solo cubría memoryview, así que se colaba sin codificar y
        # reventaba la serialización de FastAPI con UnicodeDecodeError.
        return base64.b64encode(bytes(value)).decode("ascii")

    return value


def export_all() -> dict[str, list[dict[str, Any]]]:

    dump: dict[str, list[dict[str, Any]]] = {}

    with get_conn() as conn:

        with conn.cursor() as cur:

            for table in _TABLES_IN_DEPENDENCY_ORDER:

                cur.execute(f"SELECT * FROM {table}")

                rows = cur.fetchall()

                dump[table] = [
                    {col: _to_jsonable(val) for col, val in row.items()}
                    for row in rows
                ]

    return dump


def _jsonb_columns(cur, table: str) -> set[str]:

    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s AND data_type = 'jsonb'",
        [table]
    )

    return {row["column_name"] for row in cur.fetchall()}


def _boolean_columns(cur, table: str) -> set[str]:

    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s AND data_type = 'boolean'",
        [table]
    )

    return {row["column_name"] for row in cur.fetchall()}


def _bytea_columns(cur, table: str) -> set[str]:

    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s AND data_type = 'bytea'",
        [table]
    )

    return {row["column_name"] for row in cur.fetchall()}


def _coerce_bool(value: Any) -> Any:
    """El JSON de origen puede representar una columna lógicamente booleana
    de formas distintas según qué la generó -- un booleano real (web, o un
    export de escritorio ya corregido), un entero 0/1 (SQLite no distingue
    boolean de integer -- ver el bug real de 2026-09-03 que dejó copias de
    escritorio con 0/1 en vez de true/false) o, por si algún día hay un
    tercer origen, un texto "true"/"false"/"0"/"1". None se deja tal cual
    (columna nullable). Cualquier otra cosa se deja pasar sin tocar --
    Postgres dará su propio error si de verdad es basura, mejor que
    inventarnos una conversión rara."""

    if value is None or isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return bool(value)

    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "1"):
            return True
        if low in ("false", "0"):
            return False

    return value


def _real_columns(cur, table: str) -> set[str]:
    """Columnas REALES de la tabla, según el propio esquema -- import_all()
    construye el INSERT a partir de las claves del JSON subido, así que sin
    esto cualquier clave de fila (nombre de "columna" arbitrario puesto por
    quien sea que generó el archivo) se concatenaría sin escapar en el SQL.
    Filtrar contra esta lista blanca antes de construir la sentencia cierra
    esa vía -- cualquier clave que no sea una columna real de esta tabla se
    descarta en vez de llegar al f-string."""

    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
        [table]
    )

    return {row["column_name"] for row in cur.fetchall()}


# Todo o nada: si algo falla a mitad, la conexión no hace commit (get_conn
# hace rollback automático en excepción, ver services/db.py) — no se puede
# dejar una restauración a medias como estado final.
def import_all(dump: dict[str, list[Any]]) -> None:

    with get_conn() as conn:

        with conn.cursor() as cur:

            quoted_tables = ", ".join(_TABLES_IN_DEPENDENCY_ORDER)

            cur.execute(f"TRUNCATE {quoted_tables} RESTART IDENTITY CASCADE")

            for table in _TABLES_IN_DEPENDENCY_ORDER:

                rows = dump.get(table) or []

                if not rows:
                    continue

                jsonb_cols = _jsonb_columns(cur, table)
                bool_cols = _boolean_columns(cur, table)
                bytea_cols = _bytea_columns(cur, table)
                columnas_reales = _real_columns(cur, table)

                columns = [c for c in rows[0].keys() if c in columnas_reales]

                if not columns:
                    continue

                placeholders = ", ".join(["%s"] * len(columns))

                column_list = ", ".join(columns)

                for row in rows:

                    values = [
                        Json(row[col]) if col in jsonb_cols and row[col] is not None
                        else _coerce_bool(row.get(col)) if col in bool_cols
                        else base64.b64decode(row[col]) if col in bytea_cols and row[col] is not None
                        else row.get(col)
                        for col in columns
                    ]

                    cur.execute(f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})", values)
