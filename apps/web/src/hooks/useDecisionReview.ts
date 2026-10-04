import { useCallback, useEffect, useRef, useState } from 'react';
import type { DecisionApiRequestV1, DecisionCandidateDiscoveryRequestV1 } from '@travel-blocks/decision-api-contract';
import { decisionApiClient, type DecisionApiClient, type DecisionApiClientError } from '../services/decisionApiClient';
import { decisionCandidateDiscoveryClient, type DecisionCandidateDiscoveryClient, type DecisionCandidateDiscoveryClientError } from '../services/decisionCandidateDiscoveryClient';
import { ConsideredPlacesIntegrityError, createConsideredPlacesViewModel, type ConsideredPlacesViewModel } from '../features/consideredPlaces/model';

type ReviewError = DecisionApiClientError | DecisionCandidateDiscoveryClientError;

export type DecisionReviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'discovering_candidates' }
  | { readonly status: 'evaluating_decision' }
  | { readonly status: 'empty' }
  | { readonly status: 'success'; readonly result: ConsideredPlacesViewModel }
  | { readonly status: 'error'; readonly stage: 'discovery' | 'decision'; readonly error: ReviewError };

export interface DecisionReviewClients {
  readonly discovery: DecisionCandidateDiscoveryClient;
  readonly decision: DecisionApiClient;
}

const defaultClients: DecisionReviewClients = { discovery: decisionCandidateDiscoveryClient, decision: decisionApiClient };

function decisionRequestFromCandidateSet(candidateSet: Awaited<ReturnType<DecisionCandidateDiscoveryClient['discover']>> & { readonly ok: true }): DecisionApiRequestV1 {
  return {
    contractVersion: 'decision_api_request_v1',
    tripContext: candidateSet.data.tripContext,
    constraints: candidateSet.data.constraints,
    candidates: candidateSet.data.candidates.map((candidate) => ({ candidateId: candidate.candidateId, providerReference: candidate.providerReference })),
  };
}

/** Owns the explicit discovery → decision sequence and retains no result outside React memory. */
export function useDecisionReview(clients: DecisionReviewClients = defaultClients) {
  const [state, setState] = useState<DecisionReviewState>({ status: 'idle' });
  const latestRequest = useRef(0);
  const activeAbort = useRef<AbortController | null>(null);
  const activePromise = useRef<Promise<void> | null>(null);
  const lastRequest = useRef<DecisionCandidateDiscoveryRequestV1 | null>(null);

  const review = useCallback((request: DecisionCandidateDiscoveryRequestV1): Promise<void> => {
    if (activePromise.current) return activePromise.current;
    const controller = new AbortController();
    activeAbort.current?.abort();
    activeAbort.current = controller;
    const requestNumber = ++latestRequest.current;
    lastRequest.current = request;
    const operation = (async () => {
      setState({ status: 'discovering_candidates' });
      const candidateSet = await clients.discovery.discover(request, controller.signal);
      if (requestNumber !== latestRequest.current || controller.signal.aborted) return;
      if (!candidateSet.ok) {
        if (candidateSet.error.kind !== 'aborted') setState({ status: 'error', stage: 'discovery', error: candidateSet.error });
        return;
      }
      if (candidateSet.data.candidates.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      setState({ status: 'evaluating_decision' });
      const decision = await clients.decision.evaluate(decisionRequestFromCandidateSet(candidateSet), controller.signal);
      if (requestNumber !== latestRequest.current || controller.signal.aborted) return;
      if (!decision.ok) {
        if (decision.error.kind !== 'aborted') setState({ status: 'error', stage: 'decision', error: decision.error });
        return;
      }
      try {
        setState({ status: 'success', result: createConsideredPlacesViewModel(decision.data) });
      } catch (error) {
        setState({ status: 'error', stage: 'decision', error: {
          kind: 'invalid_response',
          retryable: true,
          message: error instanceof ConsideredPlacesIntegrityError ? '검토 결과를 안전하게 표시하지 못했습니다.' : '장소 검토 결과를 만들지 못했습니다.',
        } });
      }
    })().finally(() => {
      if (requestNumber === latestRequest.current) activePromise.current = null;
    });
    activePromise.current = operation;
    return operation;
  }, [clients]);

  const retry = useCallback(() => {
    if (lastRequest.current) void review(lastRequest.current);
  }, [review]);

  const reset = useCallback(() => {
    latestRequest.current += 1;
    activeAbort.current?.abort();
    activePromise.current = null;
    lastRequest.current = null;
    setState({ status: 'idle' });
  }, []);

  useEffect(() => () => {
    latestRequest.current += 1;
    activeAbort.current?.abort();
  }, []);

  return { state, review, retry, reset };
}
