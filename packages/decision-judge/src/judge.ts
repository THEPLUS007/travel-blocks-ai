import { z } from 'zod';
import { scoreCandidate, validateDecisionRequest, validateDecisionResult, type CandidateFactSnapshot, type DecisionItem, type DecisionRequest, type DecisionResult, type DeterministicDecisionPolicy } from '@travel-blocks/decision-engine';
import { BoundedJudgePolicyV1Schema, BoundedJudgeRequestV1Schema, BoundedJudgeResultV1Schema, type BoundedJudgeEligibility, type BoundedJudgeOutcome, type BoundedJudgePolicyV1, type BoundedJudgeRequestV1, type BoundedJudgeResultV1 } from './contracts.js';

export interface BoundedJudgePort {
  rank(request: BoundedJudgeRequestV1): Promise<unknown>;
}

export interface BoundedJudgeObserverEvent {
  readonly judgeRequestId: string;
  readonly decisionRequestId: string;
  readonly policyVersion: string;
  readonly candidateCount: number;
  readonly outcome: 'applied' | 'skipped' | 'failed';
  readonly skipReason?: string;
}

export interface BoundedJudgeObserver { record(event: BoundedJudgeObserverEvent): void | Promise<void>; }

export interface BoundedJudgeBuildInput {
  readonly decisionRequest: unknown;
  readonly deterministicResult: unknown;
  readonly deterministicPolicy: DeterministicDecisionPolicy;
  readonly judgePolicy: BoundedJudgePolicyV1;
  readonly judgeRequestId: string;
  readonly providerEligible: boolean;
}

function compareId(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isJudgeEligibleDecision(item: DecisionItem): boolean {
  return item.status === 'selected' || (item.status === 'rejected' && item.reason.category === 'selection_limit' && item.reason.code === 'selection_limit');
}
function safeKnownFacts(fact: CandidateFactSnapshot) {
  return { ...(fact.businessStatus.state === 'known' ? { businessStatus: fact.businessStatus.value } : {}) };
}
function observerFailureSafe(observer: BoundedJudgeObserver | undefined, event: BoundedJudgeObserverEvent, onObserverError: ((error: unknown) => void) | undefined): void {
  void Promise.resolve().then(() => observer?.record(event)).catch((error) => onObserverError?.(error));
}

/** Pure, canonical bounded-set eligibility and request construction. */
export function buildBoundedJudgeRequest(input: BoundedJudgeBuildInput): { readonly eligibility: BoundedJudgeEligibility; readonly request?: BoundedJudgeRequestV1 } {
  const request = validateDecisionRequest(input.decisionRequest);
  const result = validateDecisionResult(request, input.deterministicResult);
  const deterministicPolicy = input.deterministicPolicy;
  const judgePolicy = BoundedJudgePolicyV1Schema.parse(input.judgePolicy);
  if (request.policy.id !== deterministicPolicy.id || request.policy.version !== deterministicPolicy.version) throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['deterministicPolicy'], message: 'Deterministic policy must match the decision request.' }]);
  const candidateById = new Map(request.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const factById = new Map(request.facts.map((fact) => [fact.factSnapshotId, fact]));
  const eligible = result.decisions.filter(isJudgeEligibleDecision).map((decision) => {
    const candidate = candidateById.get(decision.candidateId)!;
    const fact = factById.get(candidate.factSnapshotId)!;
    return { candidate, fact, score: scoreCandidate(candidate, request, deterministicPolicy).finalScore };
  }).sort((left, right) => right.score - left.score || compareId(left.candidate.candidateId, right.candidate.candidateId));
  const bounded = eligible.slice(0, judgePolicy.maximumCandidates);
  const candidateIds = bounded.map((item) => item.candidate.candidateId);
  const excludedCandidateIds = request.candidates.map((candidate) => candidate.candidateId).filter((id) => !candidateIds.includes(id)).sort(compareId);
  const skip = (reason: Exclude<BoundedJudgeEligibility['reason'], 'eligible'>): { readonly eligibility: BoundedJudgeEligibility } => ({ eligibility: { eligible: false, reason, candidateIds, excludedCandidateIds } });
  if (!judgePolicy.enabled) return skip('disabled');
  if (request.constraints.preferences.length === 0) return skip('no_preference_signal');
  if (eligible.length === 0) return skip('no_eligible_candidates');
  if (bounded.length < judgePolicy.minimumCandidates) return skip('insufficient_candidates');
  if (!input.providerEligible) return skip('no_eligible_provider');
  const judgeRequest = BoundedJudgeRequestV1Schema.parse({
    contractVersion: 'bounded_judge_request_v1', judgeRequestId: input.judgeRequestId,
    decisionRequestId: request.requestId, deterministicPolicy: request.policy,
    judgePolicy: { id: judgePolicy.id, version: judgePolicy.version },
    preferenceSignals: [...request.constraints.preferences], requestedCategories: [...request.constraints.requestedCategories],
    selectionLimit: deterministicPolicy.selectionLimit,
    candidates: bounded.map(({ candidate, fact, score }) => ({
      candidateId: candidate.candidateId, category: candidate.place.category, displayLabel: candidate.place.displayName,
      deterministicScore: score, factCoverage: fact.availability, knownFacts: safeKnownFacts(fact),
      evidenceReferences: [{ referenceType: 'fact', referenceId: fact.factSnapshotId }, { referenceType: 'policy', referenceId: deterministicPolicy.id }],
    })), candidateCount: bounded.length,
  });
  return { eligibility: { eligible: true, reason: 'eligible', candidateIds, excludedCandidateIds }, request: judgeRequest };
}

