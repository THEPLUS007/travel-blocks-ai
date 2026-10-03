import { z } from 'zod';
import {
  DETERMINISTIC_POLICY_V1,
  DecisionResultSchema,
  DeterministicDecisionPolicySchema,
  evaluateDecision,
  type DecisionCandidate,
  type DecisionResult,
} from '@travel-blocks/decision-engine';
import {
  enrichCandidateFacts,
  type CandidateFactualEnrichmentSources,
} from '@travel-blocks/factual-enrichment';
import {
  BOUNDED_JUDGE_POLICY_V1,
  executeBoundedJudge,
  type BoundedJudgeObserver,
  type BoundedJudgePort,
} from '@travel-blocks/decision-judge';
import { TravelBlockCategorySchema } from '@travel-blocks/shared';

const IdentifierSchema = z.string().trim().min(1).max(120);
const TimestampSchema = z.string().datetime({ offset: true });
const MAX_CANDIDATES = 20;

export const DecisionApiRequestV1Schema = z.object({
  contractVersion: z.literal('decision_api_request_v1'),
  tripContext: z.object({
    tripContextId: IdentifierSchema,
    destination: z.object({ country: z.string().trim().min(1).max(80).optional(), city: z.string().trim().min(1).max(80).optional(), region: z.string().trim().min(1).max(80).optional() }).strict(),
    tripStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeZone: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  constraints: z.object({
    requestedCategories: z.array(TravelBlockCategorySchema).max(6),
    preferences: z.array(z.string().trim().min(1).max(120)).max(20),
    avoidances: z.array(z.string().trim().min(1).max(120)).max(20),
    selectionLimit: z.number().int().positive().max(MAX_CANDIDATES).optional(),
  }).strict(),
  candidates: z.array(z.object({
    candidateId: IdentifierSchema,
    providerReference: z.object({ sourceSystem: IdentifierSchema, sourceRecordId: IdentifierSchema }).strict(),
  }).strict()).min(1).max(MAX_CANDIDATES),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, candidate] of value.candidates.entries()) {
    if (ids.has(candidate.candidateId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates', index, 'candidateId'], message: 'Candidate IDs must be unique.' });
    ids.add(candidate.candidateId);
  }
});

export const DecisionApiErrorResponseV1Schema = z.object({
  contractVersion: z.literal('decision_api_error_v1'),
  error: z.object({ code: z.enum(['INVALID_DECISION_REQUEST', 'FACTUAL_DEPENDENCY_FAILURE', 'AI_DEPENDENCY_TIMEOUT', 'AI_DEPENDENCY_UNAVAILABLE', 'AI_INVALID_OUTPUT', 'DECISION_INVARIANT_FAILURE']), message: z.string().trim().min(1).max(200), retryable: z.boolean(), requestId: IdentifierSchema }).strict(),
}).strict();

const JudgeApiOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('applied') }).strict(),
  z.object({ outcome: z.literal('skipped'), reason: z.enum(['disabled', 'no_preference_signal', 'insufficient_candidates', 'no_eligible_candidates', 'no_eligible_provider']) }).strict(),
]);

