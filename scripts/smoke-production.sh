#!/usr/bin/env bash
set -euo pipefail
base=${1:-${BASE_URL:-}}
[[ -n "$base" ]] || { echo 'Usage: smoke-production.sh https://YOUR_DOMAIN' >&2; exit 1; }
# Node 22 is already a deployment prerequisite. Do not print response bodies.
BASE_URL="$base" node --input-type=module <<'JS'
let base;
try {
  base = new URL(process.env.BASE_URL);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error();
  if (base.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error();
} catch { console.error('Use an HTTPS origin (HTTP allowed only on loopback).'); process.exit(1); }
for (const [path, expected] of [['/', null], ['/api/v1/health', 'ok'], ['/api/v1/ready', 'ready']]) {
  try {
    const response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) throw new Error();
    const type = response.headers.get('content-type') || '';
    if (expected) {
      if (!type.includes('application/json') || (await response.json()).status !== expected) throw new Error();
    } else if (!type.includes('text/html') || !/<!doctype html/i.test(await response.text())) throw new Error();
    console.log(`PASS ${path}`);
  } catch { console.error(`FAIL ${path}: expected HTTP 200 and valid ${expected ? 'status JSON' : 'HTML'}`); process.exit(1); }
}
JS
