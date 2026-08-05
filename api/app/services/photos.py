from typing import Optional

from services.db import get_conn


# Devuelve (bytes, content_type) o None si el alumno no existe o no tiene
# foto. No distingue "no existe el alumno" de "no tiene foto" — el router no
# lo necesita, en ambos casos responde 404.
def get_photo(student_id: str) -> Optional[tuple[bytes, str]]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT foto, foto_content_type FROM students WHERE id = %s", [student_id])

            row = cur.fetchone()

            if row is None or row["foto"] is None:
                return None

            return bytes(row["foto"]), row["foto_content_type"]


# True si el alumno existe (se haya podido guardar la foto o no), False si
# no — el router lo traduce a 404.
def set_photo(student_id: str, data: bytes, content_type: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "UPDATE students SET foto = %s, foto_content_type = %s, updated_at = now() WHERE id = %s",
                [data, content_type, student_id]
            )

            return cur.rowcount > 0


def delete_photo(student_id: str) -> bool:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "UPDATE students SET foto = NULL, foto_content_type = NULL, updated_at = now() WHERE id = %s",
                [student_id]
            )

            return cur.rowcount > 0
