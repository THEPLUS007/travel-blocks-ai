import { z } from 'zod';
import type { CandidateFactSnapshot, DecisionCandidate, DecisionItem, DecisionRequest, DecisionResult } from './contracts.js';
import { DecisionEvaluationContextSchema, DeterministicDecisionPolicySchema, type DecisionEvaluationContext, type DeterministicDecisionPolicy } from './policy.js';
import { validateDecisionRequest, validateDecisionResult } from './validation.js';

export interface DecisionScoreComponent {
  id: 'category_match';
  score: number;
  weight: number;
}

export interface CandidateScore {
  candidateId: string;
  finalScore: number;
  components: readonly DecisionScoreComponent[];
}

interface EligibleCandidate {
  candidate: DecisionCandidate;
  fact: CandidateFactSnapshot;
  score: CandidateScore;
}

type UnresolvedReasonCode = 'missing_required_facts' | 'fact_unavailable' | 'fact_untrusted';

function validationError(path: (string | number)[], message: string): never {
  throw new z.ZodError([{ code: z.ZodIssueCode.custom, path, message }]);
}

function compareCandidateIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function policyReference(policy: DeterministicDecisionPolicy) {
  return { referenceType: 'policy' as const, referenceId: policy.id };
}

function factReference(fact: CandidateFactSnapshot) {
  return { factSnapshotId: fact.factSnapshotId, referenceType: 'fact' as const, referenceId: fact.factSnapshotId };
}

function requiredFactReason(fact: CandidateFactSnapshot, policy: DeterministicDecisionPolicy): UnresolvedReasonCode | undefined {
  if (!policy.requiredFacts.includes('business_status')) return undefined;
  if (fact.availability === 'unavailable') return 'fact_unavailable';
  if (fact.availability === 'invalid' || fact.availability === 'untrusted') return 'fact_untrusted';
  if (fact.availability === 'unknown') return 'missing_required_facts';
  if (fact.businessStatus.state === 'known') return undefined;
  if (fact.businessStatus.state === 'unavailable') return 'fact_unavailable';
  if (fact.businessStatus.state === 'invalid' || fact.businessStatus.state === 'untrusted') return 'fact_untrusted';
  return 'missing_required_facts';
}

/**
 * A temporary or future-opening status is not a permanent-closure rejection,
 * but this V1 policy has no reopening date/window from which to establish
 * operational availability.  Preserve that insufficiency rather than ranking it.
 */
function hasIndeterminateOperationalStatus(fact: CandidateFactSnapshot, policy: DeterministicDecisionPolicy): boolean {
  return policy.requiredFacts.includes('business_status')
    && fact.businessStatus.state === 'known'
    && (fact.businessStatus.value === 'temporarily_closed' || fact.businessStatus.value === 'future_opening');
}

function violatesHardRule(fact: CandidateFactSnapshot, policy: DeterministicDecisionPolicy): boolean {
  return policy.hardRules.some((rule) => rule.id === 'permanently_closed')
    && fact.businessStatus.state === 'known'
    && fact.businessStatus.value === 'permanently_closed';
}

/** Scores an eligible candidate on a 0..1000 integer scale. */
export function scoreCandidate(candidate: DecisionCandidate, request: DecisionRequest, policy: DeterministicDecisionPolicy): CandidateScore {
  const categoryMatchScore = request.constraints.requestedCategories.length === 0
    ? policy.categoryMatchScores.noRequestedCategories
    : request.constraints.requestedCategories.includes(candidate.place.category)
      ? policy.categoryMatchScores.matchingCategory
      : policy.categoryMatchScores.nonMatchingCategory;
  const dimension = policy.scoringDimensions.find((item) => item.id === 'category_match');
  if (!dimension) validationError(['scoringDimensions'], 'The category_match scoring dimension is required by this engine.');
  const finalScore = Math.round((categoryMatchScore * dimension.weight) / 1000);
  return {
    candidateId: candidate.candidateId,
    finalScore,
    components: [{ id: 'category_match', score: categoryMatchScore, weight: dimension.weight }],
  };
}

/** Returns a copied, stable score-descending ranking; it never sorts caller-owned arrays. */
export function rankEligibleCandidates(candidates: readonly EligibleCandidate[]): EligibleCandidate[] {
  return [...candidates].sort((left, right) => right.score.finalScore - left.score.finalScore || compareCandidateIds(left.candidate.candidateId, right.candidate.candidateId));
}

