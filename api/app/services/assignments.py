import uuid
# date importado con alias: un campo Pydantic llamado igual que su propio
# tipo ("date: Optional[date]") hace que, al resolver la anotación, el
# nombre de la propia clase se autoeclipse y pydantic la trata como
# NoneType (repro mínima confirmada) — con alias no hay colisión de nombre.
from datetime import date as date_type, datetime
from typing import Literal, Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel, updated_at_matches

_COLUMNS = """
    id, class_id, category_id, evaluation_period_id, evaluation_tool_id,
    programming_unit_id, name, short_name, date, evaluation_method, linked_criteria,
    recovers_assignment_ids, peso_en_categoria, importancia,
    importancia_personalizada, puntuacion_maxima, created_at, updated_at
"""

_JSON_FIELDS = {"linked_criteria"}
_UUID_FIELDS = {"category_id", "evaluation_period_id", "evaluation_tool_id", "programming_unit_id"}
_UUID_ARRAY_FIELDS = {"recovers_assignment_ids"}


class LinkedCriterion(ApiModel):
    criterion_id: uuid.UUID
    ratio: float
    selected_descriptor_ids: list[uuid.UUID] = []


class AssignmentInput(ApiModel):
    category_id: uuid.UUID
    evaluation_period_id: uuid.UUID
    evaluation_tool_id: Optional[uuid.UUID] = None
    programming_unit_id: Optional[uuid.UUID] = None
    name: str
    # Alias corto opcional para la columna del cuaderno de notas -- si no
    # se pone, se sigue usando `name` (truncado) como hasta ahora.
    short_name: Optional[str] = None
    date: Optional[date_type] = None
    evaluation_method: str
    linked_criteria: list[LinkedCriterion] = []
    recovers_assignment_ids: list[uuid.UUID] = []
    peso_en_categoria: Optional[float] = None
    importancia: Optional[str] = None
    importancia_personalizada: Optional[float] = None
    # Escala de la nota directa, solo relevante con evaluation_method =
    # "direct_grade" (p.ej. 8 si un examen se puntúa sobre 8 en vez de
    # sobre 10) -- None/ausente = base 10 de toda la vida, sin conversión.
    # El cálculo de medias SIEMPRE usa grades.direct_score en base 10, esto
    # solo afecta a qué valor se muestra al escribir/revisar la nota (ver
    # grades.direct_score_raw).
    puntuacion_maxima: Optional[float] = None


class AssignmentPatch(ApiModel):
    category_id: Optional[uuid.UUID] = None
    evaluation_period_id: Optional[uuid.UUID] = None
    evaluation_tool_id: Optional[uuid.UUID] = None
    programming_unit_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    short_name: Optional[str] = None
    date: Optional[date_type] = None
    evaluation_method: Optional[str] = None
    linked_criteria: Optional[list[LinkedCriterion]] = None
    recovers_assignment_ids: Optional[list[uuid.UUID]] = None
    peso_en_categoria: Optional[float] = None
    importancia: Optional[str] = None
    importancia_personalizada: Optional[float] = None
    puntuacion_maxima: Optional[float] = None
    expected_updated_at: Optional[str] = None


class Assignment(ApiModel):
    id: uuid.UUID
    class_id: uuid.UUID
    category_id: uuid.UUID
    evaluation_period_id: uuid.UUID
    evaluation_tool_id: Optional[uuid.UUID] = None
    programming_unit_id: Optional[uuid.UUID] = None
    name: str
    short_name: Optional[str] = None
    date: Optional[date_type] = None
    evaluation_method: str
    linked_criteria: list[LinkedCriterion] = []
    recovers_assignment_ids: list[uuid.UUID] = []
    peso_en_categoria: Optional[float] = None
    importancia: Optional[str] = None
    importancia_personalizada: Optional[float] = None
    puntuacion_maxima: Optional[float] = None
    created_at: datetime
    updated_at: datetime


def _process(fields: dict) -> dict:

    processed = {}

    for key, value in fields.items():

        if key in _JSON_FIELDS:
            # mode="json" es imprescindible aquí: sin él, model_dump() deja
            # UUID de verdad (criterion_id, selected_descriptor_ids) dentro
            # de los dicts, y el json.dumps estándar que usa Json() no sabe
            # serializar UUID (TypeError, descubierto en la Fase 5 fusionada
            # bloque 6 al probar por primera vez un assignment con
            # linkedCriteria no vacío).
            processed[key] = Json([item.model_dump(by_alias=True, mode="json") if isinstance(item, ApiModel) else item for item in value])
        elif key in _UUID_FIELDS and value is not None:
            processed[key] = str(value)
        elif key in _UUID_ARRAY_FIELDS:
            processed[key] = [str(i) for i in value]
        else:
            processed[key] = value

    return processed


def list_assignments(class_id: str) -> list[Assignment]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM assignments WHERE class_id = %s ORDER BY date NULLS LAST, name", [class_id])

            return [Assignment.model_validate(row) for row in cur.fetchall()]


def get_assignment(assignment_id: str) -> Optional[Assignment]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM assignments WHERE id = %s", [assignment_id])

            row = cur.fetchone()

            return Assignment.model_validate(row) if row else None


def create_assignment(class_id: str, data: AssignmentInput) -> Assignment:

    # mode="json": sin él, model_dump() ya deja los LinkedCriterion de
    # linked_criteria aplanados a dict ANTES de que _process() los vea (por
    # eso el mode="json" de ahí abajo, en el propio dict, no bastaba —
    # nunca llegaba a ejecutarse porque isinstance(item, ApiModel) ya daba
    # falso). Con mode="json" aquí, los UUID anidados salen como string
    # desde el principio.
    fields = _process(data.model_dump(mode="json"))

    with get_conn() as conn:

        with conn.cursor() as cur:

            columns = ["class_id", *fields.keys()]

            values = [class_id, *fields.values()]

            placeholders = ", ".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO assignments ({', '.join(columns)}) VALUES ({placeholders}) RETURNING {_COLUMNS}",
                values
            )

            return Assignment.model_validate(cur.fetchone())


def update_assignment(assignment_id: str, data: AssignmentPatch) -> tuple[Literal["ok", "not_found", "conflict"], Optional[Assignment]]:

    fields = data.model_dump(exclude_unset=True, exclude={"expected_updated_at"}, mode="json")

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_COLUMNS} FROM assignments WHERE id = %s", [assignment_id])

            current_row = cur.fetchone()

            if current_row is None:
                return "not_found", None

            current = Assignment.model_validate(current_row)

            if not updated_at_matches(current.updated_at, data.expected_updated_at):
                return "conflict", current

            if not fields:
                return "ok", current

            processed = _process(fields)

            set_clause = ", ".join(f"{key} = %s" for key in processed)

            cur.execute(
                f"UPDATE assignments SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                [*processed.values(), assignment_id]
            )

            return "ok", Assignment.model_validate(cur.fetchone())


def delete_assignment(assignment_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM assignments WHERE id = %s", [assignment_id])

            return cur.rowcount > 0
