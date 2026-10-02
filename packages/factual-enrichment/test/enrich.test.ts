import { describe, expect, it, vi } from 'vitest';
import {
  CandidateFactualEnrichmentRequestSchema,
  createOpeningHoursFactSource,
  enrichCandidateFacts,
  validateCandidateFactualEnrichmentResult,
} from '../src/index.js';

const time = '2026-10-02T12:00:00.000Z';
const newerTime = '2026-10-03T12:00:00.000Z';
const provenance = (record = 'record-1', retrievedAt = time) => ({ sourceSystem: 'fixture-provider', sourceRecordId: record, sourceKind: 'curated_fixture' as const, retrievedAt });

function candidate(id: string, reference = `place-${id}`) {
  return {
    candidateId: id,
    place: { reference: { sourceSystem: 'fixture-provider', sourceRecordId: reference }, displayName: id, category: 'sightseeing' as const },
    factSnapshotId: `fact-${id}`,
    discoveredAt: time,
    provenance: provenance(`candidate-${id}`),
  };
}

function request(candidates = [candidate('candidate-b'), candidate('candidate-a')], existingFacts: unknown[] = [], route?: unknown) {
  return {
    contractVersion: 'candidate_factual_enrichment_request_v1' as const,
    requestId: 'enrichment-request-1',
    candidates,
    existingFacts,
    context: { retrievedAt: time, provenance: provenance('enrichment-context'), ...(route ? { route } : {}) },
  };
}

function snapshot(id: string, overrides: Record<string, unknown> = {}) {
  const unknown = { state: 'unknown' as const };
  return {
    factSnapshotId: `fact-${id}`,
    candidateId: id,
    availability: 'known' as const,
    coordinates: unknown,
    openingHours: unknown,
    businessStatus: unknown,
    timeZone: unknown,
    price: unknown,
    route: unknown,
    retrievedAt: time,
    provenance: provenance(`existing-${id}`),
    ...overrides,
  };
}

const placeFacts = (record: string, retrievedAt = time) => ({
  provenance: provenance(record, retrievedAt), retrievedAt,
  coordinates: { latitude: 37.5796, longitude: 126.977 },
  businessStatus: 'operational' as const,
  timeZone: 'Asia/Seoul',
});

