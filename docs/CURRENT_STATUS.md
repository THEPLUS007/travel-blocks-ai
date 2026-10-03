# Travel Blocks AI Current Status

Last verified: **2026-10-03**
Repository: `THEPLUS007/travel-blocks-ai`
Branch: `main`
Verified implementation baseline: `5b2aad27cdeb42dc30091d0024264d1619b550a5`

이 문서는 실제 저장소와 검증 결과의 현재 상태만 기록합니다. 목표 구조는 `ROADMAP.md`, 불변 규칙은 `INVARIANTS.md`에서 관리합니다.

## Phase

| Phase | Status | Evidence |
|---|---|---|
| P0 — Production baseline hardening | COMPLETE | 배포·DB·CI·provider·security baseline |
| P1 — Quality, feasibility, trust, AI execution | COMPLETE | P1-1~P1-6 complete; Gemini-only routing retained |
| P1-1 — Deterministic evaluation baseline | COMPLETE | `c7e8ef870fdcaff5abbaec667417a7e58949968f` |
| P1-2 — Geographic feasibility | COMPLETE | `fc1adedce459e357df05e74f6b1e442c9f91274b` |
| P1-3 — Opening-hours feasibility foundation | COMPLETE | `01e29ac845e9df97eba8577c78d1190a2b44efcc` |
| P1-4 — Provider resilience & regression quality gate | COMPLETE | `ed24990a`; CI Quality/E2E/PostgreSQL SUCCESS |
| P1-5 — AI Execution Platform | COMPLETE | P1-5A~F complete; Gemini production routing retained |
| P1-5A — AI task contracts | COMPLETE | `ebdc1bc`; contract tests and full verification PASS |
| P1-5B — LLM Gateway / Router Skeleton | COMPLETE | `16535c1`; Quality/E2E/PostgreSQL SUCCESS |
| P1-5C — Self-hosted LLM PoC | COMPLETE | 8313ce7; Quality/E2E/PostgreSQL SUCCESS |
| P1-5D — Explicit Routing Policy | COMPLETE | `44a3825`; Quality/E2E/PostgreSQL SUCCESS |
| P1-5E — Scope + AI Provenance | COMPLETE | `02293a6`; Quality/E2E/PostgreSQL SUCCESS |
| P1-5F — Local Model Bake-off + Isolated Self-hosted PoC | COMPLETE | 2026-09-23; no local model eligible; no routing change |
| P1-6 — Trust / Explainability UI | COMPLETE | `0098d93`, `867ac02`; Quality/E2E/PostgreSQL SUCCESS |
| P2 — Decision Engine | IN PROGRESS | P2-DE-0 through P2-DE-4 COMPLETE; P2-DE-5 is next |
| P2-DE-0 — Decision Engine ADR and boundary | COMPLETE | `08d597c` ADR boundary; `7531510`; Quality/E2E/PostgreSQL SUCCESS |
| P2-DE-1 — Provider-neutral candidate and decision contracts | COMPLETE | `45ef7fd`, `8882214`; Quality/E2E/PostgreSQL SUCCESS |
| P2-DE-2 — Deterministic pure decision engine | COMPLETE | `3a7146d`, `f48ed02`; GitHub Actions `36976995196` Quality/E2E/PostgreSQL SUCCESS |
| P2-FE-1 — Candidate factual enrichment | COMPLETE | `e7ea430`, `5b2aad2`; GitHub Actions `36981848388` Quality/E2E/PostgreSQL SUCCESS |
| P2-DE-3 — Bounded AI judge | COMPLETE | `02f0e34`, `f4d53ac`; GitHub Actions `37104429361` Quality/E2E/PostgreSQL SUCCESS |
| P2-DE-4 — Versioned Decision API integration | COMPLETE | `116c142`, `5ca1271`; GitHub Actions `37106848614` Quality/E2E/PostgreSQL SUCCESS |

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

### P1-6 Trust UI

