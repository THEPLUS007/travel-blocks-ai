import { describe, expect, it } from 'vitest';
import {
  DETERMINISTIC_POLICY_V1,
  DeterministicDecisionPolicySchema,
  evaluateDecision,
  scoreCandidate,
  validateDecisionResult,
} from '../src/index.js';

const timestamp = '2026-10-02T12:00:00.000Z';
const context = { resultId: 'deterministic-result-1', evaluatedAt: timestamp };
const provenance = { sourceSystem: 'fixture-provider', sourceRecordId: 'fixture-record', sourceKind: 'curated_fixture' as const, retrievedAt: timestamp };

type FactState = 'known' | 'unknown' | 'unavailable' | 'invalid' | 'untrusted';

function candidate(candidateId: string, category: 'sightseeing' | 'food' = 'sightseeing') {
  return {
    candidateId,
    place: { reference: { sourceSystem: 'fixture-provider', sourceRecordId: `place-${candidateId}` }, displayName: candidateId, category },
    factSnapshotId: `fact-${candidateId}`,
    discoveredAt: timestamp,
    provenance: { ...provenance, sourceRecordId: `place-${candidateId}` },
  };
}

function fact(candidateId: string, state: FactState = 'known', businessStatus: 'operational' | 'temporarily_closed' | 'permanently_closed' = 'operational') {
  const optionalUnknown = { state: 'unknown' as const };
  const businessStatusFact = state === 'known' ? { state: 'known' as const, value: businessStatus } : { state };
  return {
    factSnapshotId: `fact-${candidateId}`,
    candidateId,
    availability: state,
    coordinates: optionalUnknown,
    openingHours: optionalUnknown,
    businessStatus: businessStatusFact,
    timeZone: optionalUnknown,
    price: optionalUnknown,
    route: optionalUnknown,
    retrievedAt: timestamp,
    provenance: { ...provenance, sourceRecordId: `fact-${candidateId}` },
  };
}

function request(candidates = [candidate('candidate-a'), candidate('candidate-b', 'food'), candidate('candidate-c')], facts = [fact('candidate-a'), fact('candidate-b'), fact('candidate-c')]) {
  return {
    contractVersion: 'decision_request_v1' as const,
    requestId: 'request-1',
    tripContext: { tripContextId: 'trip-context-1', destination: { country: 'KR', city: 'Seoul' }, tripStartDate: '2026-10-05', timeZone: 'Asia/Seoul' },
    constraints: { requestedCategories: ['sightseeing' as const], preferences: [], avoidances: [], maximumCandidates: 10 },
    policy: { id: DETERMINISTIC_POLICY_V1.id, version: DETERMINISTIC_POLICY_V1.version },
    candidates,
    facts,
    trace: { traceId: 'trace-1', source: 'fixture' as const },
  };
}

