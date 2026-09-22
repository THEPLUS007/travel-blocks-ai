import { describe, expect, it, vi } from 'vitest';
import type { AnalyzeTextInput, GenerateTripInput, PlaceRankingInput, PlaceRankingResult, TravelIntent, TripPlanningInput, TravelPlanDraft } from '@travel-blocks/shared';
import {
  AiProviderError,
  AiRoutingPolicy,
  AiTaskRouter,
  DefaultAiExecutionScopeFactory,
  StaticAiProviderHealthSource,
  createGeminiAiRegistration,
  GeminiTravelAiProvider,
  SelfHostedTravelAiProvider,
  createSelfHostedAiRegistration,
  type AiProviderRegistration,
  type AiProvenance,
  type TravelAiProvider,
} from '../src/index.js';

const input: GenerateTripInput = { prompt: 'private prompt marker' };
const intent: TravelIntent = { destination: { city: 'Seoul' }, preferences: [], avoidances: [], requestedCategories: [] };
const plan: TravelPlanDraft = { trip: { name: 'Seoul', country: 'KR', city: 'Seoul', duration: '1 day', budget: '', travelers: '', style: '', description: '' }, days: [], connections: [] };
const ranking: PlaceRankingResult = { selections: [] };

function provider(model: string, extract = vi.fn(async (): Promise<TravelIntent> => intent)): TravelAiProvider & { modelForTask(task: string): string } {
  return {
    modelForTask: (task) => task === 'extract_intent' ? `${model}-intent` : model,
    extractIntent: extract,
    generateTrip: vi.fn(async (): Promise<TravelPlanDraft> => plan),
    planTrip: vi.fn(async (): Promise<TravelPlanDraft> => plan),
    analyzeText: vi.fn(async (): Promise<TravelPlanDraft> => plan),
    rankPlaces: vi.fn(async (): Promise<PlaceRankingResult> => ranking),
  };
}

function scopeFactory(): DefaultAiExecutionScopeFactory {
  const ids = ['execution-1', 'execution-2', 'execution-3', 'execution-4', 'execution-5'];
  const times = [100, 120, 130, 160, 200, 250, 300, 360, 400, 480];
  return new DefaultAiExecutionScopeFactory({ createId: () => ids.shift() ?? 'execution-overflow', now: () => times.shift() ?? 500 });
}

function hybridPolicy(registrations: readonly AiProviderRegistration[]): AiRoutingPolicy {
  return new AiRoutingPolicy({ mode: 'hybrid', registrations, selfHostedEnabled: true, health: new StaticAiProviderHealthSource({ self_hosted: 'healthy' }), now: () => 111 });
}
  it('exposes task-aware model identifiers from both concrete adapters without transport calls', () => {
    const gemini = new GeminiTravelAiProvider({ apiKey: 'test-key', model: 'gemini-plan', intentModel: 'gemini-intent' });
    const local = new SelfHostedTravelAiProvider({ model: 'local-intent', transport: { generate: async () => ({}) } });

    expect(gemini.modelForTask('extract_intent')).toBe('gemini-intent');
    expect(gemini.modelForTask('generate_trip')).toBe('gemini-plan');
    expect(local.modelForTask('extract_intent')).toBe('local-intent');
  });


