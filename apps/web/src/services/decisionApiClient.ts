import {
  DecisionApiErrorResponseV1Schema,
  DecisionApiRequestV1Schema,
  parseDecisionApiResponseV1,
  type DecisionApiRequestV1,
  type DecisionApiResponseV1,
} from '@travel-blocks/decision-api-contract';

const DECISION_ENDPOINT = '/api/v1/decisions/evaluate';

export type DecisionApiClientErrorKind = 'invalid_request' | 'http' | 'invalid_response' | 'network' | 'aborted';

export interface DecisionApiClientError {
  readonly kind: DecisionApiClientErrorKind;
  readonly retryable: boolean;
  readonly message: string;
}

export type DecisionApiClientResult =
  | { readonly ok: true; readonly data: DecisionApiResponseV1 }
  | { readonly ok: false; readonly error: DecisionApiClientError };

export interface DecisionApiClient {
  evaluate(request: DecisionApiRequestV1, signal?: AbortSignal): Promise<DecisionApiClientResult>;
}

type FetchLike = typeof fetch;

function safeHttpMessage(status: number): string {
  if (status >= 500) return '장소 검토 결과를 불러오지 못했습니다.';
  return '장소 검토 요청을 처리하지 못했습니다.';
}

async function parseJson(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDecisionApiClient(fetchImpl: FetchLike = fetch): DecisionApiClient {
  return {
    async evaluate(request: DecisionApiRequestV1, signal?: AbortSignal): Promise<DecisionApiClientResult> {
      const parsedRequest = DecisionApiRequestV1Schema.safeParse(request);
      if (!parsedRequest.success) {
        return { ok: false, error: { kind: 'invalid_request', retryable: false, message: '장소 검토 요청을 준비하지 못했습니다.' } };
      }

      try {
        const response = await fetchImpl(DECISION_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(parsedRequest.data),
        });
        const body = await parseJson(response);

        if (!response.ok) {
          const parsedError = DecisionApiErrorResponseV1Schema.safeParse(body);
          return {
            ok: false,
            error: {
              kind: 'http',
              retryable: parsedError.success ? parsedError.data.error.retryable : response.status >= 500,
              message: safeHttpMessage(response.status),
            },
          };
        }

        const parsedResponse = (() => {
          try {
            return { ok: true as const, data: parseDecisionApiResponseV1(body) };
          } catch {
            return { ok: false as const };
          }
        })();
        if (!parsedResponse.ok) {
          return { ok: false, error: { kind: 'invalid_response', retryable: true, message: '검토 결과를 안전하게 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.' } };
        }
        return parsedResponse;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { ok: false, error: { kind: 'aborted', retryable: false, message: '요청이 취소되었습니다.' } };
        }
        return { ok: false, error: { kind: 'network', retryable: true, message: '장소 검토 결과를 불러오지 못했습니다.' } };
      }
    },
  };
}

export const decisionApiClient = createDecisionApiClient();
