# Profe Planner — Faro Docente

Aplicación web de gestión académica para profesorado: clases y alumnado,
calificaciones por criterios LOMLOE, currículo, programación didáctica, horario,
agenda y diario de clase. Pensada para uso personal (un docente, sin reparto
multi-usuario) o por centro, con los datos guardados en un servidor propio en vez de
en la nube de un tercero.

Es un fork de [CuadernMestre v1.0](https://github.com/elCordones/CuadernMestre-v1.0),
de elCordones (licencia CC BY-NC 4.0 — ver [LICENSE](LICENSE)), al que se le ha
sustituido el almacenamiento (originalmente solo en el navegador, vía IndexedDB) por
persistencia en un backend propio respaldado por PostgreSQL, y se le ha añadido
importación del horario semanal desde el PDF oficial de horario del profesorado.

## Por qué forkear este proyecto

El currículo LOMLOE (competencias clave, competencias específicas, criterios de
evaluación, saberes básicos) varía según la comunidad autónoma y las decisiones de
cada centro. Ninguna materia arranca con currículo cargado: el docente lo importa
desde Ajustes → Gestionar Currículo, bien como CSV propio, bien eligiendo una de las
plantillas oficiales ya empaquetadas en
[`frontend-src/public/curriculos-oficiales/`](frontend-src/public/curriculos-oficiales/)
(actualmente las del Principado de Asturias, ver `frontend-src/curriculumPresets.ts`).
Forkar este repositorio para sustituir esas plantillas por las de otra comunidad
autónoma, o para adaptar cualquier otro detalle a la normativa de un centro o región
concreta, es exactamente el caso de uso previsto.

## Estructura del repositorio

- [`frontend-src/`](frontend-src/) — aplicación React + TypeScript + Vite. En web
  consume una API REST granular; en escritorio usa Tauri con el mismo contrato de API.
- [`api/`](api/) — API FastAPI respaldada por PostgreSQL. Persiste alumnado, cursos,
  matrículas, calificaciones, currículo, agenda, reuniones y demás entidades en tablas
  relacionales, versionadas mediante migraciones SQL.
- [`frontend-src/src-tauri/`](frontend-src/src-tauri/) — variante de escritorio con
  SQLite local y el mismo modelo relacional.
- [`compose.yaml`](compose.yaml) y [`nginx/`](nginx/) — ejemplo de despliegue con
  Docker Compose (nginx sirviendo los estáticos + proxy a la API). Sirve como
  referencia, no como receta única: cada centro puede desplegar esto como prefiera.

## Arquitectura y persistencia

La arquitectura del blob SQLite único se retiró en la migración
`0006_retire_blob_and_student_photos.sql`. En web, cada operación se realiza contra
la API y las tablas relacionales de PostgreSQL. En escritorio, Tauri usa un archivo
SQLite local también relacional. Las menciones a “blob” que aún aparezcan en comentarios
son contexto de la migración, no el mecanismo de persistencia actual.

Las copias de seguridad son exportaciones JSON de las tablas de dominio. Una
restauración sustituye el contenido actual de esas tablas: conserva una exportación
reciente antes de actualizar o importar datos y prueba primero sobre una copia de la
base de datos. Las migraciones se aplican al iniciar la API y son solo hacia delante;
para una actualización despliega una única instancia de la API hasta confirmar que han
terminado.

## Desplegar tu propia instancia

```bash
cd frontend-src
npm ci
npm run lint
npm test
npm run build
cd ..
docker compose up -d --build profe-api
```

Necesitas además una base de datos PostgreSQL accesible y un archivo `.env` (no
incluido, contiene credenciales) en la raíz con `DATABASE_URL` para `profe-api`.
`GROQ_API_KEY` es opcional y habilita las funciones que usan Groq.

`compose.yaml` no es una instalación autónoma: presupone una PostgreSQL y las redes
Docker externas `proxy` y `db-shared`; también presupone que el volumen de Nginx ya
contiene `frontend-src/dist/`.

### Autenticación y exposición de red

El backend no implementa inicio de sesión propio: sus rutas de datos comprueban
`X-authentik-username`, que debe inyectar un proxy de confianza como Authentik mediante
forward auth. No expongas `profe-api` directamente ni permitas que clientes no
confiables lleguen a ella: una petición que pueda definir esa cabecera puede suplantar
una identidad. El proxy perimetral debe autenticar, eliminar o sobrescribir cualquier
`X-authentik-username` recibido del cliente y reenviar la API solo desde una red
interna.

El endpoint `/health` únicamente confirma que el proceso HTTP responde; no comprueba
PostgreSQL. Añade una comprobación de base de datos en la monitorización antes de usarlo
como señal de disponibilidad.

## Licencia y atribución

Todo el repositorio se distribuye bajo **Creative Commons
Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** — ver
[LICENSE](LICENSE). Debes dar crédito a CuadernMestre v1.0 / elCordones y a este fork,
indicar los cambios realizados, y no puedes usarlo con fines comerciales. El backend
(`api/`) es trabajo original de este fork, no del proyecto original.
