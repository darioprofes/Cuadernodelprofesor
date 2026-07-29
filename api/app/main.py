# ==========================================================
# Importaciones
# ==========================================================

from fastapi import FastAPI

from routers.health import router as health_router
from routers.db import router as db_router
from routers.horario import router as horario_router
from routers.photos import router as photos_router

from services.db import apply_schema

# ==========================================================
# Aplicación FastAPI
# ==========================================================
#
# Backend deliberadamente mínimo: el frontend (fork de CuadernMestre) lleva
# toda la lógica de dominio (clases, alumnado, calificaciones, currículo...)
# serializada en un único blob SQLite. Aquí solo se guarda/lee ese blob tal
# cual, y se ofrece un endpoint para parsear el PDF oficial de horario.
#

app = FastAPI(
    title="Profe Planner API",
    description="Backend mínimo: persistencia del blob de CuadernMestre + import de horario en PDF",
    version="0.2.0"
)


# ==========================================================
# Arranque: aplicar el esquema de la base de datos
# ==========================================================
#
# CREATE TABLE IF NOT EXISTS, así que es seguro ejecutarlo en cada arranque
# del contenedor sin perder datos existentes.
#

@app.on_event("startup")
def _startup_apply_schema():

    apply_schema()


# ==========================================================
# Routers
# ==========================================================

app.include_router(health_router)
app.include_router(db_router)
app.include_router(horario_router)
app.include_router(photos_router)
