/** Shared transport only; each Decision endpoint owns its schemas and safe UI copy. */
export type DecisionHttpErrorKind = 'invalid_request' | 'http' | 'invalid_response' | 'network' | 'aborted';

export interface DecisionHttpError {
  readonly kind: DecisionHttpErrorKind;
  readonly retryable: boolean;
  readonly message: string;
}

export type DecisionHttpResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DecisionHttpError };

type ParseResult<T> = { readonly success: true; readonly data: T } | { readonly success: false };

interface DecisionJsonRequestOptions<TRequest, TResponse> {
  readonly endpoint: string;
  readonly requestSchema: { safeParse(input: unknown): ParseResult<TRequest> };
  readonly errorSchema: { safeParse(input: unknown): ParseResult<{ error: { retryable: boolean } }> };
  readonly parseResponse: (input: unknown) => TResponse;
  readonly messages: {
    readonly invalidRequest: string;
    readonly invalidResponse: string;
    readonly network: string;
    readonly http: (status: number) => string;
  };
}

async function parseJson(response: Response): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDecisionJsonRequest<TRequest, TResponse>(
  options: DecisionJsonRequestOptions<TRequest, TResponse>,
  fetchImpl: typeof fetch,
): (request: TRequest, signal?: AbortSignal) => Promise<DecisionHttpResult<TResponse>> {
  return async (request, signal) => {
    const parsedRequest = options.requestSchema.safeParse(request);
    if (!parsedRequest.success) {
      return { ok: false, error: { kind: 'invalid_request', retryable: false, message: options.messages.invalidRequest } };
    }
    try {
      const response = await fetchImpl(options.endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(parsedRequest.data),
      });
      const body = await parseJson(response);
      if (!response.ok) {
        const parsedError = options.errorSchema.safeParse(body);
        return {
          ok: false,
          error: {
            kind: 'http',
            retryable: parsedError.success ? parsedError.data.error.retryable : response.status >= 500,
            message: options.messages.http(response.status),
          },
        };
      }
      try {
        return { ok: true, data: options.parseResponse(body) };
      } catch {
        return { ok: false, error: { kind: 'invalid_response', retryable: true, message: options.messages.invalidResponse } };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, error: { kind: 'aborted', retryable: false, message: '요청이 취소되었습니다.' } };
      }
      return { ok: false, error: { kind: 'network', retryable: true, message: options.messages.network } };
    }
  };
}
