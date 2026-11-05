# Design

## Context

Motivation and governing references are in [proposal.md](proposal.md). This is an initial design for review, with no runtime integration.

Inspected implementation: `packages/decision-engine/src/{contracts,policy,engine,validation}.ts`, `packages/decision-judge/src/contracts.ts`, `apps/api/src/decisions.ts`; nearby tests are `packages/decision-engine/test/{contracts,engine}.test.ts`, `apps/api/test/decisions.test.ts` and `apps/api/test/evaluation.test.ts`. Existing engine input/output and policy/context schemas already provide replay primitives. The API injects IDs/time and orchestrates enrichment/judge execution; it does not persist decisions. The existing itinerary evaluator is a separate baseline, not a decision replay evaluator.

## Goals / Non-Goals

Goals: make decision behavior reproducible offline and make regressions fail with actionable safe diagnostics. Reuse contract validators and engine/judge rules rather than recreate selection logic in an evaluator.

Non-goals: user-facing decision history, runtime capture, database persistence, API/UI changes, actual route-time validation, new AI eligibility, live model benchmarks and P3 deployment. Snapshots in this design mean synthetic evaluation artifacts, not saved user history.

## Decisions

1. **Versioned fixture envelope.** Propose a strict replay schema containing dataset/scenario version, DecisionRequest V1 (including canonical candidates and normalized facts), the complete DeterministicDecisionPolicy, explicit DecisionEvaluationContext and expected DecisionResult. Record the implementation revision in run metadata. Policy ID/version alone cannot reproduce overrides such as selectionLimit. Keep the envelope separate from TravelBlock, public DTOs and repository storage. Reusing only API responses was rejected because they omit inputs needed for replay.

2. **Synthetic data only.** Curate fixture identities and minimal normalized facts with `curated_fixture` provenance. Do not export production request strings, free-text preferences, labels, prompts or provider payloads. The existing normalized schemas can carry user text, so schema validity alone does not establish privacy. Dataset review must verify synthetic origin and excluded fields. Runtime capture would require a separate retention/access design.

3. **Two explicit replay lanes.** Deterministic lane calls evaluateDecision with frozen inputs and supplied policy/context and compares the entire canonical result. Judge lane supplies a fixed, schema-validated full ranking permutation via a fake port and reuses strict validation/reconciliation; it never recalls an LLM. Preserve request IDs, judge request IDs, policies and allowlist needed by that lane. Exclude optional free explanation strings; use enumerable safe reason signals. Judge replay proves reconciliation, not live model quality.

4. **Acceptance matrix.** Include permanent closure alongside missing facts (hard rule precedence); each unknown/unavailable/invalid/untrusted required-fact state; temporary/future opening; category match and neutral scores; threshold/selection limits; stable ties and permuted input order; duplicate/dangling references; all selected/rejected/unresolved; judge skip, valid permutation, malformed permutation and started failure. Invalid input and judge failure cases expect typed failure rather than a manufactured successful result. Keep unsupported hours/price/routes distinguishable from evaluated feasibility.

5. **Deterministic gates.** Require 100% valid positive fixture schemas, exact expected-result matches, total/exclusive candidate accounting, fixed-input repeatability and judge preservation checks. Require every negative fixture to fail in its expected category. Report denominators, coverage, scenario failures and dataset version; zero scenarios means insufficient evidence and nonzero exit. Run each fixed-input scenario twice; compare candidate outcomes for order permutations while retaining the engine's canonical ordering. A deliberately wrong expected result must make the runner fail. Changes to goldens require reviewed rationale and policy/dataset version consideration, never automatic regeneration to green.

6. **Tooling location and performance.** Put fixtures in the existing test-fixtures package and a dedicated decision runner alongside API evaluation tooling; keep engine pure and use existing validators. Add a separate explicit npm command during later implementation, then integrate it into Quality CI after offline isolation is proven. Keep `npm run eval` itinerary metrics separate. Timing can be measured by the outer runner as informational evidence with environment/sample count; wall time is excluded from deterministic equality and is not an invented production latency gate.

## Risks / Trade-offs

- Fixture fidelity → publish coverage and limits; this is not a live provider or model-quality certification.
- Policy/contract drift → strict version rejection and full policy snapshots; reviewed migrations or new dataset versions.
- Privacy leakage through valid string fields → synthetic-only review and negative privacy fixtures; no production export path.
- Golden files hiding regressions → independent invariants, deliberately bad expected-output test and explicit review rationale.
- `skip_specs` can make CLI planning appear complete → it applies only to OPS-01 documentation delivery. Remove it and review behavior scenarios before any implementation. All future tasks remain unchecked.

## Migration Plan

OPS-01 changes tooling/docs only, so no application rollout or data migration applies. Future replay tooling should be additive and offline; rollback would remove its command/CI step without altering runtime data. Persistence would be a separate migration-bearing proposal, not an implicit continuation.
