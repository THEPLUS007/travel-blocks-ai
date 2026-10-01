# ADR 0001: Decision Engine Boundary

## Title

Decision Engine Boundary

## Status

Accepted

## Date

2026-10-01

## Context

P1 is complete. Today the Product Application (`apps/web` and `apps/api`) creates grounded travel plans using Google Places candidates, `TravelAiProvider`/`AiTaskRouter`, Gemini by default, deterministic itinerary validation, and PostgreSQL persistence. P1 also supplies provider-neutral opening-hours facts and deterministic geographic/opening-hours feasibility foundations, but those foundations are not on the production trip-generation path or public itinerary contract.

There is no official Candidate Set, candidate fact coverage, selected/rejected/unresolved contract, Decision Result, decision snapshot, safe decision reason code, or Decision Engine. Existing `TravelBlock` is a final itinerary item, not a record of every candidate considered. Existing `rank_places` is a current AI task, not the future Decision Engine contract.

P2 must make candidate decisions explainable and reproducible without treating an LLM as a source of real-world facts or prematurely adding a service boundary.

## Problem

Without an explicit boundary, selection rules can be duplicated across the API and UI, missing provider data can be silently treated as negative evidence, and an AI ranking response can appear to be a complete factual decision. A future service extraction would then have to untangle HTTP, database, provider, UI, and rule responsibilities at once.

## Decision

P2 starts the Decision Engine as a provider-neutral package/module planned at `packages/decision-engine`; it is not created in this ADR-only step. The Product Application remains the user-facing application and orchestration owner. It invokes the engine, supplies normalized inputs and injected ports, persists only when a later requirement warrants it, and delivers a versioned result to the UI.

The engine owns final candidate selection composition. It applies deterministic rules and scores before optionally consuming a bounded AI judgment signal. It returns a versioned safe Decision Result with selected, rejected, and unresolved candidates. The AI Judge does not own or return the Decision Result.

P2 does not add a separate service, Docker, a database schema, a public API, or runtime code. Production AI routing remains Gemini-only.

## Terminology

| Term | Meaning |
|---|---|
| Product Application | The user-facing travel application formed by `apps/web` and `apps/api`. It receives requests, authenticates, edits Trip/TravelBlock, orchestrates use cases, invokes the engine, persists approved product data, and returns UI data. |
| Decision Engine | Provider-neutral domain/application module that evaluates candidate places and composes selected, rejected, or unresolved results. P2 target: `packages/decision-engine`. |
| Bounded AI Judge | An optional AI capability that supplies a safe structured judgment only for preference, ambiguity, or ties left after deterministic evaluation. It is not the Decision Engine. |
| Factual Provider | A source of real-world facts, such as Google Places, opening-hours, future Routes, or future price/reservation providers. It never passes through the LLM Router. |
| Decision Service | The P3 separately deployable internal HTTP wrapper around the stabilized Decision Engine. It is not implemented in P2. |

## Current Architecture

The implemented P1 runtime is:

```text
Product Application
    ↓
AI Task Router
    ↓
Gemini
    ↓
Structured Trip
    ↓
Domain feasibility/evaluation
    ↓
Trip persistence
    ↓
Trust UI
```

Google Places is a separate factual provider boundary. The API retrieves and canonicalizes `VerifiedPlace` candidates before AI trip planning/ranking; the router selects an AI provider once and does not perform grounding or feasibility. The opening-hours and geographic feasibility modules are pure foundations using explicit facts/fixtures. PostgreSQL is accessed behind `TripRepository` and currently stores Trips, Days, TravelBlocks, and Connections.

## Target P2 Architecture

P2's planned in-monorepo structure is:

```text
apps/web
    ↓
apps/api — Product Application / orchestration
    ↓
packages/decision-engine
    ├── provider-neutral contracts
    ├── deterministic rules
    ├── scoring and selection
    ├── bounded judge port
    └── safe decision result
```

This is a target boundary, not a present package or runtime route.

## Runtime Pipeline

