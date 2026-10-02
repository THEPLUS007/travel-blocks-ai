import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1).max(160);

export const DecisionEvaluationContextSchema = z.object({
  resultId: IdentifierSchema,
  evaluatedAt: z.string().datetime({ offset: true }),
}).strict();

export const DeterministicHardRuleSchema = z.object({
  id: z.literal('permanently_closed'),
  priority: z.literal(1),
}).strict();

export const RequiredFactSchema = z.enum(['business_status']);

export const ScoringDimensionSchema = z.object({
  id: z.literal('category_match'),
  weight: z.number().int().min(1).max(1000),
}).strict();

/** The integer scale and neutral treatment are policy, never implicit engine defaults. */
export const CategoryMatchScoreSchema = z.object({
  matchingCategory: z.number().int().min(0).max(1000),
  nonMatchingCategory: z.number().int().min(0).max(1000),
  noRequestedCategories: z.number().int().min(0).max(1000),
}).strict();

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

export const DeterministicDecisionPolicySchema = z.object({
  id: IdentifierSchema,
  version: IdentifierSchema,
  selectionLimit: z.number().int().positive().max(100),
  minimumSelectionScore: z.number().int().min(0).max(1000),
  hardRules: z.array(DeterministicHardRuleSchema).min(1).max(10),
  requiredFacts: z.array(RequiredFactSchema).min(1).max(10),
  scoringDimensions: z.array(ScoringDimensionSchema).min(1).max(10),
  categoryMatchScores: CategoryMatchScoreSchema,
  incompleteDataHandling: z.literal('unresolved_required_fact'),
  tieBreak: z.tuple([z.literal('final_score_desc'), z.literal('candidate_id_asc')]),
}).strict().superRefine((policy, context) => {
  const hardRuleIds = new Set<string>();
  for (const [index, rule] of policy.hardRules.entries()) {
    if (hardRuleIds.has(rule.id)) addIssue(context, ['hardRules', index, 'id'], 'Hard rule IDs must be unique.');
    hardRuleIds.add(rule.id);
  }
  const requiredFactIds = new Set<string>();
  for (const [index, fact] of policy.requiredFacts.entries()) {
    if (requiredFactIds.has(fact)) addIssue(context, ['requiredFacts', index], 'Required facts must be unique.');
    requiredFactIds.add(fact);
  }
  const dimensionIds = new Set<string>();
  let totalWeight = 0;
  for (const [index, dimension] of policy.scoringDimensions.entries()) {
    if (dimensionIds.has(dimension.id)) addIssue(context, ['scoringDimensions', index, 'id'], 'Scoring dimensions must be unique.');
    dimensionIds.add(dimension.id);
    totalWeight += dimension.weight;
  }
  if (totalWeight !== 1000) addIssue(context, ['scoringDimensions'], 'Scoring dimension weights must sum to exactly 1000.');
});

export type DecisionEvaluationContext = z.infer<typeof DecisionEvaluationContextSchema>;
export type DeterministicDecisionPolicy = z.infer<typeof DeterministicDecisionPolicySchema>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export const DETERMINISTIC_POLICY_V1: Readonly<DeterministicDecisionPolicy> = deepFreeze(DeterministicDecisionPolicySchema.parse({
  id: 'deterministic-travel-selection',
  version: 'v1',
  selectionLimit: 5,
  minimumSelectionScore: 0,
  hardRules: [{ id: 'permanently_closed', priority: 1 }],
  requiredFacts: ['business_status'],
  scoringDimensions: [{ id: 'category_match', weight: 1000 }],
  categoryMatchScores: {
    matchingCategory: 1000,
    nonMatchingCategory: 0,
    noRequestedCategories: 500,
  },
  incompleteDataHandling: 'unresolved_required_fact',
  tieBreak: ['final_score_desc', 'candidate_id_asc'],
}));
