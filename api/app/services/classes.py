import uuid
from datetime import datetime
from typing import Literal, Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel, updated_at_matches

_COLUMNS = """
    id, academic_year_id, course_id, grupo, schedule, skipped_days, icono,
    color_acento, mesa_profesor_x, mesa_profesor_y, caracteristicas_grupo,
    created_at, updated_at
"""

_JSON_FIELDS = {"schedule", "skipped_days"}


class ClassInput(ApiModel):
    course_id: uuid.UUID
    grupo: Optional[str] = None
    schedule: list = []
    skipped_days: list = []
    icono: Optional[str] = None
    color_acento: Optional[int] = None
    mesa_profesor_x: Optional[float] = None
    mesa_profesor_y: Optional[float] = None
    caracteristicas_grupo: list[str] = []


class ClassPatch(ApiModel):
    course_id: Optional[uuid.UUID] = None
    grupo: Optional[str] = None
    schedule: Optional[list] = None
    skipped_days: Optional[list] = None
    icono: Optional[str] = None
    color_acento: Optional[int] = None
    mesa_profesor_x: Optional[float] = None
    mesa_profesor_y: Optional[float] = None
    caracteristicas_grupo: Optional[list[str]] = None
    expected_updated_at: Optional[str] = None


class ClassData(ApiModel):
    id: uuid.UUID
    academic_year_id: uuid.UUID
    course_id: uuid.UUID
    grupo: Optional[str] = None
    schedule: list = []
    skipped_days: list = []
    icono: Optional[str] = None
    color_acento: Optional[int] = None
    mesa_profesor_x: Optional[float] = None
    mesa_profesor_y: Optional[float] = None
    caracteristicas_grupo: list[str] = []
    created_at: datetime
    updated_at: datetime


def _process(fields: dict) -> dict:

    return {k: (Json(v) if k in _JSON_FIELDS else (str(v) if k == "course_id" else v)) for k, v in fields.items()}


def list_classes(year_id: str) -> list[ClassData]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM classes WHERE academic_year_id = %s ORDER BY created_at", [year_id])

            return [ClassData.model_validate(row) for row in cur.fetchall()]


def get_class(class_id: str) -> Optional[ClassData]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM classes WHERE id = %s", [class_id])

            row = cur.fetchone()

            return ClassData.model_validate(row) if row else None


def create_class(year_id: str, data: ClassInput) -> ClassData:

    fields = _process(data.model_dump())

    with get_conn() as conn:

        with conn.cursor() as cur:

            columns = ["academic_year_id", *fields.keys()]

            values = [year_id, *fields.values()]

            placeholders = ", ".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO classes ({', '.join(columns)}) VALUES ({placeholders}) RETURNING {_COLUMNS}",
                values
            )

            return ClassData.model_validate(cur.fetchone())


def update_class(class_id: str, data: ClassPatch) -> tuple[Literal["ok", "not_found", "conflict"], Optional[ClassData]]:

    fields = data.model_dump(exclude_unset=True, exclude={"expected_updated_at"})

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM classes WHERE id = %s", [class_id])

            current_row = cur.fetchone()

            if current_row is None:
                return "not_found", None

            current = ClassData.model_validate(current_row)

            if not updated_at_matches(current.updated_at, data.expected_updated_at):
                return "conflict", current

            if not fields:
                return "ok", current

            processed = _process(fields)

            set_clause = ", ".join(f"{key} = %s" for key in processed)

            cur.execute(
                f"UPDATE classes SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                [*processed.values(), class_id]
            )

            return "ok", ClassData.model_validate(cur.fetchone())


# RESTRICT desde categories.evaluation_period_id no aplica aqui; el
# ForeignKeyViolation real posible es courses (RESTRICT) al borrar el curso,
# no al borrar la clase — borrar una clase es CASCADE sin más (se lleva
# enrollments/categories/assignments/grades).
def delete_class(class_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM classes WHERE id = %s", [class_id])

            return cur.rowcount > 0