The target runtime pipeline, distinct from P2 delivery order, is:

```text
Travel Intent / Constraints
    ↓
Candidate Retrieval
    ↓
Factual Enrichment
    ↓
Deterministic Filtering
    ↓
Deterministic Scoring
    ↓
Optional Bounded AI Judgment
    ↓
Final Decision Composition
    ↓
Versioned Decision Result
    ├── selected
    ├── rejected
    └── unresolved
    ↓
Trip Planning / Considered-place UI
```

Factual enrichment occurs before any runtime decision or AI judgment. P2-DE-2 may nevertheless develop the pure engine first using deterministic fixture facts.

## Ownership Matrix

| Concern | Owning layer |
|---|---|
| Place existence | Factual Provider |
| Coordinates and address | Factual Provider |
| Opening hours and business status | Factual Provider |
| Provider provenance | Factual Provider |
| Missing/unknown factual coverage | Factual Enrichment |
| Hard constraints | Decision Engine |
| Deterministic scoring | Decision Engine |
| Final selected/rejected/unresolved composition | Decision Engine |
| Ambiguous preference signal | Bounded AI Judge |
| Provider/model routing | AI Router |
| Trip/TravelBlock editing | Product Application |
| Considered-place presentation | Web UI |
| Storage and retrieval | Repository / Product Application |
| Inter-service HTTP transport | P3 Decision Service |

The Product Application does not duplicate candidate-selection rules. The Web UI does not invent scores or decision states. The engine does not construct external providers; the application composition root injects factual and judge ports. Pure rules depend on no HTTP, database, clock, random source, or provider SDK.

## Fact / Inference / Decision Separation

**Fact** is supplied by an external provider or verified user input: provider place ID, coordinates, address, business status, opening hours, timezone, `retrievedAt`, and source. Facts retain provenance and coverage.

**Inference** is computed from facts under a policy: straight-line distance, opening-hours feasibility, budget fit, daily density, or preference fit. It must be traceable to its input facts and policy version.

**Decision** is the engine's inclusion outcome: `selected`, `rejected`, or `unresolved`. Decisions use safe, enumerable reason codes rather than raw chain-of-thought.

An AI cannot replace, fabricate, or claim to complete a missing factual provider result. Factual and AI provenance remain distinct from deterministic policy identity.

## Candidate Lifecycle

```text
discovered
    ↓
normalized / deduplicated
    ↓
fact-enriched
    ↓
eligible / ineligible / insufficient-facts
    ↓
scored
    ↓
optionally AI-judged
    ↓
selected / rejected / unresolved
```

`selected` means the final itinerary includes the candidate. `rejected` means an explicit fact or policy excludes it. `unresolved` means facts or policy are insufficient for a safe decision. Unknown is never coerced to false, candidates are never silently dropped, and ordering/tie-breaks are deterministic for identical input, fact snapshot, and policy version. Only selected candidates become final `TravelBlock` values; rejected and unresolved candidates are not forced into that aggregate.

## Decision Result Semantics

P2-DE-1 will implement—not this ADR—the following conceptual contract:

```text
DecisionRequestV1
- trip context
- user constraints
- normalized candidate set
- candidate fact snapshots
- decision policy identifier/version
- optional bounded-judge eligibility

DecisionResultV1
- selected candidates
- rejected candidates
- unresolved candidates
- safe reason codes
- factual coverage summary
- deterministic policy version
- optional bounded-judge provenance
- result completeness
```

This is not a TypeScript type, Zod schema, discriminated union, directory, or public API. P2-DE-1 will decide the concrete contract. Reason codes will be stable identifiers, UI-copy independent, enumerable, multi-valued per candidate, and classified as fact-, rule-, or AI-assisted. They must not contain provider error strings, raw AI reasoning, or chain-of-thought. Illustrative names such as `duplicate_place`, `permanently_closed`, `missing_required_facts`, and `ai_preference_tiebreak` are not the final enum.

## Deterministic Rule Authority

