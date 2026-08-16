# Herramientas IA — diseño y estado

> **Revisión 2026-08-16.** Pivote de arquitectura respecto a las dos versiones
> anteriores de este documento (resumen completo en §7): la idea original era un
> pipeline encolado que generaba la `ProgrammingUnit` en el servidor, con un modelo
> local (Qwen3-30B) haciendo de redactor. Tras montar y probar ese servidor en real
> (§6), el modelo local resultó **poco útil para generar contenido** — cumple mal
> guiones largos y se inventa datos con total naturalidad (ver el historial de
> pruebas, ya no reproducido aquí). El enfoque cambió a dos herramientas más simples
> y fiables:
>
> 1. **Generador de prompt** (§2) — sigue sin implementar en la app; hoy es un
>    prototipo de script en el histórico de conversación. Construye el prompt (documento
>    + currículo real) para pegarlo **a mano** en una IA online (Claude, ChatGPT), en vez
>    de automatizar la llamada. El profesor decide qué IA usar y revisa el resultado
>    antes de guardar nada.
> 2. **Anonimizador** (§3) — **implementado y en producción**, dentro de la nueva
>    sección "Herramientas IA" del Sidebar. Usa el servidor de IA solo para NER
>    (detección de entidades), no para generar texto: permite anonimizar un documento
>    con datos de alumnado antes de pegarlo en una IA online, y reintegrar la
>    respuesta con los datos reales después, sin persistir nunca el mapa
>    código↔dato real.

## 1. Por qué el pipeline automático se descartó

El servidor de IA (ia-server, §6) se montó y midió con un prompt real y exigente.
Los fallos fueron consistentes y estructurales, no accidentes de un prompt mal
escrito:

- No cumplía estructuras largas pedidas de una vez (de 12 secciones exigidas,
  entregaba 8).
- Se inventaba fuentes con total naturalidad: un Real Decreto que no existe, con
  URL del BOE a juego, más un vídeo de YouTube y un PDF de la OCDE inventados.
- Se autocertificaba como correcto — una tabla final marcando "fuentes verificadas"
  siendo falsas. Su propia autoevaluación no sirve como control de calidad.

Trocear el trabajo en pasos cortos (la idea original de §187-233 de la versión
anterior) mitigaba parte de esto, pero no lo esencial: para *generar contenido
didáctico nuevo* con calidad fiable, un modelo de frontera (Claude, ChatGPT) hace
falta de todos modos. Automatizar la llamada a un modelo de frontera vía API es
posible, pero el profesor prefirió mantener el copiar/pegar manual: revisa lo que
sale antes de que entre en la aplicación, sin dar por hecho que el pipeline lo hizo
bien.

Esto **no descarta** el servidor de IA local — lo reorienta a lo que sí hace bien:
tareas de NLP acotadas (NER, embeddings), no generación de contenido largo. El
Anonimizador (§3) es la primera de esas tareas.

## 2. Generador de prompt (sin implementar todavía)

Estado: **prototipo probado, no integrado en la app**.

Un script puro en Python (sin IA), que:

1. Extrae el texto de un documento de teoría del profesor (hoy solo PPTX
   probado, con un marcador `### Diapositiva N` por diapositiva).
2. Inyecta el currículo real del curso (`EvaluationCriterion` / `BasicKnowledge`
   desde Postgres) como listas cerradas de códigos válidos.
3. Ensambla un prompt con instrucciones explícitas: cubrir el documento
   completo sin omitir contenido introductorio, repartir en sesiones, no
   inventar códigos curriculares fuera de las listas dadas, devolver JSON con
   una forma fija (`name`, `sessions`, `sessionDetails`, `linkedBasicKnowledgeIds`,
   `linkedCriteriaIds`).

Probado dos veces con un documento real (atmósfera, 1º ESO Biología y Geología)
pegado a mano en una IA online: la segunda prueba, tras añadir la instrucción de
repasar diapositiva a diapositiva antes de responder, cubrió el documento completo
sin inventar ningún código curricular.

**Lo que falta para integrarlo en la app**, si se decide hacerlo:

- Extracción de PDF/DOCX (hoy solo hay un extractor ad-hoc de PPTX). `pdfplumber`
  ya está en `requirements.txt` (lo usa `services/horario_pdf.py`); `python-pptx` /
  `python-docx` no están.
