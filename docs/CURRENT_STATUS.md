# Travel Blocks AI Current Status

Last verified: **2026-09-22**
Repository: `THEPLUS007/travel-blocks-ai`
Branch: `main`
Verified implementation baseline: `ed24990a2745aed3c1c8e2e73a73fa34278f9e65`

이 문서는 실제 저장소와 검증 결과의 현재 상태만 기록합니다. 목표 구조는 `ROADMAP.md`, 불변 규칙은 `INVARIANTS.md`에서 관리합니다.

## Phase

| Phase | Status | Evidence |
|---|---|---|
| P0 — Production baseline hardening | COMPLETE | 배포·DB·CI·provider·security baseline |
| P1 — Quality, feasibility, trust, AI execution | IN PROGRESS | P1-1~P1-5E complete; P1-5F next |
| P1-1 — Deterministic evaluation baseline | COMPLETE | `c7e8ef870fdcaff5abbaec667417a7e58949968f` |
| P1-2 — Geographic feasibility | COMPLETE | `fc1adedce459e357df05e74f6b1e442c9f91274b` |
| P1-3 — Opening-hours feasibility foundation | COMPLETE | `01e29ac845e9df97eba8577c78d1190a2b44efcc` |
| P1-4 — Provider resilience & regression quality gate | COMPLETE | `ed24990a`; CI Quality/E2E/PostgreSQL SUCCESS |
| P1-5 — AI Execution Platform | IN PROGRESS | P1-5A~E complete; P1-5F next |
| P1-5A — AI task contracts | COMPLETE | `ebdc1bc`; contract tests and full verification PASS |
| P1-5B — LLM Gateway / Router Skeleton | COMPLETE | `16535c1`; Quality/E2E/PostgreSQL SUCCESS |
| P1-5C — Self-hosted LLM PoC | COMPLETE | 8313ce7; Quality/E2E/PostgreSQL SUCCESS |
| P1-5D — Explicit Routing Policy | COMPLETE | `44a3825`; Quality/E2E/PostgreSQL SUCCESS |
| P1-5E — Scope + AI Provenance | COMPLETE | `02293a6`; Quality/E2E/PostgreSQL SUCCESS |
| P1-6 — Trust / Explainability UI | PLANNED | Not implemented |

## Current production architecture

```text
React/Vite web
    ↓ same-origin /api
Fastify API
    ├─ PostgreSQL
    ├─ Gemini
    └─ Google Places API (New)
```

- AI provider: Gemini by default; self-hosted is an explicit, guarded `extract_intent` opt-in only
- Place provider: Google Places API (New)
- LLM router: explicit policy; default Gemini-only, no execution fallback
- Self-hosted LLM: adapter exists for `extract_intent`; inference service is not deployed
- Route provider: not implemented
- Persistence: PostgreSQL, no production memory fallback
- Delivery baseline: Nginx + systemd + GitHub Actions

The P0 production baseline was deployed previously. The P1-3 commit itself was **not deployed or restarted** as part of its completion work, and P1-3 did not change the current runtime request behavior.

## Implemented

### Application and data

- React/Vite Travel Block editor
- Fastify API with Zod request/response contracts
- PostgreSQL persistence, optimistic concurrency, anonymous-session isolation
- provider-verified place grounding and server-side canonicalization
- safe public text/HTML source extraction with SSRF controls
- deterministic itinerary structure and candidate-integrity validation

### AI

- `TravelAiProvider` boundary
- task methods: `extractIntent`, `generateTrip`, `analyzeText`, `rankPlaces`
- Gemini task-specific prompts and structured output
- application-side Zod and semantic validation
- bounded timeout/retry/concurrency/dedupe behavior
- safe AI run metadata through `ai_generation_runs`

### P1 evaluation and feasibility

- 8 deterministic evaluation scenarios with no network/provider/DB calls
- P1-2 Haversine straight-line geographic heuristic with explicit coverage
- P1-3 provider-neutral opening-hours model
- business status, timezone, current/regular schedules, provenance, quality flags
- overnight and 24-hour period support
- explicit `tripStartDate` and strict `HH:MM` / `HH:MM-HH:MM` parsing
- results: `feasible`, `caution`, `infeasible`, `unknown`
- provider facts separated from deterministic feasibility decisions
- lazy `PlaceOpeningHoursProvider` capability using Google Place Details fields

The opening-hours foundation currently participates in deterministic domain/evaluation fixtures. It does not yet change public API schemas, persisted Trip/TravelBlock data, or the production trip-generation path.

## P1-3 verification snapshot

