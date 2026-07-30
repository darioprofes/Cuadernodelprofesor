import uuid
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, course_id, code, description"


class BasicKnowledgeInput(ApiModel):
    code: str
    description: str


class BasicKnowledgePatch(ApiModel):
    code: Optional[str] = None
    description: Optional[str] = None


class BasicKnowledge(BasicKnowledgeInput):
    id: uuid.UUID
    course_id: uuid.UUID


def list_basic_knowledge(course_id: str) -> list[BasicKnowledge]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM basic_knowledge WHERE course_id = %s ORDER BY code", [course_id])

            return [BasicKnowledge.model_validate(row) for row in cur.fetchall()]


def create_basic_knowledge(course_id: str, data: BasicKnowledgeInput) -> BasicKnowledge:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO basic_knowledge (course_id, code, description) VALUES (%s, %s, %s) RETURNING {_COLUMNS}",
                [course_id, data.code, data.description]
            )

            return BasicKnowledge.model_validate(cur.fetchone())


def update_basic_knowledge(item_id: str, data: BasicKnowledgePatch) -> Optional[BasicKnowledge]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE basic_knowledge SET {set_clause} WHERE id = %s RETURNING {_COLUMNS}",
                    [*fields.values(), item_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM basic_knowledge WHERE id = %s", [item_id])

                row = cur.fetchone()

            return BasicKnowledge.model_validate(row) if row else None


def delete_basic_knowledge(item_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM basic_knowledge WHERE id = %s", [item_id])

            return cur.rowcount > 0