- Un endpoint que genere el prompt y lo devuelva como texto para copiar (mismo
  patrón sin estado que el Anonimizador, §3), y un modal en
  `ProgrammingManager.tsx` para pegar la respuesta de vuelta y previsualizar la
  `ProgrammingUnit` antes de guardarla — igual de "staged" que el flujo del
  Anonimizador.
- El endpoint `POST /courses/{id}/programming-units` ya existe y no necesita
  cambios: la generación por IA solo rellena su formulario, no cambia cómo se
  guarda.

## 3. Anonimizador (implementado)

Estado: **en producción**, sección "Herramientas IA" del Sidebar (solo web, oculta
en escritorio — depende del backend Python).

### Flujo (4 pantallas, sin autoguardado de nada sensible)

```
frontend-src/components/AiToolsView.tsx
  Paso 1: pegar documento original
      │  POST /api/ai-tools/anonimizar   { texto }
      ▼    → { anonimizado, mapa }        (mapa = código -> dato real)
  Paso 2: ver documento anonimizado, copiar
  Paso 3: pegar la respuesta de la IA online
      │  sustitución PURAMENTE en el navegador (mapa en estado de React)
      ▼
  Paso 4: ver documento con los datos reales reintegrados, copiar
      │  "Empezar de nuevo" descarta el mapa — no hay vuelta atrás
```

El backend (`api/app/services/anonimizador.py` + `routers/ai_tools.py`) **no
persiste nada**: ni tabla nueva ni fila en ninguna existente. Genera el mapa,
lo devuelve una vez, y se olvida. La reintegración (paso 3→4) es sustitución de
texto pura en el navegador — no hay una segunda llamada al backend, así que el
mapa nunca tiene que volver a viajar por red una vez generado.

### Detección

`services/anonimizador.py` combina:

- **spaCy** (`es_core_news_md`) para NER borroso: personas, organizaciones,
  localizaciones. Es la herramienta correcta para esto — un LLM de chat no aporta
  nada y sería mucho más lento para una tarea de clasificación por token.
- **Regex** para patrones estructurados y predecibles, que el NER reconoce mal:
  DNI, direcciones, código postal, nombre de centro (`IES`/`CEIP`/...), nivel+grupo
  (p.ej. "2º ESO B"), y una lista curada de cargos únicos de centro (jefe de
  estudios, director, orientador...) — en un centro normalmente solo hay una
  persona con cada cargo, así que el cargo solo ya identifica.
- Recorte de cualquier candidato que cruce un salto de línea (tanto NER como regex
  pueden fusionar líneas distintas en cabeceras densas) y una lista de exclusión de
  las 64 materias oficiales reales (`services/materias_oficiales.json`, extraídas
  de `frontend-src/curriculumPresets.ts`) para no anonimizar el nombre de una
  asignatura por error.
- Resolución de solapamientos (p.ej. un código postal de 5 dígitos dentro de un
  DNI de 8) por rango más largo/específico.

Cada dato único detectado recibe un código aleatorio (`PERS_XXXXXX` para personas/
organizaciones/localizaciones/cargos/centro/dirección, `GRUPO_XXXXXX` para
nivel+grupo), generado con `secrets.token_hex` — no determinista, cambia en cada
ejecución. El documento anonimizado lleva delante una instrucción explícita para
que la IA online no toque esos códigos.

### Lo que el Anonimizador NO hace (a propósito)

**No hay forma automática de eliminar el riesgo de reidentificación por
combinación de datos.** Si un documento dice "12 faltas sin justificar en 2º ESO B
durante el tercer trimestre" sin nombrar a nadie, esa combinación puede seguir
identificando a alguien concreto para quien conozca el grupo, aunque ningún dato
individual esté "sin anonimizar". Esto es responsabilidad de revisión humana antes
de pegar el documento en la IA online — el paso 2 de la interfaz lo recuerda
explícitamente, pero no hay ninguna comprobación de código para esto ni está
prevista.

### Dependencia nueva

