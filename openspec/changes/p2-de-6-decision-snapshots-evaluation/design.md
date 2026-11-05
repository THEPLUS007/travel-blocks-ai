# Design

## Context

See [proposal.md](proposal.md) for motivation/scope and [the behavior delta](specs/decision-replay-evaluation/spec.md) for acceptance criteria. This revision defines the offline implementation design; no replay code or production integration exists in this delivery. Reviewed baseline: `e07bb397dfc3ef6810233c53ae4108e251ab006d` (main after OPS-01).

Inspected source and evidence:

| Existing boundary | Observed behavior and implication |
|---|---|
| `packages/decision-engine/src/contracts.ts`, `policy.ts`, `validation.ts` | Strict request/fact/result and full policy/context contracts; semantic total/exclusive result validation can be reused. Policy identity alone omits overrides. |
| `packages/decision-engine/src/engine.ts` and `test/engine.test.ts` | `evaluateDecision` is pure and canonical by candidate ID. `scoreCandidate` returns score components separately; DecisionResult V1 contains no scores. Hard closure precedes insufficiency, which precedes scoring. |
| `packages/decision-judge/src/{contracts,policy,judge}.ts`, `test/judge.test.ts` | Full policy includes enabled/min/max, default 2–5; request construction derives the allowlist; execute performs zero calls for skips or one call for applied/failed judgment. Started failures propagate unchanged. |
| `apps/api/src/decisions.ts`, `apps/api/test/decisions.test.ts` | Product application injects IDs/time and resolves/enriches before engine/judge; existing safe API payload is insufficient to replay those internal inputs. No decision persistence exists. |
| `packages/test-fixtures/src/evaluation/`, `apps/api/test/evaluation-runner.ts`, `docs/EVALUATION.md` | Existing itinerary evaluation is offline and separate. Root fixtures also export TestAiProvider/TestPlaceProvider, so decision-only tooling should avoid coupling its data entry point to those helpers. |
| `package.json`, `apps/api/package.json`, `.github/workflows/ci.yml` | Existing npm/tsx/Vitest and Quality gate can host additive offline evaluation without a new external library. |

Governance remains as linked by the proposal. ADR 0001 permits deciding snapshot persistence from actual needs; reproducible testing requires fixture artifacts, not runtime/user-history storage. No invariant change is proposed. Existing architecture docs contain historical P2-stage descriptions; they are not grounds to weaken current source/test contracts.

## Goals / Non-Goals

Goals: replay complete explicit inputs offline, distinguish expected application failures from corrupt datasets, and fail a repeatable gate when outcomes or mandatory coverage regress.

Non-goals: runtime capture, durable user history, Trip/TravelBlock storage, public API/UI/schema changes, live fact retrieval or LLM calls, scoring/rule/model/prompt/routing changes, production timing SLAs, P3 service extraction and deployment. These remain separate reviewed changes. The scope follows the proposed offline first slice; user review of these artifacts precedes implementation.

## Decisions

### 1. Separate dataset, snapshot and report versions

Use strict additive tooling contracts with versions `decision_replay_dataset_v1`, `decision_replay_snapshot_v1` and `decision_replay_report_v1`. Dataset identity/version are explicit and consistent; scenario IDs are unique and stable. Do not extend any public DecisionRequest/DecisionResult schema.

A dataset carries version, synthetic-origin declaration, reviewed coverage manifest and scenarios. A scenario snapshot carries scenario ID, dataset version, lane, a valid normalized DecisionRequest V1, full DeterministicDecisionPolicy, fixed DecisionEvaluationContext and declarative expected outcome. Successful baselines carry the expected full deterministic result and separate expected scores for eligible candidates. Judge cases additionally carry the full BoundedJudgePolicy V1, fixed judgeRequestId, synthetic providerEligible flag and expected allowlist/skip outcome/call count. Applied cases include a fixed validated signal and expected full final result. No implicit current clock, random ID, default policy lookup or factual refresh is part of replay.

Reject malformed artifacts before execution, including invalid expected-result references and unknown version/fields. Preserve array semantics and compare JSON-compatible structures by deep equality independent of object key insertion order. Full results include all reason/evidence/provenance fields and fixed IDs/time. Compare score output via `scoreCandidate` against independent fixture expectations; never fabricate score fields on DecisionResult. Policy overrides such as selectionLimit and custom category scores must survive JSON round trips.

