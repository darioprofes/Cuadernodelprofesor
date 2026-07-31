import uuid
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel

_YEAR_COLUMNS = "id, label, start_date, end_date, is_current, holidays, periods"
_PERIOD_COLUMNS = "id, academic_year_id, name, start_date, end_date, weight"
_YEAR_COURSE_COLUMNS = "id, academic_year_id, course_id, created_at"


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


class EvaluationPeriodPatch(ApiModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    weight: Optional[float] = None


class EvaluationPeriod(EvaluationPeriodInput):
    id: uuid.UUID
    academic_year_id: uuid.UUID


# Declaración pura "imparto esta materia este curso académico" — ver Fase 8
# del plan (memoized-frolicking-shannon.md) para el porqué: courses no tiene
# academic_year_id (currículo reutilizable entre años, decisión de Fase -1),
# así que sin esta tabla no habría forma de listar "las materias de este
# año" antes de que existiera ya algún grupo (classes) para ellas.
class AcademicYearCourseInput(ApiModel):
    course_id: uuid.UUID


class AcademicYearCourse(ApiModel):
    id: uuid.UUID
    academic_year_id: uuid.UUID
    course_id: uuid.UUID
    created_at: datetime


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


# Los 3 periodos de evaluación por defecto (1ª/2ª/3ª) que antes sembraba
# INITIAL_ACADEMIC_CONFIGURATION (constants.ts) solo una vez, la primera
# vez que arrancaba la app con la base vacía — con el modelo nuevo, crear
# un curso académico es una acción explícita y repetible, así que el
# sembrado va aquí para que se repita en cada curso nuevo, no una sola vez.
def _default_evaluation_periods(start_date: date, end_date: date) -> list[tuple[str, date, date]]:

    total_days = (end_date - start_date).days

    third = total_days // 3

    p1_end = start_date + timedelta(days=third)
    p2_end = start_date + timedelta(days=2 * third)

    return [
        ("1ª Evaluación", start_date, p1_end),
        ("2ª Evaluación", p1_end + timedelta(days=1), p2_end),
        ("3ª Evaluación", p2_end + timedelta(days=1), end_date),
    ]


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

            year = AcademicYear.model_validate(cur.fetchone())

            for name, period_start, period_end in _default_evaluation_periods(data.start_date, data.end_date):
                cur.execute(
                    """
                    INSERT INTO evaluation_periods (academic_year_id, name, start_date, end_date, weight)
                    VALUES (%s, %s, %s, %s, 1)
                    """,
                    [year.id, name, period_start, period_end]
                )

            return year


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

            # Borrar classes explícitamente ANTES que academic_years: si no,
            # la cascada directa academic_years→evaluation_periods intenta
            # borrar periodos que categories/assignments todavía referencian
            # (RESTRICT) mientras la cascada indirecta academic_years→
            # classes→categories/assignments no ha llegado aún a limpiarlos
            # — Postgres no reordena dos caminos de cascada que convergen en
            # la misma fila, así que revienta con RestrictViolation (probado
            # con datos reales). Borrando classes primero, su propia cascada
            # (categories/assignments/grades/enrollments vía class_id) deja
            # evaluation_periods libre antes de que academic_years lo toque.
            cur.execute("DELETE FROM classes WHERE academic_year_id = %s", [year_id])

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


def update_evaluation_period(period_id: str, data: EvaluationPeriodPatch) -> Optional[EvaluationPeriod]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE evaluation_periods SET {set_clause} WHERE id = %s RETURNING {_PERIOD_COLUMNS}",
                    [*fields.values(), period_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_PERIOD_COLUMNS} FROM evaluation_periods WHERE id = %s", [period_id])

                row = cur.fetchone()

            return EvaluationPeriod.model_validate(row) if row else None


def delete_evaluation_period(period_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM evaluation_periods WHERE id = %s", [period_id])

            return cur.rowcount > 0


def list_academic_year_courses(year_id: str) -> list[AcademicYearCourse]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_YEAR_COURSE_COLUMNS} FROM academic_year_courses WHERE academic_year_id = %s", [year_id])

            return [AcademicYearCourse.model_validate(row) for row in cur.fetchall()]


def create_academic_year_course(year_id: str, data: AcademicYearCourseInput) -> AcademicYearCourse:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO academic_year_courses (academic_year_id, course_id)
                VALUES (%s, %s) RETURNING {_YEAR_COURSE_COLUMNS}
                """,
                [year_id, str(data.course_id)]
            )

            return AcademicYearCourse.model_validate(cur.fetchone())


# No hay FK compuesta que impida borrar el enlace mientras existan classes
# de esa (year, course) — es una relación declarativa, no la que de verdad
# sujeta a classes (que referencia academic_years/courses directamente). El
# bloqueo se hace aquí, a nivel de aplicación, con el mismo criterio
# protector que el resto del esquema: no dejar "grupos huérfanos" de la
# declaración "imparto esta materia este año".
def delete_academic_year_course(year_id: str, course_id: str) -> Literal["ok", "not_found", "blocked"]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "SELECT 1 FROM classes WHERE academic_year_id = %s AND course_id = %s LIMIT 1",
                [year_id, course_id]
            )

            if cur.fetchone() is not None:
                return "blocked"

            cur.execute(
                "DELETE FROM academic_year_courses WHERE academic_year_id = %s AND course_id = %s",
                [year_id, course_id]
            )

            return "ok" if cur.rowcount > 0 else "not_found"
