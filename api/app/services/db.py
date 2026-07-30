import os
import re

from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv("DATABASE_URL", "")

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

_MIGRATION_FILENAME_RE = re.compile(r"^(\d+)_.*\.sql$")


@contextmanager
def get_conn():

    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)

    try:

        yield conn

        conn.commit()

    except Exception:

        conn.rollback()

        raise

    finally:

        conn.close()


# Sustituye al antiguo apply_schema() (que re-ejecutaba schema.sql entero en
# cada arranque, solo con CREATE TABLE IF NOT EXISTS / ALTER ADD COLUMN IF
# NOT EXISTS como mecanismo de "migración"). Ahora cada cambio de esquema es
# un fichero numerado en migrations/, aplicado como mucho una vez, en orden,
# dentro de su propia transacción — mismo espíritu que services/migrations.ts
# en el frontend (versionado, forward-only, nunca se edita una migración ya
# publicada), aplicado aquí por primera vez también al backend.
def apply_migrations():

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    filename TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )

            cur.execute("SELECT version FROM schema_migrations")

            applied = {row["version"] for row in cur.fetchall()}

    pending = []

    for path in MIGRATIONS_DIR.glob("*.sql"):

        match = _MIGRATION_FILENAME_RE.match(path.name)

        if not match:
            continue

        version = int(match.group(1))

        if version not in applied:
            pending.append((version, path))

    pending.sort(key=lambda item: item[0])

    for version, path in pending:

        sql = path.read_text(encoding="utf-8")

        # DDL + registro en schema_migrations en la misma transacción: si la
        # migración falla a medias, tampoco queda marcada como aplicada.
        with get_conn() as conn:

            with conn.cursor() as cur:

                cur.execute(sql)

                cur.execute(
                    "INSERT INTO schema_migrations (version, filename) VALUES (%s, %s)",
                    (version, path.name),
                )
