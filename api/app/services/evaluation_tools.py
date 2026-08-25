import uuid
from typing import Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, type, name, course_id, levels, items"


class EvaluationToolInput(ApiModel):
    type: str
    name: str
    course_id: Optional[uuid.UUID] = None
    levels: list = []
    items: list = []


class EvaluationToolPatch(ApiModel):
    type: Optional[str] = None
    name: Optional[str] = None
    course_id: Optional[uuid.UUID] = None
    levels: Optional[list] = None
    items: Optional[list] = None


class EvaluationTool(EvaluationToolInput):
    id: uuid.UUID


def list_evaluation_tools() -> list[EvaluationTool]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM evaluation_tools ORDER BY name")

            return [EvaluationTool.model_validate(row) for row in cur.fetchall()]


def create_evaluation_tool(data: EvaluationToolInput) -> EvaluationTool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO evaluation_tools (type, name, course_id, levels, items) VALUES (%s, %s, %s, %s, %s) RETURNING {_COLUMNS}",
                [data.type, data.name, data.course_id, Json(data.levels), Json(data.items)]
            )

            return EvaluationTool.model_validate(cur.fetchone())


def update_evaluation_tool(tool_id: str, data: EvaluationToolPatch) -> Optional[EvaluationTool]:

    fields = data.model_dump(exclude_unset=True)

    processed = {k: (Json(v) if k in ("levels", "items") else v) for k, v in fields.items()}

    with get_conn() as conn:

        with conn.cursor() as cur:

            if processed:

                set_clause = ", ".join(f"{key} = %s" for key in processed)

                cur.execute(
                    f"UPDATE evaluation_tools SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                    [*processed.values(), tool_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM evaluation_tools WHERE id = %s", [tool_id])

                row = cur.fetchone()

            return EvaluationTool.model_validate(row) if row else None


def delete_evaluation_tool(tool_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM evaluation_tools WHERE id = %s", [tool_id])

            return cur.rowcount > 0
