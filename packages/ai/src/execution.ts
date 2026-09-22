import { randomUUID } from 'node:crypto';
import type { AiErrorCode } from './index.js';
import type { AiProviderId } from './router.js';
import type { AiRoutingDecision, AiRoutingMode, AiRoutingReason } from './routingPolicy.js';
import { AI_TASK_DEFINITIONS, type AiCapability, type AiTask } from './tasks.js';

export const AI_EXECUTION_SCOPE_VERSION = 1 as const;
export type AiExecutionOutcome = 'success' | 'failure';
export type AiProvenanceFailureCategory = AiErrorCode | 'unknown';

export interface AiExecutionScopeSeed {
  readonly executionId: string;
  readonly task: AiTask;
  readonly capability: AiCapability;
  readonly startedAt: number;
  readonly version: typeof AI_EXECUTION_SCOPE_VERSION;
}

export interface AiExecutionScope extends AiExecutionScopeSeed {
  readonly providerId: AiProviderId;
  readonly model: string | 'unknown';
  readonly routingMode: AiRoutingMode;
  readonly routingReason: AiRoutingReason;
  readonly routingDecision: AiRoutingDecision;
}

export interface AiProvenance {
  readonly executionId: string;
  readonly version: typeof AI_EXECUTION_SCOPE_VERSION;
  readonly task: AiTask;
  readonly capability: AiCapability;
  readonly providerId: AiProviderId;
  readonly model: string | 'unknown';
  readonly routingMode: AiRoutingMode;
  readonly routingReason: AiRoutingReason;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly outcome: AiExecutionOutcome;
  readonly failureCategory?: AiProvenanceFailureCategory;
}

export interface AiExecutionScopeFactory {
  create(task: AiTask): AiExecutionScopeSeed;
  complete(scope: AiExecutionScope, outcome: AiExecutionOutcome, failureCategory?: AiProvenanceFailureCategory): AiProvenance;
}

export interface DefaultAiExecutionScopeFactoryOptions {
  readonly createId?: () => string;
  readonly now?: () => number;
}

export class DefaultAiExecutionScopeFactory implements AiExecutionScopeFactory {
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(options: DefaultAiExecutionScopeFactoryOptions = {}) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? Date.now;
  }

  create(task: AiTask): AiExecutionScopeSeed {
    return Object.freeze({
      executionId: this.createId(),
      task,
      capability: AI_TASK_DEFINITIONS[task].requiredCapability,
      startedAt: this.now(),
      version: AI_EXECUTION_SCOPE_VERSION,
    });
  }

  complete(scope: AiExecutionScope, outcome: AiExecutionOutcome, failureCategory?: AiProvenanceFailureCategory): AiProvenance {
    const completedAt = this.now();
    return Object.freeze({
      executionId: scope.executionId,
      version: scope.version,
      task: scope.task,
      capability: scope.capability,
      providerId: scope.providerId,
      model: scope.model,
      routingMode: scope.routingMode,
      routingReason: scope.routingReason,
      startedAt: scope.startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt - scope.startedAt),
      outcome,
      ...(failureCategory ? { failureCategory } : {}),
    });
  }
}

export function resolveAiExecutionScope(seed: AiExecutionScopeSeed, decision: AiRoutingDecision, model: string | 'unknown'): AiExecutionScope {
  return Object.freeze({
    ...seed,
    providerId: decision.selectedProviderId,
    model,
    routingMode: decision.routingMode,
    routingReason: decision.reason,
    routingDecision: decision,
  });
}

export interface AiExecutionObserver {
  record(provenance: AiProvenance): void | Promise<void>;
}
