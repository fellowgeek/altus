"""Install the editable Altus landing page into an existing project database."""
from pathlib import Path
import argparse
import sqlite3
import time

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--database', type=Path, help='Existing database path (relative to the current directory)')
args = parser.parse_args()
if args.database:
    database = args.database.resolve()
else:
    candidates = [path for path in [root / 'data.sqlite3', root / 'var/data.sqlite3'] if path.is_file()]
    if len(candidates) != 1:
        raise SystemExit('Specify --database: exactly one existing database could not be identified.')
    database = candidates[0]
if not database.is_file():
    raise SystemExit('Existing data.sqlite3 is required.')
backup_dir = root / 'var/log' if database.parent == root / 'var' else root / 'logs'
backup = backup_dir / ('before-landing-' + str(time.time_ns()) + '.sqlite3')
backup.parent.mkdir(exist_ok=True)
with sqlite3.connect(database) as connection:
    with sqlite3.connect(backup) as destination:
        connection.backup(destination)
    connection.execute('''
        INSERT INTO Pages (URL, TITLE, TEXT, THEME, LAYOUT, STATUS, PERMISSIONS)
        VALUES ('/', 'Your personal cloud', ?, 'altus-site', 'index', 1, -1)
        ON CONFLICT(URL) DO UPDATE SET TITLE=excluded.TITLE, TEXT=excluded.TEXT,
            THEME=excluded.THEME, LAYOUT=excluded.LAYOUT,
            STATUS=excluded.STATUS, PERMISSIONS=excluded.PERMISSIONS
    ''', ((root / 'private/cms/landing.html').read_text(),))
print(f'Landing page installed. Database backup: {backup.name}')