The deterministic engine may deduplicate, exclude permanently closed candidates, handle required-coordinate or required-date/time absence, check opening-window and distance constraints, enforce daily density and explicit hard constraints, score budget fit, sort stably, and apply deterministic tie-breaks.

A **hard rule** makes a candidate ineligible for selection. A **soft rule** changes priority or score but does not itself reject. Every rule and scoring policy must eventually carry a version. P2-DE-0 defines no threshold, weight, or score.

## Bounded AI Judge Authority

The judge may assess limited preference fit, atmosphere preference, companion suitability, and ties or ambiguity that quantitative rules do not resolve. It receives a bounded factual candidate context only after factual enrichment and hard-rule processing, and returns a safe structured judgment signal to the engine.

It must not decide place existence, generate hours/coordinates/prices/travel times, change closure status, ignore hard constraints, revive hard-rejected candidates, return a free-form itinerary, or store/expose raw reasoning. It cannot overturn verified facts or final Decision Result ownership.

If a judge call fails, verified facts do not change. Where deterministic output is sufficient, the engine may retain it while explicitly recording that AI was unused. Where AI judgment is required, affected candidates remain `unresolved`; failure is not hidden as full success. This ADR adds neither a Gemini/self-hosted fallback nor retry policy: follow-up work must respect the existing AI Router boundary and make any new policy explicit.

## Failure and Unknown Semantics

Optional fact absence (for example no price, regular-hours-only schedule, or a quality flag) is `unknown` or `caution`, is retained in factual coverage, and does not silently delete the candidate. Required identity, coordinates, or policy-required date/time absence leads to `unresolved` or explicitly ineligible; P2-DE-1 will define that precise discriminant. AI never fills the gap.

If a required provider category fails at the transport/system level, the result is not reported as complete. The application must expose an explicit incomplete/partial result or fail closed, consistently with P1-4's no-silent-partial-success policy. This is distinct from a successful provider response with unknown fields.

## Package and Dependency Boundary

The planned package layout is:

```text
packages/decision-engine/
├── src/
│   ├── contracts/
│   ├── facts/
│   ├── rules/
│   ├── scoring/
│   ├── judge/
│   ├── decision/
│   └── index.ts
└── test/
```

It is documentation only in P2-DE-0. Intended dependency direction is `apps/api → packages/decision-engine → provider-neutral shared/domain contracts`. The package must not depend on `apps/api`, `apps/web`, PostgreSQL, HTTP clients, Gemini SDK, Google Places SDK, system clock, or random. AI integration is injected through a provider-neutral judge port; pure rules never directly call `packages/ai`.

## Persistence Boundary

`TravelBlock` remains the selected final itinerary item. It is not a candidate audit log. If considered-place history is required, a later `DecisionSnapshot` (or equivalent aggregate) will hold version, safe reason codes, fact coverage, policy identity, and safe provenance. It must not hold raw prompts, raw provider responses, or chain-of-thought.

P2-DE-0 creates no schema or migration. P2-DE-4 or P2-DE-6 will decide persistence from actual query/reproduction needs.

## P2 Delivery Order

1. P2-DE-0 — Decision Engine ADR and boundary
2. P2-DE-1 — Provider-neutral candidate and decision contracts
3. P2-DE-2 — Deterministic pure decision engine
4. P2-FE-1 — Candidate factual enrichment
5. P2-DE-3 — Bounded AI judge
6. P2-DE-4 — Versioned Decision API integration
7. P2-DE-5 — Considered-place and rejected-candidate UI
8. P2-DE-6 — Decision snapshots and evaluation

The pure engine can be developed against fixtures before live enrichment, but actual runtime enrichment must precede hard rules and AI judgment. This prevents the judge from guessing facts and limits it to hard-rule survivors.

## P3 Extraction and Docker Boundary

P3 may wrap the same package with an internal, versioned HTTP service:

```text
apps/web
    ↓
apps/api — Product Application
    ↓ internal versioned HTTP
apps/decision-service
    ↓
packages/decision-engine
```

