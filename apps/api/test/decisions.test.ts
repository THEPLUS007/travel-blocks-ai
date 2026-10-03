import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '@travel-blocks/ai';
import { BOUNDED_JUDGE_POLICY_V1 } from '@travel-blocks/decision-judge';
import { AnonymousSessionAuth } from '../src/auth.js';
import { buildApp } from '../src/app.js';
import { DecisionApplicationServiceV1, DecisionApiResponseV1Schema } from '../src/decisions.js';
import type { TripRepository } from '../src/repository.js';
import type { SavedTravelPlan, TravelPlanPayload } from '@travel-blocks/shared';

class Repo implements TripRepository { users = new Map<string, string>(); async findOrCreateUser(key: string) { if (!this.users.has(key)) this.users.set(key, randomUUID()); return this.users.get(key)!; } async create(_user: string, _payload: TravelPlanPayload): Promise<SavedTravelPlan> { throw new Error('not used'); } async list(_user: string) { return [] as SavedTravelPlan[]; } async get(_user: string, _id: string) { return null; } async update(_user: string, _id: string, _payload: TravelPlanPayload, _version: number) { return null; } async delete(_user: string, _id: string) { return false; } }
const now = '2026-10-03T12:00:00.000Z';
const request = (candidates = [{ candidateId: 'candidate-a', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'place-a' } }, { candidateId: 'candidate-b', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'place-b' } }]) => ({ contractVersion: 'decision_api_request_v1' as const, tripContext: { tripContextId: 'trip-1', destination: { city: 'Seoul' } }, constraints: { requestedCategories: ['sightseeing' as const], preferences: ['quiet'], avoidances: [], selectionLimit: 1 }, candidates });
function service(overrides: Partial<ConstructorParameters<typeof DecisionApplicationServiceV1>[0]> = {}) {
  let ids = 0;
  return new DecisionApplicationServiceV1({
    candidateResolver: { resolve: async (reference) => ({ provider: 'fixture', providerPlaceId: reference.sourceRecordId, displayName: `Place ${reference.sourceRecordId}`, category: 'sightseeing' as const }) },
    factualSources: { place: { getPlaceFacts: async (reference) => ({ provenance: { sourceSystem: 'fixture', sourceRecordId: reference.sourceRecordId, sourceKind: 'curated_fixture' as const, retrievedAt: now }, retrievedAt: now, businessStatus: 'operational' as const }) } },
    judgePort: { rank: async (judgeRequest) => ({ contractVersion: 'bounded_judge_result_v1', judgeRequestId: judgeRequest.judgeRequestId, rankings: judgeRequest.candidates.map((candidate, index) => ({ candidateId: candidate.candidateId, rank: index + 1, reasonCode: 'preference_fit' as const })) }) },
    judgeEnabled: false, judgeProviderEligible: true, createId: () => `server-id-${++ids}`, now: () => new Date(now), ...overrides,
  });
}

describe('P2-DE-4 versioned Decision API', () => {
  it('serves only the V1 endpoint with server-owned IDs and a strict deterministic response', async () => {
    const repo = new Repo(); const app = await buildApp({ repository: repo, auth: new AnonymousSessionAuth(repo), ai: {} as never, places: { getPlace: async (id: string) => ({ provider: 'fixture', providerPlaceId: id, name: 'Place', formattedAddress: 'Seoul', latitude: 1, longitude: 2, category: 'sightseeing', city: 'Seoul', region: '' }), search: async () => [] }, decisionService: service() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/decisions/evaluate', payload: request() });
    expect(response.statusCode).toBe(200);
    expect(DecisionApiResponseV1Schema.parse(response.json())).toMatchObject({ contractVersion: 'decision_api_response_v1', judge: { outcome: 'skipped', reason: 'disabled' } });
    expect(response.json().decisionResult.decisions).toHaveLength(2);
    expect(response.json().decisionResult.decisions.every((item: { status: string }) => ['selected', 'rejected', 'unresolved'].includes(item.status))).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/decisions/evaluate', payload: request() })).statusCode).toBe(404);
    await app.close();
  });

  it('rejects unsupported/forged request fields without exposing validation details', async () => {
    const repo = new Repo(); const app = await buildApp({ repository: repo, auth: new AnonymousSessionAuth(repo), ai: {} as never, places: { getPlace: async () => null, search: async () => [] }, decisionService: service() });
    for (const payload of [{ ...request(), contractVersion: 'decision_api_request_v2' }, { ...request(), resultId: 'client-forged' }, { ...request(), candidates: [] }, request([{ candidateId: 'same', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'a' } }, { candidateId: 'same', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'b' } }])]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/decisions/evaluate', payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ contractVersion: 'decision_api_error_v1', error: { code: 'INVALID_DECISION_REQUEST' } });
      expect(JSON.stringify(response.json())).not.toContain('Zod');
    }
    await app.close();
  });

  it('executes an enabled eligible judge once, applies only its full permutation, and excludes hard/unresolved candidates', async () => {
    const port = { rank: vi.fn(async (judgeRequest: { judgeRequestId: string; candidates: Array<{ candidateId: string }> }) => ({ contractVersion: 'bounded_judge_result_v1', judgeRequestId: judgeRequest.judgeRequestId, rankings: [...judgeRequest.candidates].reverse().map((candidate, index) => ({ candidateId: candidate.candidateId, rank: index + 1, reasonCode: 'preference_fit' as const })) })) };
    const result = await service({ judgeEnabled: true, judgePort: port }).evaluate(request(), 'http-request-1');
    expect(port.rank).toHaveBeenCalledOnce();
    expect(result.judge).toEqual({ outcome: 'applied' });
    expect(result.decisionResult.decisions.filter((item) => item.status === 'selected')).toHaveLength(1);
  });

  it('propagates a started AI timeout as a safe explicit application error without a second call', async () => {
    const timeout = new AiProviderError('timeout', true);
    const port = { rank: vi.fn(async () => { throw timeout; }) };
    await expect(service({ judgeEnabled: true, judgePort: port }).evaluate(request(), 'http-request-1')).rejects.toMatchObject({ code: 'AI_DEPENDENCY_TIMEOUT' });
    expect(port.rank).toHaveBeenCalledOnce();
  });

  it('deduplicates repeated provider references before enrichment without dropping candidate decisions', async () => {
    const resolve = vi.fn(async (reference: { sourceRecordId: string }) => ({ provider: 'fixture', providerPlaceId: reference.sourceRecordId, displayName: 'Shared place', category: 'sightseeing' as const }));
    const result = await service({ candidateResolver: { resolve } }).evaluate(request([{ candidateId: 'candidate-a', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'shared' } }, { candidateId: 'candidate-b', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'shared' } }]), 'http-request-1');
    expect(resolve).toHaveBeenCalledOnce();
    expect(result.decisionResult.decisions).toHaveLength(2);
  });

  it('rejects legacy partial selections and observer failure cannot alter an applied result', async () => {
    const port = { rank: vi.fn(async () => ({ selections: [{ candidateId: 'candidate-a', reason: 'legacy' }] })) };
    await expect(service({ judgeEnabled: true, judgePort: port }).evaluate(request(), 'http-request-1')).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    const observerError = vi.fn();
    const applied = await service({ observer: { record: () => { throw new Error('observer'); } }, onObserverError: observerError }).evaluate(request(), 'http-request-1');
    await Promise.resolve();
    expect(applied.judge).toMatchObject({ outcome: 'skipped' });
    expect(observerError).toHaveBeenCalledOnce();
  });
});
