import type { PlaceOpeningHoursSnapshot } from '@travel-blocks/domain';
import type { CandidatePlaceFacts, CandidatePlaceReference, CandidateRouteAcquisitionContext, CandidateRouteFacts } from './contracts.js';

/** Provider-neutral ports. Concrete adapters own transport, credentials, timeout, and retry. */
export interface CandidatePlaceFactSource {
  getPlaceFacts(reference: CandidatePlaceReference): Promise<CandidatePlaceFacts | null>;
}

/** Reuses P1's provider-neutral normalized opening-hours snapshot rather than raw provider payloads. */
export interface CandidateOpeningHoursFactSource {
  getOpeningHours(reference: CandidatePlaceReference): Promise<PlaceOpeningHoursSnapshot | null>;
}

/** Structural adapter for the existing P1 PlaceOpeningHoursProvider without importing apps/api. */
export interface PlaceOpeningHoursLookup {
  getOpeningHours(placeId: string): Promise<PlaceOpeningHoursSnapshot | null>;
}

export function createOpeningHoursFactSource(source: PlaceOpeningHoursLookup): CandidateOpeningHoursFactSource {
  return { getOpeningHours: (reference) => source.getOpeningHours(reference.sourceRecordId) };
}

export interface CandidateRouteFactSource {
  getRouteFacts(input: CandidateRouteAcquisitionContext & { destinationReference: CandidatePlaceReference; destination: { latitude: number; longitude: number } }): Promise<CandidateRouteFacts | null>;
}

export interface CandidateFactualEnrichmentSources {
  place?: CandidatePlaceFactSource;
  openingHours?: CandidateOpeningHoursFactSource;
  route?: CandidateRouteFactSource;
}
