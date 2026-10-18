import os
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv("DATABASE_URL", "")

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
_history_pruned_on = None

def history_cutoff(today: date | None = None) -> str:
    today = today or datetime.now(ZoneInfo('Europe/Madrid')).date()
    return f'{today.year if today.month >= 9 else today.year - 1}-09-01T00:00:00+02:00'

def prune_expired_history(conn, today: date | None = None) -> int:
    # Preserve an entire batch if any part belongs to the retained course.
    return conn.execute('''DELETE FROM change_history h WHERE h.created_at < %s::timestamptz
        AND NOT EXISTS (SELECT 1 FROM change_history newer WHERE newer.batch_id=h.batch_id
                        AND newer.created_at >= %s::timestamptz)''', [history_cutoff(today)] * 2).rowcount

_MIGRATION_FILENAME_RE = re.compile(r"^(\d+)_.*\.sql$")


@contextmanager
def get_conn():
    global _history_pruned_on

    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)

    try:

        today = datetime.now(ZoneInfo('Europe/Madrid')).date()
        pruned = False
        if _history_pruned_on != today and conn.execute("SELECT to_regclass('public.change_history') AS name").fetchone()['name']:
            prune_expired_history(conn, today)
            pruned = True

        yield conn

        conn.commit()
        if pruned:
            _history_pruned_on = today

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
