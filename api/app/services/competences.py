import uuid
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, course_id, code, description"


class SpecificCompetenceInput(ApiModel):
    code: str
    description: str


class SpecificCompetencePatch(ApiModel):
    code: Optional[str] = None
    description: Optional[str] = None


class SpecificCompetence(SpecificCompetenceInput):
    id: uuid.UUID
    course_id: uuid.UUID
    key_competence_descriptor_ids: list[uuid.UUID] = []


def _fetch_descriptor_ids(cur, specific_competence_id: str) -> list[uuid.UUID]:

    cur.execute(
        "SELECT descriptor_id FROM specific_competence_descriptors WHERE specific_competence_id = %s",
        [specific_competence_id]
    )

    return [row["descriptor_id"] for row in cur.fetchall()]


def list_competences(course_id: str) -> list[SpecificCompetence]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM specific_competences WHERE course_id = %s ORDER BY code", [course_id])

            rows = cur.fetchall()

            result = []

            for row in rows:
                sc = SpecificCompetence.model_validate(row)
                sc.key_competence_descriptor_ids = _fetch_descriptor_ids(cur, str(sc.id))
                result.append(sc)

            return result


def get_competence(competence_id: str) -> Optional[SpecificCompetence]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM specific_competences WHERE id = %s", [competence_id])

            row = cur.fetchone()

            if row is None:
                return None

            sc = SpecificCompetence.model_validate(row)

            sc.key_competence_descriptor_ids = _fetch_descriptor_ids(cur, competence_id)

            return sc


def create_competence(course_id: str, data: SpecificCompetenceInput) -> SpecificCompetence:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO specific_competences (course_id, code, description) VALUES (%s, %s, %s) RETURNING {_COLUMNS}",
                [course_id, data.code, data.description]
            )

            return SpecificCompetence.model_validate(cur.fetchone())


def update_competence(competence_id: str, data: SpecificCompetencePatch) -> Optional[SpecificCompetence]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE specific_competences SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                    [*fields.values(), competence_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM specific_competences WHERE id = %s", [competence_id])

                row = cur.fetchone()

            if row is None:
                return None

            sc = SpecificCompetence.model_validate(row)

            sc.key_competence_descriptor_ids = _fetch_descriptor_ids(cur, competence_id)

            return sc


# RESTRICT desde evaluation_criteria.competence_id — el router traduce a 409.
def delete_competence(competence_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM specific_competences WHERE id = %s", [competence_id])

            return cur.rowcount > 0


def link_descriptor(competence_id: str, descriptor_id: str):

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO specific_competence_descriptors (specific_competence_id, descriptor_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
                """,
                [competence_id, descriptor_id]
            )


def unlink_descriptor(competence_id: str, descriptor_id: str):

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "DELETE FROM specific_competence_descriptors WHERE specific_competence_id = %s AND descriptor_id = %s",
                [competence_id, descriptor_id]
            )
