import { describe, expect, it } from 'vitest';
import { gateIntentBenchmark, INTENT_BENCHMARK_FIXTURES, INTENT_BENCHMARK_GATE, summarizeIntentBenchmark } from '../src/index.js';

const base = { preferences: [], avoidances: [], requestedCategories: [] as const };
describe('P1-5F provider-neutral intent benchmark', () => {
  it('contains 32+ synthetic fixtures, a stratified six-sample smoke set, and a twenty-sample final set', async () => {
    const { SMOKE_INTENT_FIXTURE_IDS, FINAL_INTENT_FIXTURE_IDS } = await import('../src/index.js');
    expect(INTENT_BENCHMARK_FIXTURES).toHaveLength(34);
    expect(new Set(INTENT_BENCHMARK_FIXTURES.map((fixture) => fixture.stratum))).toEqual(new Set(['clear', 'ambiguous', 'missing', 'adversarial', 'boundary']));
    expect(SMOKE_INTENT_FIXTURE_IDS).toHaveLength(6);
    expect(FINAL_INTENT_FIXTURE_IDS).toHaveLength(INTENT_BENCHMARK_GATE.minimumSamples);
  });
  it('does not certify a date-bearing fixture when the stable intent contract has no date field', () => {
    const fixture = INTENT_BENCHMARK_FIXTURES.find((item) => item.id === 'INT-001')!;
    const summary = summarizeIntentBenchmark([{ fixture, latencyMs: 10, intent: { destination: { city: '서울' }, durationDays: 3, travelers: { count: 2, companionType: '친구' }, budget: { amount: 600000 }, preferences: ['맛집', '관광'], avoidances: [], requestedCategories: ['food', 'sightseeing'] } }]);
    expect(summary.schemaValidRate).toBe(1); expect(summary.fieldAccuracy).toBeLessThan(1); expect(gateIntentBenchmark(summary)).toBe('insufficient_evidence');
  });
  it('returns known pass, known fail, and insufficient-evidence decisions deterministically', () => {
    const runs = INTENT_BENCHMARK_FIXTURES.filter((fixture) => !fixture.expected.inputRejected).slice(0, 20).map((fixture) => ({ fixture, latencyMs: 10, outputTokens: 1, intent: fixture.expected.expectNoTravelFacts ? { ...base } : { ...base, destination: fixture.expected.city ? { city: fixture.expected.city } : undefined, durationDays: fixture.expected.durationDays, travelers: fixture.expected.travelersCount === undefined && !fixture.expected.companionType ? undefined : { count: fixture.expected.travelersCount, companionType: fixture.expected.companionType }, budget: fixture.expected.budgetAmount === undefined && !fixture.expected.budgetCurrency ? undefined : { amount: fixture.expected.budgetAmount, currency: fixture.expected.budgetCurrency }, preferences: [...(fixture.expected.preferences ?? [])], requestedCategories: [...(fixture.expected.categories ?? [])] } }));
    const withoutDate = runs.map((run) => ({ ...run, fixture: { ...run.fixture, expected: { ...run.fixture.expected, dateMentioned: false } }}));
    expect(gateIntentBenchmark(summarizeIntentBenchmark(withoutDate))).toBe('eligible');
    const dateRequired = runs.map((run) => ({ ...run, fixture: { ...run.fixture, expected: { ...run.fixture.expected, dateMentioned: true } } }));
    expect(gateIntentBenchmark(summarizeIntentBenchmark(dateRequired))).toBe('ineligible');
    expect(gateIntentBenchmark(summarizeIntentBenchmark(runs.slice(0, 3)))).toBe('insufficient_evidence');
  });
});
