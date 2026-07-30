import uuid
from datetime import date, time
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, academic_year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento"


class MeetingInput(ApiModel):
    fecha: date
    hora: Optional[time] = None
    tipo: str
    con_quien: Optional[str] = None
    motivo: Optional[str] = None
    acuerdos: Optional[str] = None
    seguimiento: Optional[str] = None


class MeetingPatch(ApiModel):
    fecha: Optional[date] = None
    hora: Optional[time] = None
    tipo: Optional[str] = None
    con_quien: Optional[str] = None
    motivo: Optional[str] = None
    acuerdos: Optional[str] = None
    seguimiento: Optional[str] = None


class Meeting(MeetingInput):
    id: uuid.UUID
    academic_year_id: uuid.UUID


def list_meetings(year_id: str) -> list[Meeting]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM meetings WHERE academic_year_id = %s ORDER BY fecha, hora", [year_id])

            return [Meeting.model_validate(row) for row in cur.fetchall()]


def create_meeting(year_id: str, data: MeetingInput) -> Meeting:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO meetings (academic_year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {_COLUMNS}
                """,
                [year_id, data.fecha, data.hora, data.tipo, data.con_quien, data.motivo, data.acuerdos, data.seguimiento]
            )

            return Meeting.model_validate(cur.fetchone())


def update_meeting(meeting_id: str, data: MeetingPatch) -> Optional[Meeting]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(f"UPDATE meetings SET {set_clause} WHERE id = %s RETURNING {_COLUMNS}", [*fields.values(), meeting_id])

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_COLUMNS} FROM meetings WHERE id = %s", [meeting_id])

                row = cur.fetchone()

            return Meeting.model_validate(row) if row else None


def delete_meeting(meeting_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM meetings WHERE id = %s", [meeting_id])

            return cur.rowcount > 0