describe('P2-FE-1 candidate factual enrichment', () => {
  it('normalizes place and P1 opening-hours facts into canonical snapshots without raw payloads', async () => {
    const places = { getPlaceFacts: vi.fn(async () => placeFacts('place-detail')) };
    const openingHours = { getOpeningHours: vi.fn(async () => ({
      provider: 'fixture-provider', providerPlaceId: 'place-candidate-a', source: 'fixture', retrievedAt: newerTime,
      businessStatus: 'operational' as const, timeZone: 'Asia/Seoul',
      currentHours: { periods: [{ openDay: 5, openTime: '22:00', closeDay: 6, closeTime: '02:00' }] },
      regularHours: { periods: [{ openDay: 1, openTime: '00:00' }] },
      dataQualityFlags: [],
    })) };
    const input = request([candidate('candidate-b'), candidate('candidate-a')]);
    const result = await enrichCandidateFacts(input, { place: places, openingHours });
    expect(result.snapshots.map((item) => item.candidateId)).toEqual(['candidate-a', 'candidate-b']);
    expect(result.snapshots[0]).toMatchObject({
      availability: 'known', retrievedAt: newerTime,
      coordinates: { state: 'known', value: { latitude: 37.5796, longitude: 126.977 } },
      businessStatus: { state: 'known', value: 'operational' }, timeZone: { state: 'known', value: 'Asia/Seoul' },
      openingHours: { state: 'known', value: { currentHours: { periods: [{ openDay: 5, openTime: '22:00', closeDay: 6, closeTime: '02:00' }] }, regularHours: { periods: [{ openDay: 1, openTime: '00:00' }] } } },
      price: { state: 'unknown' }, route: { state: 'unavailable' },
    });
    expect(JSON.stringify(result)).not.toContain('rawResponse');
    expect(validateCandidateFactualEnrichmentResult(input, result)).toEqual(result);
  });

  it('records a successful lookup with missing factual fields as unknown rather than a provider failure', async () => {
    const result = await enrichCandidateFacts(request([candidate('candidate-a')]), {
      place: { getPlaceFacts: async () => null },
      openingHours: { getOpeningHours: async () => null },
    });
    expect(result.snapshots[0]).toMatchObject({
      availability: 'known', coordinates: { state: 'unknown' }, businessStatus: { state: 'unknown' },
      timeZone: { state: 'unknown' }, openingHours: { state: 'unknown' }, price: { state: 'unknown' },
    });
  });

  it('adapts the existing P1 place-id opening-hours lookup without importing an API provider', async () => {
    const getOpeningHours = vi.fn(async () => null);
    const source = createOpeningHoursFactSource({ getOpeningHours });
    await source.getOpeningHours({ sourceSystem: 'fixture-provider', sourceRecordId: 'place-1' });
    expect(getOpeningHours).toHaveBeenCalledWith('place-1');
  });

  it('propagates provider failures unchanged, without retry, fallback, or candidate drop', async () => {
    const failure = Object.assign(new Error('timeout'), { code: 'timeout', retryable: true });
    const getPlaceFacts = vi.fn(async () => { throw failure; });
    const input = request([candidate('candidate-a', 'same'), candidate('candidate-b', 'same')]);
    await expect(enrichCandidateFacts(input, { place: { getPlaceFacts } })).rejects.toBe(failure);
    expect(getPlaceFacts).toHaveBeenCalledOnce();
  });

  it('acquires route facts only with explicit origin and mode, preserving provider mode and no-route context as unavailable', async () => {
    const getRouteFacts = vi.fn(async () => ({ provenance: provenance('route', newerTime), retrievedAt: newerTime, durationMinutes: 17, distanceKm: 4.2, transportMode: 'subway' as const }));
    const sources = { place: { getPlaceFacts: async () => placeFacts('place') }, route: { getRouteFacts } };
    const noContext = await enrichCandidateFacts(request([candidate('candidate-a')]), sources);
    expect(noContext.snapshots[0].route).toEqual({ state: 'unavailable' });
    expect(getRouteFacts).not.toHaveBeenCalled();
    const context = { requestId: 'route-request-1', origin: { latitude: 37.5, longitude: 126.9 }, transportMode: 'subway' as const };
    const withContext = await enrichCandidateFacts(request([candidate('candidate-a')], [], context), sources);
    expect(withContext.snapshots[0].route).toEqual({ state: 'known', value: { durationMinutes: 17, distanceKm: 4.2, transportMode: 'subway' } });
    expect(getRouteFacts).toHaveBeenCalledOnce();
    expect(getRouteFacts.mock.calls[0][0]).toMatchObject({ requestId: 'route-request-1', transportMode: 'subway', destinationReference: { sourceRecordId: 'place-candidate-a' } });
  });

  it('does not call route source when destination coordinates are unavailable and marks the requested route unavailable', async () => {
    const getRouteFacts = vi.fn();
    const context = { requestId: 'route-request-1', origin: { latitude: 37.5, longitude: 126.9 }, transportMode: 'walk' as const };
    const result = await enrichCandidateFacts(request([candidate('candidate-a')], [], context), { place: { getPlaceFacts: async () => null }, route: { getRouteFacts } });
    expect(getRouteFacts).not.toHaveBeenCalled();
    expect(result.snapshots[0].route).toEqual({ state: 'unavailable' });
  });

  it('uses bounded per-source concurrency, deduplicates references, and has canonical output independent of candidate order', async () => {
    let active = 0;
    let maximumActive = 0;
    const getPlaceFacts = vi.fn(async (reference: { sourceRecordId: string }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return placeFacts(`detail-${reference.sourceRecordId}`);
    });
    const candidates = [candidate('candidate-c', 'shared'), candidate('candidate-a', 'shared'), candidate('candidate-b', 'other')];
    const first = await enrichCandidateFacts(request(candidates), { place: { getPlaceFacts } }, { concurrency: 1 });
    const second = await enrichCandidateFacts(request([...candidates].reverse()), { place: { getPlaceFacts: async () => placeFacts('detail') } }, { concurrency: 1 });
    expect(maximumActive).toBeLessThanOrEqual(1);
    expect(getPlaceFacts).toHaveBeenCalledTimes(2);
    expect(first.snapshots.map((item) => item.candidateId)).toEqual(['candidate-a', 'candidate-b', 'candidate-c']);
    expect(second.snapshots.map((item) => item.candidateId)).toEqual(first.snapshots.map((item) => item.candidateId));
  });

  it('merges deterministically: known beats unknown, newer known wins, and equal-time conflicts become untrusted', async () => {
    const candidates = [candidate('candidate-known'), candidate('candidate-newer'), candidate('candidate-conflict')];
    const existing = [
      snapshot('candidate-known', { coordinates: { state: 'known', value: { latitude: 1, longitude: 2 } } }),
      snapshot('candidate-newer', { retrievedAt: time, provenance: provenance('existing-newer', time), coordinates: { state: 'known', value: { latitude: 1, longitude: 2 } } }),
      snapshot('candidate-conflict', { coordinates: { state: 'known', value: { latitude: 1, longitude: 2 } } }),
    ];
    const result = await enrichCandidateFacts(request(candidates, existing), {
      place: { getPlaceFacts: async (reference) => reference.sourceRecordId === 'place-candidate-known'
        ? { provenance: provenance('unknown-place'), retrievedAt: newerTime }
        : reference.sourceRecordId === 'place-candidate-newer'
          ? { ...placeFacts('newer-place', newerTime), coordinates: { latitude: 3, longitude: 4 } }
          : { ...placeFacts('conflict-place'), coordinates: { latitude: 3, longitude: 4 } } },
    });
    expect(result.snapshots.find((item) => item.candidateId === 'candidate-known')?.coordinates).toEqual({ state: 'known', value: { latitude: 1, longitude: 2 } });
    expect(result.snapshots.find((item) => item.candidateId === 'candidate-newer')?.coordinates).toEqual({ state: 'known', value: { latitude: 3, longitude: 4 } });
    expect(result.snapshots.find((item) => item.candidateId === 'candidate-conflict')).toMatchObject({ availability: 'untrusted', coordinates: { state: 'untrusted' } });
  });

  it('rejects malformed request references and invalid source data without exposing provider payloads', async () => {
    const invalid = request([candidate('candidate-a')]);
    invalid.candidates = [candidate('candidate-a'), candidate('candidate-a')];
    expect(() => CandidateFactualEnrichmentRequestSchema.parse(invalid)).toThrow();
    const result = await enrichCandidateFacts(request([candidate('candidate-a')]), { place: { getPlaceFacts: async () => ({ rawProviderResponse: { token: 'secret' } } as never) } });
    expect(result.snapshots[0]).toMatchObject({ availability: 'invalid', coordinates: { state: 'invalid' } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not mutate frozen input', async () => {
    const input = request([candidate('candidate-a')]);
    const before = structuredClone(input);
    const freeze = <T>(value: T): T => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; };
    freeze(input);
    await enrichCandidateFacts(input, { place: { getPlaceFacts: async () => placeFacts('place') } });
    expect(input).toEqual(before);
  });
});
