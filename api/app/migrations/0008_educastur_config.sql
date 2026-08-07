-- ==========================================================
-- Configuración de la integración con Educastur (Fase "Asistencia")
-- ==========================================================
--
-- Solo IDs de referencia (empleado/centro/perfil) y el nombre del
-- profesor para no tener que volver a resolverlos en cada
-- sincronización — nunca un token ni ninguna credencial. Ver
-- integracion-educastur-faltas.md: la sesión de Educastur vive solo en
-- memoria durante la propia sincronización, nunca en Postgres.

CREATE TABLE educastur_config (
    id BOOLEAN PRIMARY KEY DEFAULT true,
    id_empleado INTEGER,
    id_centro INTEGER,
    id_perfil INTEGER,
    nombre_profesor TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT educastur_config_singleton CHECK (id)
);
