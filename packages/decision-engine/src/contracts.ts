import { TransportModeSchema, TravelBlockCategorySchema } from '@travel-blocks/shared';
import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1).max(160);
const TimestampSchema = z.string().datetime({ offset: true });
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeZoneSchema = z.string().trim().min(1).max(120);
const ClockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const DecisionRequestVersionSchema = z.literal('decision_request_v1');
export const DecisionResultVersionSchema = z.literal('decision_result_v1');
export const FactAvailabilitySchema = z.enum(['known', 'unknown', 'unavailable', 'invalid', 'untrusted']);
export const ResultCompletenessSchema = z.enum(['complete', 'partial', 'incomplete']);
export const FactCoverageStatusSchema = z.enum(['complete', 'partial', 'unknown', 'unavailable']);

export const FactualProvenanceSchema = z.object({
  sourceSystem: IdentifierSchema,
  sourceRecordId: IdentifierSchema,
  sourceKind: z.enum(['factual_provider', 'curated_fixture', 'verified_user_input']),
  retrievedAt: TimestampSchema,
}).strict();

export const PlaceReferenceSchema = z.object({
  sourceSystem: IdentifierSchema,
  sourceRecordId: IdentifierSchema,
}).strict();

export const CoordinatesSchema = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
}).strict();

export const DecisionCandidateSchema = z.object({
  candidateId: IdentifierSchema,
  place: z.object({
    reference: PlaceReferenceSchema,
    displayName: z.string().trim().min(1).max(200),
    category: TravelBlockCategorySchema,
    formattedAddress: z.string().trim().min(1).max(300).optional(),
  }).strict(),
  factSnapshotId: IdentifierSchema,
  discoveredAt: TimestampSchema,
  provenance: FactualProvenanceSchema,
}).strict();

const OpeningHoursPeriodSchema = z.object({
  openDay: z.number().int().min(0).max(6),
  openTime: ClockSchema,
  closeDay: z.number().int().min(0).max(6).optional(),
  closeTime: ClockSchema.optional(),
  openDate: DateSchema.optional(),
  closeDate: DateSchema.optional(),
}).strict();

export const NormalizedOpeningHoursSnapshotSchema = z.object({
  businessStatus: z.enum(['operational', 'temporarily_closed', 'permanently_closed', 'future_opening', 'unknown']).optional(),
  timeZone: TimeZoneSchema.optional(),
  currentHours: z.object({
    periods: z.array(OpeningHoursPeriodSchema).max(100),
    coverageStart: DateSchema.optional(),
    coverageEnd: DateSchema.optional(),
  }).strict().optional(),
  regularHours: z.object({
    periods: z.array(OpeningHoursPeriodSchema).max(100),
    coverageStart: DateSchema.optional(),
    coverageEnd: DateSchema.optional(),
  }).strict().optional(),
  dataQualityFlags: z.array(z.enum([
    'opening_hours_missing', 'current_hours_unavailable', 'regular_hours_only', 'timezone_missing',
    'trip_date_missing', 'trip_date_invalid', 'block_time_missing', 'block_time_unparseable',
    'outside_current_hours_window', 'special_hours_unknown', 'business_temporarily_closed',
    'business_permanently_closed', 'invalid_opening_period',
  ])).max(30),
}).strict();

const UnknownFactStateSchema = z.enum(['unknown', 'unavailable', 'invalid', 'untrusted']);
const KnownCoordinatesFactSchema = z.object({ state: z.literal('known'), value: CoordinatesSchema }).strict();
const UnknownCoordinatesFactSchema = z.object({ state: UnknownFactStateSchema }).strict();
export const CoordinatesFactSchema = z.discriminatedUnion('state', [KnownCoordinatesFactSchema, UnknownCoordinatesFactSchema]);

const KnownOpeningHoursFactSchema = z.object({ state: z.literal('known'), value: NormalizedOpeningHoursSnapshotSchema }).strict();
const UnknownOpeningHoursFactSchema = z.object({ state: UnknownFactStateSchema }).strict();
export const OpeningHoursFactSchema = z.discriminatedUnion('state', [KnownOpeningHoursFactSchema, UnknownOpeningHoursFactSchema]);

const KnownBusinessStatusFactSchema = z.object({ state: z.literal('known'), value: z.enum(['operational', 'temporarily_closed', 'permanently_closed', 'future_opening']) }).strict();
const UnknownBusinessStatusFactSchema = z.object({ state: UnknownFactStateSchema }).strict();
export const BusinessStatusFactSchema = z.discriminatedUnion('state', [KnownBusinessStatusFactSchema, UnknownBusinessStatusFactSchema]);

