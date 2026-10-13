import uuid
import math
# date importado con alias: un campo Pydantic llamado igual que su propio
# tipo ("date: Optional[date]") hace que, al resolver la anotación, el
# nombre de la propia clase se autoeclipse y pydantic la trata como
# NoneType (repro mínima confirmada) — con alias no hay colisión de nombre.
from datetime import date as date_type, datetime
from typing import Literal, Optional

from psycopg.types.json import Json
from fastapi import HTTPException

from services.db import get_conn
from services.schemas import ApiModel, updated_at_matches

_COLUMNS = """
    id, class_id, category_id, evaluation_period_id, evaluation_tool_id,
    programming_unit_id, name, short_name, date, evaluation_method, linked_criteria,
    recovers_assignment_ids, peso_en_categoria, importancia,
    importancia_personalizada, puntuacion_maxima, question_round_description, assignment_group, column_order, created_at, updated_at
"""

_JSON_FIELDS = {"linked_criteria"}
_UUID_FIELDS = {"category_id", "evaluation_period_id", "evaluation_tool_id", "programming_unit_id"}
_UUID_ARRAY_FIELDS = {"recovers_assignment_ids"}


class LinkedCriterion(ApiModel):
    criterion_id: uuid.UUID
    ratio: float
    selected_descriptor_ids: list[uuid.UUID] = []


class AssignmentGroup(ApiModel):
    memberIds: list[uuid.UUID] = []
    color: Literal["blue", "violet", "emerald", "amber"] = "violet"
    memberWeights: dict[str, float] = {}


class AssignmentInput(ApiModel):
    join_group_id: Optional[uuid.UUID] = None
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
    question_round_description: Optional[str] = None
    assignment_group: Optional[AssignmentGroup] = None
    column_order: Optional[float] = None


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
    question_round_description: Optional[str] = None
    assignment_group: Optional[AssignmentGroup] = None
    column_order: Optional[float] = None
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
    question_round_description: Optional[str] = None
    assignment_group: Optional[AssignmentGroup] = None
    column_order: Optional[float] = None
    created_at: datetime
    updated_at: datetime


def _process(fields: dict) -> dict:

    processed = {}

    for key, value in fields.items():

        if key == "assignment_group":
            processed[key] = Json(value) if value is not None else None
        elif key in _JSON_FIELDS:
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


def _detach_member(cur, class_id, member_id):
    cur.execute("SELECT id, assignment_group FROM assignments WHERE class_id = %s AND assignment_group IS NOT NULL", [class_id])
    for row in cur.fetchall():
        config = row["assignment_group"]
        if str(member_id) in config.get("memberIds", []):
            config = {**config, "memberIds": [i for i in config["memberIds"] if i != str(member_id)],
                      "memberWeights": {key: weight for key, weight in config.get("memberWeights", {}).items() if key != str(member_id)}}
            cur.execute("UPDATE assignments SET assignment_group = %s, updated_at = now() WHERE id = %s", [Json(config), row["id"]])


def _validate_group(cur, class_id, assignment_id, fields):
    # Todas las modificaciones de pertenencia de una clase se serializan.
    cur.execute("SELECT id FROM classes WHERE id = %s FOR UPDATE", [class_id])
    config = fields.get("assignment_group")
    if config is None:
        return
    ids = [str(i) for i in config.get("memberIds", [])]
    weights = config.get("memberWeights", {})
    if any(key not in ids or not math.isfinite(weight) or weight <= 0 for key, weight in weights.items()):
        raise HTTPException(400, "Los pesos internos deben ser positivos y corresponder a tareas del grupo.")
    if len(ids) != len(set(ids)) or str(assignment_id) in ids:
        raise HTTPException(400, "Una tarea no puede repetirse ni incluirse a sí misma.")
    cur.execute("SELECT type, evaluation_period_id FROM categories WHERE id = %s AND class_id = %s", [fields["category_id"], class_id])
    category = cur.fetchone()
    if not category or category["type"] == "recovery" or str(category["evaluation_period_id"]) != str(fields["evaluation_period_id"]):
        raise HTTPException(400, "Un grupo debe pertenecer a una categoría normal de la clase.")
    cur.execute("SELECT a.id, a.class_id, a.evaluation_period_id, a.assignment_group, c.type FROM assignments a JOIN categories c ON c.id = a.category_id WHERE a.class_id = %s", [class_id])
    rows = cur.fetchall()
    by_id = {str(row["id"]): row for row in rows}
    for member_id in ids:
        row = by_id.get(member_id)
        if not row or str(row["evaluation_period_id"]) != str(fields["evaluation_period_id"]):
            raise HTTPException(400, "Las tareas del grupo deben pertenecer a esta clase y evaluación.")
        if row["assignment_group"] is not None:
            raise HTTPException(400, "No se pueden incluir grupos dentro de otros grupos.")
        if row["type"] == "recovery":
            raise HTTPException(400, "Las recuperaciones no se pueden incluir en un grupo.")
    for row in rows:
        other = row["assignment_group"]
        if str(row["id"]) == str(assignment_id) or other is None:
            continue
        if str(assignment_id) in other.get("memberIds", []) or set(ids).intersection(other.get("memberIds", [])):
            raise HTTPException(400, "Cada tarea solo puede pertenecer a un grupo. Retírala del anterior primero.")
    if assignment_id:
        cur.execute("SELECT 1 FROM grades WHERE assignment_id = %s LIMIT 1", [assignment_id])
        if cur.fetchone():
            raise HTTPException(400, "Una tarea con notas no puede convertirse en grupo; crea un grupo e inclúyela.")


