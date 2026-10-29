import {
  DecisionCandidateDiscoveryErrorV1Schema,
  DecisionCandidateDiscoveryRequestV1Schema,
  parseDecisionCandidateDiscoveryResponseV1,
  type DecisionCandidateDiscoveryRequestV1,
  type DecisionCandidateDiscoveryResponseV1,
} from '@travel-blocks/decision-api-contract';
import { createDecisionJsonRequest, type DecisionHttpError, type DecisionHttpErrorKind, type DecisionHttpResult } from './decisionHttpClient';

export type DecisionCandidateDiscoveryErrorKind = DecisionHttpErrorKind;
export type DecisionCandidateDiscoveryClientError = DecisionHttpError;
export type DecisionCandidateDiscoveryClientResult = DecisionHttpResult<DecisionCandidateDiscoveryResponseV1>;

export interface DecisionCandidateDiscoveryClient {
  discover(request: DecisionCandidateDiscoveryRequestV1, signal?: AbortSignal): Promise<DecisionCandidateDiscoveryClientResult>;
}

export function createDecisionCandidateDiscoveryClient(fetchImpl: typeof fetch = fetch): DecisionCandidateDiscoveryClient {
  return {
    discover: createDecisionJsonRequest({
      endpoint: '/api/v1/decision-candidates/discover',
      requestSchema: DecisionCandidateDiscoveryRequestV1Schema,
      errorSchema: DecisionCandidateDiscoveryErrorV1Schema,
      parseResponse: parseDecisionCandidateDiscoveryResponseV1,
      messages: {
        invalidRequest: '장소 후보 요청을 준비하지 못했습니다.',
        invalidResponse: '장소 후보를 안전하게 확인하지 못했습니다.',
        network: '장소 후보를 불러오지 못했습니다.',
        http: () => '장소 후보를 불러오지 못했습니다.',
      },
    }, fetchImpl),
  };
}

export const decisionCandidateDiscoveryClient = createDecisionCandidateDiscoveryClient();
