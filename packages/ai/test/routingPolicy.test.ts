import { describe, expect, it, vi } from 'vitest';
import type { GenerateTripInput, TravelIntent } from '@travel-blocks/shared';
import {
  AiProviderError,
  AiRoutingPolicy,
  AiTaskRouter,
  StaticAiProviderHealthSource,
  createGeminiAiRegistration,
  createSelfHostedAiRegistration,
  type AiProviderRegistration,
  type TravelAiProvider,
} from '../src/index.js';

const input: GenerateTripInput = { prompt: 'Seoul food trip' };
const intent: TravelIntent = { destination: { city: 'Seoul' }, preferences: [], avoidances: [], requestedCategories: [] };

function provider(extractIntent = vi.fn(async (): Promise<TravelIntent> => intent)): TravelAiProvider {
  return {
    extractIntent,
    generateTrip: vi.fn(async () => ({ trip: { id: 'trip-1', title: 'Trip', days: [] } })),
    planTrip: vi.fn(async () => ({ trip: { id: 'trip-1', title: 'Trip', days: [] } })),
    analyzeText: vi.fn(async () => ({ trip: { id: 'trip-1', title: 'Trip', days: [] } })),
    rankPlaces: vi.fn(async () => ({ selections: [] })),
  };
}

function policy(registrations: readonly AiProviderRegistration[], options: Partial<ConstructorParameters<typeof AiRoutingPolicy>[0]> = {}): AiRoutingPolicy {
  return new AiRoutingPolicy({ registrations, ...options });
}

describe('explicit AI routing policy', () => {
  it('defaults every logical task to Gemini without self-hosted opt-in', () => {
    const registrations = [createGeminiAiRegistration(provider()), createSelfHostedAiRegistration(provider())];
    const decisions = ['extract_intent', 'generate_trip', 'analyze_text', 'rank_places'].map((task) => policy(registrations).decide(task as 'extract_intent' | 'generate_trip' | 'analyze_text' | 'rank_places'));

    expect(decisions.map((decision) => decision.selectedProviderId)).toEqual(['gemini', 'gemini', 'gemini', 'gemini']);
    expect(decisions.map((decision) => decision.reason)).toEqual(['gemini_only', 'self_hosted_non_target_task', 'self_hosted_non_target_task', 'self_hosted_non_target_task']);
  });

  it('selects self-hosted only for healthy, enabled hybrid extract-intent traffic', () => {
    const registrations = [createGeminiAiRegistration(provider()), createSelfHostedAiRegistration(provider())];
    const routing = policy(registrations, { mode: 'hybrid', selfHostedEnabled: true, health: new StaticAiProviderHealthSource({ self_hosted: 'healthy' }), now: () => 123 });

    expect(routing.decide('extract_intent')).toEqual(expect.objectContaining({ selectedProviderId: 'self_hosted', reason: 'self_hosted_selected', selfHostedEligible: true, selfHostedHealth: 'healthy', selectedAt: 123 }));
    for (const task of ['generate_trip', 'analyze_text', 'rank_places'] as const) expect(routing.decide(task)).toMatchObject({ selectedProviderId: 'gemini', reason: 'self_hosted_non_target_task', selfHostedEligible: false });
  });

  it.each([
    ['disabled', [createGeminiAiRegistration(provider()), createSelfHostedAiRegistration(provider())], { mode: 'hybrid', selfHostedEnabled: false }, 'self_hosted_routing_disabled'],
    ['unregistered', [createGeminiAiRegistration(provider())], { mode: 'hybrid', selfHostedEnabled: true }, 'self_hosted_unregistered'],
    ['missing capability', [createGeminiAiRegistration(provider()), { ...createSelfHostedAiRegistration(provider()), capabilities: new Set() }], { mode: 'hybrid', selfHostedEnabled: true }, 'self_hosted_missing_capability'],
    ['unhealthy', [createGeminiAiRegistration(provider()), createSelfHostedAiRegistration(provider())], { mode: 'hybrid', selfHostedEnabled: true, health: new StaticAiProviderHealthSource({ self_hosted: 'unhealthy' }) }, 'self_hosted_unhealthy'],
    ['unknown', [createGeminiAiRegistration(provider()), createSelfHostedAiRegistration(provider())], { mode: 'hybrid', selfHostedEnabled: true, health: new StaticAiProviderHealthSource({ self_hosted: 'unknown' }) }, 'self_hosted_unhealthy'],
  ] as const)('chooses Gemini before execution when self-hosted is %s', (_name, registrations, options, reason) => {
    expect(policy(registrations, options).decide('extract_intent')).toMatchObject({ selectedProviderId: 'gemini', reason, selfHostedEligible: false });
  });

  it('delegates exactly once to the selected provider and records a safe decision', async () => {
    const gemini = provider();
    const local = provider();
    const registrations = [createGeminiAiRegistration(gemini), createSelfHostedAiRegistration(local)];
    const decisions: unknown[] = [];
    const router = new AiTaskRouter(registrations, {
      policy: policy(registrations, { mode: 'hybrid', selfHostedEnabled: true, health: new StaticAiProviderHealthSource({ self_hosted: 'healthy' }) }),
      observer: { record: (decision) => decisions.push(decision) },
    });

    await expect(router.extractIntent(input)).resolves.toBe(intent);
    expect(local.extractIntent).toHaveBeenCalledOnce();
    expect(local.extractIntent).toHaveBeenCalledWith(input);
    expect(gemini.extractIntent).not.toHaveBeenCalled();
    expect(decisions).toEqual([expect.objectContaining({ task: 'extract_intent', selectedProviderId: 'self_hosted', reason: 'self_hosted_selected', selfHostedHealth: 'healthy' })]);
    expect(JSON.stringify(decisions)).not.toContain(input.prompt);
  });

  it('propagates a selected provider failure with no retry or fallback', async () => {
    const failure = new AiProviderError('unavailable', true, 503);
    const gemini = provider();
    const local = provider(vi.fn(async () => { throw failure; }));
    const registrations = [createGeminiAiRegistration(gemini), createSelfHostedAiRegistration(local)];
    const router = new AiTaskRouter(registrations, { policy: policy(registrations, { mode: 'hybrid', selfHostedEnabled: true, health: new StaticAiProviderHealthSource({ self_hosted: 'healthy' }) }) });

    await expect(router.extractIntent(input)).rejects.toBe(failure);
    expect(local.extractIntent).toHaveBeenCalledOnce();
    expect(gemini.extractIntent).not.toHaveBeenCalled();
  });

  it('does not let routing-observer failures alter the provider result', async () => {
    const gemini = provider();
    const onObserverError = vi.fn();
    const router = new AiTaskRouter([createGeminiAiRegistration(gemini)], { observer: { record: () => { throw new Error('observer failure'); } }, onObserverError });

    await expect(router.extractIntent(input)).resolves.toBe(intent);
    await Promise.resolve();
    expect(onObserverError).toHaveBeenCalledOnce();
  });
});
