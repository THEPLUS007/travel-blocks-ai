import { describe, expect, it, vi } from 'vitest';
import { DETERMINISTIC_POLICY_V1, evaluateDecision, type DeterministicDecisionPolicy } from '@travel-blocks/decision-engine';
import {
  BOUNDED_JUDGE_POLICY_V1,
  BoundedJudgeRequestV1Schema,
  BoundedJudgeResultV1Schema,
  buildBoundedJudgeRequest,
  executeBoundedJudge,
  reconcileBoundedJudgeResult,
  validateBoundedJudgeResult,
} from '../src/index.js';

const time = '2026-10-03T12:00:00.000Z';
const provenance = (id: string) => ({ sourceSystem: 'fixture', sourceRecordId: id, sourceKind: 'curated_fixture' as const, retrievedAt: time });

function candidate(id: string, category: 'sightseeing' | 'food' = 'sightseeing') {
  return { candidateId: id, place: { reference: { sourceSystem: 'fixture', sourceRecordId: `place-${id}` }, displayName: `Label ${id}`, category }, factSnapshotId: `fact-${id}`, discoveredAt: time, provenance: provenance(`place-${id}`) };
}
function fact(id: string, availability: 'known' | 'unknown' | 'unavailable' | 'invalid' | 'untrusted' = 'known', status: 'operational' | 'permanently_closed' = 'operational') {
  const unknown = { state: 'unknown' as const };
  return { factSnapshotId: `fact-${id}`, candidateId: id, availability, coordinates: unknown, openingHours: unknown, businessStatus: availability === 'known' ? { state: 'known' as const, value: status } : availability === 'unknown' ? unknown : { state: availability as 'unavailable' | 'invalid' | 'untrusted' }, timeZone: unknown, price: unknown, route: unknown, retrievedAt: time, provenance: provenance(`fact-${id}`) };
}
function request(ids = ['candidate-d', 'candidate-b', 'candidate-a', 'candidate-c'], preferences = ['quiet museum']) {
  return {
    contractVersion: 'decision_request_v1' as const, requestId: 'decision-request-1',
    tripContext: { tripContextId: 'trip-1', destination: { city: 'Seoul' } },
    constraints: { requestedCategories: ['sightseeing' as const], preferences, avoidances: [], maximumCandidates: 10 },
    policy: { id: DETERMINISTIC_POLICY_V1.id, version: DETERMINISTIC_POLICY_V1.version },
    candidates: ids.map((id) => candidate(id)), facts: ids.map((id) => fact(id)), trace: { traceId: 'trace-1', source: 'fixture' as const },
  };
}
function policy(selectionLimit = 2): DeterministicDecisionPolicy { return { ...DETERMINISTIC_POLICY_V1, selectionLimit }; }
function base(input = request(), executionPolicy = policy()) { return evaluateDecision(input, executionPolicy, { resultId: 'result-1', evaluatedAt: time }); }
function build(input = request(), executionPolicy = policy(), options: { enabled?: boolean; providerEligible?: boolean } = {}) {
  const judgePolicy = { ...BOUNDED_JUDGE_POLICY_V1, enabled: options.enabled ?? true };
  return buildBoundedJudgeRequest({ decisionRequest: input, deterministicResult: base(input, executionPolicy), deterministicPolicy: executionPolicy, judgePolicy, judgeRequestId: 'judge-request-1', providerEligible: options.providerEligible ?? true });
}
function ranked(judgeRequest: NonNullable<ReturnType<typeof build>['request']>, ids = judgeRequest.candidates.map((item) => item.candidateId).reverse()) {
  return { contractVersion: 'bounded_judge_result_v1' as const, judgeRequestId: judgeRequest.judgeRequestId, rankings: ids.map((candidateId, index) => ({ candidateId, rank: index + 1, confidence: 900, reasonCode: 'preference_fit' as const, explanation: 'Safe short reason' })) };
}
function freeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }

