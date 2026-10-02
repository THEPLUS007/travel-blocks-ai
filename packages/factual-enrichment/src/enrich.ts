import {
  CandidateFactSnapshotSchema,
  NormalizedOpeningHoursSnapshotSchema,
  type CandidateFactSnapshot,
  type CoordinatesFactSchema,
  type OpeningHoursFactSchema,
  type BusinessStatusFactSchema,
  type TimeZoneFactSchema,
  type PriceFactSchema,
  type RouteFactSchema,
} from '@travel-blocks/decision-engine';
import { type PlaceOpeningHoursSnapshot } from '@travel-blocks/domain';
import { z } from 'zod';
import {
  CandidatePlaceFactsSchema,
  CandidateRouteFactsSchema,
  type CandidateFactualEnrichmentRequest,
  type CandidateFactualEnrichmentResult,
  validateCandidateFactualEnrichmentRequest,
  validateCandidateFactualEnrichmentResult,
} from './contracts.js';
import type { CandidateFactualEnrichmentSources } from './ports.js';

const DEFAULT_CONCURRENCY = 4;
const concurrencySchema = z.number().int().positive().max(32);

type CoordinatesFact = z.infer<typeof CoordinatesFactSchema>;
type OpeningHoursFact = z.infer<typeof OpeningHoursFactSchema>;
type BusinessStatusFact = z.infer<typeof BusinessStatusFactSchema>;
type TimeZoneFact = z.infer<typeof TimeZoneFactSchema>;
type PriceFact = z.infer<typeof PriceFactSchema>;
type RouteFact = z.infer<typeof RouteFactSchema>;
type FactState = 'known' | 'unknown' | 'unavailable' | 'invalid' | 'untrusted';
type AnyFact = CoordinatesFact | OpeningHoursFact | BusinessStatusFact | TimeZoneFact | PriceFact | RouteFact;
type Provenance = CandidateFactSnapshot['provenance'];

export interface CandidateFactualEnrichmentOptions {
  /** Per-source bound; sources are invoked in deterministic stages and never retried here. */
  concurrency?: number;
}

interface SourceObservation {
  state: 'success' | 'invalid' | 'unavailable';
  provenance?: Provenance;
  retrievedAt?: string;
}

interface OpeningObservation extends SourceObservation {
  coordinates?: CoordinatesFact;
  businessStatus?: BusinessStatusFact;
  timeZone?: TimeZoneFact;
  openingHours?: OpeningHoursFact;
}

interface PlaceObservation extends SourceObservation {
  coordinates?: CoordinatesFact;
  businessStatus?: BusinessStatusFact;
  timeZone?: TimeZoneFact;
}