describe('AI execution scope and provenance', () => {
  it('creates an immutable, distinct provenance record for every logical task with the selected Gemini model', async () => {
    const gemini = provider('gemini-plan');
    const events: AiProvenance[] = [];
    const decisions: Array<{ executionId: string }> = [];
    const router = new AiTaskRouter([createGeminiAiRegistration(gemini)], { executionScopeFactory: scopeFactory(), observer: { record: (event) => decisions.push(event) }, provenanceObserver: { record: (event) => events.push(event) } });
    const tripInput: TripPlanningInput = { prompt: input.prompt, intent, candidates: [] };
    const analyzeInput: AnalyzeTextInput = { content: input.prompt };
    const rankInput: PlaceRankingInput = { trip: plan.trip, day: { id: 'day-1', dayNumber: 1, title: 'Day 1', city: 'Seoul', blocks: [] }, existingPlaces: [], candidates: [] };

    await router.extractIntent(input);
    await router.planTrip(tripInput);
    await router.analyzeText(analyzeInput);
    await router.rankPlaces(rankInput);

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.executionId)).toEqual(['execution-1', 'execution-2', 'execution-3', 'execution-4']);
    expect(decisions.map((decision) => decision.executionId)).toEqual(events.map((event) => event.executionId));
    expect(events.map((event) => event.task)).toEqual(['extract_intent', 'generate_trip', 'analyze_text', 'rank_places']);
    expect(events.map((event) => event.model)).toEqual(['gemini-plan-intent', 'gemini-plan', 'gemini-plan', 'gemini-plan']);
    expect(events.every((event) => event.providerId === 'gemini' && event.outcome === 'success' && event.routingMode === 'gemini_only')).toBe(true);
    expect(events.map((event) => event.routingReason)).toEqual(['gemini_only', 'self_hosted_non_target_task', 'self_hosted_non_target_task', 'self_hosted_non_target_task']);
    expect(events.every(Object.isFrozen)).toBe(true);
  });

  it('uses self-hosted provenance only for an eligible hybrid extract-intent selection', async () => {
    const gemini = provider('gemini-plan');
    const local = provider('local-model');
    const registrations = [createGeminiAiRegistration(gemini), createSelfHostedAiRegistration(local)];
    const events: AiProvenance[] = [];
    const router = new AiTaskRouter(registrations, { policy: hybridPolicy(registrations), executionScopeFactory: scopeFactory(), provenanceObserver: { record: (event) => events.push(event) } });

    await router.extractIntent(input);
    await router.generateTrip(input);

    expect(events).toEqual([
      expect.objectContaining({ executionId: 'execution-1', providerId: 'self_hosted', model: 'local-model-intent', routingReason: 'self_hosted_selected', outcome: 'success' }),
      expect.objectContaining({ executionId: 'execution-2', providerId: 'gemini', model: 'gemini-plan', routingReason: 'self_hosted_non_target_task', outcome: 'success' }),
    ]);
    expect(local.extractIntent).toHaveBeenCalledOnce();
    expect(gemini.extractIntent).not.toHaveBeenCalled();
  });

  it('records the selected provider failure without altering its identity, retrying, or falling back', async () => {
    const failure = new AiProviderError('unavailable', true, 503);
    const gemini = provider('gemini-plan');
    const local = provider('local-model', vi.fn(async () => { throw failure; }));
    const registrations = [createGeminiAiRegistration(gemini), createSelfHostedAiRegistration(local)];
    const events: AiProvenance[] = [];
    const router = new AiTaskRouter(registrations, { policy: hybridPolicy(registrations), executionScopeFactory: scopeFactory(), provenanceObserver: { record: (event) => events.push(event) } });

    await expect(router.extractIntent(input)).rejects.toBe(failure);
    expect(events).toEqual([expect.objectContaining({ providerId: 'self_hosted', model: 'local-model-intent', outcome: 'failure', failureCategory: 'unavailable' })]);
    expect(local.extractIntent).toHaveBeenCalledOnce();
    expect(gemini.extractIntent).not.toHaveBeenCalled();
  });

  it('keeps concurrent request scopes isolated and never records input or secret-like content', async () => {
    const gemini = provider('gemini-plan');
    const events: AiProvenance[] = [];
    const router = new AiTaskRouter([createGeminiAiRegistration(gemini)], { executionScopeFactory: scopeFactory(), provenanceObserver: { record: (event) => events.push(event) } });

    await Promise.all([router.extractIntent({ prompt: 'prompt-token-should-not-appear' }), router.extractIntent({ prompt: 'another-private-input' })]);

    expect(events.map((event) => event.executionId)).toEqual(['execution-1', 'execution-2']);
    expect(new Set(events.map((event) => event.executionId)).size).toBe(2);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('prompt-token-should-not-appear');
    expect(serialized).not.toContain('another-private-input');
  });

  it('does not let provenance observer failures change a success or provider failure', async () => {
    const success = provider('gemini-plan');
    const observerError = vi.fn();
    const successRouter = new AiTaskRouter([createGeminiAiRegistration(success)], { provenanceObserver: { record: () => { throw new Error('observer failure'); } }, onObserverError: observerError });
    await expect(successRouter.extractIntent(input)).resolves.toBe(intent);

    const failure = new AiProviderError('timeout', true);
    const failing = provider('gemini-plan', vi.fn(async () => { throw failure; }));
    const failureRouter = new AiTaskRouter([createGeminiAiRegistration(failing)], { provenanceObserver: { record: () => { throw new Error('observer failure'); } }, onObserverError: observerError });
    await expect(failureRouter.extractIntent(input)).rejects.toBe(failure);
    await Promise.resolve();

    expect(success.extractIntent).toHaveBeenCalledOnce();
    expect(failing.extractIntent).toHaveBeenCalledOnce();
    expect(observerError).toHaveBeenCalledTimes(2);
  });
});
