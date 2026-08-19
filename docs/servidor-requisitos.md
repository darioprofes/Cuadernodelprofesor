# Servidores: qué hay montado y qué falta

> **Reescrito el 2026-08-15.** La versión anterior de este documento describía los
> requisitos de un "servidor nuevo" al que se iba a migrar todo el stack. **Esa
> migración se descartó.** `192.168.10.12` es el destino permanente de despliegue, y
> el mini PC GMKtec quedó como máquina dedicada a IA local. El documento ahora
> describe las dos máquinas tal y como están.

## 1. Servidor de producción — `192.168.10.12` (`Docker`)

Ya montado y en uso. Aquí vive todo el stack de Cuaderno Docente y no se toca sin
motivo. Acceso: `ssh 192.168.10.12` (usuario `root`, clave `~/.ssh/id_ed25519_lamarejada`).

- Docker + Docker Compose v2
- Redes: `proxy` (Nginx Proxy Manager), `postgres_db-shared`, `profe_profe-internal`
- Postgres compartido (`ghcr.io/immich-app/postgres`), base `profe`, rol `profe_app`
- Nginx Proxy Manager + Authentik en modo proxy (protege `profe.lamarejada.es`)
- **Redis** (`redis:8-alpine`) en `/mnt/storage/docker/compose/redis/`:
  `appendonly yes`, con `requirepass`, **sin `maxmemory`** (o sea sin política de
  expulsión — apto para cola de trabajos). Solo en la red `proxy`. La contraseña está
  en los `.env` de los servicios que lo usan, no en su propio compose.
  `db0` está en uso (~90 claves, compartida por Authentik, Immich, Nextcloud y
  panel); las otras 15 bases están libres.
- `.env` del stack `profe` (TZ + `DATABASE_URL`) — no está en git, no regenerarlo
- El frontend **no se sirve solo**: hay que compilarlo y copiarlo a mano
  ```bash
  cd frontend-src && npm run build
  cp -r dist/* /mnt/storage/docker/data/profe/
  ```

## 2. Servidor de IA — `192.168.10.118` (`iaserver`)

GMKtec Mini-PC, **Ryzen 7 7735HS + Radeon 680M (iGPU, sin GPU dedicada)**, 30 GB RAM,
Ubuntu 26.04 LTS. Acceso: `ssh 192.168.10.118` (usuario `dario`, clave
`~/.ssh/ia-server`). **No tiene Docker ni Ollama**, y no los necesita.

### Ya montado

- **Build propia de `llama.cpp`** compilada nativamente para `gfx1035` vía TheRock
  (ROCm por pip en un venv). Script: `~/build_llama_therock.sh`. Compilar entero lleva
  20-40 min.
- **Lanzadores en `~/.local/bin`** (`llama-cli`, `llama-server`, `llama-bench`,
  `llama-tokenize`, `llama-quantize`, `llama-perplexity`, `llama-embedding`,
  `llama-mtmd-cli`). Son envoltorios que resuelven el `LD_LIBRARY_PATH` de ROCm desde
  `~/.local/lib/llama-env.sh`; sin ellos los binarios no encuentran sus librerías.
  `~/.profile` ya mete `~/.local/bin` en el `PATH`.
  ```bash
  llama-server -m ~/models/Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf -ngl 99 -c 16384 -b 512 -ub 512
  ```
- **Modelo**: `Qwen3-30B-A3B-Instruct-2507-Q4_K_M` (17,28 GiB) en `~/models/`.
- **Grupos de dispositivo**: `dario` está en `render` y `video`. Sin eso, `/dev/kfd`
  (que es `root:render 660`) no es accesible y llama.cpp avisa de *"no usable GPU
  found"* aunque la build sea correcta. Tras un reformateo hay que rehacerlo:
  `sudo usermod -aG render,video dario` **+ sesión nueva**.
- **Límite de GTT subido a 24 GiB** por línea de kernel. La iGPU no tiene VRAM
  propia: usa RAM prestada (GTT), que el kernel limita por defecto a la mitad de la
  RAM (15 GiB de 30), insuficiente para un modelo de 17,28 GiB.
  ```
  GRUB_CMDLINE_LINUX_DEFAULT="ttm.pages_limit=6291456 ttm.page_pool_size=6291456 amdgpu.gttsize=24576"
  ```
  Es un techo, no una reserva: no se pierde RAM.

### Rendimiento medido (Qwen3-30B-A3B, 48/48 capas en GPU)

| | |
|---|---|
| Procesado de prompt | ~225 t/s (2.700 tokens en 12 s) |
| Generación | 15-18 t/s |
| Ejemplo real | respuesta de 3.650 tokens en 4,4 min |

Para comparar: la misma GPU con `-ngl 32` (descarga parcial) baja a 11,5 t/s, y en
CPU pura ronda los 8.

### ⚠️ Nunca activar `GGML_CUDA_ENABLE_UNIFIED_MEMORY=1`

Permite cargar modelos que no caben en la GTT y `llama-bench` da cifras
estupendas… pero **la salida es basura corrupta** (se comprobó: 12.000 tokens de
`z=z=z=zz=...`). `llama-bench` mide velocidad y nunca valida el contenido, así que no
lo detecta. **Toda configuración nueva hay que validarla generando texto real.** El
entorno de los lanzadores lleva un comentario avisando de esto.

### Pendiente en el servidor de IA

1. `llama-server` como **servicio systemd** (hoy hay que lanzarlo a mano).
2. Escuchar en **`0.0.0.0`** en vez de `127.0.0.1`, para que `profe-api` lo alcance
   desde `.12`.
3. **Cortafuegos** que permita el puerto solo desde `192.168.10.12`. `llama-server`
   no tiene autenticación: quien alcance ese puerto, manda.

## 3. Pendiente para conectar ambos (módulo de IA)

Detalle completo en [ai-generacion-situaciones-aprendizaje.md](ai-generacion-situaciones-aprendizaje.md).

- **Red `redis-shared`** en el compose de Redis, siguiendo el patrón de
  `postgres_db-shared`. Hoy Redis está solo en `proxy` y `profe-api` no está en
  `proxy` — y **no debe meterse ahí**: esa separación es deliberada (`profe-api`
  quedaría accesible desde Nextcloud, Immich y el resto saltándose Authentik). Se
  puede conectar en caliente sin reiniciar y luego persistir en el compose. Toca un
  stack compartido con otros servicios: avisar antes de hacerlo.
- **Base Redis propia** para `profe` (una de las 15 libres) + prefijo `profe:`.
- **Dependencias nuevas** en `api/requirements.txt`: `rq` + extracción de documentos.
  Empezar con `pdfplumber` (ya está) + `python-pptx` + `python-docx`, que son
  ligeros; Docling arrastra `torch` y engorda muchísimo la imagen de `profe-api`.

## 4. Presupuesto de recursos

El servidor de IA tiene 30 GB de RAM y **solo cabe un modelo cargado a la vez**
(17,28 GB). Por eso el worker de la cola va con concurrencia 1: dos generaciones
simultáneas no son posibles, no es una decisión de diseño sino una restricción física.
