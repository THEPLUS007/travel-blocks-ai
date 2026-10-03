import { BoundedJudgePolicyV1Schema, type BoundedJudgePolicyV1 } from './contracts.js';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export const BOUNDED_JUDGE_POLICY_V1: Readonly<BoundedJudgePolicyV1> = deepFreeze(BoundedJudgePolicyV1Schema.parse({
  contractVersion: 'bounded_judge_policy_v1',
  id: 'bounded-ai-preference-ordering',
  version: 'v1',
  enabled: true,
  minimumCandidates: 2,
  maximumCandidates: 5,
}));
