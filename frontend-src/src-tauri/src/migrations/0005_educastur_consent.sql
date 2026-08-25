-- ==========================================================
-- Activación explícita + aviso de responsabilidad para la sincronización
-- con Educastur en escritorio
-- ==========================================================
--
-- Solo existe en esta copia SQLite -- el backend web (Postgres) no gana
-- estas columnas. Motivo: en escritorio la sincronización es una pieza
-- nueva y sin verificar en real (sidecar Python + orquestación en Rust,
-- ver services/educastur.rs), a diferencia de la que ya lleva tiempo en
-- producción en la web. sync_enabled empieza desactivada a propósito
-- (DEFAULT 0): el profesor tiene que activarla a mano desde Ajustes
-- después de leer el aviso, nunca queda activa por sí sola. Ver
-- services::educastur::{get_settings, save_settings} para la lógica que
-- exige aceptar el aviso en la misma petición que activa.

ALTER TABLE educastur_config ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE educastur_config ADD COLUMN disclaimer_accepted_at TEXT;
