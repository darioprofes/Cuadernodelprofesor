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
- `anonimizar-texto` — JSON por stdin `{"texto": "..."}` →
  `{"anonimizado": "...", "mapa": {...}}`. NER en español (spaCy +
  `es_core_news_md`) + patrones regex para DNI/dirección/centro/nivel-grupo,
  igual que `POST /ai-tools/anonimizar` en la web. Lógica en
  `src/anonimizador.py`, copia manual de `api/app/services/anonimizador.py`
  con dos adaptaciones necesarias por correr congelado (ver el comentario de
  cabecera de ese fichero): carga el modelo por import directo en vez de por
  nombre, y localiza `materias_oficiales.json`/`neae_terminos.json` (también
  copias manuales, sin cambios) vía `sys._MEIPASS` en vez de
  `Path(__file__).parent`.
- `anonimizar-docx` — JSON por stdin `{"docx_base64": "..."}` →
  `{"anonimizado_docx_base64", "anonimizado_texto", "mapa"}`. Anonimiza el
  .docx entero conservando el formato (`anonimizar_docx` en
  `anonimizador.py`) y extrae el resultado a Markdown (`extraccion_docx.py`,
  copia manual sin cambios de `api/app/services/extraccion_docx.py`) para
  poder copiarlo como texto además de descargar el .docx.
- `reintegrar-docx` — JSON por stdin `{"docx_base64": "...", "mapa": {...}}`
  (el .docx que ha devuelto la IA online, con los códigos PERS_/GRUPO_
  intactos, más el mapa código→dato real que se guardó en memoria en el
  paso de anonimizar) → `{"docx_base64", "sobrantes"}` (códigos que no se
  pudieron resolver, normalmente por quedar partidos entre dos runs de
  estilo distinto).

## Compilar

Requiere **Python 3.12 exacto** -- spaCy (necesario para `anonimizar-*`) no
tiene wheels precompilados para 3.13/3.14 todavía, así que instalar sus
dependencias (numpy/thinc/blis) sin 3.12 intenta compilarlas desde cero. Sin
`anonimizar-*` cualquier 3.12+ vale, pero usa siempre 3.12 para que un
`pip install` no se ponga a compilar nada por sorpresa.

```bash
cd frontend-src/src-tauri/python-helper
py -3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/pyinstaller python-helper.spec --distpath dist --workpath build --noconfirm
```

Esto deja `dist/python-helper/` (el `.exe` + sus dependencias ya
desempaquetadas, sin coste de autoextracción en cada arranque) -- es lo
que `tauri.conf.json` (`bundle.resources`) referencia. Hay que
recompilarlo antes de `npm run tauri:build`/`tauri:dev` cada vez que
cambie algo en `src/` o `requirements.txt`; no se versiona (ver
`.gitignore`).

Usa el `.spec` (no `pyinstaller src/main.py` a pelo) -- es el que sabe
recoger los datos de `es_core_news_md` y empaquetar los dos JSON del
anonimizador (ver `python-helper.spec`), sin eso el modelo no carga
congelado aunque compile sin errores (confirmado en real).

Peso aproximado del `.exe` de escritorio final con esto añadido: ~86 MB
comprimido (medido en real, no estimado) -- antes de spaCy rondaba los 32 MB.
