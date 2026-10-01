import { describe, expect, it } from 'vitest';
import {
  CandidateFactSnapshotSchema,
  DecisionCandidateSchema,
  DecisionItemSchema,
  DecisionReasonSchema,
  DecisionRequestSchema,
  DecisionResultSchema,
  partitionDecisionItems,
  validateDecisionRequest,
  validateDecisionResult,
  type DecisionRequest,
} from '../src/index.js';

const timestamp = '2026-10-01T12:00:00.000Z';
const provenance = { sourceSystem: 'fixture_provider', sourceRecordId: 'record-1', sourceKind: 'curated_fixture' as const, retrievedAt: timestamp };

function candidate(index: number) {
  return {
    candidateId: `candidate-${index}`,
    place: {
      reference: { sourceSystem: 'fixture_provider', sourceRecordId: `place-${index}` },
      displayName: `Candidate ${index}`,
      category: 'sightseeing' as const,
      formattedAddress: 'Seoul',
    },
    factSnapshotId: `fact-${index}`,
    discoveredAt: timestamp,
    provenance: { ...provenance, sourceRecordId: `place-${index}` },
  };
}

function fact(index: number, state: 'known' | 'unknown' = 'known') {
  const unknown = { state: 'unknown' as const };
  return {
    factSnapshotId: `fact-${index}`,
    candidateId: `candidate-${index}`,
    availability: state,
    coordinates: state === 'known' ? { state: 'known' as const, value: { latitude: 37.5665, longitude: 126.978 } } : unknown,
    openingHours: state === 'known'
      ? { state: 'known' as const, value: { businessStatus: 'operational' as const, timeZone: 'Asia/Seoul', regularHours: { periods: [] }, dataQualityFlags: [] } }
      : unknown,
    businessStatus: state === 'known' ? { state: 'known' as const, value: 'operational' as const } : unknown,
    timeZone: state === 'known' ? { state: 'known' as const, value: 'Asia/Seoul' } : unknown,
    price: unknown,
    route: unknown,
    retrievedAt: timestamp,
    provenance: { ...provenance, sourceRecordId: `fact-record-${index}` },
  };
}

function request() {
  return {
    contractVersion: 'decision_request_v1' as const,
    requestId: 'request-1',
    tripContext: { tripContextId: 'trip-context-1', destination: { country: 'KR', city: 'Seoul' }, tripStartDate: '2026-10-05', timeZone: 'Asia/Seoul' },
    constraints: { requestedCategories: ['sightseeing' as const], preferences: ['museum'], avoidances: [], maximumCandidates: 3 },
    policy: { id: 'travel-selection', version: 'v1' },
    candidates: [candidate(1), candidate(2), candidate(3)],
    facts: [fact(1), fact(2), fact(3, 'unknown')],
    trace: { traceId: 'trace-1', source: 'fixture' as const },
  };
}

const decisionBase = { policy: { id: 'travel-selection', version: 'v1' }, evidence: [{ factSnapshotId: 'fact-1', referenceType: 'fact' as const, referenceId: 'fact-1' }], provenance: { traceId: 'trace-1', decisionSource: 'deterministic' as const, producedAt: timestamp } };
const selected = (candidateId: string) => ({ ...decisionBase, candidateId, status: 'selected' as const, reason: { category: 'deterministic_rule' as const, code: 'candidate_selected' as const } });
const rejected = (candidateId: string) => ({ ...decisionBase, candidateId, status: 'rejected' as const, reason: { category: 'selection_limit' as const, code: 'selection_limit' as const } });
const unresolved = (candidateId: string) => ({ ...decisionBase, candidateId, status: 'unresolved' as const, reason: { category: 'insufficient_facts' as const, code: 'missing_required_facts' as const } });

function result() {
  return {
    contractVersion: 'decision_result_v1' as const,
    resultId: 'result-1',
    requestId: 'request-1',
    policy: { id: 'travel-selection', version: 'v1' },
    createdAt: timestamp,
    completeness: 'partial' as const,
    coverage: { status: 'partial' as const, evaluatedCandidates: 3, unresolvedCandidates: 1 },
    decisions: [selected('candidate-1'), rejected('candidate-2'), unresolved('candidate-3')],
    provenance: { traceId: 'trace-1', decisionSource: 'system' as const, producedAt: timestamp },
  };
}

