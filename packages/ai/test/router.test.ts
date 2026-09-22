import { describe, expect, it, vi } from 'vitest';
import type { AnalyzeTextInput, GenerateTripInput, PlaceRankingInput, PlaceRankingResult, TravelIntent, TripPlanningInput, TravelPlanDraft } from '@travel-blocks/shared';
import { AI_TASK_DEFINITIONS } from '../src/tasks.js';
import { AiProviderError, GeminiTravelAiProvider, type AiProviderRegistration, type AiRunEvent, type TravelAiProvider } from '../src/index.js';
import { AI_TASK_ROUTING, AiTaskRouter, GEMINI_CAPABILITIES, GEMINI_PROVIDER_ID, createGeminiAiRegistration } from '../src/router.js';

const plan: TravelPlanDraft = { trip: { name: 'Seoul', country: 'KR', city: 'Seoul', duration: '1 day', budget: '', travelers: '', style: '', description: '' }, days: [], connections: [] };
const intent: TravelIntent = { destination: { city: 'Seoul' }, preferences: [], avoidances: [], requestedCategories: [] };
const ranking: PlaceRankingResult = { selections: [] };

function providerDouble() {
  return {
    extractIntent: vi.fn(async (_input: GenerateTripInput) => intent),
    planTrip: vi.fn(async (_input: TripPlanningInput) => plan),
    generateTrip: vi.fn(async (_input: GenerateTripInput) => plan),
    analyzeText: vi.fn(async (_input: AnalyzeTextInput) => plan),
    rankPlaces: vi.fn(async (_input: PlaceRankingInput) => ranking),
  } satisfies TravelAiProvider;
}

const tripInput: TripPlanningInput = { prompt: 'Seoul food trip', intent, candidates: [] };
const generateInput: GenerateTripInput = { prompt: 'Seoul food trip' };
const analyzeInput: AnalyzeTextInput = { content: 'Seoul food trip' };
const rankInput: PlaceRankingInput = { trip: plan.trip, day: { id: 'day-1', dayNumber: 1, title: 'Day 1', city: 'Seoul', blocks: [] }, existingPlaces: [], candidates: [] };

describe('Gemini-only AI task router', () => {
  it('maps exactly the task-definition keys to Gemini and declares every required capability', () => {
    expect(Object.keys(AI_TASK_ROUTING).sort()).toEqual(Object.keys(AI_TASK_DEFINITIONS).sort());
    expect(AI_TASK_ROUTING).toEqual({ extract_intent: 'gemini', generate_trip: 'gemini', analyze_text: 'gemini', rank_places: 'gemini' });
    expect(GEMINI_CAPABILITIES).toEqual(['intent_extraction', 'trip_planning', 'travel_content_analysis', 'place_ranking']);
  });

  it('rejects an unregistered route provider during construction without executing a provider', () => {
    const provider = providerDouble();
    expect(() => new AiTaskRouter([])).toThrow(`AI task extract_intent references unregistered provider ${GEMINI_PROVIDER_ID}`);
    expect(provider.extractIntent).not.toHaveBeenCalled();
  });

  it('rejects missing required capability before provider method execution and exposes no input', () => {
    const provider = providerDouble();
    const registration: AiProviderRegistration = { id: GEMINI_PROVIDER_ID, provider, capabilities: new Set(['intent_extraction']) };
    let error: unknown;
    try { new AiTaskRouter([registration]); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('AI provider gemini does not support capability trip_planning for task generate_trip');
    expect((error as Error).message).not.toContain('Seoul food trip');
    expect(provider.planTrip).not.toHaveBeenCalled();
  });

  it('delegates every provider method exactly once with the original input and result', async () => {
    const provider = providerDouble();
    const router = new AiTaskRouter([createGeminiAiRegistration(provider)]);

    await expect(router.extractIntent(generateInput)).resolves.toBe(intent);
    await expect(router.planTrip(tripInput)).resolves.toBe(plan);
    await expect(router.generateTrip(generateInput)).resolves.toBe(plan);
    await expect(router.analyzeText(analyzeInput)).resolves.toBe(plan);
    await expect(router.rankPlaces(rankInput)).resolves.toBe(ranking);

    expect(provider.extractIntent).toHaveBeenCalledOnce();
    expect(provider.extractIntent).toHaveBeenCalledWith(generateInput);
    expect(provider.planTrip).toHaveBeenCalledOnce();
    expect(provider.planTrip).toHaveBeenCalledWith(tripInput);
    expect(provider.generateTrip).toHaveBeenCalledOnce();
    expect(provider.generateTrip).toHaveBeenCalledWith(generateInput);
    expect(provider.analyzeText).toHaveBeenCalledOnce();
    expect(provider.analyzeText).toHaveBeenCalledWith(analyzeInput);
    expect(provider.rankPlaces).toHaveBeenCalledOnce();
    expect(provider.rankPlaces).toHaveBeenCalledWith(rankInput);
  });

  it('preserves provider error identity with no router retry or fallback', async () => {
    const provider = providerDouble();
    const failure = new AiProviderError('unavailable', true, 503, new Error('provider-only-cause'));
    provider.rankPlaces.mockRejectedValueOnce(failure);
    const router = new AiTaskRouter([createGeminiAiRegistration(provider)]);

    await expect(router.rankPlaces(rankInput)).rejects.toBe(failure);
    expect(provider.rankPlaces).toHaveBeenCalledOnce();
  });

  it.each([['success', 200, 'success'], ['failure', 503, 'error']] as const)(
    'keeps exactly one safe Gemini lifecycle event on router %s',
    async (_name, status, expectedStatus) => {
      const events: AiRunEvent[] = [];
      const rawMarker = 'router-raw-output-marker';
      const gemini = new GeminiTravelAiProvider({
        apiKey: 'test-api-key-is-not-recorded', model: 'router-test-model', maxRetries: 0,
        observer: { record: (event) => events.push(event) },
        fetch: async () => status === 200
          ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }), { status })
          : new Response(rawMarker, { status }),
      });
      const router = new AiTaskRouter([createGeminiAiRegistration(gemini)]);

      if (expectedStatus === 'success') await expect(router.generateTrip(generateInput)).resolves.toEqual(plan);
      else await expect(router.generateTrip(generateInput)).rejects.toMatchObject({ code: 'unavailable', status: 503 });

      expect(events).toEqual([expect.objectContaining({ provider: 'gemini', model: 'router-test-model', task: 'generate_trip', status: expectedStatus })]);
      expect(JSON.stringify(events)).not.toContain(rawMarker);
      expect(JSON.stringify(events)).not.toContain('test-api-key-is-not-recorded');
    },
  );
});
