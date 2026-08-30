import { randomUUID } from 'node:crypto';
import { PlaceRankingInputSchema, type PlaceRankingCandidate, type PlaceRankingResult, type RecommendationInput, type TravelBlock, type TravelBlockCategory } from '@travel-blocks/shared';
import type { PlaceSearchProvider } from './places.js';

const candidateQueries: Array<{ query: string; category: TravelBlockCategory }> = [
  { query: 'popular attractions', category: 'sightseeing' },
  { query: 'local restaurants', category: 'food' },
  { query: 'cafes', category: 'cafe' },
  { query: 'activities', category: 'activity' },
];

export async function retrievePlaceCandidates(places: PlaceSearchProvider, input: RecommendationInput): Promise<PlaceRankingCandidate[]> {
  const existing = new Set(input.existingPlaces.flatMap((block) => block.place ? [`${block.place.provider}:${block.place.providerPlaceId}`] : []));
  const searches = await Promise.all(candidateQueries.map(({ query, category }) => places.search({
    query,
    category,
    city: input.day.city || input.trip.city || undefined,
    region: input.day.region,
  })));
  const seen = new Set(existing);
  const candidates: PlaceRankingCandidate[] = [];
  for (const place of searches.flat()) {
    const candidateId = `${place.provider}:${place.providerPlaceId}`;
    if (seen.has(candidateId)) continue;
    seen.add(candidateId);
    candidates.push({ ...place, candidateId });
    if (candidates.length === 40) break;
  }
  return candidates;
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
