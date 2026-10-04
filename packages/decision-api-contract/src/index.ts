import { DecisionResultSchema } from '@travel-blocks/decision-engine';
import { TravelBlockCategorySchema } from '@travel-blocks/shared';
import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1).max(120);

/** Public API cap; clients must not silently truncate candidate sets. */
export const DECISION_API_MAX_CANDIDATES = 20;

const DecisionTripContextSchema = z.object({
  tripContextId: IdentifierSchema,
  destination: z.object({
    country: z.string().trim().min(1).max(80).optional(),
    city: z.string().trim().min(1).max(80).optional(),
    region: z.string().trim().min(1).max(80).optional(),
  }).strict(),
  tripStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeZone: z.string().trim().min(1).max(120).optional(),
}).strict();

const DecisionCandidateDiscoveryTripContextSchema = DecisionTripContextSchema.refine(
  (context) => Object.values(context.destination).some(Boolean),
  'A destination is required.',
);

const DecisionConstraintsSchema = z.object({
  requestedCategories: z.array(TravelBlockCategorySchema).max(6),
  preferences: z.array(z.string().trim().min(1).max(120)).max(20),
  avoidances: z.array(z.string().trim().min(1).max(120)).max(20),
  selectionLimit: z.number().int().positive().max(DECISION_API_MAX_CANDIDATES).optional(),
}).strict();

export const DecisionApiRequestV1Schema = z.object({
  contractVersion: z.literal('decision_api_request_v1'),
  tripContext: DecisionTripContextSchema,
  constraints: DecisionConstraintsSchema,
  candidates: z.array(z.object({
    candidateId: IdentifierSchema,
    providerReference: z.object({
      sourceSystem: IdentifierSchema,
      sourceRecordId: IdentifierSchema,
    }).strict(),
  }).strict()).min(1).max(DECISION_API_MAX_CANDIDATES),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, candidate] of value.candidates.entries()) {
    if (ids.has(candidate.candidateId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateId'], message: 'Candidate IDs must be unique.' });
    }
    ids.add(candidate.candidateId);
  }
});

/** Transport-only discovery boundary: provider-backed candidates, never TravelBlocks or decisions. */
export const DecisionCandidateDiscoveryRequestV1Schema = z.object({
  contractVersion: z.literal('decision_candidate_discovery_request_v1'),
  tripContext: DecisionCandidateDiscoveryTripContextSchema,
  constraints: DecisionConstraintsSchema,
  candidateLimit: z.number().int().positive().max(DECISION_API_MAX_CANDIDATES).optional(),
}).strict();

const DecisionCandidateDiscoveryItemV1Schema = z.object({
  candidateId: IdentifierSchema,
  providerReference: z.object({
    sourceSystem: IdentifierSchema,
    sourceRecordId: IdentifierSchema,
  }).strict(),
  displayName: z.string().trim().min(1).max(200),
  formattedAddress: z.string().trim().min(1).max(300).optional(),
  category: TravelBlockCategorySchema,
}).strict();

export const DecisionCandidateDiscoveryResponseV1Schema = z.object({
  contractVersion: z.literal('decision_candidate_discovery_response_v1'),
  candidateSetId: IdentifierSchema,
  tripContext: DecisionCandidateDiscoveryTripContextSchema,
  constraints: DecisionConstraintsSchema,
  canonicalOrder: z.literal('candidate_id_ascending'),
  candidates: z.array(DecisionCandidateDiscoveryItemV1Schema).max(DECISION_API_MAX_CANDIDATES),
}).strict().superRefine((value, context) => {
  const candidateIds = new Set<string>();
  const references = new Set<string>();
  let previousId: string | undefined;
  for (const [index, candidate] of value.candidates.entries()) {
    if (candidateIds.has(candidate.candidateId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateId'], message: 'Candidate IDs must be unique.' });
    }
    const referenceKey = `${candidate.providerReference.sourceSystem}\u0000${candidate.providerReference.sourceRecordId}`;
    if (references.has(referenceKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'providerReference'], message: 'Provider references must be unique.' });
    }
    if (previousId !== undefined && previousId > candidate.candidateId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateId'], message: 'Candidates must use canonical order.' });
    }
    candidateIds.add(candidate.candidateId);
    references.add(referenceKey);
    previousId = candidate.candidateId;
  }
});

export const DecisionCandidateDiscoveryErrorV1Schema = z.object({
  contractVersion: z.literal('decision_candidate_discovery_error_v1'),
  error: z.object({
    code: z.enum(['INVALID_DECISION_CANDIDATE_DISCOVERY_REQUEST', 'FACTUAL_DEPENDENCY_FAILURE', 'CANDIDATE_DISCOVERY_INVARIANT_FAILURE']),
    message: z.string().trim().min(1).max(200),
    retryable: z.boolean(),
    requestId: IdentifierSchema,
  }).strict(),
}).strict();

