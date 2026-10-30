"""Derive schema only in disposable SQLite; never run legacy data migrations on a new store."""
import pathlib
import sqlite3
import json
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
files = sorted((ROOT / 'drizzle').glob('*.sql'))
connection = sqlite3.connect(':memory:')
runtime = json.loads((ROOT / 'outputs/runtime-schema.json').read_text(encoding='utf-8'))
for migration in files:
    connection.execute('PRAGMA foreign_keys=OFF')
    pending = ''
    for line in migration.read_text(encoding='utf-8').splitlines(True):
        pending += line
        if not sqlite3.complete_statement(pending):
            continue
        # Data imports, stock resets and row-count assertions are not schema.
        # Only DDL from history is used to derive a new, empty store.
        significant = re.sub(r'/\*.*?\*/|--[^\n]*', '', pending, flags=re.S).strip()
        if not re.match(r'^(CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX)|PRAGMA)\b', significant, re.I):
            pending = ''
            continue
        try:
            connection.executescript(pending)
        except sqlite3.OperationalError as error:
            missing = re.search(r'no such table: (\w+)', str(error))
            if missing and missing.group(1) in runtime:
                connection.executescript(runtime[missing.group(1)])
                try:
                    connection.executescript(pending)
                except sqlite3.OperationalError as retry:
                    if 'duplicate column name:' not in str(retry):
                        raise
            elif 'duplicate column name:' not in str(error):
                raise
        pending = ''
    if pending.strip():
        connection.executescript(pending)
# Include runtime-created tables that no historical migration explicitly created.
for sql in runtime.values():
    connection.executescript(sql)
for sql in json.loads((ROOT / 'outputs/runtime-alters.json').read_text(encoding='utf-8')):
    match = re.match(r'ALTER TABLE (\w+) ADD COLUMN (\w+) ', sql, re.I)
    if match:
        table, column = match.groups()
        present = {row[1] for row in connection.execute('PRAGMA table_info(' + table + ')')}
        if present and column not in present:
            connection.execute(sql)
rows = connection.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").fetchall()
output = ['-- New-store schema only. No existing-store data or historical seeding is copied.', '-- Apply only to a newly created empty database. Existing tables deliberately cause failure.']
for kind, name, sql in rows:
    if name == 'store_settings':
        for value in ['1231904457865622', 'منار بارتي ستور', 'Manar Party Store', 'Manar Store', 'قطع وإكسسوارات التوزيعات بالجملة والتجزئة']:
            sql = sql.replace("DEFAULT '" + value + "'", "DEFAULT ''").replace('DEFAULT "' + value + '"', "DEFAULT ''")
        sql = sql.replace('"meta_pixel_enabled" integer DEFAULT 1', '"meta_pixel_enabled" integer DEFAULT 0').replace('meta_pixel_enabled integer DEFAULT 1', 'meta_pixel_enabled integer DEFAULT 0')
        sql = sql.replace("DEFAULT '#8f4264'", "DEFAULT '#475569'").replace("DEFAULT '#f8e8ef'", "DEFAULT '#94a3b8'")
    output.append(sql.rstrip(';') + ';')
output += ["INSERT INTO store_settings(id,store_name,created_at,updated_at) VALUES(1,'المتجر',0,0);", "INSERT INTO store_profile(id,settings_json,updated_at) VALUES(1,'{}',0);", "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);"]
output += ["INSERT INTO d1_migrations(name) VALUES('" + file.name.replace("'", "''") + "');" for file in files]
target = ROOT / 'db/store-baseline.sql'
target.parent.mkdir(exist_ok=True)
target.write_text('\n\n'.join(output) + '\n', encoding='utf-8')
print(f'Wrote schema for {len(rows)} objects with {len(files)} historical migrations marked as baseline; no product/customer data copied.')
