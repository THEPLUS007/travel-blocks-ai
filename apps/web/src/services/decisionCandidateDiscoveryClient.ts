import {
  DecisionCandidateDiscoveryErrorV1Schema,
  DecisionCandidateDiscoveryRequestV1Schema,
  parseDecisionCandidateDiscoveryResponseV1,
  type DecisionCandidateDiscoveryRequestV1,
  type DecisionCandidateDiscoveryResponseV1,
} from '@travel-blocks/decision-api-contract';

const DISCOVERY_ENDPOINT = '/api/v1/decision-candidates/discover';

export type DecisionCandidateDiscoveryErrorKind = 'invalid_request' | 'http' | 'invalid_response' | 'network' | 'aborted';

export interface DecisionCandidateDiscoveryClientError {
  readonly kind: DecisionCandidateDiscoveryErrorKind;
  readonly retryable: boolean;
  readonly message: string;
}

export type DecisionCandidateDiscoveryClientResult =
  | { readonly ok: true; readonly data: DecisionCandidateDiscoveryResponseV1 }
  | { readonly ok: false; readonly error: DecisionCandidateDiscoveryClientError };

export interface DecisionCandidateDiscoveryClient {
  discover(request: DecisionCandidateDiscoveryRequestV1, signal?: AbortSignal): Promise<DecisionCandidateDiscoveryClientResult>;
}

async function parseJson(response: Response): Promise<unknown | undefined> {
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDecisionCandidateDiscoveryClient(fetchImpl: typeof fetch = fetch): DecisionCandidateDiscoveryClient {
  return {
    async discover(request, signal) {
      const parsedRequest = DecisionCandidateDiscoveryRequestV1Schema.safeParse(request);
      if (!parsedRequest.success) {
        return { ok: false, error: { kind: 'invalid_request', retryable: false, message: '장소 후보 요청을 준비하지 못했습니다.' } };
      }
      try {
        const response = await fetchImpl(DISCOVERY_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(parsedRequest.data),
        });
        const body = await parseJson(response);
        if (!response.ok) {
          const error = DecisionCandidateDiscoveryErrorV1Schema.safeParse(body);
          return {
            ok: false,
            error: {
              kind: 'http',
              retryable: error.success ? error.data.error.retryable : response.status >= 500,
              message: '장소 후보를 불러오지 못했습니다.',
            },
          };
        }
        try {
          return { ok: true, data: parseDecisionCandidateDiscoveryResponseV1(body) };
        } catch {
          return { ok: false, error: { kind: 'invalid_response', retryable: true, message: '장소 후보를 안전하게 확인하지 못했습니다.' } };
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { ok: false, error: { kind: 'aborted', retryable: false, message: '요청이 취소되었습니다.' } };
        }
        return { ok: false, error: { kind: 'network', retryable: true, message: '장소 후보를 불러오지 못했습니다.' } };
      }
    },
  };
}

export const decisionCandidateDiscoveryClient = createDecisionCandidateDiscoveryClient();
