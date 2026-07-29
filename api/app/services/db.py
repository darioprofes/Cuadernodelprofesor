import os

from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv("DATABASE_URL", "")

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema.sql"


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


def apply_schema():

    sql = SCHEMA_FILE.read_text(encoding="utf-8")

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(sql)