- itinerary-level summary of total, provider-linked, and unverified block counts
- per-block text badges based only on `block.place?.verified === true`
- explicit user-facing boundary: place identity connection does not verify time, cost, memo, opening hours, routes, travel time, itinerary quality, or AI judgment
- explicit unknown states for opening hours and actual routes/travel time
- no public API/schema/DB/AI routing change and no new provider call

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
- public AI provenance, opening-hours feasibility, and route/travel-time results on the itinerary payload
- YouTube transcript extraction
- full login UI, booking, payment, price comparison, collaboration

## Current work

P1 COMPLETE

P2 IN PROGRESS

P2-DE-0 COMPLETE

P2-DE-1 COMPLETE

P2-DE-2 COMPLETE

P2-FE-1 COMPLETE

Production audit: **0 vulnerabilities**

Production AI routing: **Gemini-only**

Next: **P2-DE-5 — Considered-place and rejected-candidate UI**

## P2-DE-4 implementation status

`POST /api/v1/decisions/evaluate` is a new strict `decision_api_request_v1`/`decision_api_response_v1` boundary with a strict versioned error envelope. It has no unversioned alias. `DecisionApplicationServiceV1` owns server IDs/time, canonical provider-reference resolution, factual enrichment, deterministic evaluation, optional bounded judge execution, final validation, and safe response construction. Client input cannot supply provider facts/provenance, timestamps, deterministic scores, result IDs, decision state, provider/model, or force-AI flags. The endpoint exposes no raw provider/AI payload or public AI provenance.

The full-ranking `rankBoundedPlaces` operation is versioned separately from legacy `rankPlaces`; both retain the `rank_places`/`place_ranking` capability. It preserves Gemini/router execution scope, one-time selection, and adapter-owned retry/error normalization. `DECISION_AI_JUDGE_ENABLED` is false by default; skips are typed while started failures are explicit safe HTTP errors. Existing recommendation, generation, analysis, place, Trip, MCP, and authentication routes remain unchanged. No persistence, database migration, UI, Docker, deployment, restart, or live provider call occurred.

Node 22.23.2 / npm 10.9.8 completed `npm ci`, decision-engine tests (16), factual-enrichment tests (10), decision-judge tests (7), AI tests (96), API tests (120), `npm run verify`, `npm run eval` (8/8 scenarios, 98/98 checks), `GEMINI_MAX_CONCURRENCY=1 npm run test:postgres` (1), and `npm audit --omit=dev` (0 vulnerabilities). Local E2E remained blocked by the existing port-3000 listener, which was not stopped; GitHub Actions run `37106848614` passed Quality, E2E, and PostgreSQL. Gemini, Places, Routes, self-hosted, Groq, NVIDIA, and OpenRouter calls were all 0.

## P2-DE-3 implementation status

`@travel-blocks/decision-judge` now contains strict V1 bounded-judge contracts, immutable policy (2–5 candidates), pure eligibility/request creation, full-permutation validation, provider-neutral port execution, safe observer isolation, and deterministic reconciliation into the existing DecisionResult. It operates only after factual enrichment and P2-DE-2 evaluation: hard rejections, unresolved candidates, facts/provenance, scores, and all outside-allowlist decisions remain unchanged. Pre-execution skips are typed; started port errors and malformed output propagate with no retry, fallback, failover, or partial apply. `ai_assisted_selection`/`ai_assisted_not_selected` are safe enumerable reason codes only.

The current shared `rank_places` contract returns a partial selection and free reasons, so it cannot represent the required exact ranking permutation. P2-DE-3 keeps its Gemini-only default routing and existing router table unchanged; `packages/ai` exposes only a future composition seam plus an untrusted-data prompt builder. There is no public API, DB migration, production runtime, Docker, deployment, or actual Gemini/Places/Routes/self-hosted/Groq/NVIDIA/OpenRouter call. P2-DE-4 owns composition/API integration; P2-DE-5 owns considered/rejected UI; P2-DE-6 owns snapshots/evaluation.