`api/requirements.txt`: `spacy==3.8.2` + el wheel de `es_core_news_md-3.8.0`
instalado directamente por URL (para no depender de una descarga separada en
tiempo de build sin versión fijada). **Verificar que la imagen construye** tras
este cambio (`docker compose up -d --build profe-api`) — spaCy compila extensiones
nativas (thin/blis) y su compatibilidad con Python 3.13 depende de qué wheels
prebuilt existan en el momento del build; si el build falla habría que fijar una
versión de Python distinta en el `Dockerfile` o instalar toolchain de compilación.

## 4. Escritorio (Tauri)

Igual que la importación de horario en PDF y la sincronización de Educastur: **no
disponible**, depende de un backend Python (spaCy) sin equivalente en Rust.
Sidebar.tsx oculta la sección completa con el mismo patrón ya usado dos veces
(`PDF_IMPORT_AVAILABLE`, `EDUCASTUR_SYNC_AVAILABLE`):

```ts
...(isTauri() ? [] : [{ label: null, items: [{ view: 'ai-tools', ... }] }])
```

No hay ninguna tabla nueva en Postgres, así que **no hace falta tocar la migración
de escritorio** ni el formato de backup — a diferencia de lo que habría exigido el
diseño de pipeline encolado descartado (que sí añadía columnas a
`programming_units`).

## 5. Explícitamente fuera de alcance

- Generación automática de `ProgrammingUnit` sin paso manual de copiar/pegar — ver
  §1, decisión consciente tras probar el modelo local.
- Detección automática de riesgo de reidentificación por combinación de datos —
  ver §3, requiere revisión humana.
- OCR / Whisper — el Generador de prompt (§2) solo lee texto ya extraíble, no
  documentos escaneados ni audio.
- Subida de archivo en el Anonimizador — v1 es pegar texto a mano; PDF/PPTX/DOCX
  no tienen extractor integrado en esta herramienta todavía.

## 6. Infraestructura del servidor de IA (montada, 2026-08-15)

Sigue en pie tal cual se montó — el pivote de §1 cambia *para qué* se usa, no cómo
está construida.

| | Máquina | Notas |
|---|---|---|
| `profe-api`, `profe`, Postgres | `192.168.10.12` (`Docker`) | Producción actual |
| Servidor de inferencia / NER | `192.168.10.118` (`iaserver`) | GMKtec, Ryzen 7 7735HS + Radeon 680M, 30 GB RAM |

- **No hay contenedor de Ollama.** `llama-server` de una build propia de
  `llama.cpp` compilada nativamente para `gfx1035`.
- **Modelo**: `Qwen3-30B-A3B-Instruct-2507-Q4_K_M` (17,28 GiB) — sigue instalado,
  pero de momento sin un consumidor en producción tras el pivote de §1.
- **GPU inestable por firmware**: solo 512 MB de VRAM real pase lo que pase en la
  BIOS (confirmado en Linux y Windows) — incidencia formal en
  `docs/incidencia-gpu-iaserver.md` y correo de soporte en
  `docs/correo-gmktec-bios.md`, pendiente de enviar/responder. El detalle completo
  de reconstrucción (build, kernel params, qué NO hacer) está en la memoria del
  proyecto, no en este documento.
- **El Anonimizador (§3) no usa este servidor** — spaCy corre dentro del propio
  contenedor `profe-api`, en CPU, porque NER sobre un documento corto es rápido sin
  GPU. El servidor de iaserver queda disponible para si el Generador de prompt
  (§2) u otra herramienta futura necesitasen embeddings o un modelo mayor.

## 7. Historial de revisiones de este documento

| Revisión | Cambio principal |
|---|---|
| Original | Pipeline síncrono con `ollama` en el mismo host, sin servidor de IA montado todavía |
| 2026-08-15 | Servidor de IA montado y medido en `.118`; pipeline rediseñado como cola RQ + Redis con pasos cortos, tras medir que el modelo no sostenía guiones largos de una sola vez |
| 2026-08-16 (esta) | Pivote completo: se descarta la generación automática en servidor (el modelo local sigue sin ser fiable para *generar* contenido, ni siquiera troceado). Sustituida por (a) un generador de prompt para copiar/pegar manual en una IA de frontera, sin implementar todavía, y (b) el Anonimizador, implementado y en producción, que reutiliza el servidor de IA solo para NER |
