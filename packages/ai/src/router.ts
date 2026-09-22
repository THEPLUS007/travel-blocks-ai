import type {
  AnalyzeTextInput,
  GenerateTripInput,
  PlaceRankingInput,
  PlaceRankingResult,
  TravelIntent,
  TripPlanningInput,
  TravelPlanDraft,
} from '@travel-blocks/shared';
import { AiProviderError, type TravelAiProvider } from './index.js';
import { AiRoutingPolicy, type AiRoutingDecision } from './routingPolicy.js';
import { DefaultAiExecutionScopeFactory, resolveAiExecutionScope, type AiExecutionObserver, type AiExecutionScopeFactory, type AiProvenanceFailureCategory } from './execution.js';
import { AI_TASK_DEFINITIONS, type AiCapability, type AiTask } from './tasks.js';

export type AiProviderId = 'gemini' | 'self_hosted';

export interface AiProviderRegistration {
  readonly id: AiProviderId;
  readonly provider: TravelAiProvider;
  readonly capabilities: ReadonlySet<AiCapability>;
  readonly modelForTask?: (task: AiTask) => string | 'unknown';
}

export interface AiProviderModelSource {
  modelForTask(task: AiTask): string;
}

export const GEMINI_PROVIDER_ID: AiProviderId = 'gemini';
export const GEMINI_CAPABILITIES = [
  'intent_extraction',
  'trip_planning',
  'travel_content_analysis',
  'place_ranking',
] as const satisfies readonly AiCapability[];
export const SELF_HOSTED_PROVIDER_ID: AiProviderId = 'self_hosted';
export const SELF_HOSTED_CAPABILITIES = ['intent_extraction'] as const satisfies readonly AiCapability[];

type AiTaskRoutingTable = { readonly [TTask in AiTask]: AiProviderId };
export const AI_TASK_ROUTING = {
  extract_intent: GEMINI_PROVIDER_ID,
  generate_trip: GEMINI_PROVIDER_ID,
  analyze_text: GEMINI_PROVIDER_ID,
  rank_places: GEMINI_PROVIDER_ID,
} as const satisfies AiTaskRoutingTable;

export function createGeminiAiRegistration(provider: TravelAiProvider): AiProviderRegistration {
  return {
    id: GEMINI_PROVIDER_ID,
    provider,
    capabilities: new Set<AiCapability>(GEMINI_CAPABILITIES),
    modelForTask: modelForTask(provider),
  };
}

export function createSelfHostedAiRegistration(provider: TravelAiProvider): AiProviderRegistration {
  return {
    id: SELF_HOSTED_PROVIDER_ID,
    provider,
    capabilities: new Set<AiCapability>(SELF_HOSTED_CAPABILITIES),
    modelForTask: modelForTask(provider),
  };
}

function modelForTask(provider: TravelAiProvider): (task: AiTask) => string | 'unknown' {
  const source = provider as TravelAiProvider & Partial<AiProviderModelSource>;
  return (task) => {
    const model = source.modelForTask?.(task);
    return typeof model === 'string' && model.trim() ? model : 'unknown';
  };
}

export interface AiRoutingEvent extends AiRoutingDecision {
  readonly executionId: string;
}

export interface AiRoutingObserver {
  record(decision: AiRoutingEvent): void | Promise<void>;
}

export interface AiTaskRouterOptions {
  readonly policy?: AiRoutingPolicy;
  readonly observer?: AiRoutingObserver;
  readonly onObserverError?: (error: unknown) => void;
  readonly provenanceObserver?: AiExecutionObserver;
  readonly executionScopeFactory?: AiExecutionScopeFactory;
}

export class AiTaskRouter implements TravelAiProvider {
  private readonly providers: ReadonlyMap<AiProviderId, AiProviderRegistration>;
  private readonly policy: AiRoutingPolicy;
  private readonly executionScopeFactory: AiExecutionScopeFactory;

  constructor(registrations: readonly AiProviderRegistration[], private readonly options: AiTaskRouterOptions = {}) {
    const providers = new Map<AiProviderId, AiProviderRegistration>();
    for (const registration of registrations) {
      if (providers.has(registration.id)) throw new Error(`Duplicate AI provider registration: ${registration.id}`);
      providers.set(registration.id, registration);
    }
    for (const task of Object.keys(AI_TASK_DEFINITIONS) as AiTask[]) {
      const providerId = AI_TASK_ROUTING[task];
      const registration = providers.get(providerId);
      if (!registration) throw new Error(`AI task ${task} references unregistered provider ${providerId}`);
      const capability = AI_TASK_DEFINITIONS[task].requiredCapability;
      if (!registration.capabilities.has(capability)) {
        throw new Error(`AI provider ${providerId} does not support capability ${capability} for task ${task}`);
      }
    }
    this.providers = providers;
    this.policy = options.policy ?? new AiRoutingPolicy({ registrations });
    this.executionScopeFactory = options.executionScopeFactory ?? new DefaultAiExecutionScopeFactory();
  }

  private providerFor(task: AiTask, executionId: string): { readonly provider: TravelAiProvider; readonly decision: AiRoutingDecision; readonly model: string | 'unknown' } {
    const decision = this.policy.decide(task);
    void this.observe({ ...decision, executionId });
    const registration = this.providers.get(decision.selectedProviderId);
    if (!registration) throw new Error(`No AI provider registered for task ${task}`);
    if (!registration.capabilities.has(decision.requiredCapability)) {
      throw new Error(`AI provider ${decision.selectedProviderId} does not support capability ${decision.requiredCapability} for task ${task}`);
    }
    return { provider: registration.provider, decision, model: registration.modelForTask?.(task) ?? 'unknown' };
  }

  private async observe(decision: AiRoutingEvent): Promise<void> {
    try { await this.options.observer?.record(decision); } catch (error) { this.options.onObserverError?.(error); }
  }

  private async execute<T>(task: AiTask, delegate: (provider: TravelAiProvider) => Promise<T>): Promise<T> {
    const seed = this.executionScopeFactory.create(task);
    const selected = this.providerFor(task, seed.executionId);
    const scope = resolveAiExecutionScope(seed, selected.decision, selected.model);
    try {
      const result = await delegate(selected.provider);
      void this.observeProvenance(this.executionScopeFactory.complete(scope, 'success'));
      return result;
    } catch (error) {
      const failureCategory: AiProvenanceFailureCategory = error instanceof AiProviderError ? error.code : 'unknown';
      void this.observeProvenance(this.executionScopeFactory.complete(scope, 'failure', failureCategory));
      throw error;
    }
  }

  private async observeProvenance(provenance: Parameters<AiExecutionObserver['record']>[0]): Promise<void> {
    try { await this.options.provenanceObserver?.record(provenance); } catch (error) { this.options.onObserverError?.(error); }
  }

  extractIntent(input: GenerateTripInput): Promise<TravelIntent> {
    return this.execute('extract_intent', (provider) => provider.extractIntent(input));
  }

  planTrip(input: TripPlanningInput): Promise<TravelPlanDraft> {
    return this.execute('generate_trip', (provider) => provider.planTrip(input));
  }

  generateTrip(input: GenerateTripInput): Promise<TravelPlanDraft> {
    return this.execute('generate_trip', (provider) => provider.generateTrip(input));
  }

  analyzeText(input: AnalyzeTextInput): Promise<TravelPlanDraft> {
    return this.execute('analyze_text', (provider) => provider.analyzeText(input));
  }

  rankPlaces(input: PlaceRankingInput): Promise<PlaceRankingResult> {
    return this.execute('rank_places', (provider) => provider.rankPlaces(input));
  }
}
