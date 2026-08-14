# Generación de material didáctico con IA — diseño

Estado: **diseñado, sin implementar**. La infraestructura de inferencia **ya está
montada y medida** (ver §10); lo que falta es el código.

> **Revisión 2026-08-15.** Este documento se reescribió tras montar el servidor de
> IA y probar el modelo con prompts reales. Los cambios respecto a la versión
> anterior están resumidos en §13; en corto: ya no hay contenedor de Ollama, el
> servidor de IA vive en **otra máquina**, y la generación pasa de una llamada
> síncrona única a un **pipeline de varios pasos encolado**.

## 1. Alcance

El profesor, dentro de un curso ya existente (con sus `EvaluationCriterion` /
`BasicKnowledge` reales cargados en Postgres), sube un documento de teoría suyo
(PDF, PPTX o DOCX) y obtiene material didáctico derivado de él: apuntes
reelaborados, actividades y una propuesta de `ProgrammingUnit`, todo editable
antes de guardar.

**Lo que NO es**, y esto es una restricción de diseño, no una limitación temporal:

- No investiga ni consulta fuentes externas. Todo lo que necesita saber se lo damos
  nosotros: la teoría en el documento, el currículo desde Postgres.
- No cita normativa ni URLs. Ver §11: el modelo se las inventa con total
  naturalidad, así que directamente no se le piden.
- No es un asistente conversacional ni una biblioteca de conocimiento permanente.

Un documento por generación de momento; la API se diseña desde el principio para
aceptar varios (`documentIds: string[]`).

## 2. Por qué así (contexto)

Origen: brainstorm con ChatGPT sobre Remotion que derivó en generar material
didáctico con IA a partir de documentos del profesor. La mayor parte de lo que esa
conversación proponía construir desde cero (un "motor curricular") **ya existe** en
este proyecto: `Course`, `EvaluationCriterion`, `BasicKnowledge`,
`SpecificCompetence`/`KeyCompetence` y `ProgrammingUnit`
(`api/app/services/programming_units.py`) ya modelan justo lo que se quería generar.
El trabajo real es rellenar ese modelo con IA en vez de a mano.

## 3. Flujo de usuario

```
ProgrammingManager.tsx
      │  botón "✨ Generar con IA"
      ▼
GenerateUnitModal.tsx (paso 1: subir documento)
      │  POST /courses/{id}/ai/documents          → guarda el archivo, devuelve id
      ▼
      │  POST /courses/{id}/ai/generate-unit      → encola y devuelve { jobId }
      ▼
      │  GET  /courses/{id}/ai/jobs/{jobId}       → sondeo cada 3 s
      │       { estado, pasoActual, totalPasos, resultado?, error? }
      ▼
  ┌─── completado ───────────────┐   ┌─── fallado ───────────────────┐
  │ Modal paso 2: formulario     │   │ Mensaje explicando en qué     │
  │ editable precargado con la   │   │ paso falló y por qué          │
  │ propuesta                    │   │                               │
  └──────────────┬───────────────┘   └───────────────────────────────┘
                 │ profesor confirma (tras editar si quiere)
                 ▼
   POST /courses/{id}/programming-units   (endpoint YA existente, sin cambios)
```

La barra de progreso no es cosmética: con 4-6 pasos a varios minutos en total, el
usuario necesita ver que avanza.

## 4. Modelo de datos (`api/app/migrations/0005_ai_documents.sql`)

```sql
CREATE TABLE ai_source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BYTEA NOT NULL,
    texto_extraido TEXT,              -- cache de la extracción, para no repetirla
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_generations (       -- rastro permanente; la cola vive en Redis
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    source_document_ids UUID[] NOT NULL DEFAULT '{}',
    modelo TEXT NOT NULL,             -- p.ej. "qwen3-30b-a3b-instruct-2507-q4_k_m"
    estado TEXT NOT NULL,             -- pendiente | en_curso | completado | fallado
    resultado JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

ALTER TABLE programming_units
    ADD COLUMN source_document_ids UUID[] NOT NULL DEFAULT '{}';
```

El binario se guarda en Postgres (igual que las fotos de alumnado), no en un volumen
aparte — coherente con que todo el backup del proyecto es un `pg_dump`. El documento
subido **se conserva** (a diferencia de la importación de horario), para poder
regenerar más adelante.

