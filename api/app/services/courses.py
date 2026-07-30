import uuid
from datetime import datetime
from typing import Literal, Optional

from services.db import get_conn
from services.schemas import ApiModel, updated_at_matches

_COLUMNS = "id, level, subject, type, peso_criterios_manual, created_at, updated_at"


class CourseInput(ApiModel):
    level: str
    subject: str
    type: str = "academic"
    peso_criterios_manual: bool = False


class CoursePatch(ApiModel):
    level: Optional[str] = None
    subject: Optional[str] = None
    type: Optional[str] = None
    peso_criterios_manual: Optional[bool] = None
    expected_updated_at: Optional[str] = None


class Course(CourseInput):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


def list_courses() -> list[Course]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM courses ORDER BY level, subject")

            return [Course.model_validate(row) for row in cur.fetchall()]


def get_course(course_id: str) -> Optional[Course]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM courses WHERE id = %s", [course_id])

            row = cur.fetchone()

            return Course.model_validate(row) if row else None


def create_course(data: CourseInput) -> Course:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO courses (level, subject, type, peso_criterios_manual)
                VALUES (%s, %s, %s, %s) RETURNING {_COLUMNS}
                """,
                [data.level, data.subject, data.type, data.peso_criterios_manual]
            )

            return Course.model_validate(cur.fetchone())


def update_course(course_id: str, data: CoursePatch) -> tuple[Literal["ok", "not_found", "conflict"], Optional[Course]]:

    fields = data.model_dump(exclude_unset=True, exclude={"expected_updated_at"})

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM courses WHERE id = %s", [course_id])

            current_row = cur.fetchone()

            if current_row is None:
                return "not_found", None

            current = Course.model_validate(current_row)

            if not updated_at_matches(current.updated_at, data.expected_updated_at):
                return "conflict", current

            if not fields:
                return "ok", current

            set_clause = ", ".join(f"{key} = %s" for key in fields)

            cur.execute(
                f"UPDATE courses SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                [*fields.values(), course_id]
            )

            return "ok", Course.model_validate(cur.fetchone())


# El RESTRICT de classes.course_id (llega en la Fase 3) hace que Postgres
# levante ForeignKeyViolation si el curso tiene clases — el router la
# traduce a 409.
def delete_course(course_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM courses WHERE id = %s", [course_id])

            return cur.rowcount > 0
