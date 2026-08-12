# Generación de Unidades de Programación con IA — diseño

Estado: **diseñado, sin implementar**. Bloqueado por infraestructura: hace falta el
servidor nuevo (con Docker + Ollama) montado antes de escribir código — ver
"Prerrequisito de infraestructura" al final.

## 1. Alcance del MVP

El profesor, dentro de un curso ya existente (con sus `EvaluationCriterion` /
`BasicKnowledge` reales ya cargados en Postgres), sube un documento (PDF, PPTX o
DOCX) y obtiene una propuesta de `ProgrammingUnit` nueva, editable antes de
guardar.

Un documento por generación de momento; la API se diseña desde el principio
para aceptar varios (`documentIds: string[]`), para no tener que rediseñarla
cuando se añada esa capacidad.

No es una biblioteca de conocimiento permanente ni un asistente conversacional:
cada generación es un pipeline de una pasada, documento(s) → propuesta.

## 2. Por qué así (contexto)

Origen: brainstorm con ChatGPT sobre Remotion que derivó en la idea de generar
material didáctico con IA a partir de documentos del profesor (export completo
en `Qué_es_Remotion_2026-07-30.md`, fuera del repo). La mayor parte de lo que
esa conversación proponía construir desde cero (un "motor curricular") **ya
existe** en este proyecto: `Course`, `EvaluationCriterion`, `BasicKnowledge`,
`SpecificCompetence`/`KeyCompetence` y, sobre todo, `ProgrammingUnit`
(`api/app/services/programming_units.py`) ya modelan justo lo que se quería
generar. El trabajo real es rellenar ese modelo con IA en vez de a mano, no
reinventarlo.

## 3. Flujo de usuario

```
ProgrammingManager.tsx
      │  botón "✨ Generar con IA"
      ▼
GenerateUnitModal.tsx (paso 1: subir documento)
      │  POST /courses/{id}/ai/documents  →  guarda el archivo, devuelve su id
      ▼
      │  POST /courses/{id}/ai/generate-unit  { documentIds: [...] }
      ▼
  ┌─── éxito (200) ──────────────┐   ┌─── rechazo (422) ─────────────┐
  │ Modal paso 2: formulario     │   │ Mensaje explicando por qué    │
  │ editable, precargado con     │   │ (curso/documento no parecen   │
  │ la propuesta                 │   │ relacionados) + volver a      │
  │                               │   │ intentar con otro documento   │
  └──────────────┬────────────────┘   └────────────────────────────┘
                 │ profesor confirma (tras editar si quiere)
                 ▼
   POST /courses/{id}/programming-units   (endpoint YA existente, sin cambios)
```

El botón solo crea unidades **nuevas** — no rellena una unidad ya existente
que el profesor esté editando (eso queda fuera del MVP, ver §8).

## 4. Modelo de datos (nueva migración `api/app/migrations/0005_ai_documents.sql`)

```sql
CREATE TABLE ai_source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE programming_units
    ADD COLUMN source_document_ids UUID[] NOT NULL DEFAULT '{}';
```

El binario se guarda en Postgres (igual que el blob de `app_db`), no en un
volumen de archivos aparte — coherente con que todo el backup del proyecto es
un `pg_dump`. `source_document_ids` en `programming_units` sigue el mismo
patrón que `linked_criteria_ids` / `linked_basic_knowledge_ids`, que ya
existen ahí: registra de qué documento salió cada unidad y deja abierta la
puerta a "regenerar" más adelante sin rediseñar nada.

Decisión explícita: **el documento subido se conserva** (no se descarta tras
procesar, a diferencia de la importación de horario) — para poder
regenerar/consultar el original más adelante.

## 5. API nueva

`api/app/routers/ai_generation.py` + `api/app/services/ai/`, siguiendo el
mismo patrón router/service por entidad que el resto del backend.

- `POST /courses/{course_id}/ai/documents` — multipart, campo `archivo`
  (mismo patrón que `routers/horario.py`). Valida tipo MIME y tamaño (≤ 25
  MB). Devuelve metadatos (`id`, `filename`, `mimeType`, `sizeBytes`,
  `createdAt`) — nunca el binario de vuelta.
- `GET /courses/{course_id}/ai/documents` — lista lo ya subido para ese
  curso (reutilizable sin resubir).
- `POST /courses/{course_id}/ai/generate-unit` — body `{ documentIds:
  string[] }`. Devuelve `GeneratedUnitProposal` (200) o rechaza con 422 y un
  mensaje claro.
- `DELETE /courses/{course_id}/ai/documents/{document_id}` — limpieza
  manual.

Todos tras `require_auth`, igual que el resto de routers.

## 6. Pipeline interno

```
services/ai/docling_extract.py
    extraer_texto(bytes, mime_type) -> str

services/ai/ollama_client.py
    generar(prompt, model="qwen3:14b") -> str   (POST a http://ollama:11434)

services/ai/learning_unit_generator.py
    orquesta:
    1. extrae texto del/los documento(s) con Docling
    2. lee EvaluationCriterion + BasicKnowledge REALES del curso
       (services/criteria.py, services/basic_knowledge.py)
    3. construye el prompt: texto extraído + lista cerrada de códigos/ids
       válidos de ese curso + instrucción explícita de no inventar nada
       fuera de esa lista + pide JSON estricto:
         { name, estimatedSessions, sessionSummaries: string[],
           criteriaIds: string[], basicKnowledgeIds: string[] }
    4. parsea y valida la respuesta contra un modelo Pydantic
    5. decide aceptar/rechazar (ver §7)
```