interface RouteObservation extends SourceObservation {
  route?: RouteFact;
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function referenceKey(reference: { sourceSystem: string; sourceRecordId: string }): string {
  return `${reference.sourceSystem}\u0000${reference.sourceRecordId}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function severity(state: FactState): number {
  return state === 'untrusted' ? 4 : state === 'invalid' ? 3 : state === 'unavailable' ? 2 : state === 'unknown' ? 1 : 0;
}

function mergeFact<T extends AnyFact>(existing: T, incoming: T, existingAt: string, incomingAt: string): T {
  if (incoming.state === 'known') {
    if (existing.state !== 'known') return incoming;
    if (sameValue(existing.value, incoming.value)) return incomingAt > existingAt ? incoming : existing;
    if (incomingAt > existingAt) return incoming;
    if (incomingAt < existingAt) return existing;
    return { state: 'untrusted' } as T;
  }
  if (existing.state === 'known') return existing;
  return severity(incoming.state) > severity(existing.state) ? incoming : existing;
}

function mergeTimedFact<T extends AnyFact>(existing: T, incoming: T, existingAt: string, incomingAt: string): { fact: T; retrievedAt: string } {
  const fact = mergeFact(existing, incoming, existingAt, incomingAt);
  return { fact, retrievedAt: fact === existing ? existingAt : incomingAt };
}

function initialFact<T extends AnyFact>(existing: T | undefined, unavailable: T): T {
  return existing ?? unavailable;
}

function sourceBaseline<T extends AnyFact>(existing: T | undefined, observation: SourceObservation): T {
  if (existing) return existing;
  return { state: observation.state === 'unavailable' ? 'unavailable' : 'unknown' } as T;
}

function normalisedProvenance(value: unknown): { provenance: Provenance; retrievedAt: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const result = z.object({
    provenance: CandidateFactSnapshotSchema.shape.provenance,
    retrievedAt: z.string().datetime({ offset: true }),
  }).safeParse(source);
  if (!result.success || result.data.provenance.retrievedAt !== result.data.retrievedAt) return undefined;
  return result.data;
}

function observePlace(raw: unknown): PlaceObservation {
  if (raw === null) return {
    state: 'success', coordinates: { state: 'unknown' }, businessStatus: { state: 'unknown' }, timeZone: { state: 'unknown' },
  };
  const parsed = CandidatePlaceFactsSchema.safeParse(raw);
  if (!parsed.success) return { state: 'invalid' };
  const facts = parsed.data;
  return {
    state: 'success', provenance: facts.provenance, retrievedAt: facts.retrievedAt,
    coordinates: facts.coordinates ? { state: 'known', value: facts.coordinates } : { state: 'unknown' },
    businessStatus: facts.businessStatus ? { state: 'known', value: facts.businessStatus } : { state: 'unknown' },
    timeZone: facts.timeZone ? { state: 'known', value: facts.timeZone } : { state: 'unknown' },
  };
}

function observeOpeningHours(raw: PlaceOpeningHoursSnapshot | null): OpeningObservation {
  if (raw === null) return { state: 'success', coordinates: { state: 'unknown' }, businessStatus: { state: 'unknown' }, timeZone: { state: 'unknown' }, openingHours: { state: 'unknown' } };
  const provenance = normalisedProvenance({
    provenance: { sourceSystem: raw.provider, sourceRecordId: raw.providerPlaceId, sourceKind: 'factual_provider', retrievedAt: raw.retrievedAt },
    retrievedAt: raw.retrievedAt,
  });
  if (!provenance) return { state: 'invalid' };
  const businessStatus = raw.businessStatus && raw.businessStatus !== 'unknown'
    ? z.enum(['operational', 'temporarily_closed', 'permanently_closed', 'future_opening']).safeParse(raw.businessStatus)
    : undefined;
  const timeZone = typeof raw.timeZone === 'string' && raw.timeZone.trim() ? raw.timeZone.trim() : undefined;
  const hours = NormalizedOpeningHoursSnapshotSchema.safeParse({
    ...(raw.businessStatus && raw.businessStatus !== 'unknown' ? { businessStatus: raw.businessStatus } : {}),
    ...(timeZone ? { timeZone } : {}),
    ...(raw.currentHours ? { currentHours: raw.currentHours } : {}),
    ...(raw.regularHours ? { regularHours: raw.regularHours } : {}),
    dataQualityFlags: raw.dataQualityFlags,
  });
  if (!hours.success || (businessStatus && !businessStatus.success)) return { state: 'invalid', ...provenance };
  return {
    state: 'success', ...provenance,
    coordinates: { state: 'unknown' },
    businessStatus: businessStatus?.success ? { state: 'known', value: businessStatus.data } : { state: 'unknown' },
    timeZone: timeZone ? { state: 'known', value: timeZone } : { state: 'unknown' },
    openingHours: raw.currentHours || raw.regularHours ? { state: 'known', value: hours.data } : { state: 'unknown' },
  };
}

function observeRoute(raw: unknown, expectedMode: string): RouteObservation {
  if (raw === null) return { state: 'success', route: { state: 'unknown' } };
  const parsed = CandidateRouteFactsSchema.safeParse(raw);
  if (!parsed.success || parsed.data.transportMode !== expectedMode) return { state: 'invalid', route: { state: 'invalid' } };
  const facts = parsed.data;
  return {
    state: 'success', provenance: facts.provenance, retrievedAt: facts.retrievedAt,
    route: { state: 'known', value: { ...(facts.distanceKm === undefined ? {} : { distanceKm: facts.distanceKm }), ...(facts.durationMinutes === undefined ? {} : { durationMinutes: facts.durationMinutes }), transportMode: facts.transportMode } },
  };
}

async function mapBounded<T, TResult>(items: readonly T[], concurrency: number, operation: (item: T) => Promise<TResult>): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function placeObservations(request: CandidateFactualEnrichmentRequest, sources: CandidateFactualEnrichmentSources, concurrency: number): Promise<Map<string, PlaceObservation>> {
  const references = [...new Map(request.candidates.map((candidate) => [referenceKey(candidate.place.reference), candidate.place.reference])).entries()]
    .sort(([left], [right]) => compareId(left, right));
  if (!sources.place) return new Map(references.map(([key]) => [key, { state: 'unavailable' }]));
  const observations = await mapBounded(references, concurrency, async ([key, reference]) => [key, observePlace(await sources.place!.getPlaceFacts(reference))] as const);
  return new Map(observations);
}

async function openingObservations(request: CandidateFactualEnrichmentRequest, sources: CandidateFactualEnrichmentSources, concurrency: number): Promise<Map<string, OpeningObservation>> {
  const references = [...new Map(request.candidates.map((candidate) => [referenceKey(candidate.place.reference), candidate.place.reference])).entries()]
    .sort(([left], [right]) => compareId(left, right));
  if (!sources.openingHours) return new Map(references.map(([key]) => [key, { state: 'unavailable', openingHours: { state: 'unavailable' } }]));
  const observations = await mapBounded(references, concurrency, async ([key, reference]) => [key, observeOpeningHours(await sources.openingHours!.getOpeningHours(reference))] as const);
  return new Map(observations);
}

function latestProvenance(base: { provenance: Provenance; retrievedAt: string }, observations: readonly SourceObservation[]): { provenance: Provenance; retrievedAt: string } {
  return observations.reduce((latest, observation) => observation.provenance && observation.retrievedAt && observation.retrievedAt > latest.retrievedAt
    ? { provenance: observation.provenance, retrievedAt: observation.retrievedAt }
    : latest, base);
}

function snapshotAvailability(existing: CandidateFactSnapshot | undefined, observations: readonly SourceObservation[], hasConflict: boolean): FactState {
  if (hasConflict) return 'untrusted';
  if (existing?.availability === 'known' || observations.some((observation) => observation.state === 'success')) return 'known';
  if (existing?.availability === 'untrusted') return 'untrusted';
  if (existing?.availability === 'invalid' || observations.some((observation) => observation.state === 'invalid')) return 'invalid';
  if (existing?.availability === 'unknown') return 'unknown';
  return 'unavailable';
}

/**
 * Side-effect boundary: acquire and normalize facts only. Provider rejections
 * propagate unchanged; this function performs no retry, fallback, or decision.
 */
export async function enrichCandidateFacts(requestInput: unknown, sources: CandidateFactualEnrichmentSources, options: CandidateFactualEnrichmentOptions = {}): Promise<CandidateFactualEnrichmentResult> {
  const request = validateCandidateFactualEnrichmentRequest(requestInput);
  const concurrency = concurrencySchema.parse(options.concurrency ?? DEFAULT_CONCURRENCY);
  const places = await placeObservations(request, sources, concurrency);
  const openings = await openingObservations(request, sources, concurrency);
  const existingBySnapshotId = new Map(request.existingFacts.map((fact) => [fact.factSnapshotId, fact]));
  const baseSnapshots = request.candidates.map((candidate) => {
    const existing = existingBySnapshotId.get(candidate.factSnapshotId);
    const place = places.get(referenceKey(candidate.place.reference)) ?? { state: 'unavailable' };
    const opening = openings.get(referenceKey(candidate.place.reference)) ?? { state: 'unavailable', openingHours: { state: 'unavailable' as const } };
    const existingAt = existing?.retrievedAt ?? request.context.retrievedAt;
    const placeAt = place.retrievedAt ?? request.context.retrievedAt;
    const openingAt = opening.retrievedAt ?? request.context.retrievedAt;
    const coordinates = mergeTimedFact(sourceBaseline(existing?.coordinates, place), place.coordinates ?? { state: place.state === 'invalid' ? 'invalid' : place.state === 'unavailable' ? 'unavailable' : 'unknown' }, existingAt, placeAt).fact;
    const placeBusiness = mergeTimedFact(sourceBaseline(existing?.businessStatus, place), place.businessStatus ?? { state: place.state === 'invalid' ? 'invalid' : place.state === 'unavailable' ? 'unavailable' : 'unknown' }, existingAt, placeAt);
    const businessStatus = mergeTimedFact(
      placeBusiness.fact,
      opening.businessStatus ?? { state: opening.state === 'invalid' ? 'invalid' : opening.state === 'unavailable' ? 'unavailable' : 'unknown' },
      placeBusiness.retrievedAt, openingAt,
    ).fact;
    const placeTimeZone = mergeTimedFact(sourceBaseline(existing?.timeZone, place), place.timeZone ?? { state: place.state === 'invalid' ? 'invalid' : place.state === 'unavailable' ? 'unavailable' : 'unknown' }, existingAt, placeAt);
    const timeZone = mergeTimedFact(
      placeTimeZone.fact,
      opening.timeZone ?? { state: opening.state === 'invalid' ? 'invalid' : opening.state === 'unavailable' ? 'unavailable' : 'unknown' },
      placeTimeZone.retrievedAt, openingAt,
    ).fact;
    const openingHours = mergeTimedFact(sourceBaseline(existing?.openingHours, opening), opening.openingHours ?? { state: opening.state === 'invalid' ? 'invalid' : opening.state === 'unavailable' ? 'unavailable' : 'unknown' }, existingAt, openingAt).fact;
    const price = initialFact(existing?.price, { state: 'unknown' } as PriceFact);
    const route = initialFact(existing?.route, { state: 'unavailable' } as RouteFact);
    const hasConflict = [coordinates, businessStatus, timeZone, openingHours, price, route].some((fact) => fact.state === 'untrusted');
    const source = latestProvenance({ provenance: existing?.provenance ?? request.context.provenance, retrievedAt: existing?.retrievedAt ?? request.context.retrievedAt }, [place, opening]);
    return { candidate, existing, place, opening, coordinates, businessStatus, timeZone, openingHours, price, route, hasConflict, source };
  });

  const routeObservations = new Map<string, RouteObservation>();
  if (request.context.route && sources.route) {
    const routable = [...new Map(baseSnapshots.flatMap((item) => item.coordinates.state === 'known'
      ? [[referenceKey(item.candidate.place.reference), { reference: item.candidate.place.reference, destination: item.coordinates.value }] as const]
      : [])).entries()].sort(([left], [right]) => compareId(left, right));
    const routes = await mapBounded(routable, concurrency, async ([key, route]) => [key, observeRoute(await sources.route!.getRouteFacts({ ...request.context.route!, destinationReference: route.reference, destination: route.destination }), request.context.route!.transportMode)] as const);
    for (const [key, route] of routes) routeObservations.set(key, route);
  }

  const snapshots = baseSnapshots.map((item) => {
    const existingAt = item.existing?.retrievedAt ?? request.context.retrievedAt;
    const routeObservation = routeObservations.get(referenceKey(item.candidate.place.reference));
    const route = routeObservation
      ? mergeFact(item.route, routeObservation.route ?? { state: routeObservation.state === 'invalid' ? 'invalid' : 'unknown' }, existingAt, routeObservation.retrievedAt ?? request.context.retrievedAt)
      : request.context.route ? mergeFact(item.route, { state: 'unavailable' }, existingAt, request.context.retrievedAt) : item.route;
    const hasConflict = item.hasConflict || route.state === 'untrusted';
    const source = latestProvenance(item.source, routeObservation ? [routeObservation] : []);
    return CandidateFactSnapshotSchema.parse({
      factSnapshotId: item.candidate.factSnapshotId,
      candidateId: item.candidate.candidateId,
      availability: snapshotAvailability(item.existing, [item.place, item.opening, ...(routeObservation ? [routeObservation] : [])], hasConflict),
      coordinates: item.coordinates,
      openingHours: item.openingHours,
      businessStatus: item.businessStatus,
      timeZone: item.timeZone,
      price: item.price,
      route,
      retrievedAt: source.retrievedAt,
      provenance: source.provenance,
    });
  }).sort((left, right) => compareId(left.candidateId, right.candidateId));
  const result = {
    contractVersion: 'candidate_factual_enrichment_result_v1' as const,
    requestId: request.requestId,
    snapshots,
    coverage: {
      accountedCandidates: request.candidates.length,
      knownSnapshots: snapshots.filter((snapshot) => snapshot.availability === 'known').length,
      incompleteSnapshots: snapshots.filter((snapshot) => snapshot.availability !== 'known').length,
    },
  };
  return validateCandidateFactualEnrichmentResult(request, result);
}
