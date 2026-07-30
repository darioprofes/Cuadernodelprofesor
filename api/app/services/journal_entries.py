import uuid
from datetime import date
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, academic_year_id, class_id, date, period_index, notes"


class JournalEntryInput(ApiModel):
    class_id: uuid.UUID
    date: date
    period_index: int
    notes: Optional[str] = None


class JournalEntryPatch(ApiModel):
    notes: Optional[str] = None


class JournalEntry(ApiModel):
    id: uuid.UUID
    academic_year_id: uuid.UUID
    class_id: uuid.UUID
    date: date
    period_index: int
    notes: Optional[str] = None


def list_journal_entries(year_id: str) -> list[JournalEntry]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM journal_entries WHERE academic_year_id = %s ORDER BY date, period_index", [year_id])

            return [JournalEntry.model_validate(row) for row in cur.fetchall()]


# Upsert por (class_id, date, period_index) — mismo UNIQUE que la tabla, así
# que guardar una anotación en una franja que ya tenía una la actualiza en
# vez de duplicarla (igual que hoy en el frontend, un slot = una anotación).
def create_journal_entry(year_id: str, data: JournalEntryInput) -> JournalEntry:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO journal_entries (academic_year_id, class_id, date, period_index, notes)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (class_id, date, period_index) DO UPDATE SET notes = EXCLUDED.notes
                RETURNING {_COLUMNS}
                """,
                [year_id, str(data.class_id), data.date, data.period_index, data.notes]
            )

            return JournalEntry.model_validate(cur.fetchone())


def update_journal_entry(entry_id: str, data: JournalEntryPatch) -> Optional[JournalEntry]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"UPDATE journal_entries SET notes = %s WHERE id = %s RETURNING {_COLUMNS}", [data.notes, entry_id])

            row = cur.fetchone()

            return JournalEntry.model_validate(row) if row else None


def delete_journal_entry(entry_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM journal_entries WHERE id = %s", [entry_id])

            return cur.rowcount > 0
