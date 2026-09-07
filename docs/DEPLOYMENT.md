# Production deployment runbook

## Scope and architecture

Phase 4 prepares this repository; **all privileged commands below are phase 5 operator instructions, not automatic installation**. Do not run them until the domain, secrets, backups and release are approved for the actual server.

```text
Internet → Nginx :80/:443 → /var/www/travel-blocks-ai (web release symlink)
                       └→ /api/* → Fastify 127.0.0.1:3000 → local PostgreSQL
                                                        → Gemini / Places
```

Only Nginx is publicly reachable. Do not publish port 3000 or PostgreSQL. Web and API share one HTTPS origin. `npm run preview` and `npm run serve -w @travel-blocks/web` are **local preview / Playwright only**, never production services. Production is `npm run build` → `apps/web/dist` → `scripts/deploy-web.sh` → Nginx. Production Vite build uses `--base=/`; nested SPA URLs must resolve both assets and API from the origin root. Development Vite retains relative code-server preview support.

## Phase 5 prerequisites and paths

- Supported Node is `>=22.12 <23`; `.nvmrc` is the exact tested version (22.23.2). This phase's host default was Node 20.20.2; it was not replaced. Local validation used an already cached Node 22 binary, which is **not** a production service runtime.
- Provision a stable, operator-maintained Node 22 installation outside user home/cache, for example `/opt/node22/bin/node`. Verify `command -v node`, `readlink -f "$(command -v node)"`, `node --version`, `npm --version`, and `/opt/node22/bin/node --version`. Use its `bin` directory on PATH for install/build/migration. Replace both service runtime paths if another stable path is chosen. systemd does not run nvm shell initialization, npm exec or npx downloads. The service checks the Node major/minor before startup.
- Source work in this session is only `/home/ubuntu/submission/travel-blocks-ai`. Production uses a **separate release layout**: `/srv/travel-blocks-ai/releases/RELEASE_ID`, with `/srv/travel-blocks-ai/current` pointing at the selected complete release. Export the selected tracked commit into an empty release directory (for example `git archive COMMIT | tar -x -C RELEASE_DIR`), then install/build there. No `.env` or untracked files travel with the release. Keep previous complete releases and their commit IDs for rollback.
- Provision non-login users `travel-blocks` (API) and `travel-blocks-backup` (backup). The API needs read/execute access to release code and runtime, not write access. Never run the API as root. `ProtectHome=true` intentionally prevents serving from a user's checkout.
- Provision `/etc/travel-blocks-ai` root-owned mode 700, and root-owned mode 600 `/etc/travel-blocks-ai/travel-blocks-ai.env` from `.env.example`, edited securely on the host. systemd reads it as the service manager. No `export`, shell substitution, inline secrets in unit files, shell history, or Git. Never print the file or `systemctl show ... Environment`. All supported API settings should be explicitly supplied to prevent accidental fallback to a checkout `.env`. Keep `.env` out of production releases.
- Use `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=3000`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`. Do not also define `PORT`: the existing loader gives `PORT` precedence over `API_PORT`. `WEB_ORIGIN` is reserved and does not configure CORS; deployment is same-origin. `GEMINI_INTENT_MODEL` may be empty to inherit `GEMINI_MODEL`. Configure real provider keys only on the host. There is no `SESSION_SECRET` setting.
- Provision a separate root-owned mode 600 `/etc/travel-blocks-ai/backup.env` from `deploy/backup.env.example`, with only backup settings. Its database role needs read access to all application data/schema. The API service does not receive backup settings and the backup service does not receive provider keys.
- Python 3 (standard library only), Bash/GNU coreutils/findutils/util-linux and compatible `pg_dump`/`pg_restore` clients are required for the operational scripts, alongside the PostgreSQL server. Use the server's major version or a supported newer client; do not dump a newer server using an older client. CI uses PostgreSQL 16. No production credentials are needed in GitHub Actions.

Example **phase 5** directory preparation, after creating the service accounts (choose the deployment operator/group explicitly):

```bash
sudo install -d -o root -g root -m 700 /etc/travel-blocks-ai
sudo install -d -o travel-blocks-backup -g travel-blocks-backup -m 700 /var/backups/travel-blocks-ai
# Set a reviewed deployment owner on /var/www and /srv release parent directories.
# Do not grant the API user write access to code or web releases.
```

On the first deployment, prepare the complete initial release and select the `current` symlink before invoking the backup unit, which resolves its script there; do not start the API until migration finishes. Install the reviewed backup unit before checklist step 5. On subsequent deployments, retain the known-good `current` release until switch-over.

The deploy script needs write access to the web target's parent. A dedicated deployment-owned parent can be used instead of granting write access to all `/var/www`; change the Nginx root and script target together. Never place source/config/secrets in the web root.

## Release checklist (phase 5 only)

Run Git checks in `/home/ubuntu/submission/travel-blocks-ai`; run npm/build/migration commands in the chosen new release directory. Abort on any failed check. Prepare and verify a known-good rollback release before changing the active symlink.

1. `pwd`, `git status --short --branch`, `git fetch origin`, `git rev-parse HEAD`, `git rev-parse origin/main`; require clean tree and expected reviewed commit. Record the old API release and `readlink /var/www/travel-blocks-ai` in the deployment record.
2. Verify the stable Node runtime as above, put it on PATH, and export the reviewed commit to the new release directory.
3. `npm ci` (include dev tools needed for migration/build).
4. `npm run verify` and `npm audit --omit=dev`; CI Quality, E2E and PostgreSQL must also be green for this commit.
5. Take a backup with the provisioned one-shot unit: `sudo systemctl start travel-blocks-backup.service`. Check exit status and backup completion in journald; perform the separate restore drill below. This is a phase 5 production backup, never part of phase 4.
6. Run `npm run migrate -w @travel-blocks/api` in the new release with `DATABASE_URL` supplied by a protected operator environment. Do not paste a connection URI in the command line. Migration uses Drizzle's checked-in `apps/api/drizzle` history and records applied migrations in `drizzle.__drizzle_migrations`; re-running applies only pending migrations. Coordinate downtime/writes for schema changes; do not assume old code remains compatible.
7. `npm run build` in the new release. Confirm `apps/api/dist/server.js`, `apps/web/dist/index.html` and assets exist.
8. `bash scripts/deploy-web.sh /var/www/travel-blocks-ai` from the new release. It copies only dist into a same-parent temporary release, checks basic build completeness, rejects source symlinks, sets readable static permissions and renames a prepared symlink atomically. No sudo inside the script. Existing real target directories are refused. Keep builds immutable during copy; serialize deployments. Review/retire old static releases manually after the rollback window. Old browser tabs may need reload after deployment; assets from older releases are not merged into the current release.
9. Atomically select the new `/srv/travel-blocks-ai/current` symlink (prepare a sibling symlink and `mv -Tf` it into place). Install the reviewed API unit on first deployment, then `sudo systemctl daemon-reload` and `sudo systemctl restart travel-blocks-api.service`. First install may use `sudo systemctl enable --now travel-blocks-api.service` after prerequisites. `sudo systemctl status travel-blocks-api.service --no-pager` and `sudo journalctl -u travel-blocks-api.service -n 50 --no-pager` check startup without dumping environment. The service sends SIGTERM; existing code closes Fastify/pool with a 10-second forced exit, and systemd allows 15 seconds. Long in-flight AI requests can be interrupted during a restart. PostgreSQL is ordered with `Wants`/`After`; the application's DB check and restart policy handle readiness, not unit ordering alone. After five failed starts in 60 seconds, resolve the cause and use `systemctl reset-failed` before retrying.
10. Install the domain-specific reviewed Nginx config **only in phase 5**, then `sudo nginx -t`. Do not blindly replace a working TLS site with the HTTP bootstrap on later releases.
11. Only on successful syntax validation: `sudo systemctl reload nginx`.
12. `curl --fail --silent --show-error https://YOUR_DOMAIN/api/v1/health` → HTTP 200, `{"status":"ok"}`.
13. `curl --fail --silent --show-error https://YOUR_DOMAIN/api/v1/ready` → HTTP 200, `{"status":"ready"}`. Readiness checks schema/data access, not provider availability.
14. `bash scripts/smoke-production.sh https://YOUR_DOMAIN`. Then test create/save/reopen with the same browser session, restart the API, and reload that saved trip. Check ownership isolation with a different session. This persistence smoke writes data; use an operator test trip and remove it afterward.

