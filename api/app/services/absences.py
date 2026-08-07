import uuid
from datetime import date, datetime
from typing import Optional

from services.db import get_conn
from services.schemas import ApiModel

_COLUMNS = "id, enrollment_id, date, period_index, tipo_falta, educastur_falta_id, synced_at, sync_error, updated_at"


class AbsenceInput(ApiModel):
    date: date
    period_index: int
    tipo_falta: str  # 'R' | 'J' | 'I'


class Absence(ApiModel):
    id: uuid.UUID
    enrollment_id: uuid.UUID
    date: date
    period_index: int
    tipo_falta: str
    educastur_falta_id: Optional[int] = None
    synced_at: Optional[datetime] = None
    sync_error: Optional[str] = None
    updated_at: datetime


# Lectura en bloque para pintar la pestaña "Asistencia" de una clase entera:
# mismo criterio que list_grades_for_class (JOIN a enrollments, sin columna
# class_id directa en absences a propósito).
def list_absences_for_class(class_id: str) -> list[Absence]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                SELECT a.{_COLUMNS.replace(', ', ', a.')}
                FROM absences a
                JOIN enrollments e ON e.id = a.enrollment_id
                WHERE e.class_id = %s
                """,
                [class_id]
            )

            return [Absence.model_validate(row) for row in cur.fetchall()]


# Upsert por (enrollment_id, date, period_index) — clic izquierdo/derecho en
# la UI siempre manda la fila completa; si ya existía una falta en esa
# franja se sustituye (editar el tipo no crea una segunda fila). Al cambiar
# de tipo se limpia el estado de sincronización previo: es un dato nuevo que
# todavía no se ha llevado a Educastur con este valor.
def put_absence(enrollment_id: str, data: AbsenceInput) -> Absence:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO absences (enrollment_id, date, period_index, tipo_falta, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (enrollment_id, date, period_index) DO UPDATE SET
                    tipo_falta = EXCLUDED.tipo_falta,
                    synced_at = NULL,
                    sync_error = NULL,
                    updated_at = EXCLUDED.updated_at
                RETURNING {_COLUMNS}
                """,
                [enrollment_id, data.date, data.period_index, data.tipo_falta]
            )

            return Absence.model_validate(cur.fetchone())


def delete_absence(enrollment_id: str, absence_date: str, period_index: int) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "DELETE FROM absences WHERE enrollment_id = %s AND date = %s AND period_index = %s",
                [enrollment_id, absence_date, period_index]
            )

            return cur.rowcount > 0
