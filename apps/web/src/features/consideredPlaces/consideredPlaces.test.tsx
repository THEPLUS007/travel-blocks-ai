import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConsideredPlacesPanel } from '../../components/ConsideredPlacesPanel';
import { createDecisionApiClient } from '../../services/decisionApiClient';
import { COVERAGE_COPY, createConsideredPlacesViewModel, JUDGE_SKIP_COPY, REASON_COPY } from './model';

function response() {
  const timestamp = '2026-10-04T00:00:00.000Z';
  const policy = { id: 'deterministic-travel-selection', version: 'v1' };
  const provenance = { traceId: 'http-request', decisionSource: 'deterministic' as const, producedAt: timestamp };
  return {
    contractVersion: 'decision_api_response_v1' as const,
    requestId: 'http-request',
    decisionRequestId: 'decision-request',
    resultId: 'decision-result',
    policy,
    coverage: { status: 'partial' as const, evaluatedCandidates: 2, unresolvedCandidates: 1 },
    judge: { outcome: 'skipped' as const, reason: 'disabled' as const },
    candidates: [
      { candidateId: 'candidate-selected', displayName: '아주 긴 이름의 한글 English mixed place name that must wrap safely', category: 'sightseeing' as const },
      { candidateId: 'candidate-rejected', displayName: '이번 일정에서 제외된 장소', category: 'food' as const },
      { candidateId: 'candidate-unresolved', displayName: '추가 확인 장소', category: 'cafe' as const },
    ],
    decisionResult: {
      contractVersion: 'decision_result_v1' as const,
      resultId: 'decision-result',
      requestId: 'decision-request',
      policy,
      createdAt: timestamp,
      completeness: 'partial' as const,
      coverage: { status: 'partial' as const, evaluatedCandidates: 2, unresolvedCandidates: 1 },
      provenance,
      decisions: [
        { candidateId: 'candidate-selected', policy, status: 'selected' as const, reason: { category: 'deterministic_rule' as const, code: 'candidate_selected' as const }, evidence: [], provenance },
        { candidateId: 'candidate-rejected', policy, status: 'rejected' as const, reason: { category: 'selection_limit' as const, code: 'selection_limit' as const }, evidence: [], provenance },
        { candidateId: 'candidate-unresolved', policy, status: 'unresolved' as const, reason: { category: 'insufficient_facts' as const, code: 'missing_required_facts' as const }, evidence: [], provenance },
      ],
    },
  };
}

const request = {
  contractVersion: 'decision_api_request_v1' as const,
  tripContext: { tripContextId: 'trip-context', destination: { city: 'Seoul' } },
  constraints: { requestedCategories: ['sightseeing' as const], preferences: [], avoidances: [] },
  candidates: [{ candidateId: 'candidate-a', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'place-a' } }],
};

describe('considered-place view model', () => {
  it('joins all three statuses by candidate ID without mutating the response', () => {
    const raw = response();
    const before = JSON.stringify(raw);
    const model = createConsideredPlacesViewModel(raw);
    expect(model.counts).toEqual({ selected: 1, rejected: 1, unresolved: 1 });
    expect(model.selected[0]?.displayName).toContain('아주 긴 이름');
    expect(model.rejected[0]?.statusLabel).toBe('이번 일정에서는 제외');
    expect(model.unresolved[0]?.statusLabel).toBe('정보 확인 필요');
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('fails closed for missing, duplicate, or unknown decision candidates', () => {
    const missing = response();
    missing.candidates = missing.candidates.slice(0, 2);
    const duplicate = response();
    duplicate.candidates.push({ ...duplicate.candidates[0] });
    const unknown = response();
    unknown.decisionResult.decisions[0].candidateId = 'not-in-response';
    for (const value of [missing, duplicate, unknown]) {
      expect(() => createConsideredPlacesViewModel(value)).toThrow('Decision result cannot be safely displayed.');
    }
  });

  it('has exhaustive safe copy tables for decision, coverage, and judge states', () => {
    expect(Object.keys(REASON_COPY)).toHaveLength(12);
    expect(Object.keys(COVERAGE_COPY)).toHaveLength(4);
    expect(Object.keys(JUDGE_SKIP_COPY)).toHaveLength(5);
  });

  it('renders accessible state headings and no raw internal decision data', () => {
    const markup = renderToStaticMarkup(<ConsideredPlacesPanel model={createConsideredPlacesViewModel(response())} />);
    expect(markup).toContain('일정 생성 과정에서 함께 검토한 장소');
    expect(markup).toContain('일정에 포함');
    expect(markup).toContain('다른 후보');
    expect(markup).toContain('확인이 필요한 후보');
    expect(markup).toContain('일부 정보가 없어 확인 가능한 범위에서 판단했어요.');
    expect(markup).not.toContain('candidate-selected');
    expect(markup).not.toContain('selection_limit');
    expect(markup).not.toContain('decision-result');
  });
});

describe('Decision API client', () => {
  it('posts only a schema-valid request and parses a valid response', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(input).toBe('/api/v1/decisions/evaluate');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify(response()), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await createDecisionApiClient(fetchImpl).evaluate(request);
    expect(result.ok).toBe(true);
  });

  it('maps strict API errors and only makes retryable server errors retryable', async () => {
    const errorBody = { contractVersion: 'decision_api_error_v1', error: { code: 'AI_DEPENDENCY_UNAVAILABLE', message: 'safe', retryable: true, requestId: 'request-id' } };
    const result = await createDecisionApiClient(async () => new Response(JSON.stringify(errorBody), { status: 503, headers: { 'content-type': 'application/json' } })).evaluate(request);
    expect(result).toMatchObject({ ok: false, error: { kind: 'http', retryable: true } });

    const invalid = await createDecisionApiClient(async () => new Response('not-json', { status: 400, headers: { 'content-type': 'application/json' } })).evaluate(request);
    expect(invalid).toMatchObject({ ok: false, error: { kind: 'http', retryable: false } });
  });

  it('fails closed for invalid JSON/schema-success bodies and supports aborts', async () => {
    const invalidJson = await createDecisionApiClient(async () => new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } })).evaluate(request);
    expect(invalidJson).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });

    const invalidSchema = await createDecisionApiClient(async () => new Response(JSON.stringify({ contractVersion: 'decision_api_response_v1' }), { status: 200, headers: { 'content-type': 'application/json' } })).evaluate(request);
    expect(invalidSchema).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });

    const controller = new AbortController();
    const aborted = createDecisionApiClient(async () => { throw new DOMException('Aborted', 'AbortError'); });
    const abortedResult = await aborted.evaluate(request, controller.signal);
    expect(abortedResult).toMatchObject({ ok: false, error: { kind: 'aborted', retryable: false } });
  });
});
