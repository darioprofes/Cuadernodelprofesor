import uuid
from datetime import date
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, academic_year_id, fecha, texto"


class AgendaNoteInput(ApiModel):
    fecha: date
    texto: str


class AgendaNotePatch(ApiModel):
    fecha: Optional[date] = None
    texto: Optional[str] = None


class AgendaNote(AgendaNoteInput):
    id: uuid.UUID
    academic_year_id: uuid.UUID


def list_agenda_notes(year_id: str) -> list[AgendaNote]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM agenda_notes WHERE academic_year_id = %s ORDER BY fecha", [year_id])

            return [AgendaNote.model_validate(row) for row in cur.fetchall()]


def create_agenda_note(year_id: str, data: AgendaNoteInput) -> AgendaNote:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO agenda_notes (academic_year_id, fecha, texto) VALUES (%s, %s, %s) RETURNING {_COLUMNS}",
                [year_id, data.fecha, data.texto]
            )

            return AgendaNote.model_validate(cur.fetchone())


def update_agenda_note(note_id: str, data: AgendaNotePatch) -> Optional[AgendaNote]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(f"UPDATE agenda_notes SET {set_clause} WHERE id = %s RETURNING {_COLUMNS}", [*fields.values(), note_id])

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM agenda_notes WHERE id = %s", [note_id])

                row = cur.fetchone()

            return AgendaNote.model_validate(row) if row else None


def delete_agenda_note(note_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM agenda_notes WHERE id = %s", [note_id])

            return cur.rowcount > 0
