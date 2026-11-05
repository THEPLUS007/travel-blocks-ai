# Proposal

## Why

[ROADMAP P2-DE-6](../../../docs/ROADMAP.md#p2-de-6--decision-snapshots-and-evaluation) calls for reproducible decision snapshots, evaluations and regression gates. Existing package/API/UI tests cover individual contracts, but there is no versioned replay dataset and aggregate decision-quality report.

## What Changes

This OPS-01 deliverable is a documentation-only initial proposal, design and future task list. It adopts no behavioral spec and implements no P2-DE-6 code. The metadata explicitly skips specs for this planning delivery; remove that marker and author reviewed behavior deltas before implementation.

Proposed future work:
- A synthetic, versioned replay envelope for normalized request/facts, complete deterministic policy and explicit evaluation context, with expected results.
- Offline decision evaluation and a separate fixture-only bounded-judge replay lane.
- Repeatability, candidate-accounting, unknown-state and judge-authority regression gates plus safe reports.

## Capabilities

### New Capabilities

None adopted in OPS-01. Future behavioral specs should cover the cohesive `decision-replay-evaluation` capability after review of this design.

### Modified Capabilities

None. `openspec list --specs` found no existing capability specs; existing engineering documents remain authoritative.

## Impact

Future implementation should reuse `packages/decision-engine`, `packages/decision-judge`, `packages/test-fixtures` and existing evaluation tooling. No new production persistence, API, schema, model routing, deployment or dependency is proposed here. Durable user-history storage is deferred until retention, owner isolation and query needs justify a separate reviewed change.

Governance: [AGENTS.md](../../../AGENTS.md), [INVARIANTS](../../../docs/INVARIANTS.md), [CURRENT_STATUS](../../../docs/CURRENT_STATUS.md), [ROADMAP](../../../docs/ROADMAP.md), [ARCHITECTURE](../../../docs/ARCHITECTURE.md), [ADR 0001](../../../docs/adr/0001-decision-engine-boundary.md), [EVALUATION](../../../docs/EVALUATION.md). These links define authority; this proposal does not copy their rules or revise phase status.
