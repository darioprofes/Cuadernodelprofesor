-- ==========================================================
-- Faltas de asistencia, registro local (Fase "Asistencia")
-- ==========================================================
--
-- Fuente de verdad dentro de la app; Educastur es un espejo al que se
-- empuja bajo demanda (ver docs/faltas/ y el plan
-- integracion-educastur-faltas.md), nunca al revés. educastur_falta_id
-- guarda el id que devuelve Educastur al crear la falta, para poder
-- actualizarla más tarde (p.ej. injustificada -> justificada) sin duplicar.

CREATE TABLE absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    period_index INTEGER NOT NULL,
    tipo_falta TEXT NOT NULL CHECK (tipo_falta IN ('R', 'J', 'I')),
    educastur_falta_id INTEGER,
    synced_at TIMESTAMPTZ,
    sync_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id, date, period_index)
);
CREATE INDEX absences_enrollment_idx ON absences (enrollment_id);
CREATE INDEX absences_pending_sync_idx ON absences (date) WHERE synced_at IS NULL;