export const DecisionApiErrorResponseV1Schema = z.object({
  contractVersion: z.literal('decision_api_error_v1'),
  error: z.object({
    code: z.enum([
      'INVALID_DECISION_REQUEST',
      'FACTUAL_DEPENDENCY_FAILURE',
      'AI_DEPENDENCY_TIMEOUT',
      'AI_DEPENDENCY_UNAVAILABLE',
      'AI_INVALID_OUTPUT',
      'DECISION_INVARIANT_FAILURE',
    ]),
    message: z.string().trim().min(1).max(200),
    retryable: z.boolean(),
    requestId: IdentifierSchema,
  }).strict(),
}).strict();

export const DecisionApiJudgeOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('applied') }).strict(),
  z.object({
    outcome: z.literal('skipped'),
    reason: z.enum(['disabled', 'no_preference_signal', 'insufficient_candidates', 'no_eligible_candidates', 'no_eligible_provider']),
  }).strict(),
]);

export const DecisionApiResponseV1Schema = z.object({
  contractVersion: z.literal('decision_api_response_v1'),
  requestId: IdentifierSchema,
  decisionRequestId: IdentifierSchema,
  resultId: IdentifierSchema,
  policy: z.object({ id: IdentifierSchema, version: IdentifierSchema }).strict(),
  decisionResult: DecisionResultSchema,
  judge: DecisionApiJudgeOutcomeSchema,
  coverage: z.object({
    status: z.enum(['complete', 'partial', 'unknown', 'unavailable']),
    evaluatedCandidates: z.number().int().nonnegative(),
    unresolvedCandidates: z.number().int().nonnegative(),
  }).strict(),
  candidates: z.array(z.object({
    candidateId: IdentifierSchema,
    displayName: z.string().trim().min(1).max(200),
    category: TravelBlockCategorySchema,
  }).strict()).min(1).max(DECISION_API_MAX_CANDIDATES),
}).strict().superRefine((value, context) => {
  if (value.decisionResult.requestId !== value.decisionRequestId || value.decisionResult.resultId !== value.resultId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionResult'], message: 'Response identity must match the DecisionResult.' });
  }
  if (
    value.coverage.status !== value.decisionResult.coverage.status ||
    value.coverage.evaluatedCandidates !== value.decisionResult.coverage.evaluatedCandidates ||
    value.coverage.unresolvedCandidates !== value.decisionResult.coverage.unresolvedCandidates
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['coverage'], message: 'Response coverage must match the DecisionResult.' });
  }

  const candidateIds = new Set<string>();
  for (const [index, candidate] of value.candidates.entries()) {
    if (candidateIds.has(candidate.candidateId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateId'], message: 'Response candidate IDs must be unique.' });
    }
    candidateIds.add(candidate.candidateId);
  }

  const decisionIds = new Set<string>();
  for (const [index, decision] of value.decisionResult.decisions.entries()) {
    if (!candidateIds.has(decision.candidateId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionResult', 'decisions', index, 'candidateId'], message: 'Every decision must have a display candidate.' });
    }
    if (decisionIds.has(decision.candidateId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionResult', 'decisions', index, 'candidateId'], message: 'Every candidate must have exactly one decision.' });
    }
    decisionIds.add(decision.candidateId);
  }
  for (const candidateId of candidateIds) {
    if (!decisionIds.has(candidateId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionResult', 'decisions'], message: 'Every display candidate must have a decision.' });
    }
  }
});

export type DecisionApiRequestV1 = z.infer<typeof DecisionApiRequestV1Schema>;
export type DecisionApiResponseV1 = z.infer<typeof DecisionApiResponseV1Schema>;
export type DecisionApiErrorResponseV1 = z.infer<typeof DecisionApiErrorResponseV1Schema>;
export type DecisionCandidateDiscoveryRequestV1 = z.infer<typeof DecisionCandidateDiscoveryRequestV1Schema>;
export type DecisionCandidateDiscoveryResponseV1 = z.infer<typeof DecisionCandidateDiscoveryResponseV1Schema>;
export type DecisionCandidateDiscoveryErrorV1 = z.infer<typeof DecisionCandidateDiscoveryErrorV1Schema>;
export type DecisionReasonCode = DecisionApiResponseV1['decisionResult']['decisions'][number]['reason']['code'];
export type DecisionCoverageStatus = DecisionApiResponseV1['coverage']['status'];
export type DecisionJudgeSkipReason = Extract<DecisionApiResponseV1['judge'], { outcome: 'skipped' }>['reason'];

/** Validates wire shape and the candidate/decision total, exclusive join required by consumers. */
export function parseDecisionApiResponseV1(input: unknown): DecisionApiResponseV1 {
  return DecisionApiResponseV1Schema.parse(input);
}

export function parseDecisionCandidateDiscoveryResponseV1(input: unknown): DecisionCandidateDiscoveryResponseV1 {
  return DecisionCandidateDiscoveryResponseV1Schema.parse(input);
}