export const DecisionApiResponseV1Schema = z.object({
  contractVersion: z.literal('decision_api_response_v1'),
  requestId: IdentifierSchema,
  decisionRequestId: IdentifierSchema,
  resultId: IdentifierSchema,
  policy: z.object({ id: IdentifierSchema, version: IdentifierSchema }).strict(),
  decisionResult: DecisionResultSchema,
  judge: JudgeApiOutcomeSchema,
  coverage: z.object({ status: z.enum(['complete', 'partial', 'unknown', 'unavailable']), evaluatedCandidates: z.number().int().nonnegative(), unresolvedCandidates: z.number().int().nonnegative() }).strict(),
  candidates: z.array(z.object({ candidateId: IdentifierSchema, displayName: z.string().trim().min(1).max(200), category: TravelBlockCategorySchema }).strict()).min(1).max(MAX_CANDIDATES),
}).strict().superRefine((value, context) => {
  if (value.decisionResult.requestId !== value.decisionRequestId || value.decisionResult.resultId !== value.resultId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionResult'], message: 'Response identity must match the DecisionResult.' });
  if (value.coverage.status !== value.decisionResult.coverage.status || value.coverage.evaluatedCandidates !== value.decisionResult.coverage.evaluatedCandidates || value.coverage.unresolvedCandidates !== value.decisionResult.coverage.unresolvedCandidates) context.addIssue({ code: z.ZodIssueCode.custom, path: ['coverage'], message: 'Response coverage must match the DecisionResult.' });
});

export type DecisionApiRequestV1 = z.infer<typeof DecisionApiRequestV1Schema>;
export type DecisionApiResponseV1 = z.infer<typeof DecisionApiResponseV1Schema>;
export type DecisionApiErrorResponseV1 = z.infer<typeof DecisionApiErrorResponseV1Schema>;

export class DecisionApplicationError extends Error {
  constructor(public readonly code: z.infer<typeof DecisionApiErrorResponseV1Schema>['error']['code'], public readonly retryable: boolean, cause?: unknown) {
    super(code, { cause }); this.name = 'DecisionApplicationError';
  }
}

export interface DecisionResolvedCandidate {
  readonly provider: string;
  readonly providerPlaceId: string;
  readonly displayName: string;
  readonly formattedAddress?: string;
  readonly category: z.infer<typeof TravelBlockCategorySchema>;
}
export interface DecisionCandidateResolver { resolve(reference: { sourceSystem: string; sourceRecordId: string }): Promise<DecisionResolvedCandidate | null>; }
export interface DecisionApiObserverEvent { readonly requestId: string; readonly contractVersion: 'decision_api_request_v1'; readonly candidateCount: number; readonly policy: { readonly id: string; readonly version: string }; readonly judgeOutcome: 'applied' | 'skipped' | 'failed'; readonly judgeSkipReason?: string; readonly selected: number; readonly rejected: number; readonly unresolved: number; }
export interface DecisionApiObserver { record(event: DecisionApiObserverEvent): void | Promise<void>; }

export interface DecisionApplicationServiceOptions {
  readonly candidateResolver: DecisionCandidateResolver;
  readonly factualSources: CandidateFactualEnrichmentSources;
  readonly judgePort: BoundedJudgePort;
  readonly judgeEnabled: boolean;
  readonly judgeProviderEligible: boolean;
  readonly createId: () => string;
  readonly now: () => Date;
  readonly observer?: DecisionApiObserver;
  readonly onObserverError?: (error: unknown) => void;
}

function safeObserve(observer: DecisionApiObserver | undefined, event: DecisionApiObserverEvent, onError: ((error: unknown) => void) | undefined): void {
  void Promise.resolve().then(() => observer?.record(event)).catch((error) => onError?.(error));
}
function mapBounded<T, R>(items: readonly T[], operation: (item: T) => Promise<R>, concurrency = 4): Promise<R[]> {
  const values = new Array<R>(items.length); let next = 0;
  const worker = async () => { for (;;) { const index = next++; if (index >= items.length) return; values[index] = await operation(items[index]); } };
  return Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)).then(() => values);
}

export class DecisionApplicationServiceV1 {
  constructor(private readonly options: DecisionApplicationServiceOptions) {}

