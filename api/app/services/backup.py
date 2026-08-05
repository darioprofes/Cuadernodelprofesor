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
    "shortcuts",
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
    "academic_years",
    "evaluation_periods",
    "academic_year_courses",
    "classes",
    "enrollments",
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

    if isinstance(value, memoryview):
        # BYTEA (students.foto): no tiene sentido meterlo en un backup de
        # texto — se pierde a propósito, igual que ya se advertía en el
        # diálogo de "Restablecer Aplicación" del sistema viejo. El resto de
        # la fila (foto_content_type incluido) sí viaja.
        return None

    return value


def export_all() -> dict[str, list[dict[str, Any]]]:

    dump: dict[str, list[dict[str, Any]]] = {}

    with get_conn() as conn:

        with conn.cursor() as cur:

            for table in _TABLES_IN_DEPENDENCY_ORDER:

                cur.execute(f"SELECT * FROM {table}")

                rows = cur.fetchall()

                dump[table] = [
                    {col: _to_jsonable(val) for col, val in row.items() if col != "foto"}
                    for row in rows
                ]

    return dump


def _jsonb_columns(cur, table: str) -> set[str]:

    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s AND data_type = 'jsonb'",
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

                columns = list(rows[0].keys())

                placeholders = ", ".join(["%s"] * len(columns))

                column_list = ", ".join(columns)

                for row in rows:

                    values = [Json(row[col]) if col in jsonb_cols and row[col] is not None else row.get(col) for col in columns]

                    cur.execute(f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})", values)