| Check | Result |
|---|---|
| Opening-hours domain tests | 3 PASS |
| Google parser/provider mock tests | 2 PASS |
| Route regression tests | 8 PASS |
| Evaluator tests | 10 PASS |
| Evaluation baseline | 8/8 scenarios PASS |
| Deterministic checks | 98/98 PASS |
| `npm run verify` | PASS |
| `npm run eval` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |
| GitHub Actions Quality | SUCCESS |
| GitHub Actions E2E | SUCCESS |
| GitHub Actions PostgreSQL | SUCCESS |
| Live Gemini / Places / Routes calls | 0 / 0 / 0 |

## Not implemented

- actual route-distance/travel-time provider and runtime feasibility
- opening-hours lookup on the production generation/runtime path
- generalized provider health, partial-failure and data-quality policy layer
- multi-provider dynamic routing and fallback execution
- self-hosted LLM inference service
- application-data scope/source provenance and durable provenance persistence
- local-vs-Gemini benchmark and production routing quality gate
- durable background queue/worker runtime
- trust/provenance/quality-warning UI
- YouTube transcript extraction
- full login UI, booking, payment, price comparison, collaboration

## Current work

Next planned implementation: **P1-5F — Benchmark / Production Quality Gate**. P1-5E is complete.

## P1-4 verification addendum

P1-4 provider resilience and regression gates are implemented in the local focused commit. Deterministic Places failure tests, Gemini structured-output/retry tests, prompt-boundary checks, recommendation partial-category fail-closed coverage, and P1-2/P1-3 regressions pass locally. CI completion is tracked on the pushed merge commit.

## P1-5A verification

P1-5A defines four immutable task contracts backed by the existing shared Zod schemas: `extract_intent`, `generate_trip`, `analyze_text`, and `rank_places`. Gemini remains the only provider; no router, provider registry, fallback execution, public schema, or DB migration was added. Task-contract, Gemini, API, evaluation, and PostgreSQL regressions remain covered by the existing verification gates.

## P1-5D verification

`44a3825` adds the deterministic policy, readiness boundary, default Gemini-only behavior, guarded `extract_intent` self-hosted eligibility, safe routing metadata, and configuration regressions. AI package tests (84), full verify, evaluation baseline (8/8 scenarios, 98/98 checks), PostgreSQL, and production audit passed. Local E2E was blocked by an existing port-3000 API that was not stopped; GitHub Actions Quality, E2E, and PostgreSQL passed for the implementation commit. No live Gemini, Places, Routes, or self-hosted inference call, deployment, restart, public API change, or DB migration occurred.
`AiRoutingPolicy` performs one deterministic pre-execution decision from task capability, provider registration, explicit `AI_ROUTING_MODE`, self-hosted enablement, and injected readiness. Defaults are `gemini_only` and `unknown`, so all four tasks keep Gemini behavior without new environment variables. In `hybrid`, only `extract_intent` can select the registered self-hosted provider, and only when it is enabled, has `intent_extraction`, and readiness is `healthy`; the other three tasks always select Gemini. There is no retry, concurrent execution, or post-execution fallback in the Router. Routing decision metadata is safe-only (task, capability, selected provider, mode, reason, readiness, timestamp); lifecycle success/failure remains adapter-owned. No inference service, public API change, DB migration, deployment, or live provider call was added.

## P1-5E verification

Each Router invocation creates a new immutable, payload-free execution scope with an injected execution ID/clock, logical task, required capability, start time, selected provider/model, routing mode/reason, and routing decision. The terminal provider result produces safe provider-neutral provenance with the same execution ID, outcome, completion/duration, and known `AiProviderError` category (or `unknown`). Routing and provider lifecycle behavior remain unchanged: selection occurs once, execution occurs once, and there is no retry/fallback. Provenance is emitted only through an observer side-effect boundary; it is not stored in PostgreSQL, exposed by HTTP, or added to Trip/TravelBlock. It excludes prompt/input/output/raw response/token/header/user content. AI execution provenance is separate from Places/opening-hours factual provenance.

`02293a6` adds immutable request-local execution scope, correlated routing/provenance events, task-aware provider model metadata, safe terminal provenance, and observer-failure isolation. AI tests (90), full verify, evaluation baseline (8/8 scenarios and 98/98 checks), PostgreSQL, and production audit passed. Local E2E was blocked by the existing port-3000 API without stopping it; GitHub Actions Quality, E2E, and PostgreSQL passed for the implementation commit. No live Gemini, Places, Routes, or self-hosted inference call, deployment, restart, public API change, DB migration, or provenance persistence occurred.
