#!/usr/bin/env bash
set -euo pipefail
# DATABASE_URL must be supplied through a protected environment, never argv.
umask 077
[[ -n "${DATABASE_URL:-}" ]] || { echo 'DATABASE_URL is required.' >&2; exit 1; }
backup_dir=${BACKUP_DIR:-/var/backups/travel-blocks-ai}
retention=${BACKUP_RETENTION_DAYS:-14}
[[ "$retention" =~ ^[0-9]+$ && ${#retention} -le 4 ]] && (( 10#$retention >= 1 && 10#$retention <= 3650 )) || { echo 'Retention must be 1..3650 days.' >&2; exit 1; }
[[ "$backup_dir" = /* && -d "$backup_dir" && ! -L "$backup_dir" ]] || { echo 'BACKUP_DIR must be an existing absolute non-symlink directory.' >&2; exit 1; }
backup_dir=$(realpath -e -- "$backup_dir")
[[ "$backup_dir" != / && "$(basename -- "$backup_dir")" = travel-blocks-ai && -O "$backup_dir" && "$(stat -c %a -- "$backup_dir")" = 700 ]] || { echo 'Use an owned mode-700 directory named travel-blocks-ai.' >&2; exit 1; }
command -v python3 >/dev/null
command -v pg_dump >/dev/null
command -v pg_restore >/dev/null
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || { echo 'Another backup is running.' >&2; exit 1; }
partial=$(mktemp "$backup_dir/.partial.XXXXXXXX")
error_log=
cleanup() { rm -f -- "$partial" "$error_log"; }
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
error_log=$(mktemp "$backup_dir/.error.XXXXXXXX")
# Decode a single-host URI without exposing it in argv or shell evaluation.
# PGDATABASE itself does not expand a URI supplied through the environment.
if ! python3 - "$partial" 2>"$error_log" <<'PYTHON'
import os
import sys
from urllib.parse import parse_qsl, unquote, urlsplit
try:
    url = urlsplit(os.environ['DATABASE_URL'])
    if url.scheme not in ('postgres', 'postgresql') or not url.hostname or not url.path.lstrip('/') or url.fragment:
        raise ValueError('Invalid connection URL')
    env = {k: v for k, v in os.environ.items() if k != 'DATABASE_URL' and (not k.startswith('PG') or k == 'PGPASSFILE')}
    env.update(PGHOST=unquote(url.hostname), PGPORT=str(url.port or 5432),
               PGDATABASE=unquote(url.path[1:]), PGCONNECT_TIMEOUT='10')
    if url.username is not None: env['PGUSER'] = unquote(url.username)
    if url.password is not None: env['PGPASSWORD'] = unquote(url.password)
    allowed = {'sslmode': 'PGSSLMODE', 'sslrootcert': 'PGSSLROOTCERT',
               'sslcert': 'PGSSLCERT', 'sslkey': 'PGSSLKEY',
               'application_name': 'PGAPPNAME', 'channel_binding': 'PGCHANNELBINDING',
               'target_session_attrs': 'PGTARGETSESSIONATTRS'}
    seen = set()
    for key, value in parse_qsl(url.query, keep_blank_values=True, strict_parsing=True):
        if key not in allowed or key in seen: raise ValueError('Unsupported connection option')
        seen.add(key)
        env[allowed[key]] = value
    os.execvpe('pg_dump', ['pg_dump', '--no-password', '--format=custom', '--file=' + sys.argv[1]], env)
except Exception:
    sys.exit(1)
PYTHON
then
  echo 'pg_dump failed; partial archive removed and retention skipped.' >&2
  exit 1
fi
[[ -s "$partial" ]] || { echo 'Empty archive; retention skipped.' >&2; exit 1; }
if ! pg_restore --list "$partial" >/dev/null 2>"$error_log"; then
  echo 'Archive validation failed; retention skipped.' >&2
  exit 1
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$backup_dir/travel-blocks-$stamp-${partial##*.}.dump"
mv -- "$partial" "$final"
# Match only our completed regular archives, at one directory level, after success.
find "$backup_dir" -maxdepth 1 -regextype posix-extended -type f \
  -regex '.*/travel-blocks-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8}\.dump' \
  -mmin +"$((10#$retention * 1440))" -delete
printf 'Backup completed: %s\n' "$final"