describe('P2-DE-1 provider-neutral contracts', () => {
  it('parses valid candidate, fact snapshot, request, decision states, and result', () => {
    const input = request();
    expect(DecisionCandidateSchema.parse(input.candidates[0])).toMatchObject({ candidateId: 'candidate-1' });
    expect(CandidateFactSnapshotSchema.parse(input.facts[0])).toMatchObject({ factSnapshotId: 'fact-1' });
    const parsedRequest: DecisionRequest = DecisionRequestSchema.parse(input);
    expect(DecisionItemSchema.parse(selected('candidate-1')).status).toBe('selected');
    expect(DecisionItemSchema.parse(rejected('candidate-2')).status).toBe('rejected');
    expect(DecisionItemSchema.parse(unresolved('candidate-3')).status).toBe('unresolved');
    const parsedResult = DecisionResultSchema.parse(result());
    expect(validateDecisionResult(parsedRequest, parsedResult)).toEqual(parsedResult);
    expect(partitionDecisionItems(parsedResult.decisions)).toMatchObject({ selected: [expect.objectContaining({ candidateId: 'candidate-1' })], rejected: [expect.objectContaining({ candidateId: 'candidate-2' })], unresolved: [expect.objectContaining({ candidateId: 'candidate-3' })] });
  });

  it('rejects invalid versions, statuses, reason categories, identities, timestamps, and coordinates', () => {
    expect(() => DecisionRequestSchema.parse({ ...request(), contractVersion: 'decision_request_v2' })).toThrow();
    expect(() => DecisionResultSchema.parse({ ...result(), contractVersion: 'decision_result_v2' })).toThrow();
    expect(() => DecisionItemSchema.parse({ ...selected('candidate-1'), status: 'unknown' })).toThrow();
    expect(() => DecisionReasonSchema.parse({ category: 'insufficient_facts', code: 'selection_limit' })).toThrow();
    const missingIdentity = candidate(1);
    const { candidateId: _candidateId, ...withoutCandidateId } = missingIdentity;
    expect(() => DecisionCandidateSchema.parse(withoutCandidateId)).toThrow();
    expect(() => CandidateFactSnapshotSchema.parse({ ...fact(1), retrievedAt: 'not-a-timestamp' })).toThrow();
    expect(() => CandidateFactSnapshotSchema.parse({ ...fact(1), coordinates: { state: 'known', value: { latitude: 91, longitude: 0 } } })).toThrow();
  });

  it('is strict and excludes raw provider, model, prompt, and secret-shaped fields', () => {
    for (const forbidden of ['rawResponse', 'rawProviderResponse', 'prompt', 'completion', 'chainOfThought', 'authorization', 'apiToken', 'secret']) {
      expect(() => DecisionRequestSchema.parse({ ...request(), [forbidden]: 'not allowed' })).toThrow();
    }
    expect(() => DecisionCandidateSchema.parse({ ...candidate(1), rawProviderResponse: {} })).toThrow();
    expect(() => CandidateFactSnapshotSchema.parse({ ...fact(1), apiToken: 'not allowed' })).toThrow();
  });

  it('enforces unique candidate IDs and valid candidate/fact references', () => {
    const duplicateCandidates = request();
    duplicateCandidates.candidates = [candidate(1), candidate(1), candidate(3)];
    expect(() => validateDecisionRequest(duplicateCandidates)).toThrow();
    const missingCandidate = request();
    missingCandidate.facts[0] = { ...fact(1), candidateId: 'candidate-missing' };
    expect(() => validateDecisionRequest(missingCandidate)).toThrow();
    const mismatchedFact = request();
    mismatchedFact.candidates[0] = { ...candidate(1), factSnapshotId: 'fact-2' };
    expect(() => validateDecisionRequest(mismatchedFact)).toThrow();
  });

  it('preserves unknown facts as valid input without coercing them to rejection', () => {
    const parsed = validateDecisionRequest(request());
    expect(parsed.facts[2].coordinates).toEqual({ state: 'unknown' });
    expect(validateDecisionResult(parsed, result()).decisions[2]).toMatchObject({ status: 'unresolved', reason: { category: 'insufficient_facts' } });
  });

  it('requires a total, exclusive decision partition and matching request/policy identities', () => {
    const input = request();
    for (const duplicatePair of [
      [selected('candidate-1'), rejected('candidate-1'), unresolved('candidate-3')],
      [selected('candidate-1'), rejected('candidate-2'), unresolved('candidate-1')],
      [selected('candidate-1'), rejected('candidate-2'), unresolved('candidate-2')],
    ]) {
      expect(() => validateDecisionResult(input, { ...result(), decisions: duplicatePair })).toThrow();
    }
    const unknownCandidate = result();
    unknownCandidate.decisions[1] = rejected('candidate-missing');
    expect(() => validateDecisionResult(input, unknownCandidate)).toThrow();
    const missingCandidate = result();
    missingCandidate.decisions = [selected('candidate-1'), rejected('candidate-2')];
    missingCandidate.coverage = { status: 'complete', evaluatedCandidates: 3, unresolvedCandidates: 0 };
    missingCandidate.completeness = 'complete';
    expect(() => validateDecisionResult(input, missingCandidate)).toThrow();
    expect(() => validateDecisionResult(input, { ...result(), requestId: 'other-request' })).toThrow();
    expect(() => validateDecisionResult(input, { ...result(), policy: { id: 'other-policy', version: 'v1' } })).toThrow();
  });

  it('rejects a complete result with unresolved candidates and decision items without valid reasons', () => {
    const completeWithUnresolved = result();
    completeWithUnresolved.completeness = 'complete';
    completeWithUnresolved.coverage = { status: 'complete', evaluatedCandidates: 3, unresolvedCandidates: 1 };
    expect(() => validateDecisionResult(request(), completeWithUnresolved)).toThrow();
    const missingReason = rejected('candidate-2');
    const { reason: _reason, ...withoutReason } = missingReason;
    expect(() => DecisionItemSchema.parse(withoutReason)).toThrow();
  });
});
