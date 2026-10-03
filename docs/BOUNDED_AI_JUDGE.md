# Bounded AI Judge

P2-DE-3 adds `@travel-blocks/decision-judge`, an optional package between factual enrichment/deterministic evaluation and final DecisionResult reconciliation:

```text
enriched facts → deterministic DecisionResult → bounded allowlist → judge ordering
                                                    ↓
                                      strict validation → deterministic reconciliation
```

The judge is not a fact provider and is not the final decision authority. It receives only a bounded set of deterministic survivors, stable IDs, normalized category/preference signals, deterministic scores, fact coverage, minimal known business status, and safe evidence references. It cannot create candidates, change facts/provenance/scores, select outside the allowlist, or replace a hard rejection or unresolved result.

## Contract and policy

`BoundedJudgeRequestV1`, `BoundedJudgeResultV1`, and `BoundedJudgePolicyV1` are strict Zod contracts. The immutable default policy is `bounded-ai-preference-ordering`/`v1`: enabled, minimum two candidates, maximum five candidates. Candidate bounding is canonical: deterministic score descending, then candidate ID ascending.

The result ranks every allowlisted ID exactly once with contiguous ranks `1..N`. Unknown, duplicate, missing, extra IDs, non-contiguous ranks, non-finite/out-of-range confidence, and fields such as `chainOfThought` or `reasoning` are rejected. A short bounded explanation is optional, but it is never copied into a DecisionResult or used as authority.

## Eligibility, skips, and failures

Only existing deterministic `selected` candidates and `selection_limit` rejections are judge-eligible. Permanently closed candidates, all hard rejections, unresolved candidates, threshold rejections, and candidates with unavailable/invalid/untrusted required facts are outside the set. `BoundedJudgeEligibility` records a typed pre-execution skip: `disabled`, `no_preference_signal`, `insufficient_candidates`, `no_eligible_candidates`, or `no_eligible_provider`.

A skip returns the deterministic result unchanged and is not a failure. Once a port call starts, provider errors and malformed results propagate unchanged; the judge layer has no retry, fallback, failover, partial-result application, or silent deterministic fallback. The existing provider adapter remains the sole owner of transport retry.

## Reconciliation and observability

Reconciliation is a pure function. It snapshots all non-allowlisted decisions, applies only the validated ordering up to the deterministic selection limit, preserves fact/evidence/provenance values, and re-validates the full DecisionResult. `ai_assisted_selection` and `ai_assisted_not_selected` are enumerable safe reason codes; hard decisions remain deterministic.

The optional judge observer records only request ID, decision request ID, policy version, bounded candidate count, and `applied`/`skipped`/`failed`. It never receives prompt text, provider response, candidate payload, user text, headers, tokens, or chain-of-thought. Observer failures cannot change a result or provider error.

## AI boundary and production status

The existing `rank_places` logical task/capability is still Gemini-only. Its current shared input/output contract is intentionally not reused as an execution contract because it returns a partial selection (up to five entries with free reasons), not a strict complete permutation. `packages/ai` therefore exposes a composition-only `rank_places`/`place_ranking` adapter seam and a data-boundary prompt builder; it changes neither router table nor production runtime. A P2-DE-4 composition root may inject a compatible adapter after its structured output is explicitly versioned.

P2-DE-4 supplies that explicitly versioned operation: `rankBoundedPlaces(BoundedJudgeRequestV1)` uses the existing `rank_places` capability and Router execution/provenance path, but has a distinct strict full-ranking V1 structured-output schema. Legacy partial ranking remains unchanged. The Decision API server setting defaults to disabled; enabled execution remains Gemini-only and runs at most once per eligible request.

Tests use fakes only. No Gemini, Places, Routes, self-hosted, Groq, NVIDIA, OpenRouter, database, API, Docker, or deployment call is made. P2-DE-4 owns API integration, P2-DE-5 considered/rejected UI, and P2-DE-6 snapshots/evaluation.
