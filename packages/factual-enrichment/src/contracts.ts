import {
  CandidateFactSnapshotSchema,
  CoordinatesSchema,
  DecisionCandidateSchema,
  FactualProvenanceSchema,
  NormalizedOpeningHoursSnapshotSchema,
  PlaceReferenceSchema,
} from '@travel-blocks/decision-engine';
import { TransportModeSchema } from '@travel-blocks/shared';
import { z } from 'zod';

const IdentifierSchema = z.string().trim().min(1).max(160);
const TimestampSchema = z.string().datetime({ offset: true });
const BusinessStatusSchema = z.enum(['operational', 'temporarily_closed', 'permanently_closed', 'future_opening']);

export const CandidateFactualEnrichmentRequestVersionSchema = z.literal('candidate_factual_enrichment_request_v1');
export const CandidateFactualEnrichmentResultVersionSchema = z.literal('candidate_factual_enrichment_result_v1');

export const CandidateRouteAcquisitionContextSchema = z.object({
  requestId: IdentifierSchema,
  origin: CoordinatesSchema,
  transportMode: TransportModeSchema,
}).strict();

export const CandidateFactualEnrichmentContextSchema = z.object({
  retrievedAt: TimestampSchema,
  provenance: FactualProvenanceSchema,
  route: CandidateRouteAcquisitionContextSchema.optional(),
}).strict().superRefine((context, refinement) => {
  if (context.provenance.retrievedAt !== context.retrievedAt) {
    refinement.addIssue({ code: z.ZodIssueCode.custom, path: ['provenance', 'retrievedAt'], message: 'Context provenance timestamp must match context retrievedAt.' });
  }
});

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

export const CandidateFactualEnrichmentRequestSchema = z.object({
  contractVersion: CandidateFactualEnrichmentRequestVersionSchema,
  requestId: IdentifierSchema,
  candidates: z.array(DecisionCandidateSchema).min(1).max(100),
  existingFacts: z.array(CandidateFactSnapshotSchema).max(100).default([]),
  context: CandidateFactualEnrichmentContextSchema,
}).strict().superRefine((request, context) => {
  const candidateIds = new Set<string>();
  const candidateByFactSnapshotId = new Map<string, string>();
  for (const [index, candidate] of request.candidates.entries()) {
    if (candidateIds.has(candidate.candidateId)) addIssue(context, ['candidates', index, 'candidateId'], 'Candidate IDs must be unique.');
    candidateIds.add(candidate.candidateId);
    candidateByFactSnapshotId.set(candidate.factSnapshotId, candidate.candidateId);
  }
  const factIds = new Set<string>();
  for (const [index, fact] of request.existingFacts.entries()) {
    if (factIds.has(fact.factSnapshotId)) addIssue(context, ['existingFacts', index, 'factSnapshotId'], 'Existing fact snapshot IDs must be unique.');
    factIds.add(fact.factSnapshotId);
    const candidateId = candidateByFactSnapshotId.get(fact.factSnapshotId);
    if (!candidateId) addIssue(context, ['existingFacts', index, 'factSnapshotId'], 'Existing fact must be referenced by a request candidate.');
    else if (candidateId !== fact.candidateId) addIssue(context, ['existingFacts', index, 'candidateId'], 'Existing fact must belong to its referencing candidate.');
  }
});

