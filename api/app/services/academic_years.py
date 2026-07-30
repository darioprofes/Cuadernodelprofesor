import uuid
from datetime import date
from typing import Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel

_YEAR_COLUMNS = "id, label, start_date, end_date, is_current, holidays, periods"
_PERIOD_COLUMNS = "id, academic_year_id, name, start_date, end_date, weight"


class AcademicYearInput(ApiModel):
    label: str
    start_date: date
    end_date: date


class AcademicYearPatch(ApiModel):
    label: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    holidays: Optional[list] = None
    periods: Optional[list] = None


class AcademicYear(ApiModel):
    id: uuid.UUID
    label: str
    start_date: date
    end_date: date
    is_current: bool
    holidays: list = []
    periods: list = []


class EvaluationPeriodInput(ApiModel):
    name: str
    start_date: date
    end_date: date
    weight: float = 1


class EvaluationPeriod(EvaluationPeriodInput):
    id: uuid.UUID
    academic_year_id: uuid.UUID


def list_academic_years() -> list[AcademicYear]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_YEAR_COLUMNS} FROM academic_years ORDER BY start_date DESC")

            return [AcademicYear.model_validate(row) for row in cur.fetchall()]


def get_academic_year(year_id: str) -> Optional[AcademicYear]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_YEAR_COLUMNS} FROM academic_years WHERE id = %s", [year_id])

            row = cur.fetchone()

            return AcademicYear.model_validate(row) if row else None


def create_academic_year(data: AcademicYearInput) -> AcademicYear:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO academic_years (label, start_date, end_date)
                VALUES (%s, %s, %s) RETURNING {_YEAR_COLUMNS}
                """,
                [data.label, data.start_date, data.end_date]
            )

            return AcademicYear.model_validate(cur.fetchone())


def update_academic_year(year_id: str, data: AcademicYearPatch) -> Optional[AcademicYear]:

    fields = data.model_dump(exclude_unset=True)

    processed = {k: (Json(v) if k in ("holidays", "periods") else v) for k, v in fields.items()}

    with get_conn() as conn:

        with conn.cursor() as cur:

            if processed:

                set_clause = ", ".join(f"{key} = %s" for key in processed)

                cur.execute(
                    f"UPDATE academic_years SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_YEAR_COLUMNS}",
                    [*processed.values(), year_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_YEAR_COLUMNS} FROM academic_years WHERE id = %s", [year_id])

                row = cur.fetchone()

            return AcademicYear.model_validate(row) if row else None


# Desactiva cualquier otro curso marcado como actual y activa este, en la
# misma transacción — el índice único parcial (academic_years_one_current)
# es la garantía de fondo, esto es solo lo que hace falta en aplicación para
# que la operación sea "el actual pasa a ser este", no "añade uno más".
def activate_academic_year(year_id: str) -> Optional[AcademicYear]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT id FROM academic_years WHERE id = %s", [year_id])

            if cur.fetchone() is None:
                return None

            cur.execute("UPDATE academic_years SET is_current = false, updated_at = now() WHERE is_current = true AND id != %s", [year_id])

            cur.execute(f"UPDATE academic_years SET is_current = true, updated_at = now() WHERE id = %s RETURNING {_YEAR_COLUMNS}", [year_id])

            return AcademicYear.model_validate(cur.fetchone())


# CASCADE completo (clases, matrículas, notas...) — deliberadamente
# destructivo, ver fase-0-ddl-y-api.md. El frontend debe exigir doble
# confirmación antes de llamar a esto.
def delete_academic_year(year_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM academic_years WHERE id = %s", [year_id])

            return cur.rowcount > 0


def list_evaluation_periods(year_id: str) -> list[EvaluationPeriod]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_PERIOD_COLUMNS} FROM evaluation_periods WHERE academic_year_id = %s ORDER BY start_date", [year_id])

            return [EvaluationPeriod.model_validate(row) for row in cur.fetchall()]


def create_evaluation_period(year_id: str, data: EvaluationPeriodInput) -> EvaluationPeriod:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO evaluation_periods (academic_year_id, name, start_date, end_date, weight)
                VALUES (%s, %s, %s, %s, %s) RETURNING {_PERIOD_COLUMNS}
                """,
                [year_id, data.name, data.start_date, data.end_date, data.weight]
            )

            return EvaluationPeriod.model_validate(cur.fetchone())


def delete_evaluation_period(period_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM evaluation_periods WHERE id = %s", [period_id])

            return cur.rowcount > 0
