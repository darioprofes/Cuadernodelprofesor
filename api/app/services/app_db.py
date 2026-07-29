from services.db import get_conn

# Cabecera mágica de todo fichero SQLite: rechazar cualquier PUT que no
# empiece así evita aceptar un body corrupto/vacío/a medias y guardarlo
# como si fuera la base de datos real.
SQLITE_MAGIC = b"SQLite format 3\x00"

HISTORY_LIMIT = 20


class VersionConflict(Exception):
    """El PUT llegó con una versión distinta a la que hay guardada ahora mismo."""

    def __init__(self, current_version: int):
        super().__init__(f"Versión actual: {current_version}")
        self.current_version = current_version


class InvalidBlob(Exception):
    """El body del PUT no parece un fichero SQLite válido."""


def get_blob():

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT blob, version FROM app_db WHERE id = true")

            row = cur.fetchone()

            if row is None:
                return None, None

            return bytes(row["blob"]), row["version"]


def set_blob(blob: bytes, expected_version: int | None) -> int:
    """Guarda el blob si expected_version coincide con la versión actual (o si
    todavía no existe ninguna fila). Archiva la versión saliente en
    app_db_history antes de sobrescribir. Devuelve la nueva versión.
    Lanza VersionConflict si expected_version no coincide, InvalidBlob si el
    contenido no parece SQLite.
    """

    if not blob.startswith(SQLITE_MAGIC):
        raise InvalidBlob("El contenido recibido no es un fichero SQLite válido.")

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT blob, version FROM app_db WHERE id = true")
            row = cur.fetchone()

            if row is None:
                cur.execute(
                    "INSERT INTO app_db (id, blob, version, updated_at) VALUES (true, %s, 1, now())",
                    [blob]
                )
                return 1

            current_version = row["version"]

            if expected_version is not None and expected_version != current_version:
                raise VersionConflict(current_version)

            new_version = current_version + 1

            cur.execute(
                "INSERT INTO app_db_history (blob, version) VALUES (%s, %s)",
                [bytes(row["blob"]), current_version]
            )

            cur.execute(
                """
                INSERT INTO app_db (id, blob, version, updated_at)
                VALUES (true, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET blob = EXCLUDED.blob, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
                """,
                [blob, new_version]
            )

            cur.execute(
                """
                DELETE FROM app_db_history
                WHERE id NOT IN (SELECT id FROM app_db_history ORDER BY id DESC LIMIT %s)
                """,
                [HISTORY_LIMIT]
            )

            return new_version
