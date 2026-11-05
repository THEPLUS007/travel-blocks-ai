import {
  DecisionApiErrorResponseV1Schema,
  DecisionApiRequestV1Schema,
  parseDecisionApiResponseV1,
  type DecisionApiRequestV1,
  type DecisionApiResponseV1,
} from '@travel-blocks/decision-api-contract';
import { createDecisionJsonRequest, type DecisionHttpError, type DecisionHttpErrorKind, type DecisionHttpResult } from './decisionHttpClient';

export type DecisionApiClientErrorKind = DecisionHttpErrorKind;
export type DecisionApiClientError = DecisionHttpError;
export type DecisionApiClientResult = DecisionHttpResult<DecisionApiResponseV1>;

export interface DecisionApiClient {
  evaluate(request: DecisionApiRequestV1, signal?: AbortSignal): Promise<DecisionApiClientResult>;
}

export function createDecisionApiClient(fetchImpl: typeof fetch = fetch): DecisionApiClient {
  return {
    evaluate: createDecisionJsonRequest({
      endpoint: '/api/v1/decisions/evaluate',
      requestSchema: DecisionApiRequestV1Schema,
      errorSchema: DecisionApiErrorResponseV1Schema,
      parseResponse: parseDecisionApiResponseV1,
      messages: {
        invalidRequest: '장소 검토 요청을 준비하지 못했습니다.',
        invalidResponse: '검토 결과를 안전하게 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        network: '장소 검토 결과를 불러오지 못했습니다.',
        http: (status) => status >= 500 ? '장소 검토 결과를 불러오지 못했습니다.' : '장소 검토 요청을 처리하지 못했습니다.',
      },
    }, fetchImpl),
  };
}

export const decisionApiClient = createDecisionApiClient();
