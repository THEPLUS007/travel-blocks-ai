import { expect, it } from 'vitest';
import { AiProviderError } from '@travel-blocks/ai';
import { TestAiProvider, TestPlaceProvider, fixturePlan } from '@travel-blocks/test-fixtures';
import type { TripPlanningInput } from '@travel-blocks/shared';
import { buildApp } from '../src/app.js';
import type { TripRepository } from '../src/repository.js';

class InvalidPlanAi extends TestAiProvider {
  override async planTrip(_input: TripPlanningInput) {
    const value = structuredClone(fixturePlan);
    value.days[0].blocks.push({ ...value.days[0].blocks[0] });
    return value;
  }
}

it('does not expose structurally invalid AI output', async () => {
  const app = await buildApp({ repository: {} as TripRepository, auth: { authenticate: async () => ({ userId: 'u' }) }, ai: new InvalidPlanAi(), places: new TestPlaceProvider() });
  const response = await app.inject({ method: 'POST', url: '/api/v1/ai/generate-trip', payload: { prompt: '서울 여행' } });
  expect(response.statusCode).toBe(422);
  expect(response.json()).toMatchObject({ error: { code: 'ITINERARY_INVALID', retryable: false } });
  expect(response.body).not.toContain('duplicate_block_id');
  await app.close();
});

class InvalidOutputAi extends TestAiProvider {
  override async analyzeText(): Promise<never> {
    throw new AiProviderError('invalid_output', false);
  }
}

it('maps malformed AI structured output to AI_INVALID_OUTPUT', async () => {
  const app = await buildApp({ repository: {} as TripRepository, auth: { authenticate: async () => ({ userId: 'u' }) }, ai: new InvalidOutputAi(), places: new TestPlaceProvider() });
  const response = await app.inject({ method: 'POST', url: '/api/v1/ai/analyze-text', payload: { content: '서울 여행' } });
  expect(response.statusCode).toBe(502);
  expect(response.json()).toMatchObject({ error: { code: 'AI_INVALID_OUTPUT', retryable: false } });
  await app.close();
});