The repository remains one monorepo; Product Application and Decision Service become two deployable units. P3 adds the service, versioned internal transport, health/readiness, timeout/failure boundary, Dockerfile, Docker Compose, resource limits, rollback procedure, and deployment documentation.

Docker is intentionally deferred to P3. Until contracts, failure semantics, observable latency/performance, and module/transport responsibilities are stable, a separate process would add network and operational cost—especially on the current 2-vCPU server—without a stable interface to operate. Extraction requires stable P2 contracts, deterministic evaluation, versioned Decision API, settled failure semantics, measurable performance/latency, and clear module-versus-transport separation.

## Privacy and Observability

Decision observability and future snapshots may retain safe policy/version, fact coverage, result completeness, reason codes, and limited provider/AI execution provenance. They must exclude raw prompts, user content not needed for the decision contract, raw provider responses, AI chain-of-thought, tokens, authorization headers, secrets, and provider-internal error strings. The UI shows only confirmed facts, safe reason-copy mappings, coverage, status, and limited safe provenance.

P2-DE-5's planned user-facing label is **"일정 생성 과정에서 함께 검토한 장소"**. It distinguishes included places, other considered places, and places that could not be decided due to missing information; it never fabricates a UI decision state without a Decision Result.

## Alternatives Considered

### A — Add decision logic directly to the existing API

Initial implementation would be simple, but API orchestration and rules would couple, duplicate behavior across consumers would become likely, and isolated testing/service extraction would be harder. **Reject.**

### B — In-monorepo Decision Engine package

Pure logic can be tested, the current deployment remains unchanged, integration can be incremental, and P3 extraction remains possible. **Accept for P2.**

### C — Immediate independent Decision Service and Docker

Independent deployment is possible, but it would impose network, deployment, observability, and failure complexity before contracts stabilize and consumes scarce 2-vCPU resources. **Defer to P3.**

### D — Let an LLM own complete candidate selection

This would be non-deterministic, risks inventing provider facts, complicates regression evaluation, and blurs safe reasons and factual provenance. **Reject.**

## Consequences

P2 gains one owner for final candidate decisions, deterministic behavior where possible, explicit unknown/partial semantics, and a narrow seam for later AI and service work. It also requires future work to design candidate contracts, policy versions, coverage, evaluation fixtures, and safe UI wording deliberately rather than relying on current trip-generation DTOs.

## Deferred Decisions

- Concrete TypeScript/Zod contracts and final reason-code enum (P2-DE-1)
- Thresholds, weights, score formulas, and policy versions (P2-DE-2)
- Enrichment provider calls and the required-fact discriminant (P2-FE-1)
- Judge task definition, prompt, routing/retry/fallback, and model eligibility (P2-DE-3)
- Public/internal API shape (P2-DE-4)
- UI copy mapping and snapshots/persistence schema (P2-DE-5/6)
- Routes, live travel-time, price, and reservation factual providers

P4 may use P2-DE-6 fixtures and decision evidence to compare a dedicated ranker, small preference classifier, self-hosted bounded judge, managed judge, fine-tuning, or distillation. P1-5F found Qwen3-4B and Gemma 4 E2B unable to meet the 30-second budget on the current ARM 2-vCPU server; no local model is production-eligible and P2 production routing stays Gemini-only. P2-DE-0 performs no model download, inference, or benchmark.

## Acceptance Criteria

- Product Application, Decision Engine, Bounded AI Judge, Factual Provider, and Decision Service have distinct documented responsibilities.
- Facts, inferences, and decisions have separate provenance/unknown semantics.
- Candidate lifecycle and selected/rejected/unresolved results are explicit; candidates are never silently dropped.
- Deterministic rules own hard constraints and final composition; the judge has bounded, non-factual authority.
- P2 package dependency direction, snapshot boundary, delivery order, P3 extraction conditions, and Docker timing are clear.
- This ADR creates no runtime code, package, API, UI, database, migration, provider call, or deployment change.
