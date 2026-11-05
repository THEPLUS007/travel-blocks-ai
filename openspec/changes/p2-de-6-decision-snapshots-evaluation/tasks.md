# Tasks

This planning delivery completes section 1 only. P2-DE-6 runtime/tooling implementation remains unstarted. Behavior: [spec](specs/decision-replay-evaluation/spec.md). Approach and coverage matrix: [design](design.md). A separate implementation request is required before section 2.

## 1. Review and behavioral contract

- [x] 1.1 Review the offline scope against ROADMAP P2-DE-6, ADR 0001 and actual engine/judge/fixture tests; record the synthetic-only snapshot boundary, deferred durable history, score/result separation and controlled negative-case design in design.md.
- [x] 1.2 Remove skip_specs, author decision-replay-evaluation behavior deltas, reconcile proposal/design/tasks and verify strict OpenSpec validation plus requirement-to-scenario coverage; document design readiness without claiming implementation completion.

## 2. Replay envelope and fixtures

- [ ] 2.1 Add strict dataset/snapshot/report contracts using existing request/result/policy/context validators, safe outcome categories and enumerated faults; verify JSON round trip, policy overrides, unknown versions/fields, invalid expected references, duplicate IDs and privacy rejection tests; document contracts and synthetic-review limitations in EVALUATION.md.
- [ ] 2.2 Curate the design's complete manifest/coverage matrix in packages/test-fixtures with a decision-only data entry point, fixed context and independent goldens/scores; verify synthetic provenance, exercised assertions for each required group and no live-adapter dependency; document expected-data review/version procedure alongside fixtures.

## 3. Offline runner and regression gates

- [ ] 3.1 Implement deterministic replay, score/accounting/purity checks and safe gate/reporting with existing engine owners; verify repeated/reversed inputs, threshold/tie/unknown precedence, schema-valid wrong golden, corrupt/empty dataset, missing coverage, safe diagnostics and deterministic human/JSON summaries through unit/process tests; document FAIL/INSUFFICIENT_EVIDENCE precedence and denominators.
- [ ] 3.2 Implement isolated fake-port judge replay using existing eligibility/validation/reconciliation; verify all five skip reasons/precedence, policy bounding, valid permutation, every malformed-output/started-failure category, expected port counts, failure identity and preserved facts/scores/protected decisions; document that this is reconciliation evidence rather than live AI certification.
- [ ] 3.3 Add root npm run eval:decision with tested --json forwarding and Quality CI gate after offline isolation is proven; verify exit codes for passing/wrong-golden/missing-coverage inputs, parseable safe JSON and zero network/DB/credential use; document commands and limitations without weakening existing gates.

## 4. Integration evidence and delivery

- [ ] 4.1 Run npm run verify (lint/typecheck, tests and package/app builds), npm run eval, npm run eval:decision and its JSON mode, npm audit --omit=dev and relevant CI Quality/E2E/PostgreSQL; record exact results and an inspected HEAD, with no completion claim before required evidence exists.
- [ ] 4.2 Update CURRENT_STATUS.md, EVALUATION.md and relevant architecture documentation against delivered evidence; update ROADMAP only for evidenced phase status, verify git diff --check and scope inventory, then land a focused feat(eval) commit under AGENTS.md.

## Workflow follow-up

- Review the implementation evidence before archive or main-spec sync; planning completeness is not P2-DE-6 functionality.
