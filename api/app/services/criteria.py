import uuid
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, course_id, competence_id, code, description, weight, exclude_from_weighting"


class EvaluationCriterionInput(ApiModel):
    competence_id: uuid.UUID
    code: str
    description: str
    weight: Optional[float] = None
    exclude_from_weighting: bool = False


class EvaluationCriterionPatch(ApiModel):
    competence_id: Optional[uuid.UUID] = None
    code: Optional[str] = None
    description: Optional[str] = None
    weight: Optional[float] = None
    exclude_from_weighting: Optional[bool] = None


class EvaluationCriterion(ApiModel):
    id: uuid.UUID
    course_id: uuid.UUID
    competence_id: uuid.UUID
    code: str
    description: str
    weight: Optional[float] = None
    exclude_from_weighting: bool = False


def list_criteria(course_id: str) -> list[EvaluationCriterion]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM evaluation_criteria WHERE course_id = %s ORDER BY code", [course_id])

            return [EvaluationCriterion.model_validate(row) for row in cur.fetchall()]


def get_criterion(criterion_id: str) -> Optional[EvaluationCriterion]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM evaluation_criteria WHERE id = %s", [criterion_id])

            row = cur.fetchone()

            return EvaluationCriterion.model_validate(row) if row else None


def create_criterion(course_id: str, data: EvaluationCriterionInput) -> EvaluationCriterion:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO evaluation_criteria (course_id, competence_id, code, description, weight, exclude_from_weighting)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING {_COLUMNS}
                """,
                [course_id, str(data.competence_id), data.code, data.description, data.weight, data.exclude_from_weighting]
            )

            return EvaluationCriterion.model_validate(cur.fetchone())


def update_criterion(criterion_id: str, data: EvaluationCriterionPatch) -> Optional[EvaluationCriterion]:

    fields = data.model_dump(exclude_unset=True)

    fields = {k: (str(v) if k == "competence_id" else v) for k, v in fields.items()}

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE evaluation_criteria SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                    [*fields.values(), criterion_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM evaluation_criteria WHERE id = %s", [criterion_id])

                row = cur.fetchone()

            return EvaluationCriterion.model_validate(row) if row else None


def delete_criterion(criterion_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM evaluation_criteria WHERE id = %s", [criterion_id])

            return cur.rowcount > 0
