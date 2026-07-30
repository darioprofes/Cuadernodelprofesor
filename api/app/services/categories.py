import uuid
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, class_id, evaluation_period_id, name, weight, type"


class CategoryInput(ApiModel):
    evaluation_period_id: uuid.UUID
    name: str
    weight: float
    type: str = "normal"


class CategoryPatch(ApiModel):
    evaluation_period_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    weight: Optional[float] = None
    type: Optional[str] = None


class Category(ApiModel):
    id: uuid.UUID
    class_id: uuid.UUID
    evaluation_period_id: uuid.UUID
    name: str
    weight: float
    type: str


def list_categories(class_id: str) -> list[Category]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM categories WHERE class_id = %s ORDER BY name", [class_id])

            return [Category.model_validate(row) for row in cur.fetchall()]


def create_category(class_id: str, data: CategoryInput) -> Category:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO categories (class_id, evaluation_period_id, name, weight, type)
                VALUES (%s, %s, %s, %s, %s) RETURNING {_COLUMNS}
                """,
                [class_id, str(data.evaluation_period_id), data.name, data.weight, data.type]
            )

            return Category.model_validate(cur.fetchone())


def update_category(category_id: str, data: CategoryPatch) -> Optional[Category]:

    fields = data.model_dump(exclude_unset=True)

    fields = {k: (str(v) if k == "evaluation_period_id" else v) for k, v in fields.items()}

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE categories SET {set_clause} WHERE id = %s RETURNING {_COLUMNS}",
                    [*fields.values(), category_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM categories WHERE id = %s", [category_id])

                row = cur.fetchone()

            return Category.model_validate(row) if row else None


def delete_category(category_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM categories WHERE id = %s", [category_id])

            return cur.rowcount > 0
