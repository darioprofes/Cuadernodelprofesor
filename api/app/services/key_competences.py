import uuid
from typing import Literal, Optional

from services.db import get_conn
from services.schemas import ApiModel

_KC_COLUMNS = "id, code, description"
_DESC_COLUMNS = "id, key_competence_id, code, description, stage"


class OperationalDescriptorInput(ApiModel):
    code: str
    description: str
    # None = descriptor genérico, sin variante por etapa (equivalente al
    # "generic" del sistema anterior, que mostraba el mismo descriptor en
    # ESO y Bachillerato sin distinción).
    stage: Optional[Literal["eso", "bachillerato"]] = None


class OperationalDescriptorPatch(ApiModel):
    code: Optional[str] = None
    description: Optional[str] = None
    stage: Optional[Literal["eso", "bachillerato"]] = None


class OperationalDescriptor(OperationalDescriptorInput):
    id: uuid.UUID
    key_competence_id: uuid.UUID


class KeyCompetenceInput(ApiModel):
    code: str
    description: str


class KeyCompetencePatch(ApiModel):
    code: Optional[str] = None
    description: Optional[str] = None


# Se devuelve siempre con sus descriptores anidados (contrato: GET
# /key-competences -> KeyCompetence[] "con descriptors anidados").
class KeyCompetence(KeyCompetenceInput):
    id: uuid.UUID
    descriptors: list[OperationalDescriptor] = []


def _fetch_descriptors(cur, key_competence_id: str) -> list[OperationalDescriptor]:

    cur.execute(f"SELECT {_DESC_COLUMNS} FROM operational_descriptors WHERE key_competence_id = %s ORDER BY code", [key_competence_id])

    return [OperationalDescriptor.model_validate(row) for row in cur.fetchall()]


def list_key_competences() -> list[KeyCompetence]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_KC_COLUMNS} FROM key_competences ORDER BY code")

            rows = cur.fetchall()

            result = []

            for row in rows:
                kc = KeyCompetence.model_validate(row)
                kc.descriptors = _fetch_descriptors(cur, str(kc.id))
                result.append(kc)

            return result


def get_key_competence(key_competence_id: str) -> Optional[KeyCompetence]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(f"SELECT {_KC_COLUMNS} FROM key_competences WHERE id = %s", [key_competence_id])

            row = cur.fetchone()

            if row is None:
                return None

            kc = KeyCompetence.model_validate(row)

            kc.descriptors = _fetch_descriptors(cur, key_competence_id)

            return kc


def create_key_competence(data: KeyCompetenceInput) -> KeyCompetence:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"INSERT INTO key_competences (code, description) VALUES (%s, %s) RETURNING {_KC_COLUMNS}",
                [data.code, data.description]
            )

            return KeyCompetence.model_validate(cur.fetchone())


def update_key_competence(key_competence_id: str, data: KeyCompetencePatch) -> Optional[KeyCompetence]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE key_competences SET {set_clause}, updated_at = now() WHERE id = %s RETURNING {_KC_COLUMNS}",
                    [*fields.values(), key_competence_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_KC_COLUMNS} FROM key_competences WHERE id = %s", [key_competence_id])

                row = cur.fetchone()

            if row is None:
                return None

            kc = KeyCompetence.model_validate(row)

            kc.descriptors = _fetch_descriptors(cur, key_competence_id)

            return kc


def delete_key_competence(key_competence_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM key_competences WHERE id = %s", [key_competence_id])

            return cur.rowcount > 0


def create_descriptor(key_competence_id: str, data: OperationalDescriptorInput) -> OperationalDescriptor:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                f"""
                INSERT INTO operational_descriptors (key_competence_id, code, description, stage)
                VALUES (%s, %s, %s, %s) RETURNING {_DESC_COLUMNS}
                """,
                [key_competence_id, data.code, data.description, data.stage]
            )

            return OperationalDescriptor.model_validate(cur.fetchone())


def update_descriptor(descriptor_id: str, data: OperationalDescriptorPatch) -> Optional[OperationalDescriptor]:

    fields = data.model_dump(exclude_unset=True)

    with get_conn() as conn:

        with conn.cursor() as cur:

            if fields:

                set_clause = ", ".join(f"{key} = %s" for key in fields)

                cur.execute(
                    f"UPDATE operational_descriptors SET {set_clause} WHERE id = %s RETURNING {_DESC_COLUMNS}",
                    [*fields.values(), descriptor_id]
                )

                row = cur.fetchone()

            else:

                cur.execute(f"SELECT {_DESC_COLUMNS} FROM operational_descriptors WHERE id = %s", [descriptor_id])

                row = cur.fetchone()

            return OperationalDescriptor.model_validate(row) if row else None


def delete_descriptor(descriptor_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM operational_descriptors WHERE id = %s", [descriptor_id])

            return cur.rowcount > 0
