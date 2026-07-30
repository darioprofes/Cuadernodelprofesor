import uuid
from datetime import date
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, academic_year_id, texto, hecho, fecha_inicio, fecha_fin"


class TaskInput(ApiModel):
    texto: str
    hecho: bool = False
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None


class TaskPatch(ApiModel):
    texto: Optional[str] = None
    hecho: Optional[bool] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None


class Task(TaskInput):
    id: uuid.UUID
    academic_year_id: uuid.UUID


def list_tasks(year_id: str) -> list[Task]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM tasks WHERE academic_year_id = %s ORDER BY fecha_fin NULLS LAST", [year_id])

            return [Task.model_validate(row) for row in cur.fetchall()]


def create_task(year_id: str, data: TaskInput) -> Task:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO tasks (academic_year_id, texto, hecho, fecha_inicio, fecha_fin)
                VALUES (%s, %s, %s, %s, %s) RETURNING {_COLUMNS}
                """,
                [year_id, data.texto, data.hecho, data.fecha_inicio, data.fecha_fin]
            )

            return Task.model_validate(cur.fetchone())


def update_task(task_id: str, data: TaskPatch) -> Optional[Task]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(f"UPDATE tasks SET {set_clause} WHERE id = %s RETURNING {_COLUMNS}", [*fields.values(), task_id])

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM tasks WHERE id = %s", [task_id])

                row = cur.fetchone()

            return Task.model_validate(row) if row else None


def delete_task(task_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM tasks WHERE id = %s", [task_id])

            return cur.rowcount > 0
