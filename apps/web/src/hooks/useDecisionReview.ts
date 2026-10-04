import { useCallback, useEffect, useRef, useState } from 'react';
import type { DecisionApiRequestV1 } from '@travel-blocks/decision-api-contract';
import { decisionApiClient, type DecisionApiClient, type DecisionApiClientError } from '../services/decisionApiClient';
import { ConsideredPlacesIntegrityError, createConsideredPlacesViewModel, type ConsideredPlacesViewModel } from '../features/consideredPlaces/model';

export type DecisionReviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly previous?: ConsideredPlacesViewModel }
  | { readonly status: 'success'; readonly result: ConsideredPlacesViewModel }
  | { readonly status: 'error'; readonly error: DecisionApiClientError; readonly previous?: ConsideredPlacesViewModel };

export function useDecisionReview(client: DecisionApiClient = decisionApiClient) {
  const [state, setState] = useState<DecisionReviewState>({ status: 'idle' });
  const latestRequest = useRef(0);
  const activeAbort = useRef<AbortController | null>(null);
  const lastRequest = useRef<DecisionApiRequestV1 | null>(null);

  const evaluate = useCallback(async (request: DecisionApiRequestV1) => {
    activeAbort.current?.abort();
    const controller = new AbortController();
    activeAbort.current = controller;
    const requestNumber = ++latestRequest.current;
    lastRequest.current = request;
    setState((previous) => ({ status: 'loading', ...(previous.status === 'success' ? { previous: previous.result } : {}) }));

    const result = await client.evaluate(request, controller.signal);
    if (requestNumber !== latestRequest.current || controller.signal.aborted) return;

    if (!result.ok) {
      if (result.error.kind === 'aborted') return;
      setState((previous) => ({ status: 'error', error: result.error, ...(previous.status === 'loading' && previous.previous ? { previous: previous.previous } : {}) }));
      return;
    }

    try {
      setState({ status: 'success', result: createConsideredPlacesViewModel(result.data) });
    } catch (error) {
      const safeError: DecisionApiClientError = {
        kind: 'invalid_response',
        retryable: true,
        message: error instanceof ConsideredPlacesIntegrityError
          ? '검토 결과를 안전하게 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : '장소 검토 결과를 불러오지 못했습니다.',
      };
      setState({ status: 'error', error: safeError });
    }
  }, [client]);

  const retry = useCallback(() => {
    if (lastRequest.current) void evaluate(lastRequest.current);
  }, [evaluate]);

  useEffect(() => () => activeAbort.current?.abort(), []);

  return { state, evaluate, retry };
}