const KnownTimeZoneFactSchema = z.object({ state: z.literal('known'), value: TimeZoneSchema }).strict();
const UnknownTimeZoneFactSchema = z.object({ state: UnknownFactStateSchema }).strict();
export const TimeZoneFactSchema = z.discriminatedUnion('state', [KnownTimeZoneFactSchema, UnknownTimeZoneFactSchema]);

const KnownPriceFactSchema = z.object({ state: z.literal('known'), value: z.object({ amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict() }).strict();
const UnknownPriceFactSchema = z.object({ state: UnknownFactStateSchema }).strict();
export const PriceFactSchema = z.discriminatedUnion('state', [KnownPriceFactSchema, UnknownPriceFactSchema]);

const KnownRouteFactSchema = z.object({
  state: z.literal('known'),
  value: z.object({
    distanceKm: z.number().finite().nonnegative().optional(),
    durationMinutes: z.number().finite().nonnegative().optional(),
    transportMode: TransportModeSchema.optional(),
  }).strict().refine((value) => value.distanceKm !== undefined || value.durationMinutes !== undefined, 'Route fact needs distance or duration.'),
}).strict();
const UnknownRouteFactSchema = z.object({ state: UnknownFactStateSchema }).strict();
export const RouteFactSchema = z.discriminatedUnion('state', [KnownRouteFactSchema, UnknownRouteFactSchema]);

export const CandidateFactSnapshotSchema = z.object({
  factSnapshotId: IdentifierSchema,
  candidateId: IdentifierSchema,
  availability: FactAvailabilitySchema,
  coordinates: CoordinatesFactSchema,
  openingHours: OpeningHoursFactSchema,
  businessStatus: BusinessStatusFactSchema,
  timeZone: TimeZoneFactSchema,
  price: PriceFactSchema,
  route: RouteFactSchema,
  retrievedAt: TimestampSchema,
  provenance: FactualProvenanceSchema,
}).strict();

export const DecisionPolicySchema = z.object({ id: IdentifierSchema, version: IdentifierSchema }).strict();
export const SafeDecisionTraceSchema = z.object({ traceId: IdentifierSchema, source: z.enum(['product_application', 'fixture', 'migration']) }).strict();

const issue = (context: z.RefinementCtx, path: (string | number)[], message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path, message });

export const DecisionRequestSchema = z.object({
  contractVersion: DecisionRequestVersionSchema,
  requestId: IdentifierSchema,
  tripContext: z.object({
    tripContextId: IdentifierSchema,
    destination: z.object({ country: z.string().trim().min(1).max(80).optional(), city: z.string().trim().min(1).max(80).optional(), region: z.string().trim().min(1).max(80).optional() }).strict(),
    tripStartDate: DateSchema.optional(),
    timeZone: TimeZoneSchema.optional(),
  }).strict(),
  constraints: z.object({
    requestedCategories: z.array(TravelBlockCategorySchema).max(6),
    preferences: z.array(z.string().trim().min(1).max(120)).max(20),
    avoidances: z.array(z.string().trim().min(1).max(120)).max(20),
    maximumCandidates: z.number().int().positive().max(100).optional(),
  }).strict(),
  policy: DecisionPolicySchema,
  candidates: z.array(DecisionCandidateSchema).min(1).max(100),
  facts: z.array(CandidateFactSnapshotSchema).min(1).max(100),
  trace: SafeDecisionTraceSchema,
}).strict().superRefine((request, context) => {
  const candidateIds = new Set<string>();
  const factsById = new Map<string, z.infer<typeof CandidateFactSnapshotSchema>>();
  for (const [index, candidate] of request.candidates.entries()) {
    if (candidateIds.has(candidate.candidateId)) issue(context, ['candidates', index, 'candidateId'], 'Candidate IDs must be unique.');
    candidateIds.add(candidate.candidateId);
  }
  for (const [index, fact] of request.facts.entries()) {
    if (factsById.has(fact.factSnapshotId)) issue(context, ['facts', index, 'factSnapshotId'], 'Fact snapshot IDs must be unique.');
    factsById.set(fact.factSnapshotId, fact);
    if (!candidateIds.has(fact.candidateId)) issue(context, ['facts', index, 'candidateId'], 'Fact snapshot must reference an existing candidate.');
  }
  for (const [index, candidate] of request.candidates.entries()) {
    const fact = factsById.get(candidate.factSnapshotId);
    if (!fact) issue(context, ['candidates', index, 'factSnapshotId'], 'Candidate must reference an existing fact snapshot.');
    else if (fact.candidateId !== candidate.candidateId) issue(context, ['candidates', index, 'factSnapshotId'], 'Candidate fact snapshot must belong to the same candidate.');
  }
});

export const DecisionReasonSchema = z.discriminatedUnion('category', [
  z.object({ category: z.literal('deterministic_rule'), code: z.enum(['candidate_selected', 'hard_constraint']) }).strict(),
  z.object({ category: z.literal('insufficient_facts'), code: z.enum(['missing_required_facts', 'fact_unavailable', 'fact_untrusted']) }).strict(),
  z.object({ category: z.literal('selection_limit'), code: z.literal('selection_limit') }).strict(),
  z.object({ category: z.literal('ai_assisted'), code: z.enum(['ai_judge_required', 'ai_judge_unavailable']) }).strict(),
  z.object({ category: z.literal('system_policy'), code: z.literal('policy_not_executed') }).strict(),
]);

export const SafeEvidenceReferenceSchema = z.object({ factSnapshotId: IdentifierSchema.optional(), referenceType: z.enum(['fact', 'policy', 'judge_signal']), referenceId: IdentifierSchema }).strict();
export const SafeDecisionProvenanceSchema = z.object({ traceId: IdentifierSchema, decisionSource: z.enum(['deterministic', 'ai_assisted', 'system']), producedAt: TimestampSchema }).strict();

const DecisionItemBaseSchema = z.object({
  candidateId: IdentifierSchema,
  policy: DecisionPolicySchema,
  evidence: z.array(SafeEvidenceReferenceSchema).max(20),
  provenance: SafeDecisionProvenanceSchema,
}).strict();

export const SelectedDecisionItemSchema = DecisionItemBaseSchema.extend({
  status: z.literal('selected'),
  reason: z.object({ category: z.literal('deterministic_rule'), code: z.literal('candidate_selected') }).strict(),
}).strict();
export const RejectedDecisionItemSchema = DecisionItemBaseSchema.extend({
  status: z.literal('rejected'),
  reason: z.union([
    z.object({ category: z.literal('deterministic_rule'), code: z.literal('hard_constraint') }).strict(),
    z.object({ category: z.literal('selection_limit'), code: z.literal('selection_limit') }).strict(),
  ]),
}).strict();
export const UnresolvedDecisionItemSchema = DecisionItemBaseSchema.extend({
  status: z.literal('unresolved'),
  reason: z.union([
    z.object({ category: z.literal('insufficient_facts'), code: z.enum(['missing_required_facts', 'fact_unavailable', 'fact_untrusted']) }).strict(),
    z.object({ category: z.literal('ai_assisted'), code: z.enum(['ai_judge_required', 'ai_judge_unavailable']) }).strict(),
    z.object({ category: z.literal('system_policy'), code: z.literal('policy_not_executed') }).strict(),
  ]),
}).strict();
export const DecisionItemSchema = z.discriminatedUnion('status', [SelectedDecisionItemSchema, RejectedDecisionItemSchema, UnresolvedDecisionItemSchema]);

export const DecisionResultSchema = z.object({
  contractVersion: DecisionResultVersionSchema,
  resultId: IdentifierSchema,
  requestId: IdentifierSchema,
  policy: DecisionPolicySchema,
  createdAt: TimestampSchema,
  completeness: ResultCompletenessSchema,
  coverage: z.object({ status: FactCoverageStatusSchema, evaluatedCandidates: z.number().int().nonnegative(), unresolvedCandidates: z.number().int().nonnegative() }).strict(),
  decisions: z.array(DecisionItemSchema).min(1).max(100),
  provenance: SafeDecisionProvenanceSchema,
}).strict();

export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;
export type CandidateFactSnapshot = z.infer<typeof CandidateFactSnapshotSchema>;
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;
export type DecisionReason = z.infer<typeof DecisionReasonSchema>;
export type SelectedDecisionItem = z.infer<typeof SelectedDecisionItemSchema>;
export type RejectedDecisionItem = z.infer<typeof RejectedDecisionItemSchema>;
export type UnresolvedDecisionItem = z.infer<typeof UnresolvedDecisionItemSchema>;
export type DecisionItem = z.infer<typeof DecisionItemSchema>;
export type DecisionResult = z.infer<typeof DecisionResultSchema>;
