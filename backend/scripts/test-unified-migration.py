"""Replay main migrations and assert legacy data survives the additive migration.

Only an isolated test database is accepted. Each run creates a new test schema;
neither the original database nor existing integration fixtures are modified.
"""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from uuid import uuid4

import psycopg
from psycopg import sql

root = Path(__file__).resolve().parents[2]
url = urlsplit((root / '.local/unified-test.env').read_text().strip().removeprefix('DATABASE_URL='))
assert url.path == '/codex_unified_integration_20260906', 'Isolated database required'
dsn = urlunsplit(url._replace(query=urlencode([(k, v) for k, v in parse_qsl(url.query) if k != 'schema'])))
schema = 'migration_' + uuid4().hex
legacy_workspace = '00000000-0000-4000-8000-000000000001'
ids = {name: uuid4() for name in ['admin', 'employee', 'document', 'version', 'file', 'reading', 'announcement']}
content = b'Legacy handbook with preserved binary content.'
with psycopg.connect(dsn, autocommit=True) as conn:
    conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    conn.execute(sql.SQL('SET search_path TO {}, public').format(sql.Identifier(schema)))
    migrations = sorted((root / 'backend/prisma/migrations').glob('*/migration.sql'))
    pivot = next(index for index, migration in enumerate(migrations) if 'unified_workspaces' in migration.parent.name)
    for migration in migrations[:pivot]:
        conn.execute(migration.read_text(encoding='utf-8-sig'), prepare=False)
    for name, role in [('admin', 'ADMIN'), ('employee', 'USER')]:
        conn.execute('INSERT INTO users (id, username, password_hash, display_name, employee_number, division, job_title, role, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())',
                     (ids[name], name, 'preserved-hash', name, name, 'Operations', name, role))
    conn.execute('INSERT INTO documents (id,title,collection,division,status,uploaded_by_id,updated_at) VALUES (%s,%s,%s,%s,%s,%s,now())',
                 (ids['document'], 'Legacy handbook', 'Operations', 'Operations', 'READY', ids['admin']))
    conn.execute('INSERT INTO document_versions (id,document_id,version_number,original_filename,mime_type,file_size,checksum) VALUES (%s,%s,1,%s,%s,%s,%s)',
                 (ids['version'], ids['document'], 'handbook.txt', 'text/plain', len(content), hashlib.sha256(content).hexdigest()))
    conn.execute('INSERT INTO document_files (id,document_version_id,content) VALUES (%s,%s,%s)', (ids['file'], ids['version'], content))
    conn.execute('INSERT INTO chunks (chunk_id,document_version_id,text) VALUES (%s,%s,%s)', ('legacy-chunk', ids['version'], content.decode()))
    conn.execute('INSERT INTO required_readings (id,document_id,user_id,progress,due_at,completed_at) VALUES (%s,%s,%s,100,now(),now())', (ids['reading'], ids['document'], ids['employee']))
    conn.execute('INSERT INTO announcements (id,title,body,created_by_id,updated_at) VALUES (%s,%s,%s,%s,now())', (ids['announcement'], 'Legacy news', 'Keep this announcement', ids['admin']))
    tables = ['users', 'documents', 'document_versions', 'document_files', 'chunks', 'required_readings', 'announcements', 'document_categories']
    before = {}
    for table in tables:
        rows = conn.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(table)))
        before[table] = ([column.name for column in rows.description], rows.fetchall())
    for migration in migrations[pivot:]:
        conn.execute(migration.read_text(encoding='utf-8-sig'), prepare=False)
    for table, (columns, values) in before.items():
        actual = conn.execute(sql.SQL('SELECT {} FROM {}').format(sql.SQL(',').join(map(sql.Identifier, columns)), sql.Identifier(table))).fetchall()
        assert sorted(map(repr, values)) == sorted(map(repr, actual)), f'Legacy values changed: {table}'
    admin_state = conn.execute('SELECT is_admin, is_platform_owner, workspace_id::text, role::text FROM users WHERE id=%s', (ids['admin'],)).fetchone()
    assert admin_state == (True, False, legacy_workspace, 'ADMIN'), admin_state
    assert conn.execute('SELECT is_admin FROM users WHERE id=%s', (ids['employee'],)).fetchone() == (False,)
    unit = conn.execute('SELECT unit_kerja_id FROM users WHERE id=%s', (ids['employee'],)).fetchone()[0]
    assert unit.version == 4
    assert conn.execute('SELECT unit_kerja_id FROM documents WHERE id=%s', (ids['document'],)).fetchone()[0] == unit
    assert bytes(conn.execute('SELECT content FROM document_files WHERE id=%s', (ids['file'],)).fetchone()[0]) == content
    print(f'PASS {len(migrations)} migrations; legacy rows, file bytes, completed readings, roles and unit ownership preserved')
    (root / '.local/unified-migration-results.json').write_text(json.dumps({'passed': True, 'schema': schema, 'tables': tables, 'migrations': len(migrations)}))