describe('P2-DE-3 bounded AI judge', () => {
  it('uses a strict, versioned full-permutation contract and rejects malformed, unknown, duplicate, missing, rank-gap, confidence, and reasoning fields', () => {
    const built = build();
    expect(built.eligibility.eligible).toBe(true);
    if (!built.request) throw new Error('expected request');
    const valid = ranked(built.request);
    expect(BoundedJudgeRequestV1Schema.parse(built.request)).toEqual(built.request);
    expect(validateBoundedJudgeResult(built.request, valid)).toEqual(valid);
    expect(() => validateBoundedJudgeResult(built.request, { ...valid, rankings: [...valid.rankings, { ...valid.rankings[0], candidateId: 'candidate-unknown', rank: 5 }] })).toThrow();
    expect(() => validateBoundedJudgeResult(built.request, { ...valid, rankings: [valid.rankings[0], { ...valid.rankings[0], rank: 2 }, ...valid.rankings.slice(2)] })).toThrow();
    expect(() => validateBoundedJudgeResult(built.request, { ...valid, rankings: valid.rankings.slice(1) })).toThrow();
    expect(() => BoundedJudgeResultV1Schema.parse({ ...valid, rankings: valid.rankings.map((item, index) => ({ ...item, rank: index === 1 ? 4 : item.rank })) })).toThrow();
    expect(() => BoundedJudgeResultV1Schema.parse({ ...valid, rankings: valid.rankings.map((item) => ({ ...item, confidence: 1001 })) })).toThrow();
    expect(() => BoundedJudgeResultV1Schema.parse({ ...valid, chainOfThought: 'not allowed' })).toThrow();
    expect(() => BoundedJudgeResultV1Schema.parse({ ...valid, rankings: valid.rankings.map((item) => ({ ...item, reasoning: 'not allowed' })) })).toThrow();
  });

  it('skips deterministically for disabled, no preference, insufficient candidates, and unavailable provider', () => {
    expect(build(request(), policy(), { enabled: false }).eligibility).toMatchObject({ eligible: false, reason: 'disabled' });
    expect(build(request(['candidate-a', 'candidate-b'], []), policy()).eligibility).toMatchObject({ eligible: false, reason: 'no_preference_signal' });
    expect(build(request(['candidate-a']), policy()).eligibility).toMatchObject({ eligible: false, reason: 'insufficient_candidates' });
    expect(build(request(), policy(), { providerEligible: false }).eligibility).toMatchObject({ eligible: false, reason: 'no_eligible_provider' });
  });

  it('excludes hard-rejected and unresolved facts, bounds by score then candidate ID, and preserves canonical input order independence', () => {
    const input = request(['candidate-z', 'candidate-a', 'candidate-closed', 'candidate-unresolved']);
    input.facts = [fact('candidate-z'), fact('candidate-a'), fact('candidate-closed', 'known', 'permanently_closed'), fact('candidate-unresolved', 'unavailable')];
    const executionPolicy = policy(2);
    const first = build(input, executionPolicy);
    expect(first.eligibility).toMatchObject({ eligible: true, candidateIds: ['candidate-a', 'candidate-z'] });
    expect(first.eligibility.excludedCandidateIds).toEqual(['candidate-closed', 'candidate-unresolved']);
    const reordered = { ...input, candidates: [...input.candidates].reverse(), facts: [...input.facts].reverse() };
    expect(build(reordered, executionPolicy)).toEqual(first);
  });

  it('calls an injected judge exactly once, has no judge retry/failover, preserves provider error identity, and observer failure is non-authoritative', async () => {
    const input = request(); const deterministic = base(input); const failure = new Error('provider timeout');
    const port = { rank: vi.fn(async () => { throw failure; }) };
    const observerError = vi.fn(); const observer = { record: () => { throw new Error('observer failed'); } };
    await expect(executeBoundedJudge({ decisionRequest: input, deterministicResult: deterministic, deterministicPolicy: policy(), judgePolicy: BOUNDED_JUDGE_POLICY_V1, judgeRequestId: 'judge-request-1', providerEligible: true, port, observer, onObserverError: observerError })).rejects.toBe(failure);
    expect(port.rank).toHaveBeenCalledOnce();
    await Promise.resolve(); expect(observerError).toHaveBeenCalledOnce();
  });

  it('reconciles only the bounded allowlist, keeps protected decisions and facts intact, applies selection limit, and passes the final DecisionResult validator', async () => {
    const input = request(['candidate-a', 'candidate-b', 'candidate-closed', 'candidate-unknown']);
    input.facts = [fact('candidate-a'), fact('candidate-b'), fact('candidate-closed', 'known', 'permanently_closed'), fact('candidate-unknown', 'unknown')];
    const deterministic = base(input, policy(1));
    const calls = vi.fn(async (judgeRequest: NonNullable<ReturnType<typeof build>['request']>) => ranked(judgeRequest, ['candidate-b', 'candidate-a']));
    const outcome = await executeBoundedJudge({ decisionRequest: input, deterministicResult: deterministic, deterministicPolicy: policy(1), judgePolicy: BOUNDED_JUDGE_POLICY_V1, judgeRequestId: 'judge-request-1', providerEligible: true, port: { rank: calls } });
    expect(outcome.outcome).toBe('applied');
    expect(outcome.decisionResult.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateId: 'candidate-b', status: 'selected', reason: { category: 'ai_assisted', code: 'ai_assisted_selection' } }),
      expect.objectContaining({ candidateId: 'candidate-a', status: 'rejected', reason: { category: 'ai_assisted', code: 'ai_assisted_not_selected' } }),
      expect.objectContaining({ candidateId: 'candidate-closed', status: 'rejected', reason: { category: 'deterministic_rule', code: 'hard_constraint' } }),
      expect.objectContaining({ candidateId: 'candidate-unknown', status: 'unresolved' }),
    ]));
    expect(outcome.decisionResult.decisions.find((item) => item.candidateId === 'candidate-closed')).toEqual(deterministic.decisions.find((item) => item.candidateId === 'candidate-closed'));
    expect(outcome.decisionResult.decisions.find((item) => item.candidateId === 'candidate-b')?.evidence[0]).toEqual(deterministic.decisions.find((item) => item.candidateId === 'candidate-b')?.evidence[0]);
    expect(calls).toHaveBeenCalledOnce();
  });

  it('is pure for frozen inputs and returns the deterministic result unchanged on a pre-execution skip', async () => {
    const input = request(); const deterministic = base(input); const before = structuredClone(input); freeze(input);
    const port = { rank: vi.fn() };
    const outcome = await executeBoundedJudge({ decisionRequest: input, deterministicResult: deterministic, deterministicPolicy: policy(), judgePolicy: { ...BOUNDED_JUDGE_POLICY_V1, enabled: false }, judgeRequestId: 'judge-request-1', providerEligible: true, port });
    expect(outcome).toMatchObject({ outcome: 'skipped', eligibility: { reason: 'disabled' }, decisionResult: deterministic });
    expect(port.rank).not.toHaveBeenCalled();
    expect(input).toEqual(before);
  });

  it('rejects an invalid judge result before reconciliation and never partially applies it', () => {
    const input = request(); const deterministic = base(input); const built = build(input);
    if (!built.request) throw new Error('expected request');
    const invalid = ranked(built.request).rankings.slice(1);
    expect(() => reconcileBoundedJudgeResult(input, deterministic, built.request, { contractVersion: 'bounded_judge_result_v1', judgeRequestId: 'judge-request-1', rankings: invalid }, policy())).toThrow();
    expect(deterministic.decisions.every((item) => item.reason.category !== 'ai_assisted')).toBe(true);
  });
});
