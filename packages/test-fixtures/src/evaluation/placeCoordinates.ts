import type { RouteCoordinate } from '@travel-blocks/domain';
import { evaluationCandidateIds } from './expectedPlaces.js';

const cityCenters: Record<string, RouteCoordinate> = {
  서울: { latitude: 37.5665, longitude: 126.9780 },
  부산: { latitude: 35.1796, longitude: 129.0756 },
  오사카: { latitude: 34.6937, longitude: 135.5023 },
  제주: { latitude: 33.4996, longitude: 126.5312 },
  도쿄: { latitude: 35.6762, longitude: 139.6503 },
  경주: { latitude: 35.8562, longitude: 129.2247 },
};

/** Minimal curated coordinates for deterministic evaluation, never provider payloads. */
export function evaluationCoordinatesForScenario(scenarioId: string, city: string, durationDays: number): Record<string, RouteCoordinate> {
  const center = cityCenters[city];
  if (!center) throw new Error(`No deterministic coordinate fixture for ${city}`);
  return Object.fromEntries(evaluationCandidateIds(scenarioId, durationDays).map((placeId, index) => {
    const withinDay = index % 3;
    const dayOffset = Math.floor(index / 3) * 0.001;
    return [placeId, {
      latitude: center.latitude + dayOffset + withinDay * 0.004,
      longitude: center.longitude + dayOffset + withinDay * 0.004,
    }];
  }));
}