Steps 12–14 on first deployment follow the HTTPS bootstrap below. Do not weaken secure cookies for HTTP bootstrap; HTTP is only for ACME/network checks until TLS is ready. The standard smoke checks HTML, status code, health/readiness JSON, rejects redirects, and never calls billing APIs. Production Gemini/Places validation is a **separate explicitly authorized phase 5 task**: use the documented API/UI flows in `docs/API.md` with an operator session; verify real place provenance and AI output, then inspect sanitized telemetry. No live provider workflow is installed.

## Nginx and HTTPS bootstrap (phase 5)

`deploy/nginx/travel-blocks-ai.conf` is an HTTP bootstrap site with explicit `YOUR_DOMAIN`. It is not a certificate-bearing configuration. Preserve its locations when adding TLS.

1. Choose a real domain; configure DNS A (and AAAA only if IPv6 actually works) to the server. Confirm resolution from outside. Confirm public TCP 80/443 reach Nginx; keep 3000/5432 private. Firewall and DNS changes are phase 5 operator work.
2. Replace `YOUR_DOMAIN` in a reviewed copy. Provision `/var/www/letsencrypt` for ACME webroot. Install the site under `/etc/nginx/sites-available/`, enable its link, test `sudo nginx -t`, then reload. Fetch a test file under `http://YOUR_DOMAIN/.well-known/acme-challenge/` externally before issuance. Do not install a redirect-only site yet.
3. Install Certbot using its official platform instructions. Issue without changing the site automatically:
   `sudo certbot certonly --webroot -w /var/www/letsencrypt -d YOUR_DOMAIN`
   Certificate/key remain under `/etc/letsencrypt/live/YOUR_DOMAIN/` and never enter Git or a web release.