`ai_generations` guarda el resultado y el rastro **en Postgres, no en Redis**: Redis
es la cola y el estado transitorio, lo que se quiere conservar va a la base y entra
en el backup.

## 5. API nueva

`api/app/routers/ai_generation.py` + `api/app/services/ai/`, siguiendo el mismo
patrón router/servicio por entidad que el resto del backend.

- `POST   /courses/{id}/ai/documents` — multipart, campo `archivo` (mismo patrón que
  `routers/horario.py`). Valida MIME y tamaño (≤ 25 MB). Devuelve metadatos, nunca
  el binario.
- `GET    /courses/{id}/ai/documents` — lista lo ya subido para ese curso.
- `DELETE /courses/{id}/ai/documents/{documentId}` — limpieza manual.
- `POST   /courses/{id}/ai/generate-unit` — body `{ documentIds: string[] }`.
  **Encola y devuelve `202` con `{ jobId }`**; no bloquea.
- `GET    /courses/{id}/ai/jobs/{jobId}` — estado del trabajo para el sondeo.

Todos tras `require_auth`.

## 6. Pipeline por pasos

**Decisión clave: el guion de pasos está fijo en código Python, no lo genera la IA.**

Es tentador pedirle al modelo que planifique la tarea y luego ejecute su propio plan,
pero va en contra de lo medido (§11): el modelo no cumple un guion **que se le da
escrito**, así que dejarle inventar el guion es darle más libertad justo donde falla.
Además, en este dominio los pasos no varían. Un pipeline fijo es reproducible,
depurable paso a paso, y cuando algo sale mal se sabe exactamente dónde.

```
services/ai/extraccion.py
    extraer_texto(bytes, mime_type) -> str

services/ai/cliente_llm.py
    generar(prompt_sistema, prompt_usuario, esquema) -> dict
    (POST a http://192.168.10.118:8080/v1/chat/completions, temperatura 0.2)

services/ai/pipeline.py — orquesta, un paso por función:
    1. extraer texto del/los documento(s)
    2. LLM: identificar los bloques temáticos del documento
    3. LLM (uno por bloque): redactar apuntes de ese bloque
    4. LLM (uno por bloque): proponer actividades, vinculadas a los
       criterios/saberes REALES del curso pasados como lista cerrada
    5. ensamblar la ProgrammingUnit (sin LLM: es composición, código puro)
```

Cada paso del 2 al 4 es una llamada corta y acotada. Nada de pedir doce secciones de
una vez.

**Prefijo común y caché KV.** Todos los prompts se construyen con el mismo bloque
inicial (currículo del curso + texto del documento) y solo cambian en la instrucción
final. `llama-server` reutiliza la caché KV cuando dos peticiones comparten prefijo,
así que solo se paga el procesado del prompt largo una vez en lugar de en cada paso.
A 225 t/s de procesado y varios miles de tokens de contexto, esto son segundos por
paso que se acumulan.

**Validación entre pasos, no al final.** Cada respuesta se valida con Pydantic y se
comprueba que todo `criteriaId`/`basicKnowledgeId` propuesto exista de verdad en la
lista real del curso. Si falla, se reintenta **ese paso** una vez, incluyendo el
error como contexto; si vuelve a fallar, el trabajo se marca `fallado` indicando el
paso. Esta es la ventaja principal de trocear: se detecta la basura en el paso 2 en
lugar de descubrirla al final de un documento entero.

**Nunca se le pide que se autoevalúe.** Ver §11: marca todo como correcto,
incluidas cosas que se acababa de inventar. Su opinión sobre su propio trabajo no
vale como control de calidad.

## 7. Cola de trabajos (RQ sobre el Redis existente)

Una generación completa son varios minutos, así que no cabe en una petición HTTP.

- **RQ**, no Celery ni Dramatiq: es una cola sencilla, sin broker aparte ni
  configuración ceremonial, que es exactamente lo que hace falta aquí.
- **Un worker, concurrencia 1.** No es una preferencia: en el servidor de IA solo
  cabe **un modelo en memoria** (17,28 GB), así que dos generaciones simultáneas no
  son posibles. La concurrencia 1 expresa esa restricción de forma declarativa en
  lugar de con un cerrojo hecho a mano.
