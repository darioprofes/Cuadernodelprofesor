# python-helper

Sidecar Python de la versión de escritorio (Tauri) para las partes que
dependen de librerías Python sin equivalente razonable en Rust. Ver
`services::python_helper` en el lado Rust (`../src/services/python_helper.rs`)
y la memoria del proyecto para el porqué de este diseño (un único
ejecutable con subcomandos, compilado con PyInstaller en modo `--onedir`
e instalado como **recurso** de Tauri, no como sidecar `externalBin`).

## Subcomandos

Cada subcomando lee su entrada por **stdin** (bytes crudos, no una ruta de
fichero) y escribe un único JSON a stdout con código de salida 0, o
`{"error": "..."}` a stderr con código 1 si algo falla.

- `importar-horario` — PDF del "Horario individual del profesorado" oficial
  por stdin → `{"filas": [...], "errores": [...]}`. Lógica en `src/horario_pdf.py`,
  copia manual de `api/app/services/horario_pdf.py` (mantener sincronizadas
  a mano si se toca la extracción en el backend web).
- `educastur-sincronizar` — JSON por stdin (`usuario`, `contrasena`,
  `id_empleado`/`id_centro`/`id_perfil` opcionales, `stored` con la
  configuración ya resuelta, `procesables` con las faltas ya filtradas por
  el lado Rust) → `{"sincronizadas": [...], "errores": [...], "id_empleado",
  "id_centro", "id_perfil", "nombre_profesor"}`. Login→push→logout
  autocontenido contra Educastur (`src/educastur_client.py`, copia manual
  de `api/app/services/educastur_client.py`) orquestado en
  `src/educastur_orchestrator.py` (adaptado de `educastur_sync.py`, sin
  ningún acceso a base de datos -- eso lo hace Rust, ver
  `../src/services/educastur.rs`, antes y después de llamar a este
  subcomando). Requiere que el profesor haya activado esta función en
  Ajustes tras aceptar el aviso de responsabilidad (ver
  `EducasturSyncSettings.tsx`) -- el propio `educastur.rs` lo comprueba
  otra vez server-side, así que este subcomando en sí no necesita saberlo.

## Compilar

Requiere Python 3.12+ (probado con 3.14 para este subcomando; el futuro
subcomando `anonimizar`, con spaCy, probablemente necesite 3.12 exacto,
igual que el backend web -- ver Dockerfile).

```bash
cd frontend-src/src-tauri/python-helper
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/pyinstaller --onedir --name python-helper --distpath dist --workpath build --noconfirm src/main.py
```

Esto deja `dist/python-helper/` (el `.exe` + sus dependencias ya
desempaquetadas, sin coste de autoextracción en cada arranque) -- es lo
que `tauri.conf.json` (`bundle.resources`) referencia. Hay que
recompilarlo antes de `npm run tauri:build`/`tauri:dev` cada vez que
cambie algo en `src/` o `requirements.txt`; no se versiona (ver
`.gitignore`).