4. In the reviewed site copy, keep the complete static/API location set but change its listeners to `listen 443 ssl;` and `listen [::]:443 ssl;`. Add:

   ```nginx
   ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
   ssl_protocols TLSv1.2 TLSv1.3;
   ```

   Keep a **separate HTTP server with the original bootstrap behavior** while testing TLS. Run `sudo nginx -t`, reload, validate certificate chain/hostname/expiry without `curl -k`, and run the HTTPS smoke. Verify secure session cookies in the browser.
5. Only after HTTPS passes, replace the HTTP server's non-ACME locations with this redirect configuration. Keep the full application locations in the TLS server:

   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name YOUR_DOMAIN;
       location ^~ /.well-known/acme-challenge/ {
           root /var/www/letsencrypt;
           try_files $uri =404;
       }
       location / { return 308 https://YOUR_DOMAIN$request_uri; }
   }
   ```

   Run `sudo nginx -t` and reload. Check HTTP redirects and HTTPS smoke again. Test renewal with `sudo certbot renew --dry-run`; confirm the platform renewal timer and install a reviewed deploy hook that runs `nginx -t && systemctl reload nginx` after renewal. No certificate issuance/renewal commands run in phase 4.
6. HSTS is initially **off**, including on proxied API responses (upstream Helmet HSTS is hidden). After verified HTTPS and a successful renewal drill, optionally add `add_header Strict-Transport-Security "max-age=300" always;` to **each TLS location that emits responses**, including API/static locations. Nginx location-level `add_header` blocks override parent inheritance on commonly deployed versions; a server-only HSTS line is insufficient for the static locations here. Review coverage via `curl -I` for `/`, `/index.html`, a real asset and `/api/v1/health`. Increase lifetime gradually. Do not initially use `includeSubDomains` or `preload`; browsers remember HSTS and removal is not immediate.

Proxy semantics: `proxy_pass http://127.0.0.1:3000;` has no URI suffix, so `/api/v1/health` remains `/api/v1/health`; adding a trailing slash would strip `/api/`. `^~ /api/` prevents SPA fallback even for nonexistent API routes; `/api` redirects to `/api/`. Client forwarding chains are replaced at this sole edge because `TRUST_PROXY=true` must never trust arbitrary direct internet requests. If another proxy/CDN is added, redesign trust explicitly.

