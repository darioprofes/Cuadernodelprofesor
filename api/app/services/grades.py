import uuid
from datetime import datetime
from typing import Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "enrollment_id, assignment_id, direct_score, recovery_score, tool_results, updated_at"


class GradeInput(ApiModel):
    direct_score: Optional[float] = None
    recovery_score: Optional[float] = None
    tool_results: Optional[dict] = None


class Grade(GradeInput):
    enrollment_id: uuid.UUID
    assignment_id: uuid.UUID
    updated_at: datetime


# Lectura en bloque para cargar el cuaderno de una clase entera: notas de
# todas las tareas evaluables de esa clase, para todas sus matrículas — se
# hace con un JOIN a assignments (no hay columna class_id directa en grades,
# a propósito: una nota siempre se llega a través de su tarea).
def list_grades_for_class(class_id: str) -> list[Grade]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                SELECT g.{_COLUMNS.replace(', ', ', g.')}
                FROM grades g
                JOIN assignments a ON a.id = g.assignment_id
                WHERE a.class_id = %s
                """,
                [class_id]
            )

            return [Grade.model_validate(row) for row in cur.fetchall()]


# Sin expectedUpdatedAt / control de versión, a propósito (ver plan
# principal, sección GRADE) — última escritura gana. Upsert simple sobre la
# PK compuesta (enrollment_id, assignment_id).
def put_grade(assignment_id: str, enrollment_id: str, data: GradeInput) -> Grade:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO grades (enrollment_id, assignment_id, direct_score, recovery_score, tool_results, updated_at)
                VALUES (%s, %s, %s, %s, %s, now())
                ON CONFLICT (enrollment_id, assignment_id) DO UPDATE SET
                    direct_score = EXCLUDED.direct_score,
                    recovery_score = EXCLUDED.recovery_score,
                    tool_results = EXCLUDED.tool_results,
                    updated_at = EXCLUDED.updated_at
                RETURNING {_COLUMNS}
                """,
                [
                    enrollment_id, assignment_id, data.direct_score, data.recovery_score,
                    Json(data.tool_results) if data.tool_results is not None else None,
                ]
            )

            return Grade.model_validate(cur.fetchone())


def delete_grade(assignment_id: str, enrollment_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "DELETE FROM grades WHERE assignment_id = %s AND enrollment_id = %s",
                [assignment_id, enrollment_id]
            )

            return cur.rowcount > 0