export const CandidateFactualEnrichmentResultSchema = z.object({
  contractVersion: CandidateFactualEnrichmentResultVersionSchema,
  requestId: IdentifierSchema,
  snapshots: z.array(CandidateFactSnapshotSchema).min(1).max(100),
  coverage: z.object({
    accountedCandidates: z.number().int().nonnegative(),
    knownSnapshots: z.number().int().nonnegative(),
    incompleteSnapshots: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const CandidatePlaceFactsSchema = z.object({
  provenance: FactualProvenanceSchema,
  retrievedAt: TimestampSchema,
  coordinates: CoordinatesSchema.optional(),
  businessStatus: BusinessStatusSchema.optional(),
  timeZone: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((facts, context) => {
  if (facts.provenance.retrievedAt !== facts.retrievedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provenance', 'retrievedAt'], message: 'Place fact provenance timestamp must match retrievedAt.' });
  }
});

export const CandidateRouteFactsSchema = z.object({
  provenance: FactualProvenanceSchema,
  retrievedAt: TimestampSchema,
  distanceKm: z.number().finite().nonnegative().optional(),
  durationMinutes: z.number().finite().nonnegative().optional(),
  transportMode: TransportModeSchema,
}).strict().superRefine((facts, context) => {
  if (facts.distanceKm === undefined && facts.durationMinutes === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Route facts need distance or duration.' });
  }
  if (facts.provenance.retrievedAt !== facts.retrievedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['provenance', 'retrievedAt'], message: 'Route fact provenance timestamp must match retrievedAt.' });
  }
});

export type CandidateFactualEnrichmentRequest = z.infer<typeof CandidateFactualEnrichmentRequestSchema>;
export type CandidateFactualEnrichmentResult = z.infer<typeof CandidateFactualEnrichmentResultSchema>;
export type CandidateFactualEnrichmentContext = z.infer<typeof CandidateFactualEnrichmentContextSchema>;
export type CandidateRouteAcquisitionContext = z.infer<typeof CandidateRouteAcquisitionContextSchema>;
export type CandidatePlaceFacts = z.infer<typeof CandidatePlaceFactsSchema>;
export type CandidateRouteFacts = z.infer<typeof CandidateRouteFactsSchema>;
export type CandidatePlaceReference = z.infer<typeof PlaceReferenceSchema>;
export type CandidateOpeningHoursFacts = z.infer<typeof NormalizedOpeningHoursSnapshotSchema>;

export function validateCandidateFactualEnrichmentRequest(input: unknown): CandidateFactualEnrichmentRequest {
  return CandidateFactualEnrichmentRequestSchema.parse(input);
}

export function validateCandidateFactualEnrichmentResult(requestInput: unknown, resultInput: unknown): CandidateFactualEnrichmentResult {
  const request = validateCandidateFactualEnrichmentRequest(requestInput);
  const result = CandidateFactualEnrichmentResultSchema.parse(resultInput);
  const issues: z.ZodIssue[] = [];
  if (result.requestId !== request.requestId) issues.push({ code: z.ZodIssueCode.custom, path: ['requestId'], message: 'Result request ID must match request.' });
  const candidateBySnapshotId = new Map(request.candidates.map((candidate) => [candidate.factSnapshotId, candidate.candidateId]));
  const snapshotIds = new Set<string>();
  for (const [index, snapshot] of result.snapshots.entries()) {
    if (snapshotIds.has(snapshot.factSnapshotId)) issues.push({ code: z.ZodIssueCode.custom, path: ['snapshots', index, 'factSnapshotId'], message: 'Each fact snapshot must appear once.' });
    snapshotIds.add(snapshot.factSnapshotId);
    if (candidateBySnapshotId.get(snapshot.factSnapshotId) !== snapshot.candidateId) issues.push({ code: z.ZodIssueCode.custom, path: ['snapshots', index], message: 'Snapshot must match a request candidate and fact snapshot ID.' });
  }
  for (const candidate of request.candidates) if (!snapshotIds.has(candidate.factSnapshotId)) issues.push({ code: z.ZodIssueCode.custom, path: ['snapshots'], message: `Candidate ${candidate.candidateId} is missing a snapshot.` });
  if (result.coverage.accountedCandidates !== request.candidates.length) issues.push({ code: z.ZodIssueCode.custom, path: ['coverage', 'accountedCandidates'], message: 'Coverage must account for every candidate.' });
  const known = result.snapshots.filter((snapshot) => snapshot.availability === 'known').length;
  if (result.coverage.knownSnapshots !== known || result.coverage.incompleteSnapshots !== result.snapshots.length - known) issues.push({ code: z.ZodIssueCode.custom, path: ['coverage'], message: 'Coverage must match snapshot availability.' });
  if (issues.length) throw new z.ZodError(issues);
  return result;
}