Alternative rejected: snapshotting only API responses or policy IDs cannot reproduce hidden input/policy values. Saving production requests was rejected for privacy and because no user-history query requirement exists.

### 2. Negative executions use valid baselines plus controlled faults

Avoid an unrestricted unknown/raw payload field in fixtures. Load and validate a successful synthetic baseline first. An enumerated test fault creates an intentionally invalid execution input on a fresh clone or supplies a controlled fake-port response/error. Expected-failure cases specify one failure category and expected fake-port count; their execution result is absent, not a successful fallback.

| Controlled failure class | Replay category | Port calls |
|---|---|---|
| Duplicate candidate ID, dangling fact reference, request/policy mismatch, invalid context | `decision_input_invalid` | 0 |
| Missing/duplicate/outside judge ID, rank gap, mismatched judge request identity | `judge_output_invalid` | 1 |
| Fake port throws a fixture timeout object | `judge_timeout` | 1 |
| Fake port throws a fixture dependency-failure object | `judge_dependency_failure` | 1 |

Use existing validators to detect contract failures; distinguish by controlled execution stage, never matching exception text. For injected port failures, assert object identity and count to verify no retry/fallback. Unknown exceptions are `unexpected_failure` and fail the gate. Dataset/schema/privacy errors remain artifact failures even if a case expects an error. Meta-tests intentionally corrupt versions, fields, expected outcomes and accounting to prove the loader/gate rejects them; they are not normal passing negative execution fixtures.

These are evaluation categories, not new public API error codes. Fixtures do not store Error objects, stack traces or provider strings; the harness maps enumerated faults to safe synthetic instances. No general user-controlled transformation or evaluation expression is accepted.

### 3. Replay through existing owners

The deterministic lane validates and freezes inputs, runs evaluateDecision twice, validates each result, compares against expected output, and checks input immutability. A third replay reverses candidates/facts to prove input-order invariance. Independently validate candidate accounting/coverage and fixture-defined scores without copying engine rules.

The judge lane recomputes the deterministic result, calls existing build/execute/validate/reconcile boundaries through an injected fake port and repeats with the same signal and reversed input arrays. Each execution is isolated: a skipped case calls the fake port zero times; an applied or started-failure case calls once. Assert the derived allowlist equals the expected IDs before accepting a signal. Preserve hard/threshold/unresolved/outside-allowlist decisions exactly. Facts, policy and score expectations remain unchanged. Allowed items may change selected/rejected status, safe reason, appended judge evidence and AI-assisted provenance only, as the current judge contract permits.

The baseline policy's minimum/maximum are 2/5. Full stored judge-policy values control replay; there is no new production eligibility toggle. Skip fixtures separately exercise disabled, no_preference_signal, no_eligible_candidates, insufficient_candidates and no_eligible_provider, plus skip precedence. Invalid judge output is supplied only by a controlled negative fake port; positive signals exclude optional explanation strings.

Alternative rejected: invoking the LLM would turn reconciliation regression into a nondeterministic paid benchmark. Reimplementing rules in the evaluator would create a second decision engine.

### 4. Synthetic data and dependency location

Keep curated JSON-compatible data under `packages/test-fixtures/src/decision-evaluation/` with a decision-only export entry point. Put replay-specific schemas, runner/gate functions and their unit/process tests alongside existing API evaluation tooling, with no production composition import. Data definitions should not construct live adapters or depend on API implementation. Reuse existing workspace contracts and installed Zod/tsx/Vitest; any needed local workspace import/export must preserve the package dependency direction. No new external npm package is needed.

Require `trace.source: fixture`, `curated_fixture` factual provenance and synthetic-only declared origin in replay artifacts. Schema rejection can block extra raw fields/non-fixture provenance, but cannot establish the real-world origin of arbitrary valid strings. Curated labels/preferences and origin declarations therefore require review in Git. No runtime export command or ingestion path exists. Privacy meta-tests use harmless sentinel strings and assert that neither reports nor captured stdout/stderr include them, raw thrown messages, stacks, payloads or credentials.

### 5. Mandatory coverage with exercised assertions