Limits: Nginx 64k matches Fastify's 64 KiB bodyLimit. Body/send timeouts are 30 seconds and connect timeout is 5 seconds. Fastify `requestTimeout=30000` limits receiving a request, **not total provider execution**. The 120-second upstream read timeout accommodates default Gemini 15-second attempts with up to two retries and sequential tasks, plus 10-second Places calls; it is an idle response timeout, not an unlimited execution allowance. The browser also aborts at 120 seconds. Changing provider timeout/retry settings requires reviewing the whole latency budget; an edge timeout does not cancel all upstream work.

Header ownership: Helmet owns API security headers except HSTS; Nginx adds static `nosniff`, cache policy and, only after TLS validation, HSTS. No conflicting second CSP or frame policy is added to API responses. Fingerprinted `/assets/` gets a one-year immutable cache; `index.html` and SPA responses use `no-cache` for revalidation. Missing assets return 404, never HTML.

## Backup and restore drill

`scripts/backup-postgres.sh` reads `DATABASE_URL` from a protected environment. It parses a single-host PostgreSQL URL with Python standard library and execs pg_dump using libpq environment variables, keeping credentials out of argv. URL options accepted are `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `application_name`, `channel_binding` and `target_session_attrs`; unsupported or repeated options fail closed. A protected `PGPASSFILE` may supply a password when the URL omits it. Connection timeout is 10 seconds; never use `set -x`, environment dumps or verbose HTTP traces. It creates a custom-format `pg_dump` under an existing owned mode-700 directory named `travel-blocks-ai`, with umask 077 and mode-600 archives. It serializes with `flock`, verifies the archive TOC, removes partial/error files on failure, and only applies retention after a successful dump. Errors are summarized to avoid leaking credentials from libpq diagnostics. Monitor nonzero unit exits, disk space, archive sizes and restore drills; TOC validation alone is not a restore test. A SIGKILL/power loss may leave hidden partial files; review and remove these manually when no backup is running.

Backup-only settings: `DATABASE_URL`, `BACKUP_DIR` (default `/var/backups/travel-blocks-ai`), `BACKUP_RETENTION_DAYS` (default 14, accepted 1–3650). Retention deletes only this script's timestamped completed regular archives directly in the validated directory, older than the configured days. Unrelated files, subdirectories and symlinks are untouched. Keep encrypted off-host copies with independent access/retention and periodically test them; a same-host dump alone does not protect against host loss. Dumps contain user data and must never be uploaded as CI artifacts or committed.

Install the backup service/timer templates in phase 5 only after credentials, directory, client and restore validation are ready. Run the one-shot unit first; daily schedule is 03:00 UTC plus up to 15 minutes jitter, persistent after downtime. Decide `sudo systemctl enable --now travel-blocks-backup.timer` explicitly during deployment and verify `systemctl list-timers`. The one-shot has a one-hour timeout; review it against actual data size and alert on failures.

Restore **only into a new dedicated test DB**, ideally on an isolated test PostgreSQL instance with limited access. Supply `PGHOST`, `PGPORT`, `PGUSER` and a mode-600 `PGPASSFILE` through protected operator configuration. Do not reuse an existing database or run `--clean` against production. An archive does not include cluster roles/configuration; provision those separately as needed.

```bash
# ARCHIVE is an explicitly selected successful backup pathname, not a credential.
pg_restore --list "$ARCHIVE" > /tmp/restore-toc.txt
createdb --template=template0 dedicated_restore_test
pg_restore --exit-on-error --no-owner --no-privileges --dbname=dedicated_restore_test "$ARCHIVE"
psql --dbname=dedicated_restore_test -v ON_ERROR_STOP=1 -c '\dt'
psql --dbname=dedicated_restore_test -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM drizzle.__drizzle_migrations;'
# Supply DATABASE_URL for dedicated_restore_test via a protected environment.
# Double-check destination by name without printing its URI, then:
npm run build:packages
npm run test:postgres
```

Protect the TOC output (use `umask 077` in this operator shell) and remove it after review. Run the integration test only after setting its dedicated-test `DATABASE_URL`; it invokes the same database readiness check, persists/reloads a complex trip through a recreated repository, verifies ownership and cleans its test rows. Compare backed-up table counts and selected operator-owned trip IDs against the restored copy using protected SQL output. A production archive must not be exposed through a public test API.

For HTTP readiness testing, start a separate built API on loopback port 3001 with that restore-test `DATABASE_URL`, `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=3001`, no `PORT`, and empty provider keys; query `http://127.0.0.1:3001/api/v1/ready`, then stop it. Never connect this test process to production. After checking restored data and repository persistence, remove the dedicated restore database only with explicit operator review. CI automatically tests backup → separate restore DB → readiness/persistence in its ephemeral container, without live providers.

