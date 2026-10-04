import { randomUUID } from 'node:crypto';
import { PlaceRankingCandidateSchema, PlaceRankingInputSchema, VerifiedPlaceSchema, type PlaceRankingCandidate, type PlaceRankingResult, type RecommendationInput, type TravelBlock, type TravelBlockCategory } from '@travel-blocks/shared';
import type { PlaceSearchProvider } from './places.js';

export const RECOMMENDATION_CANDIDATE_QUERIES: ReadonlyArray<{ readonly query: string; readonly category: TravelBlockCategory }> = [
  { query: 'popular attractions', category: 'sightseeing' },
  { query: 'local restaurants', category: 'food' },
  { query: 'cafes', category: 'cafe' },
  { query: 'activities', category: 'activity' },
];

export interface RecommendationCandidateRetrievalContext {
  readonly city?: string;
  readonly region?: string;
  readonly existingProviderReferences?: readonly string[];
}

/** Reuses the existing category retrieval/fail-closed policy before any preview composition. */
export async function retrieveRecommendationCandidates(
  places: PlaceSearchProvider,
  context: RecommendationCandidateRetrievalContext,
  limit: number,
): Promise<PlaceRankingCandidate[]> {
  const searches = await Promise.all(RECOMMENDATION_CANDIDATE_QUERIES.map(({ query, category }) => places.search({
    query,
    category,
    city: context.city,
    region: context.region,
  })));
  const seen = new Set(context.existingProviderReferences ?? []);
  const candidates: PlaceRankingCandidate[] = [];
  for (const result of searches.flat()) {
    const place = VerifiedPlaceSchema.parse(result);
    const candidateId = `${place.provider}:${place.providerPlaceId}`;
    if (seen.has(candidateId)) continue;
    seen.add(candidateId);
    candidates.push(PlaceRankingCandidateSchema.parse({ ...place, candidateId }));
    if (candidates.length === limit) break;
  }
  return candidates;
}

export async function retrievePlaceCandidates(places: PlaceSearchProvider, input: RecommendationInput): Promise<PlaceRankingCandidate[]> {
  const existing = new Set(input.existingPlaces.flatMap((block) => block.place ? [`${block.place.provider}:${block.place.providerPlaceId}`] : []));
  return retrieveRecommendationCandidates(places, {
    city: input.day.city || input.trip.city || undefined,
    region: input.day.region,
    existingProviderReferences: [...existing],
  }, 40);
}

export function buildPlaceRankingInput(input: RecommendationInput, candidates: PlaceRankingCandidate[]) {
  return PlaceRankingInputSchema.parse({ ...input, candidates });
}

export function selectedPlacesToBlocks(candidates: PlaceRankingCandidate[], ranking: PlaceRankingResult): TravelBlock[] {
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  return ranking.selections.flatMap(({ candidateId, reason }) => {
    const place = byId.get(candidateId);
    if (!place) return [];
    return [{
      id: randomUUID(),
      title: place.name,
      category: place.category,
      priceLevel: 'medium' as const,
      location: place.formattedAddress,
      memo: reason,
      place: { provider: place.provider, providerPlaceId: place.providerPlaceId, verified: true as const },
    }];
  });
}