  async evaluate(requestInput: unknown, requestId: string): Promise<DecisionApiResponseV1> {
    const input = DecisionApiRequestV1Schema.parse(requestInput);
    const timestamp = this.options.now().toISOString();
    const decisionRequestId = this.options.createId();
    const resultId = this.options.createId();
    const selectionLimit = input.constraints.selectionLimit ?? DETERMINISTIC_POLICY_V1.selectionLimit;
    const policy = DeterministicDecisionPolicySchema.parse({ ...DETERMINISTIC_POLICY_V1, selectionLimit });
    let resolved: DecisionResolvedCandidate[];
    try {
      const references = [...new Map(input.candidates.map((candidate) => [`${candidate.providerReference.sourceSystem}\u0000${candidate.providerReference.sourceRecordId}`, candidate.providerReference] as const)).entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
      const values = await mapBounded(references, async ([key, reference]) => {
        const value = await this.options.candidateResolver.resolve(reference);
        if (!value || value.provider !== reference.sourceSystem || value.providerPlaceId !== reference.sourceRecordId) throw new DecisionApplicationError('FACTUAL_DEPENDENCY_FAILURE', false);
        return [key, value] as const;
      });
      const byReference = new Map(values);
      resolved = input.candidates.map((candidate) => byReference.get(`${candidate.providerReference.sourceSystem}\u0000${candidate.providerReference.sourceRecordId}`)!);
    } catch (error) {
      if (error instanceof DecisionApplicationError) throw error;
      throw new DecisionApplicationError('FACTUAL_DEPENDENCY_FAILURE', true, error);
    }
    const candidates: DecisionCandidate[] = input.candidates.map((candidate, index) => ({
      candidateId: candidate.candidateId,
      place: { reference: candidate.providerReference, displayName: resolved[index].displayName, category: resolved[index].category, ...(resolved[index].formattedAddress ? { formattedAddress: resolved[index].formattedAddress } : {}) },
      factSnapshotId: `fact-${decisionRequestId}-${candidate.candidateId}`,
      discoveredAt: timestamp,
      provenance: { sourceSystem: resolved[index].provider, sourceRecordId: resolved[index].providerPlaceId, sourceKind: 'factual_provider', retrievedAt: timestamp },
    }));
    let enrichment;
    try {
      enrichment = await enrichCandidateFacts({
        contractVersion: 'candidate_factual_enrichment_request_v1', requestId: decisionRequestId, candidates, existingFacts: [],
        context: { retrievedAt: timestamp, provenance: { sourceSystem: 'decision-api', sourceRecordId: decisionRequestId, sourceKind: 'verified_user_input', retrievedAt: timestamp } },
      }, this.options.factualSources);
    } catch (error) { throw new DecisionApplicationError('FACTUAL_DEPENDENCY_FAILURE', true, error); }
    const decisionRequest = {
      contractVersion: 'decision_request_v1' as const, requestId: decisionRequestId, tripContext: input.tripContext,
      constraints: { requestedCategories: input.constraints.requestedCategories, preferences: input.constraints.preferences, avoidances: input.constraints.avoidances, maximumCandidates: MAX_CANDIDATES },
      policy: { id: policy.id, version: policy.version }, candidates, facts: enrichment.snapshots,
      trace: { traceId: requestId, source: 'product_application' as const },
    };
    const deterministic = evaluateDecision(decisionRequest, policy, { resultId, evaluatedAt: timestamp });
    const judgePolicy = { ...BOUNDED_JUDGE_POLICY_V1, enabled: this.options.judgeEnabled };
    let execution;
    try {
      execution = await executeBoundedJudge({ decisionRequest, deterministicResult: deterministic, deterministicPolicy: policy, judgePolicy, judgeRequestId: this.options.createId(), providerEligible: this.options.judgeProviderEligible, port: this.options.judgePort });
    } catch (error) {
      if (error instanceof z.ZodError) throw new DecisionApplicationError('AI_INVALID_OUTPUT', false, error);
      const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'unknown';
      if (code === 'timeout') throw new DecisionApplicationError('AI_DEPENDENCY_TIMEOUT', true, error);
      if (['network', 'unavailable', 'rate_limit', 'auth', 'bad_request'].includes(code)) throw new DecisionApplicationError('AI_DEPENDENCY_UNAVAILABLE', code !== 'auth' && code !== 'bad_request', error);
      throw new DecisionApplicationError('DECISION_INVARIANT_FAILURE', false, error);
    }
    const result = DecisionResultSchema.parse(execution.decisionResult);
    const counts = result.decisions.reduce((total, item) => ({ ...total, [item.status]: total[item.status] + 1 }), { selected: 0, rejected: 0, unresolved: 0 });
    const judge = execution.outcome === 'applied' ? { outcome: 'applied' as const } : { outcome: 'skipped' as const, reason: execution.eligibility.reason };
    const response = DecisionApiResponseV1Schema.parse({
      contractVersion: 'decision_api_response_v1', requestId, decisionRequestId, resultId, policy: result.policy, decisionResult: result, judge, coverage: result.coverage,
      candidates: candidates.map((candidate) => ({ candidateId: candidate.candidateId, displayName: candidate.place.displayName, category: candidate.place.category })),
    });
    safeObserve(this.options.observer, { requestId, contractVersion: input.contractVersion, candidateCount: candidates.length, policy: result.policy, judgeOutcome: execution.outcome, ...(execution.outcome === 'skipped' ? { judgeSkipReason: execution.eligibility.reason } : {}), ...counts }, this.options.onObserverError);
    return response;
  }
}

export function decisionApiError(requestId: string, code: z.infer<typeof DecisionApiErrorResponseV1Schema>['error']['code'], retryable: boolean): DecisionApiErrorResponseV1 {
  const messages = { INVALID_DECISION_REQUEST: '요청 형식이 올바르지 않습니다.', FACTUAL_DEPENDENCY_FAILURE: '현재 후보 사실을 확인할 수 없습니다.', AI_DEPENDENCY_TIMEOUT: 'AI 판단 시간이 초과되었습니다.', AI_DEPENDENCY_UNAVAILABLE: '현재 AI 판단을 사용할 수 없습니다.', AI_INVALID_OUTPUT: 'AI가 유효한 순위 형식을 반환하지 않았습니다.', DECISION_INVARIANT_FAILURE: '결정 결과를 안전하게 구성하지 못했습니다.' } as const;
  return DecisionApiErrorResponseV1Schema.parse({ contractVersion: 'decision_api_error_v1', error: { code, message: messages[code], retryable, requestId } });
}
