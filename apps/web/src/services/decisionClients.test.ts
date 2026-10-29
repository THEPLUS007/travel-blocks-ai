import { describe, expect, it, vi } from 'vitest';
import { createDecisionApiClient } from './decisionApiClient';
import { createDecisionCandidateDiscoveryClient } from './decisionCandidateDiscoveryClient';

const context = { tripContextId: 'review-day', destination: { city: 'Seoul' } };
const constraints = { requestedCategories: [], preferences: [], avoidances: [] };
const clients = [
  {
    name: 'decision',
    endpoint: '/api/v1/decisions/evaluate',
    errorVersion: 'decision_api_error_v1',
    errorCode: 'AI_DEPENDENCY_UNAVAILABLE',
    request: {
      contractVersion: 'decision_api_request_v1' as const,
      tripContext: context,
      constraints,
      candidates: [{ candidateId: 'fixture:a', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'a' } }],
    },
    create(fetchImpl: typeof fetch) {
      const client = createDecisionApiClient(fetchImpl);
      return (request: unknown, signal?: AbortSignal) => client.evaluate(request as Parameters<typeof client.evaluate>[0], signal);
    },
  },
  {
    name: 'discovery',
    endpoint: '/api/v1/decision-candidates/discover',
    errorVersion: 'decision_candidate_discovery_error_v1',
    errorCode: 'FACTUAL_DEPENDENCY_FAILURE',
    request: {
      contractVersion: 'decision_candidate_discovery_request_v1' as const,
      tripContext: context,
      constraints,
      candidateLimit: 2,
    },
    create(fetchImpl: typeof fetch) {
      const client = createDecisionCandidateDiscoveryClient(fetchImpl);
      return (request: unknown, signal?: AbortSignal) => client.discover(request as Parameters<typeof client.discover>[0], signal);
    },
  },
];

for (const client of clients) {
  describe(`${client.name} transport regression`, () => {
    it('rejects invalid requests without any network call', async () => {
      const fetchImpl = vi.fn<typeof fetch>();
      expect(await client.create(fetchImpl)({})).toMatchObject({ ok: false, error: { kind: 'invalid_request', retryable: false } });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('preserves the endpoint, same-origin session, JSON request and caller cancellation', async () => {
      const controller = new AbortController();
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
      await client.create(fetchImpl)(client.request, controller.signal);
      expect(fetchImpl).toHaveBeenCalledOnce();
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(client.endpoint);
      expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', signal: controller.signal });
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
      expect(JSON.parse(init?.body as string)).toEqual(client.request);
    });

    it.each([
      { status: 503, retryable: false },
      { status: 400, retryable: true },
    ])('honors a schema-valid retry policy even at HTTP $status', async ({ status, retryable }) => {
      const response = {
        contractVersion: client.errorVersion,
        error: { code: client.errorCode, message: 'private upstream payload', retryable, requestId: 'request-1' },
      };
      const result = await client.create(async () => new Response(JSON.stringify(response), {
        status, headers: { 'content-type': 'application/json; charset=utf-8' },
      }))(client.request);
      expect(result).toMatchObject({ ok: false, error: { kind: 'http', retryable } });
      expect(JSON.stringify(result)).not.toContain('private upstream payload');
    });

    it.each([400, 502])('uses HTTP status for malformed error bodies at $0', async (status) => {
      const result = await client.create(async () => new Response('private raw error', { status }))(client.request);
      expect(result).toMatchObject({ ok: false, error: { kind: 'http', retryable: status >= 500 } });
      expect(JSON.stringify(result)).not.toContain('private raw error');
    });

    it.each([
      { body: '{}', contentType: 'text/html' },
      { body: 'not JSON', contentType: 'application/json' },
      { body: '{}', contentType: 'application/json' },
    ])('fails closed for invalid success content: $contentType / $body', async ({ body, contentType }) => {
      const result = await client.create(async () => new Response(body, { headers: { 'content-type': contentType } }))(client.request);
      expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_response', retryable: true } });
    });

    it('distinguishes cancellation from network failure without leaking errors', async () => {
      const aborted = await client.create(async () => { throw new DOMException('private abort', 'AbortError'); })(client.request);
      expect(aborted).toMatchObject({ ok: false, error: { kind: 'aborted', retryable: false } });
      const network = await client.create(async () => { throw new Error('private transport detail'); })(client.request);
      expect(network).toMatchObject({ ok: false, error: { kind: 'network', retryable: true } });
      expect(JSON.stringify(network)).not.toContain('private transport detail');
    });
  });
}