Node 22.23.2 / npm 10.9.8 completed `npm ci`, decision-engine tests (16), factual-enrichment tests (10), decision-judge tests (7), AI tests (95), API tests (114), `npm run verify`, `npm run eval` (8/8 scenarios, 98/98 checks), `GEMINI_MAX_CONCURRENCY=1 npm run test:postgres` (1), and `npm audit --omit=dev` (0 vulnerabilities). GitHub Actions run `37104429361` passed Quality, E2E, and PostgreSQL. No local process on port 3000 was stopped or restarted; no live provider calls occurred.

## P2-FE-1 validation

`e7ea430` adds `@travel-blocks/factual-enrichment`, an injected provider-neutral side-effect boundary that turns P2-DE-1 candidates, prior snapshots, and an explicit retrieval context into canonical `CandidateFactSnapshot[]`. It defines place, opening-hours, and route ports; structurally adapts the existing P1 opening-hours lookup; preserves current/regular schedules and quality metadata; maps successful missing fields to `unknown`; propagates provider failures unchanged; preserves no-source/context as `unavailable`; retains no raw payload; and provides deterministic timestamp/provenance merge, candidate accounting, deduplication, and bounded concurrency. Route acquisition requires explicit origin/mode and known destination; no real route provider or exact price source exists. It adds no API/runtime/UI/DB/Docker integration and does not change Decision Engine rules or DecisionRequest V1.

Node 22.23.2 / npm 10.9.8 completed clean `npm ci`, factual-enrichment tests (10), decision-engine tests (16), `npm run verify`, `npm run eval` (8/8 scenarios, 98/98 checks), `GEMINI_MAX_CONCURRENCY=1 npm run test:postgres` (1), and `npm audit --omit=dev` (0 vulnerabilities). Local E2E remained blocked by the existing port-3000 listener; it was not stopped. GitHub Actions run `36981848388` passed Quality, E2E, and PostgreSQL. Gemini, Places, Routes, self-hosted inference, and other product-provider calls were all 0.

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


## P1-5F verification

`P1-5F_LOCAL_MODEL_BAKEOFF.md` records the 2026-09-23 isolated ARM 2-vCPU PoC. Candidate A did not meet community-conversion provenance requirements and was not downloaded. Official Qwen3-4B Q4_K_M and Gemma 4 E2B Q4_0 were loaded sequentially with loopback-only, authenticated, two-thread runtimes; both first synthetic warm-ups exceeded the 30-second hard deadline and were stopped before output. MemAvailable stayed above 9.7 GiB and production health stayed `ok`. P1-5F is complete with **no local model eligible for staging**. No production routing, API, schema, database, deployment, or restart occurred; external managed-provider calls remained zero. The deterministic benchmark suite adds 34 synthetic intent fixtures plus six future-only bounded-decision fixtures; live raw prompts/responses and artifacts are not stored in Git.

## P1-6 verification

`0098d93` adds the Trust Summary and block badges; `867ac02` corrects the deterministic E2E selector to count only block badges. The web UI consumes the existing public `TravelBlock.place` reference and renders `장소 확인됨` only for `verified === true`; all other blocks render `장소 미확인`. It does not expose provider IDs, opening-hours feasibility, route calculations, AI execution provenance, or new inferred confidence data.

Node 22.23.2 / npm 10.9.8 completed `npm ci`, web lint/build, `npm run verify` (domain 30, AI 93, API 114 tests), and `npm run eval` (8/8 scenarios, 98/98 checks). `npm audit --omit=dev` reported 0 vulnerabilities. Local PostgreSQL verification was safely blocked because the CI-only test database was unavailable (authentication failed); GitHub Actions run `36431436242` then passed Quality, E2E, and PostgreSQL. Local E2E was not run because an existing listener occupied port 3000 and the fixed test configuration has no isolated API port; no process was stopped. No Gemini, Places, Routes, self-hosted, or other managed-LLM call, deployment, restart, or migration occurred.