- **Base de datos Redis propia** (`db0` está ocupada con 90 claves compartidas por
  Authentik, Immich, Nextcloud y el panel; las otras 15 están libres — elegir una y
  usar además prefijo `profe:`). Aislamiento real: si hay que vaciar la cola, no se
  roza a nadie más.
- El Redis existente tiene `appendonly yes` y **sin `maxmemory`**, o sea sin política
  de expulsión. Importante: con `allkeys-lru` una cola de trabajos sería una trampa,
  porque Redis podría descartar trabajos pendientes para hacer sitio. Tal y como está
  configurado, no puede pasar.

## 8. Revisión antes de guardar

El modal de revisión es **editable**: nombre, número de sesiones, descripción de cada
sesión, apuntes, actividades y qué criterios/saberes quedan vinculados. Al confirmar
se llama al endpoint ya existente `POST /courses/{id}/programming-units`, sin cambios
sobre él.

## 9. Límites técnicos

- Tamaño máximo por archivo: 25 MB.
- **Temperatura 0.2**, no la 0.7 por defecto. Para reelaborar material dado, la
  creatividad estorba: perjudica el seguimiento de formato sin aportar nada.
- El sondeo del estado del trabajo es una petición trivial, así que **el problema del
  `proxy_read_timeout` de nginx desaparece**: ninguna petición HTTP dura más de unos
  segundos. Esto era un riesgo real en el diseño síncrono anterior y la arquitectura
  encolada lo elimina de raíz, no lo parchea.

## 10. Infraestructura (montada y medida, 2026-08-15)

El servidor de IA **no está en el mismo host que `profe-api`**:

| | Máquina | Notas |
|---|---|---|
| `profe-api`, `profe`, Postgres, Redis | `192.168.10.12` (`Docker`) | Producción actual |
| Servidor de inferencia | `192.168.10.118` (`iaserver`) | GMKtec, Ryzen 7 7735HS + Radeon 680M, 30 GB RAM |

- **No hay contenedor de Ollama.** Se usa `llama-server` de una build propia de
  `llama.cpp` compilada nativamente para `gfx1035` (ver
  `~/build_llama_therock.sh` en el ia-server). Los binarios genéricos de Ollama
  rendían ~8 veces peor en esta iGPU.
- **Modelo**: `Qwen3-30B-A3B-Instruct-2507-Q4_K_M` (17,28 GiB), en `~/models/`. Es
  MoE: 30B totales pero solo ~3B activos por token, que es lo que lo hace viable en
  una GPU integrada sin VRAM dedicada.
- **Rendimiento medido** con las 48 capas en GPU: **~225 t/s** procesando el prompt y
  **15-18 t/s** generando. Un prompt de 2.700 tokens se procesa en 12 s; una
  respuesta de 3.650 tokens tardó 4,4 min.
- **Trampa documentada**: la GPU no tiene VRAM propia, usa GTT (RAM prestada), que el
  kernel limitaba a la mitad de la RAM. Está subido a 24 GiB por línea de kernel
  (`ttm.pages_limit=6291456`). **Nunca activar
  `GGML_CUDA_ENABLE_UNIFIED_MEMORY=1`**: permite cargar modelos que no caben, pero la
  salida sale corrupta sin ningún aviso.

**Pendiente de montar** (nada de esto está hecho todavía):

1. **Red `redis-shared`** en el compose de Redis, siguiendo el patrón de
   `postgres_db-shared`. Hoy Redis está solo en `proxy` y `profe-api` no está en
   `proxy` — y meterlo ahí sería un error: esa separación es deliberada, `profe-api`
   quedaría accesible desde Nextcloud, Immich y el resto saltándose Authentik. Se
   puede conectar en caliente (`docker network connect` no reinicia el contenedor) y
   luego persistir en el `compose.yml`. Toca un stack compartido: avisar antes.
2. **`llama-server` escuchando en `0.0.0.0`** (hoy solo `127.0.0.1`) **con
   cortafuegos que solo permita `192.168.10.12`**. `llama-server` no tiene
   autenticación: quien alcance ese puerto, manda.
3. **`llama-server` como servicio systemd** en el ia-server, para que arranque solo.
4. **Dependencias nuevas** en `api/requirements.txt`: `rq` y la librería de
   extracción de documentos. Sobre Docling: arrastra `torch` y engorda muchísimo la
   imagen de `profe-api` (hoy `python:3.13-slim` + fastapi/psycopg/pdfplumber).
   Merece la pena empezar con `pdfplumber` (ya está) + `python-pptx` + `python-docx`,
   que son ligeros, y reservar Docling para si la extracción se queda corta de
   verdad.

