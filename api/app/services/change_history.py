"""Transactional, conflict-checked undo of gradebook rows. Snapshots stay on server."""
from datetime import datetime
from fastapi import HTTPException
from psycopg import sql
from psycopg.errors import IntegrityError
from psycopg.types.json import Jsonb
from services.db import get_conn

TABLES = ['courses', 'evaluation_criteria', 'evaluation_tools', 'categories', 'assignments', 'grades']

def _canonical(row):
    if row is None:
        return None
    result = dict(row)
    # Saving an unchanged note only touches updated_at and produces no event.
    # Such a save must not strand the previous recoverable version.
    result.pop('updated_at', None)
    for key in ('created_at',):
        if isinstance(result.get(key), str):
            try:
                result[key] = datetime.fromisoformat(result[key].replace('Z', '+00:00'))
            except ValueError:
                pass
    return result

def _keys(table, row):
    return {k: row[k] for k in (['enrollment_id', 'assignment_id'] if table == 'grades' else ['id'])}

def _rows(conn, batch):
    rows = conn.execute('SELECT * FROM change_history WHERE batch_id=%s ORDER BY id', [batch]).fetchall()
    if not rows:
        raise HTTPException(404, 'Cambio no encontrado.')
    merged = {}
    for row in rows:
        if row['table_name'] not in TABLES:
            raise HTTPException(409, 'Este cambio no se puede restaurar.')
        key = (row['table_name'], row['row_key'])
        if key not in merged:
            merged[key] = dict(row)
        merged[key]['after_data'] = row['after_data']
    return rows, [r for r in merged.values() if r['before_data'] is not None or r['after_data'] is not None]

def _conflicts(conn, rows):
    if any(r['undone_at'] is not None for r in rows):
        return 'Este cambio ya está deshecho.'
    for r in rows:
        table = r['table_name']
        keys = _keys(table, r['after_data'] or r['before_data'])
        where = sql.SQL(' AND ').join(sql.SQL('{}=%s').format(sql.Identifier(k)) for k in keys)
        current = conn.execute(sql.SQL('SELECT to_jsonb(t) AS data FROM {} t WHERE ').format(sql.Identifier(table)) + where, list(keys.values())).fetchone()
        if _canonical(current['data'] if current else None) != _canonical(r['after_data']):
            return 'Hay cambios posteriores en los mismos datos. Deshaz primero esos cambios para no perder información.'
        if table in ('assignments', 'evaluation_tools') and r['before_data'] is not None and r['after_data'] is not None:
            identity = (r['after_data'] or r['before_data'])['id']
            later = conn.execute('''SELECT 1 FROM change_history h WHERE h.table_name='grades' AND h.undone_at IS NULL
                AND h.id>(SELECT max(id) FROM change_history WHERE batch_id=%s)
                AND COALESCE(h.after_data,h.before_data)->>'assignment_id' IN (
                    SELECT id::text FROM assignments WHERE (%s='assignments' AND id::text=%s) OR (%s='evaluation_tools' AND evaluation_tool_id::text=%s)) LIMIT 1''',
                [r['batch_id'], table, identity, table, identity]).fetchone()
            if later:
                return 'Se han cambiado notas después de esta configuración. Deshaz primero esos cambios para conservar las notas posteriores.'
    return None

def list_changes(class_id, page=0):
    with get_conn() as conn:
        rows = conn.execute('''SELECT batch_id AS id, min(created_at) AS "createdAt", max(undone_at) AS "undoneAt",
            count(*) AS "changeCount", string_agg(DISTINCT label, ', ') AS label
            FROM change_history WHERE batch_id IN (
              SELECT h.batch_id FROM change_history h WHERE h.class_id=%s OR h.course_id=(SELECT course_id::text FROM classes WHERE id=%s)
              OR (h.class_id IS NULL AND h.course_id IS NULL AND h.table_name='evaluation_tools'))
            GROUP BY batch_id ORDER BY min(id) DESC LIMIT 200 OFFSET %s''', [class_id, class_id, page * 200]).fetchall()
        return rows

def preview(batch):
    with get_conn() as conn:
        _, rows = _rows(conn, batch)
        conflict = _conflicts(conn, rows)
        return {'id': batch, 'canRestore': conflict is None, 'reason': conflict,
                'changes': [{'table': r['table_name'], 'label': r['label'], 'before': r['before_data'], 'after': r['after_data']} for r in rows]}

def restore(batch):
    try:
        with get_conn() as conn:
            # Undo is rare. Lock these tables to close races with new grades or
            # assignments created between validation and restoration.
            conn.execute('LOCK TABLE courses,evaluation_criteria,evaluation_tools,categories,assignments,grades IN SHARE ROW EXCLUSIVE MODE')
            _, rows = _rows(conn, batch)
            conflict = _conflicts(conn, rows)
            if conflict:
                raise HTTPException(409, conflict)
            conn.execute("SELECT set_config('profe.history_disabled','on',true)")
            # Remove newly created grades first; restore parents before children.
            for r in sorted(rows, key=lambda r: TABLES.index(r['table_name']), reverse=True):
                if r['before_data'] is None:
                    keys = _keys(r['table_name'], r['after_data'])
                    where = sql.SQL(' AND ').join(sql.SQL('{}=%s').format(sql.Identifier(k)) for k in keys)
                    conn.execute(sql.SQL('DELETE FROM {} WHERE ').format(sql.Identifier(r['table_name'])) + where, list(keys.values()))
            for r in sorted(rows, key=lambda r: TABLES.index(r['table_name'])):
                before = r['before_data']
                if before is None:
                    continue
                table = r['table_name']
                cols = list(before)
                keys = _keys(table, before)
                query = sql.SQL('INSERT INTO {table} ({cols}) SELECT {cols} FROM jsonb_populate_record(NULL::{table}, %s) ON CONFLICT ({pk}) DO UPDATE SET {updates}').format(
                    table=sql.Identifier(table), cols=sql.SQL(',').join(map(sql.Identifier, cols)),
                    pk=sql.SQL(',').join(map(sql.Identifier, keys)),
                    updates=sql.SQL(',').join(sql.SQL('{c}=excluded.{c}').format(c=sql.Identifier(c)) for c in cols if c not in keys))
                conn.execute(query, [Jsonb(before)])
            conn.execute('UPDATE change_history SET undone_at=clock_timestamp() WHERE batch_id=%s', [batch])
            return {'restored': True}
    except IntegrityError:
        raise HTTPException(409, 'Faltan datos relacionados o existe un conflicto. No se ha restaurado nada.')
