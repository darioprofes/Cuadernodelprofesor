import uuid
from datetime import date
from typing import Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = """
    id, course_id, name, sessions, start_date, context, session_details,
    linked_criteria_ids, linked_basic_knowledge_ids, linked_specific_competence_ids,
    final_product, final_exam, created_at, updated_at
"""

_JSON_FIELDS = {"session_details", "final_product", "final_exam"}


class ProgrammingUnitInput(ApiModel):
    name: str
    sessions: int = 0
    start_date: Optional[date] = None
    context: Optional[str] = None
    session_details: list = []
    linked_criteria_ids: list[uuid.UUID] = []
    linked_basic_knowledge_ids: list[uuid.UUID] = []
    linked_specific_competence_ids: list[uuid.UUID] = []
    final_product: dict = {"incluido": False}
    final_exam: dict = {"incluido": False}


class ProgrammingUnitPatch(ApiModel):
    name: Optional[str] = None
    sessions: Optional[int] = None
    start_date: Optional[date] = None
    context: Optional[str] = None
    session_details: Optional[list] = None
    linked_criteria_ids: Optional[list[uuid.UUID]] = None
    linked_basic_knowledge_ids: Optional[list[uuid.UUID]] = None
    linked_specific_competence_ids: Optional[list[uuid.UUID]] = None
    final_product: Optional[dict] = None
    final_exam: Optional[dict] = None


class ProgrammingUnit(ProgrammingUnitInput):
    id: uuid.UUID
    course_id: uuid.UUID


def list_programming_units(course_id: str) -> list[ProgrammingUnit]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM programming_units WHERE course_id = %s ORDER BY start_date NULLS LAST, name", [course_id])

            return [ProgrammingUnit.model_validate(row) for row in cur.fetchall()]


def create_programming_unit(course_id: str, data: ProgrammingUnitInput) -> ProgrammingUnit:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO programming_units
                    (course_id, name, sessions, start_date, context, session_details,
                     linked_criteria_ids, linked_basic_knowledge_ids, linked_specific_competence_ids,
                     final_product, final_exam)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {_COLUMNS}
                """,
                [
                    course_id, data.name, data.sessions, data.start_date, data.context, Json(data.session_details),
                    [str(i) for i in data.linked_criteria_ids], [str(i) for i in data.linked_basic_knowledge_ids],
                    [str(i) for i in data.linked_specific_competence_ids],
                    Json(data.final_product), Json(data.final_exam),
                ]
            )

            return ProgrammingUnit.model_validate(cur.fetchone())


def update_programming_unit(unit_id: str, data: ProgrammingUnitPatch) -> Optional[ProgrammingUnit]:

    fields = data.model_dump(exclude_unset=True)

    processed = {}

    for key, value in fields.items():

        if key in _JSON_FIELDS:
            processed[key] = Json(value)
        elif key in ("linked_criteria_ids", "linked_basic_knowledge_ids", "linked_specific_competence_ids"):
            processed[key] = [str(i) for i in value]
        else:
            processed[key] = value

    with get_conn() as conn:

        with conn.cursor() as cur:

            if processed:

                set_clause = ", ".join(f"{key} = %s" for key in processed)

                cur.execute(
                    f"UPDATE programming_units SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                    [*processed.values(), unit_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM programming_units WHERE id = %s", [unit_id])

                row = cur.fetchone()

            return ProgrammingUnit.model_validate(row) if row else None


def delete_programming_unit(unit_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM programming_units WHERE id = %s", [unit_id])

            return cur.rowcount > 0