/**
 * Pure deterministic P2-DE-2 decision composition.
 * The caller owns IDs and timestamps through the explicit evaluation context.
 */
export function evaluateDecision(requestInput: unknown, policyInput: unknown, contextInput: unknown): DecisionResult {
  const request = validateDecisionRequest(requestInput);
  const policy = DeterministicDecisionPolicySchema.parse(policyInput);
  const context = DecisionEvaluationContextSchema.parse(contextInput);
  if (request.policy.id !== policy.id || request.policy.version !== policy.version) {
    validationError(['policy'], 'Request policy identity must match the execution policy.');
  }

  const factsById = new Map(request.facts.map((fact) => [fact.factSnapshotId, fact]));
  const decisions: DecisionItem[] = [];
  const eligible: EligibleCandidate[] = [];

  for (const candidate of request.candidates) {
    const fact = factsById.get(candidate.factSnapshotId);
    if (!fact) validationError(['candidates', candidate.candidateId, 'factSnapshotId'], 'Candidate fact snapshot is missing after request validation.');
    const evidence = [factReference(fact), policyReference(policy)];
    const provenance = { traceId: request.trace.traceId, decisionSource: 'deterministic' as const, producedAt: context.evaluatedAt };

    if (violatesHardRule(fact, policy)) {
      decisions.push({ candidateId: candidate.candidateId, policy: { id: policy.id, version: policy.version }, status: 'rejected', reason: { category: 'deterministic_rule', code: 'hard_constraint' }, evidence, provenance });
      continue;
    }
    const unresolvedReason = requiredFactReason(fact, policy);
    if (unresolvedReason) {
      decisions.push({ candidateId: candidate.candidateId, policy: { id: policy.id, version: policy.version }, status: 'unresolved', reason: { category: 'insufficient_facts', code: unresolvedReason }, evidence, provenance });
      continue;
    }
    if (hasIndeterminateOperationalStatus(fact, policy)) {
      decisions.push({ candidateId: candidate.candidateId, policy: { id: policy.id, version: policy.version }, status: 'unresolved', reason: { category: 'insufficient_facts', code: 'missing_required_facts' }, evidence, provenance });
      continue;
    }
    eligible.push({ candidate, fact, score: scoreCandidate(candidate, request, policy) });
  }

  let selectedCount = 0;
  for (const item of rankEligibleCandidates(eligible)) {
    const evidence = [factReference(item.fact), policyReference(policy)];
    const provenance = { traceId: request.trace.traceId, decisionSource: 'deterministic' as const, producedAt: context.evaluatedAt };
    if (item.score.finalScore < policy.minimumSelectionScore) {
      decisions.push({ candidateId: item.candidate.candidateId, policy: { id: policy.id, version: policy.version }, status: 'rejected', reason: { category: 'selection_limit', code: 'selection_threshold' }, evidence, provenance });
    } else if (selectedCount < policy.selectionLimit) {
      selectedCount += 1;
      decisions.push({ candidateId: item.candidate.candidateId, policy: { id: policy.id, version: policy.version }, status: 'selected', reason: { category: 'deterministic_rule', code: 'candidate_selected' }, evidence, provenance });
    } else {
      decisions.push({ candidateId: item.candidate.candidateId, policy: { id: policy.id, version: policy.version }, status: 'rejected', reason: { category: 'selection_limit', code: 'selection_limit' }, evidence, provenance });
    }
  }

  const unresolvedCandidates = decisions.filter((item) => item.status === 'unresolved').length;
  const complete = unresolvedCandidates === 0;
  const result: DecisionResult = {
    contractVersion: 'decision_result_v1',
    resultId: context.resultId,
    requestId: request.requestId,
    policy: { id: policy.id, version: policy.version },
    createdAt: context.evaluatedAt,
    completeness: complete ? 'complete' : 'partial',
    coverage: { status: complete ? 'complete' : 'partial', evaluatedCandidates: request.candidates.length, unresolvedCandidates },
    decisions: [...decisions].sort((left, right) => compareCandidateIds(left.candidateId, right.candidateId)),
    provenance: { traceId: request.trace.traceId, decisionSource: 'deterministic', producedAt: context.evaluatedAt },
  };
  return validateDecisionResult(request, result);
}

export type { EligibleCandidate };
