import { expect, it } from 'vitest';
import { AiProviderError, GeminiTravelAiProvider } from '@travel-blocks/ai';
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


class RateLimitedAi extends TestAiProvider {
  override async analyzeText(): Promise<never> {
    throw new AiProviderError('rate_limit', true, 429);
  }
}

it('returns a sanitized AI provider rate-limit response', async () => {
  const app = await buildApp({ repository: {} as TripRepository, auth: { authenticate: async () => ({ userId: 'u' }) }, ai: new RateLimitedAi(), places: new TestPlaceProvider() });
  const response = await app.inject({ method: 'POST', url: '/api/v1/ai/analyze-text', payload: { content: '서울 여행' } });
  expect(response.statusCode).toBe(429);
  expect(response.json()).toMatchObject({ error: { code: 'AI_PROVIDER_RATE_LIMIT', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.', retryable: true } });
  await app.close();
});

it('analyzes a lengthy Busan fixture with the compatible trip schema and itinerary validation', async () => {
  const content = [
    '부산 2박 3일 여행 기록입니다. 첫날은 해운대 해수욕장과 동백섬을 둘러보고 저녁에는 해운대 시장에서 식사했습니다.',
    '둘째 날은 감천문화마을, 국제시장, BIFF 광장, 자갈치시장 순서로 이동했으며 대중교통을 이용했습니다.',
    '마지막 날은 광안리 해변에서 카페를 방문한 뒤 부산역으로 이동했습니다. 너무 촘촘하지 않은 동선을 원합니다.',
  ].join(' ');
  let requestBody: any;
  const ai = new GeminiTravelAiProvider({
    apiKey: 'test',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fixturePlan) }] } }] }), { status: 200 });
    },
  });
  const app = await buildApp({ repository: {} as TripRepository, auth: { authenticate: async () => ({ userId: 'u' }) }, ai, places: new TestPlaceProvider() });
  const response = await app.inject({ method: 'POST', url: '/api/v1/ai/analyze-text', payload: { content } });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ trip: { name: fixturePlan.trip.name }, days: [{ blocks: expect.any(Array) }] });
  expect(requestBody.generationConfig.responseJsonSchema.properties.days.items.properties.blocks.maxItems).toBeUndefined();
  await app.close();
});
