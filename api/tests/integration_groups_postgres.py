"""Ensayo ASGI real sobre una base PostgreSQL desechable, nunca la base original.

DATABASE_URL aporta servidor/usuario. PROFE_TEST_DATABASE_NAME debe identificar
una base ya creada cuyo nombre empiece por profe_groups_test_. No imprime claves.
"""
import asyncio
import json
import os
from urllib.parse import urlsplit, urlunsplit

test_db = os.environ.get("PROFE_TEST_DATABASE_NAME", "")
if not test_db.startswith("profe_groups_test_"):
    raise RuntimeError("Se requiere una base desechable profe_groups_test_*.")
parts = urlsplit(os.environ["DATABASE_URL"])
os.environ["DATABASE_URL"] = urlunsplit((parts.scheme, parts.netloc, "/" + test_db, parts.query, parts.fragment))

from services import db
assert urlsplit(db.DATABASE_URL).path == "/" + test_db
from main import app


async def request(method, path, body=None, expected=200, auth=True):
    payload = json.dumps(body).encode() if body is not None else b""
    messages = []
    async def receive():
        return {"type": "http.request", "body": payload, "more_body": False}
    async def send(message):
        messages.append(message)
    headers = [(b"content-type", b"application/json")]
    if auth:
        headers.append((b"x-authentik-username", b"deployment-test"))
    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
               "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
               "headers": headers, "server": ("test", 80), "client": ("127.0.0.1", 1), "root_path": ""}, receive, send)
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    data = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    if status != expected:
        raise AssertionError(f"{method} {path}: HTTP {status}, esperado {expected}: {data.decode()[:400]}")
    return json.loads(data) if data else None


async def main():
    db.apply_migrations()
    db.apply_migrations()  # segundo arranque: idempotencia
    await request("GET", "/assignments/no-existe", expected=401, auth=False)
    year = await request("POST", "/academic-years", {"label": "Pruebas grupos", "startDate": "2026-09-01", "endDate": "2027-06-30"}, 201)
    periods = await request("GET", f"/academic-years/{year['id']}/evaluation-periods")
    period = periods[0]["id"]
    course = await request("POST", "/courses", {"level": "1 ESO", "subject": "Materia ficticia"}, 201)
    cls = await request("POST", f"/academic-years/{year['id']}/classes", {"courseId": course["id"], "grupo": "Pruebas"}, 201)
    class_id = cls["id"]
    enrollment = await request("POST", f"/classes/{class_id}/enrollments", {"newStudent": {"nombre": "Alumna ficticia"}}, 201)
    cat = await request("POST", f"/classes/{class_id}/categories", {"evaluationPeriodId": period, "name": "Trabajo", "weight": 100}, 201)
    other = await request("POST", f"/classes/{class_id}/categories", {"evaluationPeriodId": period, "name": "Otra", "weight": 0}, 201)
    async def task(name, category=cat["id"], **extra):
        return await request("POST", f"/classes/{class_id}/assignments", {"name": name, "categoryId": category, "evaluationPeriodId": period, "evaluationMethod": "direct_grade", **extra}, 201)
    a, b = await task("Pregunta A"), await task("Pregunta B", other["id"])
    await request("PUT", f"/assignments/{a['id']}/grades/{enrollment['id']}", {"directScore": 7})
    config = {"memberIds": [a["id"], b["id"]], "color": "violet", "memberWeights": {a["id"]: 1, b["id"]: 2}}
    group = await task("Preguntas en clase", assignmentGroup=config)
    assert group["assignmentGroup"]["memberIds"] == [a["id"], b["id"]]
    edited = await request("PATCH", f"/assignments/{group['id']}", {"name": "Grupo editado", "assignmentGroup": config, "importancia": "alta", "importanciaPersonalizada": None})
    assert edited["name"] == "Grupo editado" and edited["importancia"] == "alta" and edited["importanciaPersonalizada"] is None
    await request("PATCH", f"/assignments/{group['id']}", {"importanciaPersonalizada": 1.25})
    levels = await request("PATCH", f"/assignments/{group['id']}", {"importancia": "muy_baja", "importanciaPersonalizada": None})
    assert levels["importancia"] == "muy_baja" and levels["importanciaPersonalizada"] is None
    moved = await request("GET", f"/assignments/{b['id']}")
    assert moved["categoryId"] == cat["id"] and moved["importanciaPersonalizada"] == 2
    await request("PUT", f"/assignments/{group['id']}/grades/{enrollment['id']}", {"directScore": 10}, 400)
    await request("PATCH", f"/assignments/{group['id']}", {"assignmentGroup": {**config, "memberIds": [group["id"]]}}, 400)
    duplicate = await request("POST", f"/classes/{class_id}/assignments", {"name": "No se crea", "categoryId": cat["id"], "evaluationPeriodId": period, "evaluationMethod": "direct_grade", "assignmentGroup": config}, 400)
    before = await request("GET", f"/classes/{class_id}/assignments")
    await task("Nueva dentro del grupo", joinGroupId=group["id"])
    after = await request("GET", f"/classes/{class_id}/assignments")
    assert len(after) == len(before) + 1
    new = next(row for row in after if row["name"] == "Nueva dentro del grupo")
    parent = await request("GET", f"/assignments/{group['id']}")
    assert new["id"] in parent["assignmentGroup"]["memberIds"]
    await request("POST", f"/classes/{class_id}/assignments/reorder", {"ids": [new["id"], b["id"], a["id"]]}, 204)
    assert (await request("GET", f"/assignments/{new['id']}"))["columnOrder"] == 0
    await request("POST", f"/classes/{class_id}/assignments/reorder", {"ids": [new["id"], group["id"]]}, 400)
    await request("PATCH", f"/assignments/{a['id']}", {"categoryId": other["id"]})
    parent = await request("GET", f"/assignments/{group['id']}")
    assert a["id"] not in parent["assignmentGroup"]["memberIds"]
    assert a["id"] not in parent["assignmentGroup"]["memberWeights"]
    dumped = await request("GET", "/backup/export")
    await request("POST", "/backup/import", dumped)
    restored = await request("GET", f"/assignments/{group['id']}")
    assert restored["assignmentGroup"] == parent["assignmentGroup"]
    await request("DELETE", f"/assignments/{group['id']}", expected=204)
    assert (await request("GET", f"/assignments/{b['id']}"))["name"] == "Pregunta B"
    assert len(await request("GET", f"/classes/{class_id}/grades")) == 1
    print("OK: migraciones, autenticación, grupos, pesos, traslado, creación interna, orden, copias y conservación de notas.")


asyncio.run(main())
