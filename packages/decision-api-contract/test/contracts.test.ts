import { describe, expect, it } from 'vitest';
import { DecisionApiResponseV1Schema, DecisionCandidateDiscoveryRequestV1Schema, DecisionCandidateDiscoveryResponseV1Schema, parseDecisionApiResponseV1 } from '../src/index.js';

const response = () => ({
  contractVersion: 'decision_api_response_v1',
  requestId: 'http-request',
  decisionRequestId: 'decision-request',
  resultId: 'decision-result',
  policy: { id: 'policy', version: 'v1' },
  judge: { outcome: 'skipped', reason: 'disabled' },
  coverage: { status: 'complete', evaluatedCandidates: 1, unresolvedCandidates: 0 },
  candidates: [{ candidateId: 'candidate-a', displayName: 'Place A', category: 'sightseeing' }],
  decisionResult: {
    contractVersion: 'decision_result_v1', resultId: 'decision-result', requestId: 'decision-request', policy: { id: 'policy', version: 'v1' },
    createdAt: '2026-10-04T00:00:00.000Z', completeness: 'complete', coverage: { status: 'complete', evaluatedCandidates: 1, unresolvedCandidates: 0 },
    provenance: { traceId: 'http-request', decisionSource: 'deterministic', producedAt: '2026-10-04T00:00:00.000Z' },
    decisions: [{
      candidateId: 'candidate-a',
      status: 'selected',
      policy: { id: 'policy', version: 'v1' },
      reason: { category: 'deterministic_rule', code: 'candidate_selected' },
      evidence: [{ factSnapshotId: 'fact-a', referenceType: 'fact', referenceId: 'fact-a' }],
      provenance: { traceId: 'http-request', decisionSource: 'deterministic', producedAt: '2026-10-04T00:00:00.000Z' },
    }],
  },
});

describe('Decision API contract', () => {
  it('accepts a total candidate/decision partition', () => {
    expect(parseDecisionApiResponseV1(response())).toMatchObject({ contractVersion: 'decision_api_response_v1' });
  });

  it('rejects unknown decisions and missing display candidates', () => {
    const value = response();
    value.decisionResult.decisions[0].candidateId = 'candidate-missing';
    expect(DecisionApiResponseV1Schema.safeParse(value).success).toBe(false);
  });

  it('rejects duplicate candidate IDs', () => {
    const value = response();
    value.candidates.push({ ...value.candidates[0] });
    expect(DecisionApiResponseV1Schema.safeParse(value).success).toBe(false);
  });
});

describe('Decision candidate discovery contract', () => {
  const request = () => ({
    contractVersion: 'decision_candidate_discovery_request_v1',
    tripContext: { tripContextId: 'review-day-1', destination: { city: 'Seoul' } },
    constraints: { requestedCategories: [], preferences: [], avoidances: [] },
    candidateLimit: 2,
  });
  const candidateSet = () => ({
    contractVersion: 'decision_candidate_discovery_response_v1',
    candidateSetId: 'candidate-set-1',
    tripContext: request().tripContext,
    constraints: request().constraints,
    canonicalOrder: 'candidate_id_ascending',
    candidates: [
      { candidateId: 'fixture:a', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'a' }, displayName: 'Place A', formattedAddress: 'Seoul', category: 'sightseeing' },
      { candidateId: 'fixture:b', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'b' }, displayName: 'Place B', category: 'food' },
    ],
  });

  it('accepts strict normalized discovery request and a canonical empty/non-empty set', () => {
    expect(DecisionCandidateDiscoveryRequestV1Schema.parse(request()).candidateLimit).toBe(2);
    expect(DecisionCandidateDiscoveryResponseV1Schema.parse(candidateSet()).candidates).toHaveLength(2);
    expect(DecisionCandidateDiscoveryResponseV1Schema.parse({ ...candidateSet(), candidates: [] }).candidates).toEqual([]);
  });

  it('rejects unknown fields, limits, duplicate IDs/references, and non-canonical order', () => {
    expect(DecisionCandidateDiscoveryRequestV1Schema.safeParse({ ...request(), providerQuery: 'forged' }).success).toBe(false);
    expect(DecisionCandidateDiscoveryRequestV1Schema.safeParse({ ...request(), candidateLimit: 21 }).success).toBe(false);
    const duplicate = candidateSet(); duplicate.candidates.push({ ...duplicate.candidates[0] });
    expect(DecisionCandidateDiscoveryResponseV1Schema.safeParse(duplicate).success).toBe(false);
    const unordered = candidateSet(); unordered.candidates.reverse();
    expect(DecisionCandidateDiscoveryResponseV1Schema.safeParse(unordered).success).toBe(false);
  });

  it('does not mutate discovery input while validating it', () => {
    const value = candidateSet();
    const before = JSON.stringify(value);
    DecisionCandidateDiscoveryResponseV1Schema.parse(value);
    expect(JSON.stringify(value)).toBe(before);
  });
});
