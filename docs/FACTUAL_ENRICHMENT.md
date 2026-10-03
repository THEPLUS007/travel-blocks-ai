# Candidate Factual Enrichment

## Boundary

`@travel-blocks/factual-enrichment` is the I/O-capable factual boundary before `@travel-blocks/decision-engine`:

```text
candidate + existing snapshot + explicit enrichment context + injected ports
  → factual retrieval and normalization
  → CandidateFactSnapshot[]
  → future DecisionRequest construction
  → pure Decision Engine
```

It does not decide feasibility, score candidates, select/reject candidates, call AI, create TravelBlocks, or connect to the production API/runtime.

## Contracts and ports

`CandidateFactualEnrichmentRequestV1` contains a request ID, P2-DE-1 candidates, optional existing snapshots, and explicit context (`retrievedAt`, factual provenance, optional route origin/mode/request ID). Its result has a snapshot for every input candidate and validates total accounting, candidate/fact identity, canonical candidate-ID ordering, and coverage.

Injected ports are `CandidatePlaceFactSource`, `CandidateOpeningHoursFactSource`, and `CandidateRouteFactSource`. `createOpeningHoursFactSource` adapts the existing P1 `PlaceOpeningHoursProvider` structurally using the candidate's provider record ID. Concrete providers own credentials, transport, timeouts, and retry; the enrichment orchestrator has neither retry nor fallback.

## Fact semantics

- Place: coordinates, business status, timezone.
- Opening hours: P1-normalized current and regular schedules, date coverage, overnight/24-hour periods, quality flags, status, timezone, provenance, and retrieval time.
- Route: duration/distance/mode only when explicit route context and known destination coordinates exist.
- Price: no exact amount/currency provider exists, so no amount is invented and the fact remains unknown unless supplied by an existing snapshot.

`known` means normalized source data is valid. `unknown` means a successful lookup did not supply that field. `unavailable` means no compatible source/context could acquire it. `invalid` means normalized source data failed schema/shape validation. `untrusted` records equal-timestamp conflict between distinct known values. Provider transport/protocol failures are not fact states: they propagate unchanged.

## Merge and determinism

Known never yields to unknown. A newer known value wins; same timestamp plus differing known values becomes untrusted. Snapshot-level provenance/retrieval time uses the latest accepted source contributor; P2-DE-1 has no per-field provenance, so multi-source field provenance is a documented contract limitation. Results are sorted by candidate ID. Calls are deduplicated by provider reference and processed with an injected per-source concurrency bound (default 4); no global semaphore, clock, random ID, retry, or fallback is used.

## Contract gaps and deferred facts

DecisionRequest V1 still has no visit window, budget/currency maximum, route threshold, matching route transport constraint, or structured category exclusion. Enrichment does not invent any of them. It also does not activate opening-hours, budget, or route Decision Engine rules. There is no actual route provider or exact price source today; P2-FE-1 only defines their provider-neutral acquisition ports and tests them with fakes.

## P2-DE-3 handoff

P2-DE-3 consumes only the normalized `CandidateFactSnapshot` values after deterministic evaluation. `@travel-blocks/decision-judge` does not enrich, reinterpret, mutate, or overwrite factual values or factual provenance; unavailable, invalid, untrusted, and unresolved required facts remain outside its bounded allowlist. This is package-only work: enrichment and the judge are not connected to the production API/runtime yet.
