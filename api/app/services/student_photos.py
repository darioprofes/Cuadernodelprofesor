from services.db import get_conn


def list_photos() -> dict:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT student_id, data_url FROM student_photos")

            rows = cur.fetchall()

            return {row["student_id"]: row["data_url"] for row in rows}


def set_photo(student_id: str, data_url: str):

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO student_photos (student_id, data_url, updated_at)
                VALUES (%s, %s, now())
                ON CONFLICT (student_id) DO UPDATE SET data_url = EXCLUDED.data_url, updated_at = EXCLUDED.updated_at
                """,
                [student_id, data_url]
            )


def delete_photo(student_id: str):

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM student_photos WHERE student_id = %s", [student_id])


def delete_all_photos():

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("DELETE FROM student_photos")
