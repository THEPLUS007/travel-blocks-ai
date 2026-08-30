import { describe, expect, it } from 'vitest';
import { TestAiProvider } from '@travel-blocks/test-fixtures';
import { buildApp } from '../src/app.js';
import { PlaceProviderError, type PlaceSearchProvider } from '../src/places.js';
import type { TripRepository } from '../src/repository.js';

const appWith = (places: PlaceSearchProvider) => buildApp({
  repository: {} as TripRepository,
  auth: { authenticate: async () => ({ userId: 'test-user' }) },
  ai: new TestAiProvider(),
  places,
});

describe('Place provider API errors', () => {
  it.each([
    [new PlaceProviderError('rate_limit', true, 429), 429, 'PLACE_PROVIDER_RATE_LIMIT', true],
    [new PlaceProviderError('auth', false, 403), 503, 'PLACE_PROVIDER_UNAVAILABLE', false],
    [new PlaceProviderError('timeout', true), 503, 'PLACE_PROVIDER_UNAVAILABLE', true],
  ])('sanitizes provider error %s', async (error, status, code, retryable) => {
    const app = await appWith({ search: async () => { throw error; }, getPlace: async () => { throw error; } });
    const result = await app.inject({ method: 'GET', url: '/api/v1/places/search?query=Seoul' });
    expect(result.statusCode).toBe(status);
    expect(result.json()).toMatchObject({ error: { code, retryable } });
    expect(result.body).not.toContain('server-key');
    expect(result.json().error.requestId).toBeTruthy();
    await app.close();
  });
});
