# Decision replay evaluation delta

## Purpose

Provide reproducible offline regression evidence for decision behavior using synthetic snapshots and controlled judge signals, without capturing user history or changing production execution. This is a proposed capability, not evidence of an implemented evaluator.

Scope and authority: [proposal](../../proposal.md), [design](../../design.md), [INVARIANTS](../../../../../docs/INVARIANTS.md), [ROADMAP P2-DE-6](../../../../../docs/ROADMAP.md#p2-de-6--decision-snapshots-and-evaluation). Shared engineering rules remain in those authoritative documents.

## ADDED Requirements

### Requirement: Explicit versioned replay inputs
The evaluator SHALL accept only supported, strictly validated snapshot and dataset versions. Each snapshot SHALL include stable scenario identity, normalized request/facts, all deterministic policy values, fixed result ID/time and reviewed expected outcomes. Replay SHALL reject extra fields, missing required data and inconsistent identities rather than infer defaults.

#### Scenario: Complete snapshot round trip
- **WHEN** a supported synthetic snapshot is serialized, loaded and validated
- **THEN** all normalized inputs, policy overrides, fixed IDs/time and expected outcomes are preserved without refreshing facts or generating identifiers.

#### Scenario: Unsupported or malformed artifact
- **WHEN** a dataset or snapshot has an unsupported version, unexpected field, missing context, duplicate scenario ID or inconsistent dataset identity
- **THEN** the evaluation fails artifact validation with a safe category and nonzero exit; it does not count the artifact as a passing expected-error case.

#### Scenario: Complete policy overrides
- **WHEN** a valid snapshot overrides the selection limit, threshold or category scores while retaining the same policy identity
- **THEN** replay uses those complete stored values and compares against the independently specified expected outcome, without substituting current defaults.

### Requirement: Synthetic artifact and diagnostic boundary
Replay artifacts SHALL contain curated synthetic values only, with fixture provenance for candidates/facts and an explicit dataset-level synthetic-origin declaration. Runtime exports, raw provider/model payloads, prompts, chain-of-thought, credentials and real user text SHALL be excluded. Diagnostics SHALL use only scenario/check identifiers and safe categories, never input values or exception messages.

#### Scenario: Declared synthetic values
- **WHEN** synthetic labels and preference strings are used to exercise a judge case
- **THEN** they remain fixture data with curated provenance and are excluded from human/JSON diagnostics; their presence does not imply permission to export runtime text.

#### Scenario: Unsafe artifact or text
- **WHEN** an artifact includes forbidden raw-payload fields or non-fixture provenance, or an injected failure contains sensitive text
- **THEN** the artifact is rejected or the failure is categorized as appropriate without including that text in reports, logs or stack traces.

### Requirement: Offline execution and runtime isolation
The decision evaluation command SHALL complete using checked-in fixtures and injected fake ports, without network, database, production credentials or live provider adapters. It SHALL remain separate from production request paths, persistence and the existing itinerary evaluator. A synthetic snapshot SHALL NOT be presented as saved itinerary history or a live model-quality certification.

#### Scenario: External dependencies unavailable
- **WHEN** replay runs with external access blocked and no database/provider credentials
- **THEN** all valid replay scenarios can execute and reports are produced without initiating an external call.

#### Scenario: Independent evaluation entry points
- **WHEN** decision replay is introduced
- **THEN** the existing itinerary evaluation retains its original scenarios and outcomes, and production API/UI/persistence/routing behavior is unchanged.

### Requirement: Repeated canonical deterministic replay
For each positive deterministic case, the evaluator SHALL execute the same explicit inputs at least twice, preserve inputs, validate each full result and compare it exactly with the expected result. Object-key serialization order SHALL NOT affect equality; array order, reason/evidence/provenance fields, IDs and timestamps SHALL remain significant.

#### Scenario: Fixed-input repeatability
- **WHEN** one snapshot is replayed twice with the same fixed context
- **THEN** both full results equal the expected result and the original request, facts, policy and context remain unchanged.

#### Scenario: Candidate and fact order permutations
- **WHEN** the same candidates and facts are supplied in reversed input-array order with all other inputs fixed
- **THEN** the resulting decisions retain canonical candidate-ID order and the entire result equals the original replay.

#### Scenario: Schema-valid incorrect expected outcome
- **WHEN** an expected result has a valid shape but an intentionally incorrect status, reason or fixed timestamp
- **THEN** the run fails exact-result comparison and exits nonzero rather than regenerating expected data.

### Requirement: Complete candidate accounting and explicit unknown states
Every successful result SHALL account for each input candidate exactly once across selected, rejected and unresolved states, with matching IDs, policy, evidence, coverage and completeness. Replay SHALL independently verify this accounting and SHALL preserve the engine's required-fact precedence and safe reason categories.

#### Scenario: Permanent closure takes priority
- **WHEN** a candidate has known permanent closure alongside unavailable enclosing fact coverage
- **THEN** the candidate is rejected by the hard constraint before required-fact insufficiency; replay confirms it is neither selected nor silently dropped.

#### Scenario: Required facts are insufficient
- **WHEN** required business-status data or enclosing availability is unknown, unavailable, invalid or untrusted and no hard rejection applies
- **THEN** the candidate remains unresolved with the corresponding missing-required-facts, unavailable or untrusted reason and partial coverage/completeness.

#### Scenario: Temporary closure and future opening
- **WHEN** otherwise valid candidates have known temporarily-closed or future-opening business status under the existing V1 policy
- **THEN** they remain unresolved for missing required operational information, without becoming permanently rejected or eligible for selection.

#### Scenario: Missing or duplicate decision
- **WHEN** a result omits an input candidate, repeats one or refers to an unknown candidate
- **THEN** the semantic-accounting check fails even if individual decision objects have valid shapes.

### Requirement: Deterministic score and selection expectations
Replay SHALL verify fixture-defined category-score expectations for eligible candidates separately from the final decision result, without adding score fields to public contracts. Fixtures SHALL cover category match/non-match/neutral scoring, explicit threshold boundaries, selection limits and candidate-ID tie breaks using existing policy semantics.

#### Scenario: Category scores and neutral preference
- **WHEN** default-policy eligible candidates respectively match, do not match, or have no requested categories
- **THEN** replay verifies the corresponding integer score expectations and the resulting selection decisions independently.

#### Scenario: Threshold equality and selection limit
- **WHEN** candidates have scores below and equal to an explicit threshold and eligible candidates exceed the selection limit
- **THEN** below-threshold candidates are rejected for threshold, equal-threshold candidates remain eligible, and overflow is rejected for selection limit with stable tie order.

#### Scenario: Fact has no implemented rule
- **WHEN** optional opening-hours, price or route facts are absent under the existing V1 policy
- **THEN** the run does not claim those constraints were evaluated or invent route time, and it distinguishes that limitation from required business-status coverage.

### Requirement: Reproducible bounded judge inputs and skips
The judge lane SHALL replay full stored judge policy, fixed judge-request identity, synthetic eligibility and controlled signal/failure using the existing deterministic survivor boundary. It SHALL verify the derived allowlist and outcome. Every skipped case SHALL call the fake judge zero times and retain the deterministic result unchanged.

#### Scenario: Disabled or ineligible judge
- **WHEN** a fixture exercises disabled, no preference signal, no eligible candidates, insufficient candidates or provider-ineligible status
- **THEN** replay observes the matching typed skip reason, zero fake-port calls and the unchanged deterministic result, including skip precedence when multiple conditions apply.

#### Scenario: Policy-bounded allowlist
- **WHEN** eligible survivors exceed the configured judge bound
- **THEN** the allowlist is derived by deterministic score and candidate-ID order, and hard-rejected/unresolved candidates are excluded; only the allowlist can be ranked.

### Requirement: Valid judge reconciliation preserves authority
For an applied judge case, replay SHALL supply one fixed complete allowlist permutation, verify exactly one fake-port call and compare the final result with a reviewed expectation. It SHALL independently preserve facts/provenance, deterministic scores, hard/threshold rejections, unresolved decisions, decisions outside the allowlist and total candidate accounting.

#### Scenario: Valid preference permutation
- **WHEN** a fixed valid ranking reverses eligible preferences within the bounded allowlist
- **THEN** only permitted candidate status/reason/judge-evidence and AI-assisted provenance changes occur, selection stays within the limit, and outside decisions and original inputs remain unchanged.

#### Scenario: Repeated judge replay
- **WHEN** the same judge snapshot is replayed twice and once with reversed candidate/fact input order
- **THEN** each replay derives the same allowlist, calls its fake port once and produces the same full final result and score expectations.

### Requirement: Negative cases remain distinguishable from corrupt fixtures
Expected-failure cases SHALL start from a valid synthetic baseline and use a bounded, enumerated fault or mutation with an explicit expected failure category and call count. Passing a negative case SHALL require the specified failure; an unexpected failure, successful output or wrong call count SHALL fail the run. Malformed dataset/envelope errors SHALL never be excused by a negative-case declaration.

#### Scenario: Invalid deterministic input
- **WHEN** a controlled fault introduces duplicate candidate IDs, a dangling fact reference, policy identity mismatch or invalid evaluation context
- **THEN** replay verifies the expected validation failure before any judge call and reports no successful decision result for that execution.

#### Scenario: Invalid judge permutation
- **WHEN** an eligible fixture's fake judge returns missing, duplicate or outside-allowlist candidates, noncontiguous ranks or a mismatched judge-request ID
- **THEN** the failure category is judge-invalid-output after exactly one call, and no partial result, retry or fallback is counted as success.

#### Scenario: Started judge failure
- **WHEN** a fake judge throws a known fixture timeout or dependency failure
- **THEN** the same injected failure reaches the replay boundary after one call, original inputs/base result remain unchanged, and diagnostics expose only the expected category.

#### Scenario: Wrong error expectation
- **WHEN** a negative fixture succeeds or throws a different error category than expected
- **THEN** the scenario and aggregate run fail, even if other fixtures pass.

### Requirement: Required behavior coverage and independent baselines
A versioned coverage manifest SHALL declare required behavior groups. A passing dataset SHALL exercise hard rejection/precedence, each required-fact state, temporary/future opening, scores/threshold/limits/ties, ordering/purity/partition, all judge skips, valid bounded reconciliation, negative input/output/failure and safe diagnostics. Expected outcomes SHALL be reviewed data; replay SHALL NOT overwrite them to make a run pass.

#### Scenario: Missing coverage or no scenarios
- **WHEN** the dataset is empty or a required group has no matching validated and successful case
- **THEN** the report outcome is INSUFFICIENT_EVIDENCE unless a failing check already requires FAIL, identifies missing group IDs and exits nonzero.

#### Scenario: Self-declared coverage without evidence
- **WHEN** a scenario is merely tagged with a coverage group without executing and passing that group's defined assertions
- **THEN** the group is not counted as covered and cannot satisfy the passing gate.

#### Scenario: Expected-data change
- **WHEN** an expected result, policy fixture or coverage requirement changes
- **THEN** the change includes reviewed rationale and dataset-version impact in the diff; normal replay never writes replacement goldens or lowers thresholds.

### Requirement: Safe reproducible reports and exit codes
The command SHALL provide a human summary and a machine-readable report with explicit report/dataset versions, supplied implementation revision (or unknown), lane/scenario/check denominators, safe per-scenario failures and coverage limitations. PASS SHALL require all mandatory checks to pass at 100% with full required coverage. FAIL and INSUFFICIENT_EVIDENCE SHALL exit nonzero. Report order SHALL be stable; timing SHALL NOT affect the gate.

#### Scenario: Passing and failing commands
- **WHEN** the root decision-evaluation command runs against a complete passing dataset, then against an intentionally failing valid dataset
- **THEN** the first exits zero with PASS and the second exits nonzero with FAIL, and JSON output parses as one report without human log contamination.

#### Scenario: Error-case denominators
- **WHEN** a dataset includes expected-error cases
- **THEN** the report separates expected-error passes from successful-result/schema counts, excludes nonexistent negative-case results from candidate metrics and does not imply every execution produced a valid decision.

#### Scenario: Revision and reproducibility
- **WHEN** fixed inputs and an explicit implementation revision are replayed again
- **THEN** deterministic reports have the same order and contents; absent revision is reported as unknown, and any optional duration/environment observations remain separate informational data.

### Requirement: CI gate and honest scope claims
Quality CI SHALL run decision replay in addition to existing checks, without credentials or weakened audit thresholds. Completion evidence SHALL distinguish offline decision regression, itinerary evaluation, live AI quality and service readiness. The capability SHALL NOT imply that P2-DE-6 code, production history storage or P3 service readiness is complete merely because these planning artifacts validate.

#### Scenario: CI catches a regression
- **WHEN** a schema-valid wrong expected result or a missing required coverage group reaches the CI decision gate
- **THEN** the job fails through the command's nonzero exit while existing verification, itinerary evaluation and audit requirements remain in place.

#### Scenario: Planning-only delivery
- **WHEN** this behavior specification passes OpenSpec validation before a runner exists
- **THEN** status documents report design/spec readiness only and leave implementation tasks unchecked; no implemented capability is synced into the baseline specs.
