# Proposal

## Why

[ROADMAP P2-DE-6](../../../docs/ROADMAP.md#p2-de-6--decision-snapshots-and-evaluation) requires reproducible decision snapshots, evaluations and regression gates. Existing engine, judge and API tests verify individual behavior, but there is no versioned decision replay dataset or aggregate regression report.

## What Changes

Define the `decision-replay-evaluation` behavior contract and reconcile the OPS-01 draft with current source/tests. This delivery writes planning documents only; the runner, replay schemas, fixture dataset and CI integration remain unimplemented.

The planned implementation will add:

- Synthetic offline snapshots containing complete normalized inputs, full policy values, fixed evaluation context and independently reviewed expected outcomes.
- Separate deterministic and fake-port bounded-judge replay lanes, including expected failure cases.
- Strict dataset validation, repeatability/partition/score/judge preservation checks, minimum coverage gates and safe human/JSON reports.
- An additive `npm run eval:decision` command and Quality CI gate, separate from the existing itinerary evaluation.

## Capabilities

### New Capabilities

- `decision-replay-evaluation`: reproducible synthetic decision replay and offline regression evidence. Requirements and testable scenarios are in [the delta specification](specs/decision-replay-evaluation/spec.md).

### Modified Capabilities

None. The baseline OpenSpec capability inventory is empty. Existing engineering documents retain authority; this delta introduces no replacement governance.

## Impact

Implementation is planned in existing decision-engine/decision-judge, test-fixtures and API evaluation tooling boundaries, using current validators and no new external library. Full policies are necessary because IDs alone omit overrides. DecisionResult V1 has no scores; score assertions remain replay-only metadata.

Production runtime capture, user decision history, persistence/DB migrations, public API/UI changes, model/prompt/routing changes, live providers, route-time claims and P3 service/deployment work are excluded. Snapshots are curated test artifacts, not saved Trip/TravelBlock state. No runtime/CI command is added by this planning delivery.

Governance: [AGENTS.md](../../../AGENTS.md), [INVARIANTS](../../../docs/INVARIANTS.md), [CURRENT_STATUS](../../../docs/CURRENT_STATUS.md), [ROADMAP](../../../docs/ROADMAP.md), [ARCHITECTURE](../../../docs/ARCHITECTURE.md), [ADR 0001](../../../docs/adr/0001-decision-engine-boundary.md), [EVALUATION](../../../docs/EVALUATION.md). See [design.md](design.md) for source evidence and [tasks.md](tasks.md) for delivery gates.
