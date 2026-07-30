import uuid
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, label, url, icon, sort_order"


class ShortcutInput(ApiModel):
    label: str
    url: str
    icon: Optional[str] = None
    sort_order: int = 0


class ShortcutPatch(ApiModel):
    label: Optional[str] = None
    url: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None


class Shortcut(ShortcutInput):
    id: uuid.UUID


def list_shortcuts() -> list[Shortcut]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM shortcuts ORDER BY sort_order, label")

            return [Shortcut.model_validate(row) for row in cur.fetchall()]


def create_shortcut(data: ShortcutInput) -> Shortcut:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO shortcuts (label, url, icon, sort_order) VALUES (%s, %s, %s, %s) RETURNING {_COLUMNS}",
                [data.label, data.url, data.icon, data.sort_order]
            )

            return Shortcut.model_validate(cur.fetchone())


def update_shortcut(shortcut_id: str, data: ShortcutPatch) -> Optional[Shortcut]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE shortcuts SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                    [*fields.values(), shortcut_id]
                )

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM shortcuts WHERE id = %s", [shortcut_id])

            row = cur.fetchone()

            return Shortcut.model_validate(row) if row else None


def delete_shortcut(shortcut_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM shortcuts WHERE id = %s", [shortcut_id])

            return cur.rowcount > 0
