-- Mismo campo que api/app/migrations/0024_reuniones_tipo_otras.sql -- ver
-- su comentario para el porqué. SQLite no permite alterar un CHECK ya
-- creado, así que hay que recrear la tabla entera (mismo criterio que
-- recomienda la propia documentación de SQLite para este caso): tabla
-- nueva con el CHECK ampliado, copiar filas, borrar la vieja, renombrar.
-- meetings no tiene ninguna FK entrante (nada más referencia meetings.id),
-- así que no hace falta tocar PRAGMA foreign_keys para este caso concreto.
CREATE TABLE meetings_new (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    hora TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('tutoria','departamento','familia','r_tutores','otras')),
    con_quien TEXT,
    motivo TEXT,
    acuerdos TEXT,
    seguimiento TEXT
);
INSERT INTO meetings_new SELECT id, academic_year_id, fecha, hora, tipo, con_quien, motivo, acuerdos, seguimiento FROM meetings;
DROP TABLE meetings;
ALTER TABLE meetings_new RENAME TO meetings;
CREATE INDEX meetings_year_idx ON meetings (academic_year_id);
