#!/usr/bin/env python3
"""Isolated regression tests: temporary filesystem and fake libpq tools, no live APIs/DB."""
import http.server
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest

REPO = Path(__file__).resolve().parent.parent


class OperationsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="travel-blocks-ops-")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        (self.repo / "scripts").mkdir(parents=True)
        for name in ("deploy-web.sh", "backup-postgres.sh", "smoke-production.sh"):
            shutil.copy2(REPO / "scripts" / name, self.repo / "scripts" / name)
        self.env = dict(os.environ)
        for key in ("DATABASE_URL", "PGDATABASE", "PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE"):
            self.env.pop(key, None)

    def tearDown(self):
        self.temp.cleanup()

    def run_script(self, name, *args, ok=True):
        result = subprocess.run(["bash", str(self.repo / "scripts" / name), *map(str, args)],
                                env=self.env, capture_output=True, text=True, timeout=20)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def build(self):
        dist = self.repo / "apps/web/dist"
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text('<!doctype html><script src="/assets/app-abc123.js"></script>')
        (dist / "assets/app-abc123.js").write_text("version1")
        return dist

    def test_web_missing_build_and_invalid_target_preserve_existing(self):
        target = self.root / "web"
        self.run_script("deploy-web.sh", target, ok=False)
        self.assertFalse(target.exists())
        self.build()
        target.mkdir()
        (target / "sentinel").write_text("keep")
        self.run_script("deploy-web.sh", target, ok=False)
        self.assertEqual((target / "sentinel").read_text(), "keep")
        self.run_script("deploy-web.sh", "/", ok=False)

    def test_web_switch_keeps_old_release_and_copies_only_dist(self):
        dist = self.build()
        (self.repo / "private.txt").write_text("not a web asset")
        target = self.root / "web"
        self.run_script("deploy-web.sh", target)
        old = target.resolve()
        self.assertFalse((target / "private.txt").exists())
        self.assertEqual(old.stat().st_mode & 0o777, 0o755)
        (dist / "assets/app-abc123.js").write_text("version2")
        self.run_script("deploy-web.sh", target)
        self.assertNotEqual(old, target.resolve())
        self.assertEqual((old / "assets/app-abc123.js").read_text(), "version1")
        self.assertEqual((target / "assets/app-abc123.js").read_text(), "version2")
        (dist / "escape").symlink_to(self.root)
        self.run_script("deploy-web.sh", target, ok=False)
        self.assertEqual((target / "assets/app-abc123.js").read_text(), "version2")

    def test_web_failed_copy_preserves_published_release(self):
        self.build()
        target = self.root / "web"
        self.run_script("deploy-web.sh", target)
        old = target.resolve()
        tools = self.root / "broken-tools"
        tools.mkdir()
        cp = tools / "cp"
        cp.write_text('#!/usr/bin/env bash\nexit 1\n')
        cp.chmod(0o755)
        self.env["PATH"] = str(tools) + os.pathsep + self.env["PATH"]
        self.run_script("deploy-web.sh", target, ok=False)
        self.assertEqual(target.resolve(), old)
        self.assertEqual(list(self.root.glob("web.release.*")), [old])

    def backup_setup(self):
        backup = self.root / "travel-blocks-ai"
        backup.mkdir(mode=0o700)
        tools = self.root / "bin"
        tools.mkdir()
        dump = tools / "pg_dump"
        dump.write_text('''#!/usr/bin/env bash
set -eu
[[ "$PGDATABASE" = test && "$PGHOST" = localhost && "$PGUSER" = test && "$PGPASSWORD" = fixture-password ]]
for arg in "$@"; do
  [[ "$arg" != *fixture-password* ]]
  case "$arg" in --file=*) output=${arg#--file=} ;; esac
done
printf 'custom-archive-fixture' > "$output"
if [[ "${FAIL_DUMP:-0}" = 1 ]]; then echo 'fixture-password' >&2; exit 1; fi
''')
        dump.chmod(0o755)
        restore = tools / "pg_restore"
        restore.write_text('#!/usr/bin/env bash\n[[ "${FAIL_RESTORE:-0}" != 1 ]]\n')
        restore.chmod(0o755)
        self.env.update(PATH=str(tools) + os.pathsep + self.env["PATH"],
                        DATABASE_URL="postgresql://test:fixture-password@localhost/test",
                        BACKUP_DIR=str(backup), BACKUP_RETENTION_DAYS="14")
        return backup

    def old_archive(self, backup):
        old = backup / "travel-blocks-20000101T000000Z-abcdefgh.dump"
        old.write_text("old")
        os.utime(old, (time.time() - 20 * 86400,) * 2)
        return old

    def test_backup_permissions_and_scoped_retention(self):
        backup = self.backup_setup()
        old = self.old_archive(backup)
        unrelated = backup / "do-not-delete.dump"
        unrelated.write_text("keep")
        os.utime(unrelated, (time.time() - 20 * 86400,) * 2)
        nested = backup / "nested"
        nested.mkdir()
        nested_old = self.old_archive(nested)
        (backup / "travel-blocks-20000101T000000Z-ijklmnop.dump").symlink_to(unrelated)
        self.run_script("backup-postgres.sh")
        self.assertFalse(old.exists())
        self.assertTrue(unrelated.exists())
        self.assertTrue(nested_old.exists())
        archives = [p for p in backup.glob("travel-blocks-*.dump") if not p.is_symlink()]
        self.assertEqual(len(archives), 1)
        self.assertEqual(archives[0].stat().st_mode & 0o777, 0o600)
        self.assertFalse(list(backup.glob(".partial.*")))
        self.assertFalse(list(backup.glob(".error.*")))

    def test_backup_failure_cleans_partial_and_skips_retention(self):
        backup = self.backup_setup()
        old = self.old_archive(backup)
        for flag in ("FAIL_DUMP", "FAIL_RESTORE"):
            self.env[flag] = "1"
            result = self.run_script("backup-postgres.sh", ok=False)
            self.assertNotIn("fixture-password", result.stdout + result.stderr)
            self.assertTrue(old.exists())
            self.assertFalse(list(backup.glob(".partial.*")))
            self.assertFalse(list(backup.glob(".error.*")))
            self.env.pop(flag)

    def test_backup_decodes_uri_and_rejects_unknown_options(self):
        backup = self.backup_setup()
        self.env["DATABASE_URL"] = "postgresql://%74est:fixture%2Dpassword@localhost/%74est?sslmode=require"
        self.run_script("backup-postgres.sh")
        count = len(list(backup.glob("*.dump")))
        self.env["DATABASE_URL"] += "&unsupported=secret-value"
        result = self.run_script("backup-postgres.sh", ok=False)
        self.assertNotIn("secret-value", result.stdout + result.stderr)
        self.assertEqual(len(list(backup.glob("*.dump"))), count)

    def test_backup_rejects_unsafe_path_and_retention(self):
        backup = self.backup_setup()
        for invalid in ("0", "-1", "abc", "99999"):
            self.env["BACKUP_RETENTION_DAYS"] = invalid
            self.run_script("backup-postgres.sh", ok=False)
        self.env["BACKUP_RETENTION_DAYS"] = "14"
        for invalid in ("/", str(self.root), "relative"):
            self.env["BACKUP_DIR"] = invalid
            self.run_script("backup-postgres.sh", ok=False)
        self.env["BACKUP_DIR"] = str(backup)
        backup.chmod(0o755)
        self.run_script("backup-postgres.sh", ok=False)

    def test_smoke_validates_json_status_and_rejects_redirects(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            failure = None
            def do_GET(self):
                bodies = {"/": ("text/html", '<!doctype html><html></html>'),
                          "/api/v1/health": ("application/json", '{"status":"ok"}'),
                          "/api/v1/ready": ("application/json", '{"status":"ready"}')}
                content_type, body = bodies[self.path]
                status = 200
                if self.path == "/api/v1/ready":
                    if self.failure == "json": body = '{"status":"wrong"}'
                    if self.failure == "redirect": status = 302
                    if self.failure == "unready": status = 503
                    if self.failure == "html": content_type, body = "text/html", '<!doctype html>'
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.end_headers()
                self.wfile.write(body.encode())
            def log_message(self, *args):
                pass
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}"
                self.run_script("smoke-production.sh", base)
                for failure in ("json", "redirect", "unready", "html"):
                    Handler.failure = failure
                    self.run_script("smoke-production.sh", base, ok=False)
                self.run_script("smoke-production.sh", "https://user:password@example.com", ok=False)
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    unittest.main(verbosity=2)