## Rollback

Record prior known-good API release, static release, commit and migration version before deployment. For code rollback, redeploy the prior complete build or rebuild the prior reviewed commit in a separate release; select prior API/static symlinks, restart the API, and verify health/readiness and persistence. Do not rewrite repository history or mix old dependencies with new builds. Keep deployments serialized; switching web and API cannot be one filesystem transaction, so plan a maintenance window for incompatible contracts.

**Code rollback is not database rollback.** Migrations may be forward-only or destructive. Inspect schema compatibility first. If a DB rollback is required, stop writes, preserve the current state, and follow an operator-reviewed recovery plan using the verified pre-migration backup. Prefer restore into a separate replacement DB, validate it, then deliberately switch connection configuration. Account for writes since the backup. There is no automatic destructive rollback script.

## Validation CI and test scope

`.github/workflows/ci.yml` runs on PRs and pushes to main with read-only repository permissions. Official checkout/setup-node v6 actions are pinned to verified tag SHAs, and `.nvmrc` selects the application runtime. There is no deployment job and no production secret reference.

- Quality: `npm ci`, `npm run verify` (lint/typecheck/unit/API/MCP/build), production audit, shell syntax and operational regression tests.
- E2E: workspace package build, Playwright Chromium install and existing app-contract E2E. It uses test AI/Place providers and a memory repository, never billing APIs.
- PostgreSQL: ephemeral PostgreSQL 16 service with health check, package build, checked-in migration, integration test, custom backup and separate DB restore, then the integration test again. Migration must precede the tests: `checkDatabase` expects schema tables.

Local baseline: Node from `.nvmrc`, `npm ci`, `npm run verify`, `npm run test:e2e`, `npm audit --omit=dev`, `for script in scripts/*.sh; do bash -n "$script"; done`, `python3 scripts/test-operations.py`. Real Nginx syntax requires an installed Nginx binary; never write `/etc/nginx` just to test a repository template. Check a temporary full config with `nginx -t -c ABSOLUTE_TEMP_CONFIG -p TEMP_PREFIX` if available. The template needs an `http` wrapper and mime types for this test. Phase 5 always requires `sudo nginx -t` before reload.

## Official references

- [Nginx proxy_pass and timeout semantics](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Nginx header inheritance](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [Certbot webroot and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) and [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [GitHub Node.js validation workflow](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