function policy(limit = 2) {
  return DeterministicDecisionPolicySchema.parse({ ...DETERMINISTIC_POLICY_V1, selectionLimit: limit });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

describe('P2-DE-2 deterministic pure engine', () => {
  it('rejects permanently closed candidates before required-fact resolution and never selects them for a high score', () => {
    const input = request(
      [candidate('candidate-open'), candidate('candidate-closed'), candidate('candidate-temporary'), candidate('candidate-limit', 'food')],
      [fact('candidate-open'), fact('candidate-closed', 'known', 'permanently_closed'), fact('candidate-temporary', 'known', 'temporarily_closed'), fact('candidate-limit')],
    );
    const result = evaluateDecision(input, policy(1), context);
    expect(result.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateId: 'candidate-closed', status: 'rejected', reason: { category: 'deterministic_rule', code: 'hard_constraint' } }),
      expect.objectContaining({ candidateId: 'candidate-open', status: 'selected' }),
      expect.objectContaining({ candidateId: 'candidate-temporary', status: 'unresolved', reason: { category: 'insufficient_facts', code: 'missing_required_facts' } }),
      expect.objectContaining({ candidateId: 'candidate-limit', status: 'rejected', reason: { category: 'selection_limit', code: 'selection_limit' } }),
    ]));
    expect(validateDecisionResult(input, result)).toEqual(result);
  });

  it('preserves required unknown, unavailable, invalid, and untrusted business-status facts as unresolved', () => {
    const input = request(
      [candidate('candidate-unknown'), candidate('candidate-unavailable'), candidate('candidate-invalid'), candidate('candidate-untrusted')],
      [fact('candidate-unknown', 'unknown'), fact('candidate-unavailable', 'unavailable'), fact('candidate-invalid', 'invalid'), fact('candidate-untrusted', 'untrusted')],
    );
    const result = evaluateDecision(input, policy(), context);
    expect(result.completeness).toBe('partial');
    expect(result.coverage).toEqual({ status: 'partial', evaluatedCandidates: 4, unresolvedCandidates: 4 });
    expect(result.decisions.map((decision) => [decision.candidateId, decision.status, decision.reason.code])).toEqual([
      ['candidate-invalid', 'unresolved', 'fact_untrusted'],
      ['candidate-unavailable', 'unresolved', 'fact_unavailable'],
      ['candidate-unknown', 'unresolved', 'missing_required_facts'],
      ['candidate-untrusted', 'unresolved', 'fact_untrusted'],
    ]);
  });

  it('does not treat temporary or future opening as permanent closure or as an eligible operational fact', () => {
    const input = request(
      [candidate('candidate-temporary'), candidate('candidate-future'), candidate('candidate-operational')],
      [fact('candidate-temporary', 'known', 'temporarily_closed'), { ...fact('candidate-future'), businessStatus: { state: 'known' as const, value: 'future_opening' as const } }, fact('candidate-operational')],
    );
    const result = evaluateDecision(input, policy(2), context);
    expect(result.decisions).toEqual([
      expect.objectContaining({ candidateId: 'candidate-future', status: 'unresolved', reason: expect.objectContaining({ code: 'missing_required_facts' }) }),
      expect.objectContaining({ candidateId: 'candidate-operational', status: 'selected' }),
      expect.objectContaining({ candidateId: 'candidate-temporary', status: 'unresolved', reason: expect.objectContaining({ code: 'missing_required_facts' }) }),
    ]);
  });

  it('fails closed when the enclosing fact snapshot is unavailable, invalid, or untrusted', () => {
    const states: Array<[FactState, 'missing_required_facts' | 'fact_unavailable' | 'fact_untrusted']> = [
      ['unknown', 'missing_required_facts'],
      ['unavailable', 'fact_unavailable'],
      ['invalid', 'fact_untrusted'],
      ['untrusted', 'fact_untrusted'],
    ];
    for (const [state, reason] of states) {
      const snapshot = { ...fact(`candidate-${state}`), availability: state };
      const result = evaluateDecision(request([candidate(`candidate-${state}`)], [snapshot]), policy(), context);
      expect(result.decisions[0]).toMatchObject({ status: 'unresolved', reason: { category: 'insufficient_facts', code: reason } });
    }
  });

  it('uses the documented category score formula and deterministic candidate-id tie-break', () => {
    const input = request([candidate('candidate-z', 'food'), candidate('candidate-a', 'food')], [fact('candidate-z'), fact('candidate-a')]);
    const executionPolicy = policy(1);
    expect(scoreCandidate(input.candidates[0], input, executionPolicy)).toEqual({
      candidateId: 'candidate-z', finalScore: 0, components: [{ id: 'category_match', score: 0, weight: 1000 }],
    });
    const result = evaluateDecision(input, executionPolicy, context);
    expect(result.decisions).toEqual([
      expect.objectContaining({ candidateId: 'candidate-a', status: 'selected' }),
      expect.objectContaining({ candidateId: 'candidate-z', status: 'rejected', reason: { category: 'selection_limit', code: 'selection_limit' } }),
    ]);
    const noRequestedCategories = { ...input, constraints: { ...input.constraints, requestedCategories: [] } };
    expect(scoreCandidate(noRequestedCategories.candidates[0], noRequestedCategories, executionPolicy).finalScore).toBe(500);
    expect(scoreCandidate(input.candidates[1], input, executionPolicy).finalScore).toBe(0);
  });

  it('applies the policy score values and weights without hidden defaults', () => {
    const input = request([candidate('candidate-a')], [fact('candidate-a')]);
    const customPolicy = DeterministicDecisionPolicySchema.parse({
      ...policy(),
      categoryMatchScores: { matchingCategory: 900, nonMatchingCategory: 100, noRequestedCategories: 400 },
    });
    expect(scoreCandidate(input.candidates[0], input, customPolicy)).toEqual({
      candidateId: 'candidate-a',
      finalScore: 900,
      components: [{ id: 'category_match', score: 900, weight: 1000 }],
    });
    expect(Number.isInteger(scoreCandidate(input.candidates[0], input, customPolicy).finalScore)).toBe(true);
  });

  it('rejects an otherwise eligible candidate below the explicit selection threshold', () => {
    const input = request([candidate('candidate-match'), candidate('candidate-miss', 'food')], [fact('candidate-match'), fact('candidate-miss')]);
    const thresholdPolicy = DeterministicDecisionPolicySchema.parse({ ...policy(2), minimumSelectionScore: 1000 });
    const result = evaluateDecision(input, thresholdPolicy, context);
    expect(result.decisions).toEqual([
      expect.objectContaining({ candidateId: 'candidate-match', status: 'selected' }),
      expect.objectContaining({ candidateId: 'candidate-miss', status: 'rejected', reason: { category: 'selection_limit', code: 'selection_threshold' } }),
    ]);
  });

  it('is pure for frozen input, canonical across candidate ordering, and does not mutate request or policy', () => {
    const original = request([candidate('candidate-b'), candidate('candidate-a'), candidate('candidate-c', 'food')], [fact('candidate-b'), fact('candidate-a'), fact('candidate-c')]);
    const executionPolicy = policy(2);
    const beforeRequest = structuredClone(original);
    const beforePolicy = structuredClone(executionPolicy);
    deepFreeze(original);
    deepFreeze(executionPolicy);
    const first = evaluateDecision(original, executionPolicy, context);
    const second = evaluateDecision(original, executionPolicy, context);
    const reordered = { ...beforeRequest, candidates: [...beforeRequest.candidates].reverse(), facts: [...beforeRequest.facts].reverse() };
    expect(first).toEqual(second);
    expect(evaluateDecision(reordered, beforePolicy, context)).toEqual(first);
    expect(original).toEqual(beforeRequest);
    expect(executionPolicy).toEqual(beforePolicy);
  });

  it('rejects invalid policies and request-policy identity mismatches instead of applying defaults', () => {
    const input = request();
    expect(() => evaluateDecision(input, { ...policy(), selectionLimit: 0 }, context)).toThrow();
    expect(() => evaluateDecision(input, { ...policy(), minimumSelectionScore: 1001 }, context)).toThrow();
    expect(() => evaluateDecision(input, { ...policy(), scoringDimensions: [{ id: 'category_match', weight: 999 }] }, context)).toThrow();
    expect(() => evaluateDecision({ ...input, policy: { id: 'other-policy', version: 'v1' } }, policy(), context)).toThrow();
    expect(() => evaluateDecision(input, policy(), { ...context, evaluatedAt: 'not-a-timestamp' })).toThrow();
  });
});
