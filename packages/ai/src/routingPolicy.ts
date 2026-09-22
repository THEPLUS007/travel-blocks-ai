import { AI_TASK_DEFINITIONS, type AiCapability, type AiTask } from './tasks.js';
import type { AiProviderId, AiProviderRegistration } from './router.js';

export type AiRoutingMode = 'gemini_only' | 'hybrid';
export type AiProviderHealth = 'healthy' | 'unhealthy' | 'unknown';

export interface AiProviderHealthSource {
  status(providerId: AiProviderId): AiProviderHealth;
}

export class StaticAiProviderHealthSource implements AiProviderHealthSource {
  constructor(private readonly statuses: Partial<Record<AiProviderId, AiProviderHealth>> = {}) {}

  status(providerId: AiProviderId): AiProviderHealth {
    return this.statuses[providerId] ?? 'unknown';
  }
}

export type AiRoutingReason =
  | 'gemini_only'
  | 'self_hosted_non_target_task'
  | 'self_hosted_routing_disabled'
  | 'self_hosted_unregistered'
  | 'self_hosted_missing_capability'
  | 'self_hosted_unhealthy'
  | 'self_hosted_selected';

export interface AiRoutingDecision {
  readonly task: AiTask;
  readonly requiredCapability: AiCapability;
  readonly selectedProviderId: AiProviderId;
  readonly routingMode: AiRoutingMode;
  readonly reason: AiRoutingReason;
  readonly selfHostedEligible: boolean;
  readonly selfHostedHealth: AiProviderHealth;
  readonly selectedAt: number;
}

export interface AiRoutingPolicyOptions {
  readonly mode?: AiRoutingMode;
  readonly registrations: readonly AiProviderRegistration[];
  readonly selfHostedEnabled?: boolean;
  readonly health?: AiProviderHealthSource;
  readonly now?: () => number;
}

export class AiRoutingPolicy {
  private readonly registrations: ReadonlyMap<AiProviderId, AiProviderRegistration>;
  private readonly mode: AiRoutingMode;
  private readonly selfHostedEnabled: boolean;
  private readonly health: AiProviderHealthSource;
  private readonly now: () => number;

  constructor(options: AiRoutingPolicyOptions) {
    this.registrations = new Map(options.registrations.map((registration) => [registration.id, registration]));
    this.mode = options.mode ?? 'gemini_only';
    this.selfHostedEnabled = options.selfHostedEnabled ?? false;
    this.health = options.health ?? new StaticAiProviderHealthSource();
    this.now = options.now ?? Date.now;
  }

  decide(task: AiTask): AiRoutingDecision {
    const requiredCapability = AI_TASK_DEFINITIONS[task].requiredCapability;
    const selfHostedHealth = this.health.status('self_hosted');
    const base = { task, requiredCapability, routingMode: this.mode, selfHostedEligible: false, selfHostedHealth, selectedAt: this.now() } as const;

    if (task !== 'extract_intent') return { ...base, selectedProviderId: 'gemini', reason: 'self_hosted_non_target_task' };
    if (this.mode === 'gemini_only') return { ...base, selectedProviderId: 'gemini', reason: 'gemini_only' };
    if (!this.selfHostedEnabled) return { ...base, selectedProviderId: 'gemini', reason: 'self_hosted_routing_disabled' };

    const registration = this.registrations.get('self_hosted');
    if (!registration) return { ...base, selectedProviderId: 'gemini', reason: 'self_hosted_unregistered' };
    if (!registration.capabilities.has(requiredCapability)) return { ...base, selectedProviderId: 'gemini', reason: 'self_hosted_missing_capability' };
    if (selfHostedHealth !== 'healthy') return { ...base, selectedProviderId: 'gemini', reason: 'self_hosted_unhealthy' };
    return { ...base, selectedProviderId: 'self_hosted', reason: 'self_hosted_selected', selfHostedEligible: true };
  }
}
