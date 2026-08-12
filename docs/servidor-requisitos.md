# Requisitos del servidor nuevo — Cuaderno Docente + IA

Qué tiene que tener instalado/configurado el servidor nuevo (mini PC GMKtec,
Ryzen 7 7735HS / 32 GB, sin GPU dedicada) para poder ejecutar Cuaderno Docente
tal y como está hoy, más el módulo de IA diseñado en
[ai-generacion-unidades.md](ai-generacion-unidades.md).

## 1. Base del host (común a todo el stack Docker, no exclusivo de este proyecto)

- **Docker + Docker Compose** (`docker compose`, plugin v2)
- Red Docker **`proxy`** (externa) — la usa Nginx Proxy Manager para llegar a
  los contenedores expuestos públicamente. Si se replica el despliegue actual
  con dominio propio, hace falta también:
  - **Nginx Proxy Manager** (u otro reverse proxy equivalente)
  - **Authentik** en modo proxy — es lo que hoy protege `profe.lamarejada.es`
    con SSO. Si en el servidor nuevo no se quiere/necesita SSO todavía, se
    puede arrancar `profe` sin la red `proxy` y acceder solo por IP/puerto
    mientras se decide.
- Red Docker **`postgres_db-shared`** (externa) — la crea el compose de
  Postgres, no el de `profe`
- **Contenedor Postgres compartido** (`ghcr.io/immich-app/postgres` en el
  servidor actual) con:
  - base de datos `profe`
  - rol `profe_app` con privilegios solo sobre esa base
  - la migración del `DATABASE_URL` real (con la contraseña) vive en `.env`
    en la raíz del repo — **no está en git** (gitignored), hay que
    recrearlo/copiarlo a mano en el servidor nuevo, no regenerarlo desde
    cero

## 2. Específico de Cuaderno Docente (`profe`)

Con el host de arriba ya listo, desde este repo:

```bash
cd /mnt/storage/docker/compose/profe   # o la ruta equivalente en el server nuevo
docker compose up -d --build profe-api
```

- `.env` (TZ + `DATABASE_URL`) — copiarlo del servidor actual, no inventarlo
- El frontend **no se sirve solo, hay que compilarlo y copiarlo a mano**:
  ```bash
  cd frontend-src
  npm run build
  cp -r dist/* /mnt/storage/docker/data/profe/
  ```
  Requiere **Node.js** (versión que use `frontend-src/package.json`) instalado
  en la máquina donde se compile — no necesariamente el propio servidor, se
  puede compilar en local y copiar el resultado por scp/rsync
- El contenedor `profe` (nginx:alpine) sirve ese bind mount tal cual, sin
  build propio

## 3. Nuevo para el módulo de IA

- **Servicio `ollama`** añadido a `compose.yaml`, en la red `profe-internal`
  (no en `proxy` — no debe quedar expuesto a Internet ni a Authentik,
  igual que `profe-api` hoy):
  ```yaml
  ollama:
    image: ollama/ollama
    container_name: profe-ollama
    restart: unless-stopped
    volumes:
      - /mnt/storage/docker/data/profe-ollama:/root/.ollama
    networks:
      - profe-internal
  ```
- Descargar el modelo tras levantarlo:
  ```bash
  docker compose exec ollama ollama pull qwen3:14b
  ```
- Nueva dependencia en `api/requirements.txt`: **`docling`** — pesada,
  arrastra `torch`; la imagen de `profe-api` (hoy muy ligera, `python:3.13-slim`
  + fastapi/psycopg/pdfplumber) va a crecer bastante en tamaño y tiempo de
  build. Vale la pena probar el build en el servidor nuevo antes de dar por
  hecho que el `Dockerfile` actual (sin más cambios) es suficiente.
- Ajuste en `nginx/default.conf`: subir `proxy_read_timeout` /
  `proxy_send_timeout` en el `location /api/` (hoy sin valor propio → hereda
  el default de nginx, 60s) para que una generación de varios minutos no
  muera en 504.

## 4. Presupuesto de recursos a vigilar

Todo esto — Postgres compartido, `profe-api`, Ollama con Qwen3 14B, más
cualquier otro stack que también migre a este mini PC (p. ej. `panel`) —
compite por los mismos 32 GB de RAM y una CPU sin GPU dedicada. Antes de dar
por bueno el dimensionado, conviene medir con el servidor nuevo ya montado:
uso de RAM de Ollama con el modelo cargado, y si el resto de servicios siguen
respondiendo con holgura mientras hay una generación en curso.

## 5. Orden recomendado de puesta en marcha

1. Docker + Compose en el host nuevo
2. Redes `proxy` / `postgres_db-shared` (o recrear equivalentes)
3. Postgres compartido migrado, con la base `profe` y su rol
4. `profe` + `profe-api` arrancados y verificados contra ese Postgres (la app
   tal y como funciona hoy, sin IA)
5. Solo entonces: `ollama` + modelo descargado + `docling` en el backend +
   ajuste de nginx — y retomar la implementación descrita en
   `ai-generacion-unidades.md`
