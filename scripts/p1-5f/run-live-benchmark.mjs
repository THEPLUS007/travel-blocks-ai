#!/usr/bin/env node
// Writes only safe aggregate metrics. It never writes prompt text, model content, or authorization values.
import { readFileSync, writeFileSync } from 'node:fs';
import { FINAL_INTENT_FIXTURE_IDS, SMOKE_INTENT_FIXTURE_IDS, gateIntentBenchmark, intentFixturesFor, summarizeIntentBenchmark } from '../../packages/ai/dist/index.js';
import { TravelIntentSchema } from '../../packages/shared/dist/index.js';

const stage = process.argv[2];
if (stage !== 'smoke' && stage !== 'final') throw new Error('usage: run-live-benchmark.mjs smoke|final');
const endpoint = new URL(process.env.LOCAL_BENCHMARK_ENDPOINT ?? 'http://127.0.0.1:11435');
const token = process.env.LOCAL_WRAPPER_TOKEN;
const model = process.env.LOCAL_BENCHMARK_MODEL;
const llamaPid = Number(process.env.LLAMA_SERVER_PID ?? '0');
const resultPath = process.env.P1_5F_RESULT_PATH ?? `/tmp/travel-ai-p1-5f-${stage}-${Date.now()}.json`;
const healthUrl = process.env.PRODUCTION_HEALTH_URL ?? 'http://127.0.0.1:3000/api/v1/health';
if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !token || !model) throw new Error('loopback endpoint, LOCAL_WRAPPER_TOKEN, and LOCAL_BENCHMARK_MODEL are required');
const memAvailable = () => Number((readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m) ?? [])[1] ?? '0') * 1024;
const rss = () => { try { return Number((readFileSync(`/proc/${llamaPid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m) ?? [])[1] ?? '0') * 1024; } catch { return 0; } };
const load = () => readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/).slice(0, 3).map(Number);
const health = async () => { try { return (await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) })).ok; } catch { return false; } };
const fixtures = intentFixturesFor(stage === 'smoke' ? SMOKE_INTENT_FIXTURE_IDS : FINAL_INTENT_FIXTURE_IDS);
const runs = []; let peakRss = rss(); let resourceGuard = false; let productionHealthy = true;
for (const fixture of fixtures) {
  const beforeMem = memAvailable(); const beforeHealth = await health(); productionHealthy &&= beforeHealth;
  const started = performance.now(); let intent; let failureCategory; let outputTokens;
  if (fixture.expected.inputRejected) failureCategory = 'input_rejected';
  else {
    try {
      const response = await fetch(new URL('/v1/generate', endpoint), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ task: 'extract_intent', model, input: { prompt: fixture.prompt } }), signal: AbortSignal.timeout(30_000) });
      outputTokens = Number(response.headers.get('x-local-output-tokens')) || undefined;
      if (!response.ok) failureCategory = 'transport';
      else { const body = await response.json(); const parsed = typeof body?.content === 'string' ? JSON.parse(body.content) : undefined; const validated = TravelIntentSchema.safeParse(parsed); if (validated.success) intent = validated.data; else failureCategory = 'invalid_output'; }
    } catch (error) { failureCategory = error?.name === 'TimeoutError' ? 'timeout' : 'transport'; }
  }
  peakRss = Math.max(peakRss, rss()); const afterMem = memAvailable(); const afterHealth = await health(); productionHealthy &&= afterHealth;
  if (beforeMem < 2 * 1024 ** 3 || afterMem < 2 * 1024 ** 3 || !beforeHealth || !afterHealth) { resourceGuard = true; runs.push({ fixture, latencyMs: Math.round(performance.now() - started), outputTokens, failureCategory: 'resource_guard' }); break; }
  runs.push({ fixture, latencyMs: Math.round(performance.now() - started), outputTokens, intent, failureCategory });
}
const summary = summarizeIntentBenchmark(runs);
const report = { stage, model, startedAt: new Date().toISOString(), externalCalls: { gemini: 0, places: 0, routes: 0, selfHosted: summary.modelCalls, groq: 0, nvidia: 0, openRouter: 0 }, resource: { memAvailableBytes: memAvailable(), peakRssBytes: peakRss, loadAverage: load(), productionHealthy, resourceGuard }, summary, gate: resourceGuard || !productionHealthy ? 'ineligible' : gateIntentBenchmark(summary) };
writeFileSync(resultPath, JSON.stringify(report, null, 2), { mode: 0o600 });
console.info(JSON.stringify({ stage, model, resultPath, gate: report.gate, calls: summary.modelCalls, schemaValidRate: summary.schemaValidRate, fieldAccuracy: summary.fieldAccuracy, p95LatencyMs: summary.p95LatencyMs, productionHealthy }));
