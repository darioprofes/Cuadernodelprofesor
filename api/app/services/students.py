import uuid
from datetime import date, datetime
from typing import Literal, Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel, updated_at_matches

_COLUMNS = """
    id, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, dni,
    nie, nacionalidad, imported_academic_year_id, ultimo_curso_sauce, ultima_unidad_sauce,
    telefono_urgencias, tutor1, tutor2, domicilio_direccion, domicilio_localidad,
    domicilio_codigo_postal, domicilio_telefono, alergias, enfermedades_relevantes,
    medicacion_habitual, intolerancias_alimentarias, observaciones_sanitarias,
    autorizacion_imagen, autorizacion_salidas, foto_content_type, created_at, updated_at
"""

# Columnas JSONB de esta tabla: necesitan Json(...) al escribir, psycopg no
# las adapta solas desde un dict/None de Pydantic.
_JSON_FIELDS = {"tutor1", "tutor2"}


class Tutor(ApiModel):
    nombre: Optional[str] = None
    relacion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None


class StudentInput(ApiModel):
    nombre: Optional[str] = None
    primer_apellido: Optional[str] = None
    segundo_apellido: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    dni: Optional[str] = None
    # NIE = Número de Identificación Escolar (SAUCE) — no el NIE de
    # extranjería, que vive en `dni` (ver comentario de la migración 0010).
    nie: Optional[str] = None
    nacionalidad: Optional[str] = None
    # Rastro de la última importación de SAUCE (ver migración 0011) — no
    # matricula por sí solo, solo alimenta el filtro por defecto/rápido de
    # ExistingStudentPicker.tsx.
    imported_academic_year_id: Optional[uuid.UUID] = None
    # Nivel/grupo de referencia del alumno (p.ej. "1 ESO" / "A"),
    # independiente de en qué clase-materia esté matriculado -- para
    # materias con alumnado mezclado de varios grupos (optativas), donde el
    # grupo de la CLASE no coincide con el real de cada alumno. La
    # importación de SAUCE (ImportSauceStudentsModal.tsx) los rellena/
    # actualiza automáticamente en cada reimportación (SAUCE manda cuando
    # hay dato real), pero también son editables a mano en la ficha para
    # quien nunca pasó por SAUCE -- ver ExistingStudentPicker.tsx, que los
    # usa como filtro.
    ultimo_curso_sauce: Optional[str] = None
    ultima_unidad_sauce: Optional[str] = None
    telefono_urgencias: Optional[str] = None
    tutor1: Optional[Tutor] = None
    tutor2: Optional[Tutor] = None
    domicilio_direccion: Optional[str] = None
    domicilio_localidad: Optional[str] = None
    domicilio_codigo_postal: Optional[str] = None
    domicilio_telefono: Optional[str] = None
    alergias: Optional[str] = None
    enfermedades_relevantes: Optional[str] = None
    medicacion_habitual: Optional[str] = None
    intolerancias_alimentarias: Optional[str] = None
    observaciones_sanitarias: Optional[str] = None
    autorizacion_imagen: Optional[bool] = None
    autorizacion_salidas: Optional[bool] = None


class StudentPatch(StudentInput):
    expected_updated_at: Optional[str] = None


class Student(StudentInput):
    id: uuid.UUID
    # Los bytes de la foto no viajan aquí (ver routers/photos.py) — solo si
    # hay una, para que el frontend decida si pintar <img src="/api/photos/
    # {id}"> o el icono genérico, sin tener que pedir la foto para saberlo.
    foto_content_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime


def list_students() -> list[Student]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM students ORDER BY primer_apellido, segundo_apellido, nombre")

            return [Student.model_validate(row) for row in cur.fetchall()]


def get_student(student_id: str) -> Optional[Student]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM students WHERE id = %s", [student_id])

            row = cur.fetchone()

            return Student.model_validate(row) if row else None


def create_student(data: StudentInput) -> Student:

    fields = data.model_dump()

    columns = list(fields.keys())

    values = [Json(v) if k in _JSON_FIELDS and v is not None else v for k, v in fields.items()]

    placeholders = ", ".join(["%s"] * len(columns))

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO students ({', '.join(columns)}) VALUES ({placeholders}) RETURNING {_COLUMNS}",
                values
            )

            return Student.model_validate(cur.fetchone())


# Devuelve ("ok", Student) | ("not_found", None) | ("conflict", Student con
# el estado actual del servidor) — el router decide el código HTTP a partir
# de esto, el servicio no conoce FastAPI.
def update_student(student_id: str, data: StudentPatch) -> tuple[Literal["ok", "not_found", "conflict"], Optional[Student]]:

    fields = data.model_dump(exclude_unset=True, exclude={"expected_updated_at"})

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM students WHERE id = %s", [student_id])

            current_row = cur.fetchone()

            if current_row is None:
                return "not_found", None

            current = Student.model_validate(current_row)

            if not updated_at_matches(current.updated_at, data.expected_updated_at):
                return "conflict", current

            if not fields:
                return "ok", current

            set_clause = ", ".join(f"{key} = %s" for key in fields)

            values = [Json(v) if k in _JSON_FIELDS and v is not None else v for k, v in fields.items()]

            cur.execute(
                f"UPDATE students SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                [*values, student_id]
            )

            return "ok", Student.model_validate(cur.fetchone())


# True si se borró, False si no existía. El RESTRICT de enrollments.student_id
# (llega en la Fase 3) hace que Postgres levante ForeignKeyViolation si la
# persona tiene matrículas — el router la traduce a 409, este servicio no
# la atrapa (para no esconder el error real).
def delete_student(student_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM students WHERE id = %s", [student_id])

            return cur.rowcount > 0
