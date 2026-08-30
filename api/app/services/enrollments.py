import uuid
from datetime import datetime
from typing import Literal, Optional

from services.db import get_conn
from services.schemas import ApiModel, updated_at_matches
from services.students import StudentInput, create_student

_COLUMNS = """
    id, student_id, class_id, acneae, centro_procedencia, ha_repetido_curso,
    materias_pendientes, programa_especifico, neae, neae_detalle,
    medidas_educativas, indicaciones_pti, observaciones_tutor, plano_x,
    plano_y, plano_color, created_at, updated_at
"""


class EnrollmentInput(ApiModel):
    student_id: Optional[uuid.UUID] = None
    new_student: Optional[StudentInput] = None
    acneae: list[str] = []
    centro_procedencia: Optional[str] = None
    ha_repetido_curso: Optional[bool] = None
    materias_pendientes: Optional[str] = None
    programa_especifico: Optional[str] = None
    neae: Optional[bool] = None
    neae_detalle: Optional[str] = None
    medidas_educativas: Optional[str] = None
    indicaciones_pti: Optional[str] = None
    observaciones_tutor: Optional[str] = None
    plano_x: Optional[float] = None
    plano_y: Optional[float] = None
    plano_color: Optional[str] = None


class EnrollmentPatch(ApiModel):
    acneae: Optional[list[str]] = None
    centro_procedencia: Optional[str] = None
    ha_repetido_curso: Optional[bool] = None
    materias_pendientes: Optional[str] = None
    programa_especifico: Optional[str] = None
    neae: Optional[bool] = None
    neae_detalle: Optional[str] = None
    medidas_educativas: Optional[str] = None
    indicaciones_pti: Optional[str] = None
    observaciones_tutor: Optional[str] = None
    plano_x: Optional[float] = None
    plano_y: Optional[float] = None
    plano_color: Optional[str] = None
    expected_updated_at: Optional[str] = None


class Enrollment(ApiModel):
    id: uuid.UUID
    student_id: uuid.UUID
    class_id: uuid.UUID
    acneae: list[str] = []
    centro_procedencia: Optional[str] = None
    ha_repetido_curso: Optional[bool] = None
    materias_pendientes: Optional[str] = None
    programa_especifico: Optional[str] = None
    neae: Optional[bool] = None
    neae_detalle: Optional[str] = None
    medidas_educativas: Optional[str] = None
    indicaciones_pti: Optional[str] = None
    observaciones_tutor: Optional[str] = None
    plano_x: Optional[float] = None
    plano_y: Optional[float] = None
    plano_color: Optional[str] = None
    created_at: datetime
    updated_at: datetime


def list_enrollments(class_id: str) -> list[Enrollment]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM enrollments WHERE class_id = %s ORDER BY created_at", [class_id])

            return [Enrollment.model_validate(row) for row in cur.fetchall()]


# Acepta studentId (matricula a una persona ya existente) o newStudent (da
# de alta la persona y la matrícula en un solo paso) — nunca ambos ni
# ninguno, el router valida esa exclusividad antes de llamar aquí.
def create_enrollment(class_id: str, data: EnrollmentInput) -> Enrollment:

    student_id = data.student_id

    if student_id is None and data.new_student is not None:
        student_id = create_student(data.new_student).id

    fields = data.model_dump(exclude={"student_id", "new_student"})

    with get_conn() as conn:

        with conn.cursor() as cur:

            columns = ["student_id", "class_id", *fields.keys()]

            values = [str(student_id), class_id, *fields.values()]

            placeholders = ", ".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO enrollments ({', '.join(columns)}) VALUES ({placeholders}) RETURNING {_COLUMNS}",
                values
            )

            return Enrollment.model_validate(cur.fetchone())


def update_enrollment(enrollment_id: str, data: EnrollmentPatch) -> tuple[Literal["ok", "not_found", "conflict"], Optional[Enrollment]]:

    fields = data.model_dump(exclude_unset=True, exclude={"expected_updated_at"})

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM enrollments WHERE id = %s", [enrollment_id])

            current_row = cur.fetchone()

            if current_row is None:
                return "not_found", None

            current = Enrollment.model_validate(current_row)

            if not updated_at_matches(current.updated_at, data.expected_updated_at):
                return "conflict", current

            if not fields:
                return "ok", current

            set_clause = ", ".join(f"{key} = %s" for key in fields)

            cur.execute(
                f"UPDATE enrollments SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                [*fields.values(), enrollment_id]
            )

            return "ok", Enrollment.model_validate(cur.fetchone())


def delete_enrollment(enrollment_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM enrollments WHERE id = %s", [enrollment_id])

            return cur.rowcount > 0
