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


class Preferences(PreferencesInput):
    grade_scale: list = []
    teacher_profile: list = []


# Singleton (id = true, ver DDL) — igual que app_db en el sistema viejo. Se
# trata como "siempre hay una fila lógica" aunque todavía no se haya escrito
# ninguna: GET devuelve valores por defecto, PUT crea la fila si hace falta.
def get_preferences() -> Preferences:

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute("SELECT layout_mode, default_calendar_view, grade_scale, teacher_profile FROM app_preferences WHERE id = true")

            row = cur.fetchone()

            return Preferences.model_validate(row) if row else Preferences()


def update_preferences(data: PreferencesInput) -> Preferences:

    current = get_preferences()

    merged = current.model_copy(update=data.model_dump(exclude_unset=True))

    with get_conn() as conn:

        with conn.cursor() as cur:

            cur.execute(
                """
                INSERT INTO app_preferences (id, layout_mode, default_calendar_view, grade_scale, teacher_profile, updated_at)
                VALUES (true, %s, %s, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                    layout_mode = EXCLUDED.layout_mode,
                    default_calendar_view = EXCLUDED.default_calendar_view,
                    grade_scale = EXCLUDED.grade_scale,
                    teacher_profile = EXCLUDED.teacher_profile,
                    updated_at = EXCLUDED.updated_at
                """,
                [merged.layout_mode, merged.default_calendar_view, Json(merged.grade_scale), Json(merged.teacher_profile)]
            )

    return merged
