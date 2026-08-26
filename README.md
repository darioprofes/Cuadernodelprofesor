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

- [`frontend-src/`](frontend-src/) — la aplicación (React + TypeScript + Vite): toda
  la lógica de dominio (clases, calificaciones, currículo, programación...) vive aquí,
  serializada como una base SQLite completa en el propio navegador (`sql.js`) que se
  sube/descarga entera del backend. Ver su [README](frontend-src/README.md) para
  desarrollo local.
- [`api/`](api/) — backend mínimo (FastAPI + PostgreSQL) que solo guarda/lee ese blob
  SQLite tal cual, más un endpoint para parsear el PDF oficial de horario del
  profesorado. Sin lógica de dominio propia: toda vive en el frontend.
- [`compose.yaml`](compose.yaml) y [`nginx/`](nginx/) — ejemplo de despliegue con
  Docker Compose (nginx sirviendo los estáticos + proxy a la API). Sirve como
  referencia, no como receta única: cada centro puede desplegar esto como prefiera.

## Arquitectura y persistencia

El frontend mantiene una base de datos SQLite completa en memoria en el navegador
(vía `sql.js`) con autoguardado a los 1.5s de cada cambio: exporta la base entera y la
sube al backend (`PUT /api/db`), que la persiste como un único blob binario en
Postgres (una fila, sin modelo relacional propio — todo el dominio vive en el SQLite
serializado). Al cargar, el frontend descarga ese blob (`GET /api/db`) y lo abre en
memoria. Esto permite acceder desde varios dispositivos y hacer copias de seguridad
centralizadas, a costa de necesitar un backend desplegado (a diferencia del
CuadernMestre original, que no necesita servidor alguno).

## Desplegar tu propia instancia

```bash
# Backend: aplica el esquema de la base de datos automáticamente al arrancar
docker compose up -d --build profe-api

# Frontend: compilar y servir los estáticos (sin pipeline de CI en este repo)
cd frontend-src
npm install
npm run build
# copiar dist/* al directorio que sirva tu nginx (ver compose.yaml/nginx/default.conf)
```

Necesitas además una base de datos PostgreSQL accesible y un archivo `.env` (no
incluido, contiene credenciales) en la raíz con `DATABASE_URL` para `profe-api` — ver
`compose.yaml` y `api/app/services/db.py`. `X-authentik-username` (o adaptar
`api/app/services/auth.py`) si quieres poner autenticación delante; el backend no
implementa su propio login.

## Licencia y atribución

Todo el repositorio se distribuye bajo **Creative Commons
Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** — ver
[LICENSE](LICENSE). Debes dar crédito a CuadernMestre v1.0 / elCordones y a este fork,
indicar los cambios realizados, y no puedes usarlo con fines comerciales. El backend
(`api/`) es trabajo original de este fork, no del proyecto original.