The initial replay manifest must require each replay behavior group below; parameterized members count independently where listed. Coverage is earned only by executing and passing that group's defined assertions, not by a fixture's self-declared tag. Multiple groups can share a scenario, so there is no arbitrary minimum scenario count that can replace coverage.

| Required behavior group | Mandatory evidence |
|---|---|
| Hard rejection/precedence | Known permanent closure with otherwise high score; closure plus unavailable aggregate coverage |
| Required facts | Each unknown/unavailable/invalid/untrusted state at both enclosing availability and business-status field level; exact safe reason and partial result |
| Operational uncertainty | Separate temporary closure and future opening |
| Score behavior | Match, non-match, no requested category; custom stored category-score override |
| Selection policy | Below/equal threshold, selection-limit overflow, tied score with candidate-ID order |
| Replay integrity | Repeated and reversed-input runs; frozen-input immutability; total/exclusive partition and completeness |
| Judge skips | Each of the five current reasons; deterministic skip precedence |
| Judge authority | Valid full permutation, policy-bounded allowlist overflow, protected hard/threshold/unresolved/outside decisions and score/fact preservation |
| Negative execution | Each enumerated input mutation, malformed judge permutation/identity, started timeout and dependency failure; expected call counts |
| Safe diagnostics | Controlled failure fixtures with harmless sentinel text exercise safe categorized reports without input/exception-value disclosure |
| Declared limitations | Optional hours/price/route coverage is not claimed as an active V1 constraint; no live judge or service-readiness certification |

Harness correctness is a separate mandatory test-suite gate, outside the replay manifest denominator: evaluator/process tests must reject wrong goldens/error categories, missing/duplicate decisions, malformed/unknown-version/extra-field artifacts, duplicate scenario IDs, empty data, missing coverage and privacy sentinel disclosure. These meta-tests do not label an intentionally failed dataset run as a passing replay scenario or require normal replay to rerun its own test suite. Goldens are authored independently, reviewed with change rationale and dataset-version impact; the normal runner never rewrites them.

### 6. Safe gate, reports and command behavior

Add root `npm run eval:decision` with human summary by default and `--json` for one clean JSON report; verify root-to-workspace argument forwarding. The same runner/gate generates both forms. CI calls it after existing itinerary evaluation, leaving verify, audit, E2E and PostgreSQL gates intact.

The report includes contract/dataset versions, supplied implementation revision or literal unknown, sorted scenario IDs, lane counts, separate success/expected-failure denominators, per-scenario safe check outcomes, required/covered/missing group IDs and evaluated-versus-unimplemented limitations. Do not dump expected/actual input/results or arbitrary labels. Do not count a negative execution as a schema-valid successful result or include it in successful-candidate metrics.

Gate precedence: any assertion/artifact/unexpected error yields FAIL; otherwise empty dataset or missing mandatory coverage yields INSUFFICIENT_EVIDENCE; otherwise all mandatory checks passing at 100% yields PASS. Only PASS exits zero. Repeated reports with the same revision and inputs have identical content/order. Optional wall-time/environment observations are separate informational metadata, excluded from deterministic equality and gating. No production p95 target is inferred from these offline runs. Implement and test safe top-level errors, including loader failures, so JSON failure mode emits a safe report instead of a stack.

## Risks / Trade-offs

- Synthetic coverage is limited → expose manifest/limitations; never claim live provider/model quality or P3 readiness.
- Valid text fields can still contain private data → manual origin review and no runtime import/export; shape validation alone is insufficient.
- Baseline/schema drift → reject unsupported versions, keep full policies, require reviewed expected-data changes.
- Test data can bless a regression → retain independent invariants and deliberately wrong-golden/negative-category process tests.
- Offline code could accidentally load live adapters → narrow decision data entry point and tests blocking network/DB/credential access.
- Existing narrow coverage does not certify unused feasibility features → keep hours/price/routes marked unimplemented as policy rules.

## Migration Plan

This delivery changes planning/status documents only; no application rollout or migration applies. After separate implementation authorization, land replay contracts/fixtures, then engine/judge runner tests, then root command/CI gate with evidence. Additive evaluation tooling can be rolled back by reverting its command/CI integration without modifying runtime data. Durable history requires a separate retention/owner-isolation/migration design.
