import {
  DECISION_API_MAX_CANDIDATES,
  DecisionCandidateDiscoveryRequestV1Schema,
  DecisionCandidateDiscoveryResponseV1Schema,
  type DecisionCandidateDiscoveryErrorV1,
  type DecisionCandidateDiscoveryRequestV1,
  type DecisionCandidateDiscoveryResponseV1,
} from '@travel-blocks/decision-api-contract';
import { z } from 'zod';
import { retrieveRecommendationCandidates } from './recommendations.js';
import type { PlaceSearchProvider } from './places.js';

export class DecisionCandidateDiscoveryError extends Error {
  constructor(
    public readonly code: DecisionCandidateDiscoveryErrorV1['error']['code'],
    public readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'DecisionCandidateDiscoveryError';
  }
}

export async function discoverDecisionCandidates(
  places: PlaceSearchProvider,
  requestInput: unknown,
  createId: () => string,
): Promise<DecisionCandidateDiscoveryResponseV1> {
  const request = DecisionCandidateDiscoveryRequestV1Schema.parse(requestInput);
  try {
    const candidates = await retrieveRecommendationCandidates(places, {
      city: request.tripContext.destination.city,
      region: request.tripContext.destination.region,
    }, DECISION_API_MAX_CANDIDATES);
    return DecisionCandidateDiscoveryResponseV1Schema.parse({
      contractVersion: 'decision_candidate_discovery_response_v1',
      candidateSetId: createId(),
      tripContext: request.tripContext,
      constraints: request.constraints,
      canonicalOrder: 'candidate_id_ascending',
      candidates: candidates
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          providerReference: { sourceSystem: candidate.provider, sourceRecordId: candidate.providerPlaceId },
          displayName: candidate.name,
          formattedAddress: candidate.formattedAddress,
          category: candidate.category,
        }))
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
        .slice(0, request.candidateLimit ?? DECISION_API_MAX_CANDIDATES),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DecisionCandidateDiscoveryError('CANDIDATE_DISCOVERY_INVARIANT_FAILURE', false, error);
    }
    throw error;
  }
}

export function decisionCandidateDiscoveryError(
  requestId: string,
  code: DecisionCandidateDiscoveryErrorV1['error']['code'],
  retryable: boolean,
): DecisionCandidateDiscoveryErrorV1 {
  const messages = {
    INVALID_DECISION_CANDIDATE_DISCOVERY_REQUEST: '장소 후보 요청 형식이 올바르지 않습니다.',
    FACTUAL_DEPENDENCY_FAILURE: '장소 후보를 불러오지 못했습니다.',
    CANDIDATE_DISCOVERY_INVARIANT_FAILURE: '장소 후보를 안전하게 구성하지 못했습니다.',
  } as const;
  return {
    contractVersion: 'decision_candidate_discovery_error_v1',
    error: { code, message: messages[code], retryable, requestId },
  };
}
