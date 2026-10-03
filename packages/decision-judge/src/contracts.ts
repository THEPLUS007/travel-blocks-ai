import { TravelBlockCategorySchema } from '@travel-blocks/shared';
import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1).max(160);
const SafeTextSchema = z.string().trim().min(1).max(120);

export const BoundedJudgeRequestVersionSchema = z.literal('bounded_judge_request_v1');
export const BoundedJudgeResultVersionSchema = z.literal('bounded_judge_result_v1');
export const BoundedJudgePolicyVersionSchema = z.literal('bounded_judge_policy_v1');

export const BoundedJudgePolicyV1Schema = z.object({
  contractVersion: BoundedJudgePolicyVersionSchema,
  id: IdentifierSchema,
  version: IdentifierSchema,
  enabled: z.boolean(),
  minimumCandidates: z.number().int().min(2).max(100),
  maximumCandidates: z.number().int().min(2).max(100),
}).strict().superRefine((value, context) => {
  if (value.minimumCandidates > value.maximumCandidates) context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimumCandidates'], message: 'minimumCandidates cannot exceed maximumCandidates.' });
});

export const BoundedJudgeCandidateSchema = z.object({
  candidateId: IdentifierSchema,
  category: TravelBlockCategorySchema,
  displayLabel: z.string().trim().min(1).max(200).optional(),
  deterministicScore: z.number().finite().int().min(0).max(1000),
  factCoverage: z.enum(['known', 'unknown', 'unavailable', 'invalid', 'untrusted']),
  knownFacts: z.object({
    businessStatus: z.enum(['operational', 'temporarily_closed', 'permanently_closed', 'future_opening']).optional(),
  }).strict(),
  evidenceReferences: z.array(z.object({ referenceType: z.enum(['fact', 'policy']), referenceId: IdentifierSchema }).strict()).min(1).max(4),
}).strict();

export const BoundedJudgeRequestV1Schema = z.object({
  contractVersion: BoundedJudgeRequestVersionSchema,
  judgeRequestId: IdentifierSchema,
  decisionRequestId: IdentifierSchema,
  deterministicPolicy: z.object({ id: IdentifierSchema, version: IdentifierSchema }).strict(),
  judgePolicy: z.object({ id: IdentifierSchema, version: IdentifierSchema }).strict(),
  preferenceSignals: z.array(SafeTextSchema).min(1).max(20),
  requestedCategories: z.array(TravelBlockCategorySchema).max(6),
  selectionLimit: z.number().int().positive().max(100),
  candidates: z.array(BoundedJudgeCandidateSchema).min(2).max(100),
  candidateCount: z.number().int().min(2).max(100),
}).strict().superRefine((value, context) => {
  if (value.candidateCount !== value.candidates.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidateCount'], message: 'candidateCount must equal candidates length.' });
  const ids = new Set<string>();
  for (const [index, candidate] of value.candidates.entries()) {
    if (ids.has(candidate.candidateId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateId'], message: 'Candidate IDs must be unique.' });
    ids.add(candidate.candidateId);
  }
});

export const BoundedJudgeRankingSchema = z.object({
  candidateId: IdentifierSchema,
  rank: z.number().int().positive(),
  confidence: z.number().int().min(0).max(1000).optional(),
  reasonCode: z.enum(['preference_fit', 'category_affinity', 'tie_break']),
  explanation: z.string().trim().min(1).max(240).optional(),
}).strict();

export const BoundedJudgeResultV1Schema = z.object({
  contractVersion: BoundedJudgeResultVersionSchema,
  judgeRequestId: IdentifierSchema,
  rankings: z.array(BoundedJudgeRankingSchema).min(2).max(100),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  const ranks = new Set<number>();
  for (const [index, ranking] of value.rankings.entries()) {
    if (ids.has(ranking.candidateId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rankings', index, 'candidateId'], message: 'Candidate IDs must be unique.' });
    if (ranks.has(ranking.rank)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rankings', index, 'rank'], message: 'Ranks must be unique.' });
    ids.add(ranking.candidateId);
    ranks.add(ranking.rank);
  }
  for (let rank = 1; rank <= value.rankings.length; rank += 1) {
    if (!ranks.has(rank)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rankings'], message: 'Ranks must be contiguous from 1.' });
  }
});

export type BoundedJudgePolicyV1 = z.infer<typeof BoundedJudgePolicyV1Schema>;
export type BoundedJudgeRequestV1 = z.infer<typeof BoundedJudgeRequestV1Schema>;
export type BoundedJudgeResultV1 = z.infer<typeof BoundedJudgeResultV1Schema>;
export type BoundedJudgeCandidate = z.infer<typeof BoundedJudgeCandidateSchema>;

export type BoundedJudgeSkipReason = 'disabled' | 'no_preference_signal' | 'insufficient_candidates' | 'no_eligible_candidates' | 'no_eligible_provider';
export type BoundedJudgeEligibility =
  | { readonly eligible: true; readonly reason: 'eligible'; readonly candidateIds: readonly string[]; readonly excludedCandidateIds: readonly string[] }
  | { readonly eligible: false; readonly reason: BoundedJudgeSkipReason; readonly candidateIds: readonly string[]; readonly excludedCandidateIds: readonly string[] };

export type BoundedJudgeOutcome =
  | { readonly outcome: 'skipped'; readonly eligibility: BoundedJudgeEligibility }
  | { readonly outcome: 'applied'; readonly eligibility: BoundedJudgeEligibility & { readonly eligible: true }; readonly request: BoundedJudgeRequestV1; readonly result: BoundedJudgeResultV1 };