## 11. Qué se aprendió probando el modelo (2026-08-15)

Se le pasó un prompt real y exigente (diseño completo de una prueba escrita con 12
secciones, rúbricas, adaptación TDAH y fuentes citadas). **Falló claramente**, y los
fallos son los que justifican varias decisiones de arriba:

- **No cumplió la estructura**: de 12 secciones exigidas entregó 8, con nombres
  propios inventados. → De ahí el pipeline por pasos cortos (§6).
- **No produjo el entregable central** (la prueba de 8 preguntas). Terminó por su
  cuenta en 3.651 tokens sin acercarse al límite.
- **Se inventó las fuentes**: un "Real Decreto 1105/2022" que no existe (mezcla del
  217/2022 real con el 1105/2014 derogado), con URL del BOE a juego, más un vídeo de
  YouTube y un PDF de la OCDE inventados. Ignoró el marco autonómico exigido y citó
  competencias clave de una ley derogada. → De ahí que **no se le pidan fuentes
  nunca** y que los referentes curriculares se inyecten desde Postgres (§1, §6).
- **Se autocertificó como correcto**: tabla final marcando ✔️ en "fuentes
  verificadas" siendo falsas. → De ahí que no se use su autoevaluación (§6).

**A su favor**, y por eso sigue siendo la elección correcta: el español es fluido y
con registro didáctico adecuado, la rúbrica tenía niveles coherentes y la adaptación
TDAH era pedagógicamente sensata. **Todos los fallos graves son de inventar
información que no tenía.** En el caso de uso real no hay nada que inventar: la
teoría la aporta el documento y el currículo sale de la base de datos. La prueba fue
el peor escenario posible para un modelo local; el trabajo real es el mejor.

## 12. Explícitamente fuera de este MVP

- Orquestación multi-agente (LangGraph) — el pipeline fijo cubre esto.
- Planificación de pasos por IA — ver §6, decisión consciente.
- OCR / Whisper — solo documentos de texto, no escaneados.
- Corrección de exámenes manuscritos — necesita visión y OCR de manuscrito, otra
  liga; ver la nota al final.
- Perfiles de adaptación NEAE — fase 2, una vez la generación base funcione.
- Generación de vídeo (Remotion) — módulo aparte que consumiría la unidad guardada.
- Rellenar una `ProgrammingUnit` ya existente — el botón solo crea nuevas.

## 13. Cambios respecto a la versión anterior de este documento

| Antes | Ahora | Motivo |
|---|---|---|
| Contenedor `ollama` en `profe-internal` | `llama-server` propio en otra máquina (`.118`) | La migración del servidor al GMKtec se descartó; el GMKtec es caja de IA aparte |
| `qwen3:14b` denso | `Qwen3-30B-A3B` (MoE) | Un denso de 14B da ~5 t/s en esta iGPU; el MoE da 15-18 con más calidad |
| Una llamada síncrona con timeout de 5 min | Pipeline por pasos encolado con RQ | El modelo no sostiene specs largas; y varios minutos no caben en una petición HTTP |
| Subir `proxy_read_timeout` en nginx | Innecesario | Con sondeo, ninguna petición dura más de segundos |
| Temperatura por defecto | 0.2 | Mejor seguimiento de formato |
| "Prerrequisito bloqueante: montar el servidor" | Hecho y medido | Ver §10 |

## 14. Orden de implementación

1. Red `redis-shared` + `llama-server` como servicio con cortafuegos (§10).
2. Migración `0005_ai_documents.sql`.
3. `services/ai/extraccion.py` + `cliente_llm.py` — probar el pipeline suelto contra
   3-5 documentos reales, midiendo tiempos y calidad **antes** de tocar frontend.
   Criterio de éxito: ningún criterio/saber inventado, apuntes fieles al documento
   original, actividades pertinentes.
4. `services/ai/pipeline.py` + validación Pydantic + reintento por paso.
5. Cola RQ + worker + endpoints de estado.
6. Frontend: `GenerateUnitModal.tsx` con progreso + botón en `ProgrammingManager.tsx`.