Nivel de detalle de `sessionSummaries`: una o dos frases por sesión (mismo
nivel que hoy se escribe a mano en `ProgrammingManager.tsx`), no contenido
extenso — el campo `description` de `sessionDetails` es texto corto en la UI
actual.

## 7. Manejo de baja confianza

Si el documento no encaja razonablemente con los criterios/saberes del curso
elegido (JSON no parseable, o ningún `criteriaId`/`basicKnowledgeId`
propuesto existe realmente en la lista real del curso), el pipeline
**rechaza** — no genera una propuesta parcial ni marca partes como
inciertas. Responde 422 con un mensaje legible en español explicando el
motivo (p. ej. "No se han encontrado criterios de evaluación ni saberes
básicos claramente relacionados con el contenido de este documento. Revisa
que el curso seleccionado sea el correcto."), y el frontend deja elegir otro
documento.

## 8. Revisión antes de guardar

El modal de revisión (paso 2) es **editable**: nombre, número de sesiones,
descripción de cada sesión y qué criterios/saberes quedan vinculados, todo
tocable antes de confirmar — igual de fiable que revisar un borrador antes de
enviarlo. Al confirmar, se llama al endpoint ya existente `POST
/courses/{id}/programming-units` sin cambios sobre él.

## 9. Límites técnicos (ajustables con uso real)

- Tamaño máximo por archivo: 25 MB
- Timeout de generación: 5 minutos (Qwen3 14B en CPU no es instantáneo)
- **Importante — ya detectado revisando `nginx/default.conf`:** el `location
  /api/` no tiene `proxy_read_timeout` propio, hereda el default de nginx
  (60s). Una generación de 2-3 min moriría en 504 antes de que el backend
  termine. Hay que subir `proxy_read_timeout` / `proxy_send_timeout` (p. ej.
  a 300s) para esa ruta antes de probar en real, y revisar si el outpost de
  Authentik delante tiene su propio límite si el problema persiste tras ese
  cambio.

## 10. Infraestructura

Nuevo servicio `ollama` en `compose.yaml`, red `profe-internal` (no expuesto
a `proxy` / Authentik, mismo criterio que `profe-api` hoy). Apunta al
**servidor nuevo** (mini PC GMKtec, Ryzen 7 7735HS / 32 GB, sin GPU dedicada),
no al servidor actual (`192.168.10.12`), porque la migración a ese mini PC ya
está en marcha — montar Ollama en el servidor viejo ahora significaría
repetirlo justo después de migrar.

Modelo: empezar con `qwen3:14b`; comparar con `qwen3:30b-a3b` (MoE) si la
calidad no basta. Sin GPU NVIDIA — inferencia por CPU/RAM.

## 11. Explícitamente fuera de este MVP

- Cola de trabajos (Redis/Dramatiq) — una llamada síncrona con timeout largo
  basta para un documento
- Orquestación multi-agente (LangGraph) — un único prompt bien construido
  primero
- OCR / Whisper — solo documentos de texto (no escaneados) al principio
- Perfiles de adaptación NEAE — fase 2 clara, una vez que la generación base
  funcione bien
- Generación de vídeo (Remotion) — módulo aparte que consumiría la unidad ya
  guardada, no bloquea esto
- Rellenar una `ProgrammingUnit` ya existente — el botón solo crea nuevas
- Combinar varios documentos en una sola generación — la API ya lo admite en
  el contrato (`documentIds: string[]`), pero el MVP solo se prueba con uno

## 12. Prerrequisito de infraestructura (bloqueante)

**No empezar a programar nada de esto hasta que el servidor nuevo (GMKtec)
esté montado**: Docker + Docker Compose, red equivalente a `profe-internal` /
`db-shared`, y Ollama con el modelo elegido descargado y respondiendo. Ver
`project_deployment_server` en la memoria de Claude para el estado de esa
migración — confirmar ahí (o preguntando de nuevo) si ya está lista antes de
retomar este documento.

## 13. Orden de implementación (una vez el servidor esté listo)

1. Migración `0005_ai_documents.sql`
2. `services/ai/docling_extract.py` + `ollama_client.py` — probar el pipeline
   suelto (script o endpoint mínimo) contra 3-5 documentos reales, medir
   tiempos y calidad **antes** de tocar frontend (criterio de éxito: ningún
   criterio/saber inventado, desglose de sesiones razonable)
3. `services/ai/learning_unit_generator.py` + validación Pydantic +
   decisión aceptar/rechazar
4. Routers (`ai_generation.py`) + ajuste de `nginx/default.conf`
   (`proxy_read_timeout`)
5. Frontend: `GenerateUnitModal.tsx` + botón en `ProgrammingManager.tsx`
