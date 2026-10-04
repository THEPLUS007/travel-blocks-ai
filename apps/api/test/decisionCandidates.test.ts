import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnonymousSessionAuth } from '../src/auth.js';
import { buildApp } from '../src/app.js';
import { PlaceProviderError, type PlaceSearchProvider } from '../src/places.js';
import type { TripRepository } from '../src/repository.js';
import type { SavedTravelPlan, TravelPlanPayload } from '@travel-blocks/shared';
import { TestAiProvider, TestPlaceProvider } from '@travel-blocks/test-fixtures';

class Repo implements TripRepository {
  private users = new Map<string, string>();
  async findOrCreateUser(key: string) { if (!this.users.has(key)) this.users.set(key, randomUUID()); return this.users.get(key)!; }
  async create(_user: string, _payload: TravelPlanPayload): Promise<SavedTravelPlan> { throw new Error('not used'); }
  async list(_user: string) { return [] as SavedTravelPlan[]; }
  async get(_user: string, _id: string) { return null; }
  async update(_user: string, _id: string, _payload: TravelPlanPayload, _version: number) { return null; }
  async delete(_user: string, _id: string) { return false; }
}

const request = {
  contractVersion: 'decision_candidate_discovery_request_v1' as const,
  tripContext: { tripContextId: 'review-day-1', destination: { country: '대한민국', city: '서울' } },
  constraints: { requestedCategories: [], preferences: ['도보'], avoidances: [] },
  candidateLimit: 2,
};

function app(places: PlaceSearchProvider = new TestPlaceProvider()) {
  const repository = new Repo();
  return buildApp({ repository, auth: new AnonymousSessionAuth(repository), ai: new TestAiProvider(), places });
}

describe('P2-DE-5A decision candidate discovery', () => {
  it('returns a bounded, canonical provider-backed set without TravelBlocks', async () => {
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/api/v1/decision-candidates/discover', payload: request });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ contractVersion: 'decision_candidate_discovery_response_v1', canonicalOrder: 'candidate_id_ascending' });
    expect(response.json().candidates).toHaveLength(2);
    expect(response.json().candidates.map((candidate: { candidateId: string }) => candidate.candidateId)).toEqual(['test:deoksugung', 'test:namsan']);
    expect(response.json().candidates[0]).toMatchObject({ providerReference: { sourceSystem: 'test', sourceRecordId: 'deoksugung' }, displayName: '덕수궁' });
    expect(JSON.stringify(response.json())).not.toContain('priceLevel');
    expect(JSON.stringify(response.json())).not.toContain('TravelBlock');
    await server.close();
  });

  it('deduplicates provider results and preserves the existing recommendation endpoint contract', async () => {
    const server = await app();
    const discovery = await server.inject({ method: 'POST', url: '/api/v1/decision-candidates/discover', payload: { ...request, candidateLimit: 20 } });
    expect(discovery.json().candidates).toHaveLength(3);
    const recommendation = await server.inject({ method: 'POST', url: '/api/v1/ai/recommendations', payload: { trip: { name: '서울', country: '대한민국', city: '서울', duration: '1일', budget: '', travelers: '', style: '', description: '' }, day: { id: 'day-1', dayNumber: 1, title: 'Day 1', city: '서울', blocks: [] }, existingPlaces: [] } });
    expect(recommendation.statusCode).toBe(200);
    expect(recommendation.json()[0]).toMatchObject({ place: { provider: 'test', verified: true } });
    await server.close();
  });

  it('uses only the versioned endpoint and returns a safe discovery envelope for invalid input', async () => {
    const server = await app();
    const invalid = await server.inject({ method: 'POST', url: '/api/v1/decision-candidates/discover', payload: { ...request, extra: 'forged' } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ contractVersion: 'decision_candidate_discovery_error_v1', error: { code: 'INVALID_DECISION_CANDIDATE_DISCOVERY_REQUEST' } });
    expect(JSON.stringify(invalid.json())).not.toContain('Zod');
    expect((await server.inject({ method: 'POST', url: '/api/decision-candidates/discover', payload: request })).statusCode).toBe(404);
    await server.close();
  });

  it('fails closed when a category provider request fails', async () => {
    const provider = new TestPlaceProvider();
    const failing = {
      getPlace: provider.getPlace.bind(provider),
      search: async (input: Parameters<TestPlaceProvider['search']>[0]) => {
        if (input.category === 'food') throw new PlaceProviderError('unavailable', true);
        return provider.search(input);
      },
    } satisfies PlaceSearchProvider;
    const server = await app(failing);
    const response = await server.inject({ method: 'POST', url: '/api/v1/decision-candidates/discover', payload: request });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ contractVersion: 'decision_candidate_discovery_error_v1', error: { code: 'FACTUAL_DEPENDENCY_FAILURE', retryable: true } });
    expect(JSON.stringify(response.json())).not.toContain('unavailable');
    await server.close();
  });
});
