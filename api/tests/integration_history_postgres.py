"""Ensayo ASGI real sobre una base PostgreSQL desechable, nunca la base original.

DATABASE_URL aporta servidor/usuario. PROFE_TEST_DATABASE_NAME debe identificar
una base ya creada cuyo nombre empiece por profe_history_test_. No imprime claves.
"""
import asyncio
import json
import os
from urllib.parse import urlsplit, urlunsplit

test_db = os.environ.get("PROFE_TEST_DATABASE_NAME", "")
if not test_db.startswith("profe_history_test_"):
    raise RuntimeError("Se requiere una base desechable profe_history_test_*.")
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
    db.apply_migrations()
    await request('GET','/history/no-existe',expected=401,auth=False)
    year=await request('POST','/academic-years',{'label':'History test','startDate':'2026-09-01','endDate':'2027-06-30'},201)
    period=(await request('GET',f"/academic-years/{year['id']}/evaluation-periods"))[0]['id']
    course=await request('POST','/courses',{'level':'1 ESO','subject':'Historia ficticia'},201)
    cls=await request('POST',f"/academic-years/{year['id']}/classes",{'courseId':course['id']},201)
    cid=cls['id']
    e=await request('POST',f'/classes/{cid}/enrollments',{'newStudent':{'nombre':'Ficticio'}},201)
    cat=await request('POST',f'/classes/{cid}/categories',{'name':'Trabajo','weight':100,'evaluationPeriodId':period},201)
    task=await request('POST',f'/classes/{cid}/assignments',{'name':'Tarea','categoryId':cat['id'],'evaluationPeriodId':period,'evaluationMethod':'direct_grade'},201)
    tid=task['id']; path=f"/assignments/{tid}/grades/{e['id']}"
    async def latest(): return (await request('GET',f'/classes/{cid}/history'))[0]['id']
    await request('PUT',path,{'directScore':0}); first=await latest()
    await request('PUT',path,{'directScore':8}); second=await latest()
    assert not (await request('GET',f'/history/{first}'))['canRestore']
    await request('POST',f'/history/{first}/restore',{},409)
    await request('POST',f'/history/{second}/restore',{})
    assert (await request('GET',f'/classes/{cid}/grades'))[0]['directScore']==0
    await request('POST',f'/history/{first}/restore',{})
    assert not (await request('GET',f'/classes/{cid}/grades'))
    await request('POST',f'/history/{first}/restore',{},409)
    await request('PATCH',f'/assignments/{tid}',{'name':'Changed'}); config=await latest()
    await request('PUT',path,{'toolResults':{'criterion-test':7}})
    await request('POST',f'/history/{config}/restore',{},409)
    await request('DELETE',f'/assignments/{tid}',expected=204); deleted=await latest()
    assert len((await request('GET',f'/history/{deleted}'))['changes'])==2
    # Real export/import must retain history without recording the import itself.
    from services.backup import export_all,import_all
    backup=export_all(); count=len(backup['change_history']); import_all(backup)
    assert len(export_all()['change_history'])==count
    await request('POST',f'/history/{deleted}/restore',{})
    assert (await request('GET',f'/classes/{cid}/grades'))[0]['toolResults']['criterion-test']==7
    assert (await request('GET',f'/assignments/{tid}'))['name']=='Changed'
    # Group membership changes and cascading grade deletion are one undo batch.
    group=await request('POST',f'/classes/{cid}/assignments',{'name':'Grupo','categoryId':cat['id'],'evaluationPeriodId':period,'evaluationMethod':'direct_grade','assignmentGroup':{'memberIds':[tid],'color':'violet'}},201)
    await request('DELETE',f'/assignments/{tid}',expected=204); deleted=await latest()
    await request('POST',f'/history/{deleted}/restore',{})
    assert tid in (await request('GET',f"/assignments/{group['id']}"))['assignmentGroup']['memberIds']
    # Restoring a category must restore its tasks and grades, parent first.
    await request('DELETE',f"/categories/{cat['id']}",expected=204); deleted=await latest()
    await request('POST',f'/history/{deleted}/restore',{})
    assert (await request('GET',f'/classes/{cid}/grades'))[0]['toolResults']['criterion-test']==7
    await request('PATCH',f"/courses/{course['id']}",{'pesoCriteriosManual':True}); weights=await latest()
    await request('POST',f'/history/{weights}/restore',{})
    assert not (await request('GET',f"/courses/{course['id']}"))['pesoCriteriosManual']
    comp=await request('POST',f"/courses/{course['id']}/competences",{'code':'CE1','description':'Ficticia'},201)
    criterion=await request('POST',f"/courses/{course['id']}/criteria",{'code':'1.1','description':'Criterio ficticio','competenceId':comp['id'],'weight':80},201)
    await request('PATCH',f"/criteria/{criterion['id']}",{'weight':20,'excludeFromWeighting':True}); weights=await latest()
    await request('POST',f'/history/{weights}/restore',{})
    restored=await request('GET',f"/criteria/{criterion['id']}")
    assert restored['weight']==80 and not restored['excludeFromWeighting']
    await request('PUT',path,{'directScore':5}); changed=await latest()
    await request('PUT',path,{'directScore':5})
    assert await latest()==changed
    await request('POST',f'/history/{changed}/restore',{})
    # Retention deletes old batches, never part of a batch spanning September 1.
    from datetime import date
    assert db.history_cutoff(date(2026,8,31)).startswith('2025-09-01')
    assert db.history_cutoff(date(2026,9,1)).startswith('2026-09-01')
    with db.get_conn() as c:
        for batch,stamp in [('expired','2026-08-31T21:59:59Z'),('mixed','2026-08-31T21:59:59Z'),('mixed','2026-08-31T22:00:00Z')]:
            c.execute("INSERT INTO change_history(batch_id,table_name,row_key,label,created_at) VALUES (%s,'courses',%s,'Prueba',%s)",[batch,course['id'],stamp])
        assert db.prune_expired_history(c,date(2026,10,18))==1
        assert c.execute("SELECT count(*) AS n FROM change_history WHERE batch_id='mixed'").fetchone()['n']==2
    await request('POST','/history/clear',{'confirmation':'BORRAR HISTORIAL'},401,auth=False)
    await request('POST','/history/clear',{},400)
    before=export_all()
    cleared=await request('POST','/history/clear',{'confirmation':'BORRAR HISTORIAL'})
    assert cleared['deleted']>0
    after=export_all()
    assert not after['change_history']
    assert {k:v for k,v in before.items() if k!='change_history'}=={k:v for k,v in after.items() if k!='change_history'}
    await request('PUT',path,{'directScore':6})
    assert len(await request('GET',f'/classes/{cid}/history'))==1
    print('PostgreSQL: historial, conflictos, recuperación de tareas/notas/grupos/categorías y copias correctos.')

asyncio.run(main())
