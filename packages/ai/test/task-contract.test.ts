import { describe, expect, it } from 'vitest';
import { AnalyzeTextRequestSchema, GenerateTripRequestSchema, GenerateTripResponseSchema, PlaceRankingInputSchema, PlaceRankingResultSchema, TravelIntentSchema, TripPlanningInputSchema } from '@travel-blocks/shared';
import { AI_TASK_DEFINITIONS } from '../src/tasks.js';

const candidate = { candidateId: 'google:p1', provider: 'google', providerPlaceId: 'p1', name: 'Place', formattedAddress: 'Seoul', latitude: 1, longitude: 2, category: 'sightseeing' as const, city: 'Seoul', region: '' };
const plan = { trip: { name: 'x', country: 'KR', city: 'Seoul', duration: '1 day', budget: '', travelers: '', style: '', description: '' }, days: [], connections: [] };

describe('AI task definitions', () => {
  it('defines exactly the four logical observability tasks', () => {
    expect(Object.keys(AI_TASK_DEFINITIONS).sort()).toEqual(['analyze_text', 'extract_intent', 'generate_trip', 'rank_places']);
    for (const [key, definition] of Object.entries(AI_TASK_DEFINITIONS)) expect(definition.task).toBe(key);
  });

  it('reuses the shared input and output schema identities', () => {
    expect(AI_TASK_DEFINITIONS.extract_intent.inputSchema).toBe(GenerateTripRequestSchema);
    expect(AI_TASK_DEFINITIONS.extract_intent.outputSchema).toBe(TravelIntentSchema);
    expect(AI_TASK_DEFINITIONS.generate_trip.inputSchema).toBe(TripPlanningInputSchema);
    expect(AI_TASK_DEFINITIONS.generate_trip.outputSchema).toBe(GenerateTripResponseSchema);
    expect(AI_TASK_DEFINITIONS.analyze_text.inputSchema).toBe(AnalyzeTextRequestSchema);
    expect(AI_TASK_DEFINITIONS.analyze_text.outputSchema).toBe(GenerateTripResponseSchema);
    expect(AI_TASK_DEFINITIONS.rank_places.inputSchema).toBe(PlaceRankingInputSchema);
    expect(AI_TASK_DEFINITIONS.rank_places.outputSchema).toBe(PlaceRankingResultSchema);
  });

  it('declares capability, timeout, and explicit fallback metadata', () => {
    expect(AI_TASK_DEFINITIONS.extract_intent).toMatchObject({ requiredCapability: 'intent_extraction', timeoutClass: 'intent', fallbackPolicy: 'fail_explicitly' });
    expect(AI_TASK_DEFINITIONS.generate_trip).toMatchObject({ requiredCapability: 'trip_planning', timeoutClass: 'long', fallbackPolicy: 'fail_explicitly' });
    expect(AI_TASK_DEFINITIONS.analyze_text).toMatchObject({ requiredCapability: 'travel_content_analysis', timeoutClass: 'long', fallbackPolicy: 'fail_explicitly' });
    expect(AI_TASK_DEFINITIONS.rank_places).toMatchObject({ requiredCapability: 'place_ranking', timeoutClass: 'short', fallbackPolicy: 'fail_explicitly' });
  });

  it('retains schema validation at each task boundary', () => {
    expect(AI_TASK_DEFINITIONS.extract_intent.inputSchema.safeParse({ prompt: 'Seoul' }).success).toBe(true);
    expect(AI_TASK_DEFINITIONS.extract_intent.inputSchema.safeParse({ prompt: '' }).success).toBe(false);
    expect(AI_TASK_DEFINITIONS.generate_trip.inputSchema.safeParse({ prompt: 'Seoul', intent: { preferences: [], avoidances: [], requestedCategories: [] }, candidates: [] }).success).toBe(true);
    expect(AI_TASK_DEFINITIONS.analyze_text.inputSchema.safeParse({ content: 'Seoul' }).success).toBe(true);
    expect(AI_TASK_DEFINITIONS.rank_places.inputSchema.safeParse({ trip: plan.trip, day: { id: 'd1', dayNumber: 1, title: 'Day 1', city: 'Seoul', blocks: [] }, existingPlaces: [], candidates: [candidate] }).success).toBe(true);
    expect(AI_TASK_DEFINITIONS.generate_trip.outputSchema.safeParse(plan).success).toBe(true);
    expect(AI_TASK_DEFINITIONS.rank_places.outputSchema.safeParse({ selections: [] }).success).toBe(true);
    expect(AI_TASK_DEFINITIONS.rank_places.outputSchema.safeParse({ selections: [{ candidateId: 'unknown', reason: 'x' }] }).success).toBe(true);
  });
});
