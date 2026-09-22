import type {
  AnalyzeTextInput,
  GenerateTripInput,
  PlaceRankingInput,
  PlaceRankingResult,
  TravelIntent,
  TripPlanningInput,
  TravelPlanDraft,
} from '@travel-blocks/shared';
import type { TravelAiProvider } from './index.js';
import { AI_TASK_DEFINITIONS, type AiCapability, type AiTask } from './tasks.js';

export type AiProviderId = 'gemini' | 'self_hosted';

export interface AiProviderRegistration {
  readonly id: AiProviderId;
  readonly provider: TravelAiProvider;
  readonly capabilities: ReadonlySet<AiCapability>;
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
  };
}

export function createSelfHostedAiRegistration(provider: TravelAiProvider): AiProviderRegistration {
  return {
    id: SELF_HOSTED_PROVIDER_ID,
    provider,
    capabilities: new Set<AiCapability>(SELF_HOSTED_CAPABILITIES),
  };
}

export class AiTaskRouter implements TravelAiProvider {
  private readonly providers: ReadonlyMap<AiProviderId, AiProviderRegistration>;

  constructor(registrations: readonly AiProviderRegistration[]) {
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
  }

  private providerFor(task: AiTask): TravelAiProvider {
    const registration = this.providers.get(AI_TASK_ROUTING[task]);
    if (!registration) throw new Error(`No AI provider registered for task ${task}`);
    return registration.provider;
  }

  extractIntent(input: GenerateTripInput): Promise<TravelIntent> {
    return this.providerFor('extract_intent').extractIntent(input);
  }

  planTrip(input: TripPlanningInput): Promise<TravelPlanDraft> {
    return this.providerFor('generate_trip').planTrip(input);
  }

  generateTrip(input: GenerateTripInput): Promise<TravelPlanDraft> {
    return this.providerFor('generate_trip').generateTrip(input);
  }

  analyzeText(input: AnalyzeTextInput): Promise<TravelPlanDraft> {
    return this.providerFor('analyze_text').analyzeText(input);
  }

  rankPlaces(input: PlaceRankingInput): Promise<PlaceRankingResult> {
    return this.providerFor('rank_places').rankPlaces(input);
  }
}
