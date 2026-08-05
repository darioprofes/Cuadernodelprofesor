# ==========================================================
# Importaciones
# ==========================================================

from fastapi import FastAPI

from routers.health import router as health_router
from routers.horario import router as horario_router
from routers.photos import router as photos_router
from routers.preferences import router as preferences_router
from routers.shortcuts import router as shortcuts_router
from routers.students import router as students_router
from routers.courses import router as courses_router
from routers.key_competences import router as key_competences_router
from routers.competences import router as competences_router, courses_router as competences_courses_router
from routers.criteria import router as criteria_router, courses_router as criteria_courses_router
from routers.basic_knowledge import router as basic_knowledge_router, courses_router as basic_knowledge_courses_router
from routers.programming_units import router as programming_units_router, courses_router as programming_units_courses_router
from routers.evaluation_tools import router as evaluation_tools_router
from routers.academic_years import router as academic_years_router
from routers.classes import router as classes_router, years_router as classes_years_router
from routers.enrollments import router as enrollments_router, classes_router as enrollments_classes_router
from routers.categories import router as categories_router, classes_router as categories_classes_router
from routers.assignments import router as assignments_router, classes_router as assignments_classes_router
from routers.grades import router as grades_router, classes_router as grades_classes_router
from routers.journal_entries import router as journal_entries_router, item_router as journal_entries_item_router
from routers.tasks import router as tasks_router, item_router as tasks_item_router
from routers.meetings import router as meetings_router, item_router as meetings_item_router
from routers.agenda_notes import router as agenda_notes_router, item_router as agenda_notes_item_router
from routers.backup import router as backup_router

from services.db import apply_migrations

# ==========================================================
# Aplicación FastAPI
# ==========================================================
#
# Backend relacional real sobre Postgres (Fase 6 completa la migración desde
# el blob SQLite único que tenía al principio — ver api/app/migrations/ para
# el historial). Escritorio (Tauri) es la única parte que sigue con un
# fichero SQLite local propio, sin pasar por aquí, hasta la Fase 7.
#

app = FastAPI(
    title="Profe Planner API",
    description="Backend relacional (clases, alumnado, calificaciones, currículo, horario...) + import de horario en PDF",
    version="0.3.0"
)


# ==========================================================
# Arranque: aplicar las migraciones pendientes
# ==========================================================
#
# Cada migración se aplica como mucho una vez (ver services/db.py y
# schema_migrations), así que es seguro ejecutarlo en cada arranque del
# contenedor sin perder datos existentes ni reaplicar nada dos veces.
#

@app.on_event("startup")
def _startup_apply_migrations():

    apply_migrations()


# ==========================================================
# Routers
# ==========================================================

app.include_router(health_router)
app.include_router(horario_router)
app.include_router(photos_router)
app.include_router(preferences_router)
app.include_router(shortcuts_router)
app.include_router(students_router)
app.include_router(courses_router)
app.include_router(key_competences_router)
app.include_router(competences_router)
app.include_router(competences_courses_router)
app.include_router(criteria_router)
app.include_router(criteria_courses_router)
app.include_router(basic_knowledge_router)
app.include_router(basic_knowledge_courses_router)
app.include_router(programming_units_router)
app.include_router(programming_units_courses_router)
app.include_router(evaluation_tools_router)
app.include_router(academic_years_router)
app.include_router(classes_router)
app.include_router(classes_years_router)
app.include_router(enrollments_router)
app.include_router(enrollments_classes_router)
app.include_router(categories_router)
app.include_router(categories_classes_router)
app.include_router(assignments_router)
app.include_router(assignments_classes_router)
app.include_router(grades_router)
app.include_router(grades_classes_router)
app.include_router(journal_entries_router)
app.include_router(journal_entries_item_router)
app.include_router(tasks_router)
app.include_router(tasks_item_router)
app.include_router(meetings_router)
app.include_router(meetings_item_router)
app.include_router(agenda_notes_router)
app.include_router(agenda_notes_item_router)
app.include_router(backup_router)