def _move_members(cur, fields, apply_weights=True):
    config = fields.get("assignment_group")
    if config and config.get("memberIds"):
        for member_id in config["memberIds"]:
            weight = config.get("memberWeights", {}).get(member_id) if apply_weights else None
            cur.execute("UPDATE assignments SET category_id = %s, importancia_personalizada = COALESCE(%s, importancia_personalizada), updated_at = now() WHERE id = %s",
                        [str(fields["category_id"]), weight, member_id])


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
    raw_fields = data.model_dump(mode="json", exclude={"join_group_id"})
    fields = _process(raw_fields)

    with get_conn() as conn:

        with conn.cursor() as cur:

            _validate_group(cur, class_id, None, raw_fields)
            columns = ["class_id", *fields.keys()]

            values = [class_id, *fields.values()]

            placeholders = ", ".join(["%s"] * len(columns))

            cur.execute(
                f"INSERT INTO assignments ({', '.join(columns)}) VALUES ({placeholders}) RETURNING {_COLUMNS}",
                values
            )

            result = Assignment.model_validate(cur.fetchone())
            _move_members(cur, raw_fields)
            if data.join_group_id is not None:
                cur.execute("SELECT assignment_group, class_id, category_id, evaluation_period_id FROM assignments WHERE id = %s", [str(data.join_group_id)])
                parent = cur.fetchone()
                if (not parent or parent["assignment_group"] is None or data.assignment_group is not None or
                    str(parent["class_id"]) != class_id or parent["category_id"] != data.category_id or parent["evaluation_period_id"] != data.evaluation_period_id):
                    raise HTTPException(400, "El grupo debe pertenecer a la misma clase, categoría y evaluación.")
                config = {**parent["assignment_group"], "memberIds": [*parent["assignment_group"]["memberIds"], str(result.id)]}
                cur.execute("UPDATE assignments SET assignment_group = %s, updated_at = now() WHERE id = %s", [Json(config), str(data.join_group_id)])
            return result


def update_assignment(assignment_id: str, data: AssignmentPatch) -> tuple[Literal["ok", "not_found", "conflict"], Optional[Assignment]]:

    fields = data.model_dump(exclude_unset=True, exclude={"expected_updated_at"}, mode="json")

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT c.id FROM classes c JOIN assignments a ON a.class_id = c.id WHERE a.id = %s FOR UPDATE OF c", [assignment_id])
            cur.execute(f"SELECT {_COLUMNS} FROM assignments WHERE id = %s", [assignment_id])

            current_row = cur.fetchone()

            if current_row is None:
                return "not_found", None

            current = Assignment.model_validate(current_row)

            if not updated_at_matches(current.updated_at, data.expected_updated_at):
                return "conflict", current

            if not fields:
                return "ok", current

            merged = {**current.model_dump(mode="json"), **fields}
            _validate_group(cur, current.class_id, assignment_id, merged)
            if ("category_id" in fields or "evaluation_period_id" in fields) and current.assignment_group is None:
                if merged["category_id"] != str(current.category_id) or merged["evaluation_period_id"] != str(current.evaluation_period_id):
                    _detach_member(cur, current.class_id, assignment_id)

            processed = _process(fields)

            set_clause = ", ".join(f"{key} = %s" for key in processed)

            cur.execute(
                f"UPDATE assignments SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_COLUMNS}",
                [*processed.values(), assignment_id]
            )

            result = Assignment.model_validate(cur.fetchone())
            _move_members(cur, merged, "assignment_group" in fields)
            return "ok", result


def delete_assignment(assignment_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT class_id FROM assignments WHERE id = %s", [assignment_id])
            row = cur.fetchone()
            if row:
                cur.execute("SELECT id FROM classes WHERE id = %s FOR UPDATE", [row["class_id"]])
                _detach_member(cur, row["class_id"], assignment_id)
            cur.execute("DELETE FROM assignments WHERE id = %s", [assignment_id])

            return cur.rowcount > 0


def reorder_assignments(class_id: str, ids: list[str]) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM classes WHERE id = %s FOR UPDATE", [class_id])
            cur.execute(f"SELECT {_COLUMNS} FROM assignments WHERE class_id = %s", [class_id])
            rows = cur.fetchall()
            by_id = {str(row["id"]): row for row in rows}
            if not ids or len(ids) != len(set(ids)) or any(i not in by_id for i in ids):
                raise HTTPException(400, "Orden de columnas inválido.")
            owners = {member: str(row["id"]) for row in rows if row["assignment_group"] is not None for member in row["assignment_group"].get("memberIds", [])}
            first = by_id[ids[0]]
            owner = owners.get(ids[0])
            siblings = {str(row["id"]) for row in rows if row["category_id"] == first["category_id"] and row["evaluation_period_id"] == first["evaluation_period_id"] and owners.get(str(row["id"])) == owner}
            if set(ids) != siblings:
                raise HTTPException(400, "Solo se pueden ordenar columnas de la misma categoría o del mismo grupo.")
            for order, assignment_id in enumerate(ids):
                cur.execute("UPDATE assignments SET column_order = %s, updated_at = now() WHERE id = %s", [order, assignment_id])
