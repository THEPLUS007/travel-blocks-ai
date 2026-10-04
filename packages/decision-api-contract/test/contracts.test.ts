import { describe, expect, it } from 'vitest';
import { DecisionApiResponseV1Schema, parseDecisionApiResponseV1 } from '../src/index.js';

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