export function validateBoundedJudgeResult(requestInput: unknown, resultInput: unknown): BoundedJudgeResultV1 {
  const request = BoundedJudgeRequestV1Schema.parse(requestInput);
  const result = BoundedJudgeResultV1Schema.parse(resultInput);
  const issues: z.ZodIssue[] = [];
  if (result.judgeRequestId !== request.judgeRequestId) issues.push({ code: z.ZodIssueCode.custom, path: ['judgeRequestId'], message: 'Judge result must match its request.' });
  const allowed = new Set(request.candidates.map((candidate) => candidate.candidateId));
  const returned = new Set(result.rankings.map((ranking) => ranking.candidateId));
  if (result.rankings.length !== request.candidates.length) issues.push({ code: z.ZodIssueCode.custom, path: ['rankings'], message: 'Judge result must rank every allowed candidate exactly once.' });
  for (const [index, ranking] of result.rankings.entries()) if (!allowed.has(ranking.candidateId)) issues.push({ code: z.ZodIssueCode.custom, path: ['rankings', index, 'candidateId'], message: 'Judge result candidate must be in the allowlist.' });
  for (const candidate of request.candidates) if (!returned.has(candidate.candidateId)) issues.push({ code: z.ZodIssueCode.custom, path: ['rankings'], message: `Judge result is missing candidate ${candidate.candidateId}.` });
  if (issues.length) throw new z.ZodError(issues);
  return result;
}

