# Tasks

Future P2-DE-6 work only. OPS-01 implements none of these tasks. See [design.md](design.md); the documentation-only skip marker is not permission to apply.

## 1. Review and behavioral contract

- [ ] 1.1 Review the proposed offline scope against ROADMAP P2-DE-6 and ADR 0001; record the accepted scope and confirm durable history remains deferred.
- [ ] 1.2 Remove `skip_specs` and author decision-replay-evaluation behavior deltas with replay, privacy, failure and insufficient-evidence scenarios; verify strict OpenSpec validation and review before implementing.

## 2. Replay envelope and fixtures

- [ ] 2.1 Add the versioned strict replay envelope reusing existing request/result/policy/context validators; verify valid round-trip, unknown version, extra fields and mismatched-reference tests; document envelope ownership in EVALUATION.md.
- [ ] 2.2 Curate the design acceptance matrix in packages/test-fixtures with full policy overrides and fixed context; verify synthetic provenance, coverage manifest and no raw payload/user data, with reviewed expected outcomes.

## 3. Offline runner and regression gates

- [ ] 3.1 Implement deterministic replay and aggregate reporting using existing engine validators; verify exact output, repeatability, canonical ordering, accounting, known-bad golden failure and empty-dataset nonzero exit; document the command and report semantics.
- [ ] 3.2 Add fake-port bounded-judge replay using existing judge validation/reconciliation; verify valid permutations, skips, malformed output, started errors and unchanged hard rejection/unresolved/facts/scores; document that replay does not certify live AI quality.
- [ ] 3.3 Add a separate npm evaluation command and Quality CI step after proving offline operation; verify successful and intentionally failing process exit codes without product-provider or DB access; document any informational timing and its limits.

## 4. Integration evidence and delivery

- [ ] 4.1 Run npm run verify, npm run typecheck, npm run build, npm run eval and the new decision evaluation command; record exact results and relevant CI evidence, with no phase completion claim before required gates pass.
- [ ] 4.2 Review docs/CURRENT_STATUS.md and related evaluation/architecture documentation against implemented evidence; update ROADMAP only for evidenced phase changes; verify git diff --check and scope inventory before a focused feat(eval) commit under AGENTS.md.

## Workflow follow-up

- Review implementation evidence before archive; planning completeness does not mean P2-DE-6 is complete.
