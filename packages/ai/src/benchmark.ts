import type { TravelIntent } from '@travel-blocks/shared';
import type { IntentBenchmarkFixture } from './intentBenchmarkFixtures.js';

export const INTENT_BENCHMARK_DATASET_VERSION = 'p1-5f-intent-v1' as const;
export const INTENT_BENCHMARK_GATE = Object.freeze({ minimumSamples: 20, schemaValidRate: 0.95, fieldAccuracy: 0.90, maxFailureRate: 0.05, maxTimeoutRate: 0.05, maxP95LatencyMs: 30_000, maxHallucinations: 0 });
export type BenchmarkFailureCategory = 'timeout' | 'invalid_output' | 'transport' | 'input_rejected' | 'resource_guard';
export interface IntentBenchmarkRun { readonly fixture: IntentBenchmarkFixture; readonly latencyMs: number; readonly outputTokens?: number; readonly intent?: TravelIntent; readonly failureCategory?: BenchmarkFailureCategory; }
export interface IntentFixtureResult { readonly fixtureId: string; readonly schemaValid: boolean; readonly fieldChecks: readonly boolean[]; readonly hallucinations: number; readonly latencyMs: number; readonly outputTokens?: number; readonly failureCategory?: BenchmarkFailureCategory; }
export interface IntentBenchmarkSummary { readonly datasetVersion: typeof INTENT_BENCHMARK_DATASET_VERSION; readonly samples: number; readonly modelCalls: number; readonly schemaValidRate: number; readonly fieldAccuracy: number; readonly hallucinationCount: number; readonly meanLatencyMs: number; readonly p50LatencyMs: number; readonly p95LatencyMs: number; readonly timeoutRate: number; readonly failureRate: number; readonly meanOutputTokens?: number; readonly failures: Readonly<Record<string, number>>; readonly results: readonly IntentFixtureResult[]; }
export type IntentBenchmarkGate = 'eligible' | 'ineligible' | 'insufficient_evidence';

const normalized = (value: string | undefined) => value?.trim().toLocaleLowerCase();
const same = (actual: string | undefined, expected: string) => normalized(actual) === normalized(expected);
const includes = (actual: readonly string[], expected: string) => actual.some((item) => normalized(item)?.includes(normalized(expected) ?? ''));
const percentile = (numbers: readonly number[], fraction: number) => {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]!;
};

function evaluateRun(run: IntentBenchmarkRun): IntentFixtureResult {
  const { fixture, intent } = run;
  if (fixture.expected.inputRejected) return { fixtureId: fixture.id, schemaValid: run.failureCategory === 'input_rejected', fieldChecks: [run.failureCategory === 'input_rejected'], hallucinations: 0, latencyMs: run.latencyMs, outputTokens: run.outputTokens, failureCategory: run.failureCategory };
  if (!intent) return { fixtureId: fixture.id, schemaValid: false, fieldChecks: [], hallucinations: 0, latencyMs: run.latencyMs, outputTokens: run.outputTokens, failureCategory: run.failureCategory ?? 'transport' };
  const expected = fixture.expected;
  const checks: boolean[] = [];
  if (expected.city) checks.push(same(intent.destination?.city, expected.city));
  if (expected.country) checks.push(same(intent.destination?.country, expected.country));
  if (expected.durationDays !== undefined) checks.push(intent.durationDays === expected.durationDays);
  if (expected.travelersCount !== undefined) checks.push(intent.travelers?.count === expected.travelersCount);
  if (expected.companionType) checks.push(same(intent.travelers?.companionType, expected.companionType));
  if (expected.budgetAmount !== undefined) checks.push(intent.budget?.amount === expected.budgetAmount);
  if (expected.budgetCurrency) checks.push(same(intent.budget?.currency, expected.budgetCurrency));
  for (const preference of expected.preferences ?? []) checks.push(includes(intent.preferences, preference));
  for (const category of expected.categories ?? []) checks.push(intent.requestedCategories.includes(category as never));
  // Date information has no field in the stable TravelIntent schema. It is a scored
  // contract gap: accepting it silently would falsely certify a local model.
  if (expected.dateMentioned) checks.push(false);
  const noFacts = !intent.destination && !intent.durationDays && !intent.travelers && !intent.budget && intent.preferences.length === 0 && intent.avoidances.length === 0 && intent.requestedCategories.length === 0 && !intent.mobilityPreference;
  if (expected.expectNoTravelFacts) checks.push(noFacts);
  return { fixtureId: fixture.id, schemaValid: true, fieldChecks: checks, hallucinations: expected.expectNoTravelFacts && !noFacts ? 1 : 0, latencyMs: run.latencyMs, outputTokens: run.outputTokens };
}

export function summarizeIntentBenchmark(runs: readonly IntentBenchmarkRun[]): IntentBenchmarkSummary {
  const results = runs.map(evaluateRun);
  const modelResults = results.filter((result) => result.failureCategory !== 'input_rejected');
  const fieldChecks = results.flatMap((result) => result.fieldChecks);
  const latencies = modelResults.map((result) => result.latencyMs);
  const tokens = modelResults.flatMap((result) => result.outputTokens === undefined ? [] : [result.outputTokens]);
  const failures = results.reduce<Record<string, number>>((all, result) => { if (result.failureCategory && result.failureCategory !== 'input_rejected') all[result.failureCategory] = (all[result.failureCategory] ?? 0) + 1; return all; }, {});
  const failed = modelResults.filter((result) => !result.schemaValid).length;
  return {
    datasetVersion: INTENT_BENCHMARK_DATASET_VERSION, samples: results.length, modelCalls: modelResults.length,
    schemaValidRate: modelResults.length ? modelResults.filter((result) => result.schemaValid).length / modelResults.length : 0,
    fieldAccuracy: fieldChecks.length ? fieldChecks.filter(Boolean).length / fieldChecks.length : 0,
    hallucinationCount: results.reduce((sum, result) => sum + result.hallucinations, 0),
    meanLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
    p50LatencyMs: percentile(latencies, 0.5), p95LatencyMs: percentile(latencies, 0.95),
    timeoutRate: modelResults.length ? (failures.timeout ?? 0) / modelResults.length : 0,
    failureRate: modelResults.length ? failed / modelResults.length : 0,
    ...(tokens.length ? { meanOutputTokens: tokens.reduce((sum, value) => sum + value, 0) / tokens.length } : {}), failures, results,
  };
}

export function gateIntentBenchmark(summary: IntentBenchmarkSummary): IntentBenchmarkGate {
  if (summary.modelCalls < INTENT_BENCHMARK_GATE.minimumSamples) return 'insufficient_evidence';
  if (summary.schemaValidRate < INTENT_BENCHMARK_GATE.schemaValidRate || summary.fieldAccuracy < INTENT_BENCHMARK_GATE.fieldAccuracy || summary.failureRate > INTENT_BENCHMARK_GATE.maxFailureRate || summary.timeoutRate > INTENT_BENCHMARK_GATE.maxTimeoutRate || summary.p95LatencyMs > INTENT_BENCHMARK_GATE.maxP95LatencyMs || summary.hallucinationCount > INTENT_BENCHMARK_GATE.maxHallucinations) return 'ineligible';
  return 'eligible';
}