/** Pure reconciliation: only the precomputed allowlist can change status/order authority. */
export function reconcileBoundedJudgeResult(decisionRequestInput: unknown, deterministicResultInput: unknown, judgeRequestInput: unknown, judgeResultInput: unknown, deterministicPolicy: DeterministicDecisionPolicy): DecisionResult {
  const request = validateDecisionRequest(decisionRequestInput);
  const base = validateDecisionResult(request, deterministicResultInput);
  const judgeRequest = BoundedJudgeRequestV1Schema.parse(judgeRequestInput);
  const judgeResult = validateBoundedJudgeResult(judgeRequest, judgeResultInput);
  if (judgeRequest.decisionRequestId !== request.requestId || judgeRequest.deterministicPolicy.id !== request.policy.id || judgeRequest.deterministicPolicy.version !== request.policy.version) throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['judgeRequest'], message: 'Judge request does not belong to this decision request.' }]);
  const allowed = new Set(judgeRequest.candidates.map((candidate) => candidate.candidateId));
  const baseById = new Map(base.decisions.map((decision) => [decision.candidateId, decision]));
  for (const id of allowed) if (!isJudgeEligibleDecision(baseById.get(id)!)) throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['judgeRequest', 'candidates'], message: 'Judge allowlist contains a protected decision.' }]);
  const order = new Map(judgeResult.rankings.map((ranking) => [ranking.candidateId, ranking.rank]));
  const decisions = base.decisions.map((item) => {
    if (!allowed.has(item.candidateId)) return item;
    const selected = order.get(item.candidateId)! <= deterministicPolicy.selectionLimit;
    return {
      ...item,
      status: selected ? 'selected' as const : 'rejected' as const,
      reason: selected ? { category: 'ai_assisted' as const, code: 'ai_assisted_selection' as const } : { category: 'ai_assisted' as const, code: 'ai_assisted_not_selected' as const },
      evidence: [...item.evidence, { referenceType: 'judge_signal' as const, referenceId: judgeRequest.judgeRequestId }],
      provenance: { ...item.provenance, decisionSource: 'ai_assisted' as const },
    };
  }).sort((left, right) => compareId(left.candidateId, right.candidateId));
  const protectedBefore = base.decisions.filter((item) => !allowed.has(item.candidateId));
  const protectedAfter = decisions.filter((item) => !allowed.has(item.candidateId));
  if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) throw new Error('Protected deterministic decisions changed during reconciliation.');
  const output = { ...base, decisions, provenance: { ...base.provenance, decisionSource: 'ai_assisted' as const } };
  return validateDecisionResult(request, output);
}

export interface ExecuteBoundedJudgeOptions extends BoundedJudgeBuildInput {
  readonly port: BoundedJudgePort;
  readonly observer?: BoundedJudgeObserver;
  readonly onObserverError?: (error: unknown) => void;
}

/** Calls the injected port once only after a pure eligibility skip decision. */
export async function executeBoundedJudge(options: ExecuteBoundedJudgeOptions): Promise<BoundedJudgeOutcome & { readonly decisionResult: DecisionResult }> {
  const built = buildBoundedJudgeRequest(options);
  if (!built.eligibility.eligible || !built.request) {
    const base = validateDecisionResult(options.decisionRequest, options.deterministicResult);
    observerFailureSafe(options.observer, { judgeRequestId: options.judgeRequestId, decisionRequestId: base.requestId, policyVersion: options.judgePolicy.version, candidateCount: built.eligibility.candidateIds.length, outcome: 'skipped', skipReason: built.eligibility.reason }, options.onObserverError);
    return { outcome: 'skipped', eligibility: built.eligibility, decisionResult: base };
  }
  try {
    const raw = await options.port.rank(built.request);
    const result = validateBoundedJudgeResult(built.request, raw);
    const decisionResult = reconcileBoundedJudgeResult(options.decisionRequest, options.deterministicResult, built.request, result, options.deterministicPolicy);
    observerFailureSafe(options.observer, { judgeRequestId: built.request.judgeRequestId, decisionRequestId: built.request.decisionRequestId, policyVersion: built.request.judgePolicy.version, candidateCount: built.request.candidateCount, outcome: 'applied' }, options.onObserverError);
    return { outcome: 'applied', eligibility: built.eligibility, request: built.request, result, decisionResult };
  } catch (error) {
    observerFailureSafe(options.observer, { judgeRequestId: options.judgeRequestId, decisionRequestId: validateDecisionRequest(options.decisionRequest).requestId, policyVersion: options.judgePolicy.version, candidateCount: built.eligibility.candidateIds.length, outcome: 'failed' }, options.onObserverError);
    throw error;
  }
}
