from typing import Optional

from psycopg.types.json import Json

from services.db import get_conn
from services.schemas import ApiModel


class PreferencesInput(ApiModel):
    layout_mode: Optional[str] = None
    default_calendar_view: Optional[str] = None
    grade_scale: Optional[list] = None
    # Rasgos de estilo docente (p.ej. "Cercano y motivador", "Prioriza la
    # práctica sobre la teoría"...) -- se inyectan en el prompt de cada SA
    # generada con IA para que escriba coherente con cómo enseña este
    # profesor, no con un "eres un profesor" genérico.
    teacher_profile: Optional[list] = None
    # Notas libres complementarias a teacher_profile -- preferencias sobre
    # el material en sí (formato, extensión, tono...) que no encajan como
    # una etiqueta corta. Se inyectan también en el prompt.
    teacher_notes: Optional[str] = None
    # Datos personales del profesor (nombre para mostrar en la app; la foto
    # va aparte, mismo patrón BYTEA que students.foto -- ver services/
    # photos.py -- con su propio endpoint binario en vez de viajar aquí).
    teacher_name: Optional[str] = None


class Preferences(PreferencesInput):
    grade_scale: list = []
    teacher_profile: list = []
    teacher_notes: str = ''
    teacher_name: str = ''
    # Solo lectura (no en PreferencesInput): evita que el frontend tenga que
    # intentar cargar /preferences/photo a ciegas y detectar el 404 -- sabe
    # de antemano si hay algo que pedir.
    teacher_has_photo: bool = False


# Singleton (id = true, ver DDL) — igual que app_db en el sistema viejo. Se
# trata como "siempre hay una fila lógica" aunque todavía no se haya escrito
# ninguna: GET devuelve valores por defecto, PUT crea la fila si hace falta.
def get_preferences() -> Preferences:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                "SELECT layout_mode, default_calendar_view, grade_scale, teacher_profile, teacher_notes, teacher_name, "
                "(teacher_photo IS NOT NULL) AS teacher_has_photo FROM app_preferences WHERE id = true"
            )

            row = cur.fetchone()

            return Preferences.model_validate(row) if row else Preferences()


def update_preferences(data: PreferencesInput) -> Preferences:

    current = get_preferences()

    merged = current.model_copy(update=data.model_dump(exclude_unset=True))

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO app_preferences (id, layout_mode, default_calendar_view, grade_scale, teacher_profile, teacher_notes, teacher_name, updated_at)
                VALUES (true, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                    layout_mode = EXCLUDED.layout_mode,
                    default_calendar_view = EXCLUDED.default_calendar_view,
                    grade_scale = EXCLUDED.grade_scale,
                    teacher_profile = EXCLUDED.teacher_profile,
                    teacher_notes = EXCLUDED.teacher_notes,
                    teacher_name = EXCLUDED.teacher_name,
                    updated_at = EXCLUDED.updated_at
                """,
                [merged.layout_mode, merged.default_calendar_view, Json(merged.grade_scale), Json(merged.teacher_profile), merged.teacher_notes, merged.teacher_name]
            )

    return merged


# Foto del profesor, mismo patrón BYTEA que students.foto (services/
# photos.py) pero sobre la fila singleton de app_preferences en vez de por
# id -- upsert en set/delete porque, a diferencia de students, la fila de
# preferencias puede no existir todavía la primera vez que se sube una foto.
def get_teacher_photo() -> Optional[tuple[bytes, str]]:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT teacher_photo, teacher_photo_content_type FROM app_preferences WHERE id = true")

            row = cur.fetchone()

            if row is None or row["teacher_photo"] is None:
                return None

            return bytes(row["teacher_photo"]), row["teacher_photo_content_type"]


def set_teacher_photo(data: bytes, content_type: str) -> None:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO app_preferences (id, teacher_photo, teacher_photo_content_type, updated_at)
                VALUES (true, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                    teacher_photo = EXCLUDED.teacher_photo,
                    teacher_photo_content_type = EXCLUDED.teacher_photo_content_type,
                    updated_at = EXCLUDED.updated_at
                """,
                [data, content_type]
            )


def delete_teacher_photo() -> None:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO app_preferences (id, teacher_photo, teacher_photo_content_type, updated_at)
                VALUES (true, NULL, NULL, now())
                ON CONFLICT (id) DO UPDATE SET
                    teacher_photo = NULL,
                    teacher_photo_content_type = NULL,
                    updated_at = now()
                """
            )