## P2-DE-0 validation

`08d597c` defines the Decision Engine ADR and module boundary without adding a runtime engine, candidate/decision contract, public API, Trip/TravelBlock change, database migration, provider call, deployment, or restart. `7531510` remediates the production dependency advisories with Fastify 5.12.5 and patched transitive `fast-uri` releases. Node 22.23.2 / npm 10.9.8 completed clean `npm ci`, API tests (114), `npm run verify` (domain 30, AI 93, API 114, MCP PASS), `npm run eval` (8/8 scenarios, 98/98 checks), and production audit (0 vulnerabilities). Local PostgreSQL remained safely blocked by CI-only database authentication and local E2E remained blocked by the existing port-3000 listener; neither process was changed. GitHub Actions run `36871218177` passed Quality (including verify, eval, audit, and shell/operations regression), E2E, and PostgreSQL. Gemini, Places, Routes, self-hosted inference, and other product-provider calls were all 0; only npm registry metadata/package retrieval was used for the dependency remediation.

## P2-DE-1 validation

`45ef7fd` creates `@travel-blocks/decision-engine`, an import-side-effect-free package with strict, versioned Zod contracts for candidates, factual snapshots, DecisionRequest, selected/rejected/unresolved DecisionItem, DecisionResult, safe reason codes, provenance, and semantic validation helpers; `8882214` reuses the existing shared TransportModeSchema rather than duplicating it. Candidate/fact references are validated; a result must form a total, exclusive partition of all request candidates, preventing silent drops. Unknown/unavailable/invalid/untrusted facts remain facts and can produce `unresolved`; they are not coerced to false or `rejected`. The package contains no rule engine, scoring, AI Judge, provider client, prompt, raw provider/model output, public API integration, Trip/TravelBlock change, DB migration, Docker, deployment, or restart. Node 22.23.2 / npm 10.9.8 passed decision-engine tests (7), full verify (domain 30, AI 93, decision-engine 7, API 114, MCP PASS), evaluation (8/8 scenarios, 98/98 checks), and production audit (0 vulnerabilities). Local PostgreSQL was safely blocked by CI-only authentication and local E2E by the existing port-3000 listener; GitHub Actions runs `36876035290` and `36877373299` passed Quality, E2E, and PostgreSQL. Gemini, Places, Routes, self-hosted inference, and other product-provider calls were all 0.

## P2-DE-2 validation

`3a7146d` adds the pure `evaluateDecision` engine and immutable `DETERMINISTIC_POLICY_V1` (`deterministic-travel-selection`/`v1`). The policy keeps permanently closed as the only active hard rejection, requires business status, preserves unknown/unavailable/invalid/untrusted facts as unresolved, scores category fit on the documented 0–1000 integer scale, enforces an explicit minimum selection threshold and selection limit, ranks by score then candidate ID, and emits a canonical total/exclusive DecisionResult. Temporary/future opening is neither silently rejected nor selected without an operational window; it is unresolved. Opening-hours visit feasibility, budget, route, and exclusions remain deferred because V1 supplies no corresponding explicit constraints. No application/API/runtime/UI/DB/Docker change or external provider/AI call was added.

Node 22.23.2 / npm 10.9.8 completed clean `npm ci`, decision-engine tests (16), `npm run verify`, `npm run eval` (8/8 scenarios, 98/98 checks), `GEMINI_MAX_CONCURRENCY=1 npm run test:postgres` (1), and `npm audit --omit=dev` (0 vulnerabilities). Local E2E remained blocked by the existing port-3000 listener; it was not stopped. GitHub Actions run `36976995196` passed Quality, E2E, and PostgreSQL for `f48ed02`. Gemini, Places, Routes, self-hosted inference, and other product-provider calls were all 0.
