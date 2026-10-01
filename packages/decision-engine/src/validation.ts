import { z } from 'zod';
import { DecisionRequestSchema, DecisionResultSchema, type DecisionItem, type DecisionRequest, type DecisionResult, type RejectedDecisionItem, type SelectedDecisionItem, type UnresolvedDecisionItem } from './contracts.js';

function semanticError(issues: z.ZodIssue[]): never {
  throw new z.ZodError(issues);
}

function issue(path: (string | number)[], message: string): z.ZodIssue {
  return { code: z.ZodIssueCode.custom, path, message };
}

export function validateDecisionRequest(input: unknown): DecisionRequest {
  return DecisionRequestSchema.parse(input);
}

export function validateDecisionResult(requestInput: unknown, resultInput: unknown): DecisionResult {
  const request = validateDecisionRequest(requestInput);
  const result = DecisionResultSchema.parse(resultInput);
  const issues: z.ZodIssue[] = [];
  if (result.requestId !== request.requestId) issues.push(issue(['requestId'], 'Result request ID must match the request.'));
  if (result.policy.id !== request.policy.id || result.policy.version !== request.policy.version) issues.push(issue(['policy'], 'Result policy must match the request policy.'));

  const requestCandidateIds = new Set(request.candidates.map((candidate) => candidate.candidateId));
  const decisionIds = new Set<string>();
  let unresolved = 0;
  for (const [index, decision] of result.decisions.entries()) {
    if (decisionIds.has(decision.candidateId)) issues.push(issue(['decisions', index, 'candidateId'], 'Each candidate must appear exactly once in a result.'));
    decisionIds.add(decision.candidateId);
    if (!requestCandidateIds.has(decision.candidateId)) issues.push(issue(['decisions', index, 'candidateId'], 'Decision must reference a request candidate.'));
    if (decision.policy.id !== request.policy.id || decision.policy.version !== request.policy.version) issues.push(issue(['decisions', index, 'policy'], 'Decision policy must match the request policy.'));
    if (decision.status === 'unresolved') unresolved += 1;
  }
  for (const candidate of request.candidates) {
    if (!decisionIds.has(candidate.candidateId)) issues.push(issue(['decisions'], `Candidate ${candidate.candidateId} is missing from the result.`));
  }
  if (result.coverage.evaluatedCandidates !== request.candidates.length) issues.push(issue(['coverage', 'evaluatedCandidates'], 'Coverage must account for every request candidate.'));
  if (result.coverage.unresolvedCandidates !== unresolved) issues.push(issue(['coverage', 'unresolvedCandidates'], 'Coverage unresolved count must match unresolved decisions.'));
  if ((result.completeness === 'complete' && (unresolved > 0 || result.coverage.status !== 'complete')) || (result.completeness !== 'complete' && result.coverage.status === 'complete' && unresolved > 0)) {
    issues.push(issue(['completeness'], 'An unresolved or incomplete coverage result cannot be marked complete.'));
  }
  if (issues.length > 0) semanticError(issues);
  return result;
}

export function partitionDecisionItems(decisions: readonly DecisionItem[]): { selected: SelectedDecisionItem[]; rejected: RejectedDecisionItem[]; unresolved: UnresolvedDecisionItem[] } {
  return {
    selected: decisions.filter((decision): decision is SelectedDecisionItem => decision.status === 'selected'),
    rejected: decisions.filter((decision): decision is RejectedDecisionItem => decision.status === 'rejected'),
    unresolved: decisions.filter((decision): decision is UnresolvedDecisionItem => decision.status === 'unresolved'),
  };
}
