use serde::Serialize;

// Forma equivalente al detail/status que ya usa el backend web (ver
// services/schemas.py y ApiError en frontend-src/services/api.ts) — así
// api.ts puede tratar un error de invoke() igual que uno de fetch(), sin
// que el resto de la app (hooks, componentes) tenga que distinguir.
#[derive(Serialize, Debug)]
pub struct ApiError {
    pub status: u16,
    pub detail: String,
}

impl ApiError {
    pub fn not_found(detail: impl Into<String>) -> Self {
        Self { status: 404, detail: detail.into() }
    }

    pub fn bad_request(detail: impl Into<String>) -> Self {
        Self { status: 400, detail: detail.into() }
    }

    pub fn internal(detail: impl std::fmt::Display) -> Self {
        Self { status: 500, detail: detail.to_string() }
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        ApiError::internal(e)
    }
}

// Traduce una violación de FOREIGN KEY (fila referenciada desde otra tabla,
// ON DELETE RESTRICT en el baseline) al mismo 409 que ya da el backend web
// para (RestrictViolation, ForeignKeyViolation). Cualquier otro error de
// sqlite en un DELETE es un fallo real (500) -- no debería darse, ninguna
// tabla del baseline tiene más restricciones que puedan saltar al borrar.
pub fn conflict_or_internal(e: rusqlite::Error, conflict_detail: &str) -> ApiError {
    if let rusqlite::Error::SqliteFailure(sqlite_err, _) = &e {
        if sqlite_err.code == rusqlite::ErrorCode::ConstraintViolation {
            return ApiError { status: 409, detail: conflict_detail.to_string() };
        }
    }
    ApiError::internal(e)
}
