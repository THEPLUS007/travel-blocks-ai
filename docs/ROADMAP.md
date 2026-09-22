# Travel Blocks AI Roadmap

이 문서는 phase의 목표, 순서, 범위와 완료 조건을 정의하는 source of truth입니다.

- 실제 완료 상태와 검증 HEAD는 `CURRENT_STATUS.md`에서 관리합니다.
- 절대 깨면 안 되는 규칙은 `INVARIANTS.md`에서 관리합니다.
- 현재 구현 구조는 `ARCHITECTURE.md`와 주제별 문서에서 관리합니다.
- 아래의 target architecture를 현재 구현으로 해석하지 않습니다.

## Status vocabulary

| Status | Meaning |
|---|---|
| COMPLETE | 구현·검증·문서·커밋 증거가 모두 존재 |
| IN PROGRESS | 현재 작업 중이며 완료 조건 미충족 |
| NEXT | 직후 착수할 단계 |
| DESIGN DEFINED | 범위와 순서는 확정됐지만 코드 미구현 |
| PLANNED | 상위 목표만 확정 |
| DEFERRED | 의도적으로 이후 phase로 연기 |

## Architecture themes

서로 다른 아이디어를 하나의 기능으로 섞지 않고 다음 책임으로 배치합니다. 참고한 프로젝트의 구현을 복사한다는 뜻이 아니라, 관찰한 설계 개념을 Travel Blocks의 기존 boundary에 맞게 적용합니다.

| Design input | Adopted theme | 책임 | P1 placement |
|---|---|---|---|
| 군번여지도에서 관찰한 데이터 신뢰 구조 | Data Trust | provider fact, provenance, quality, partial failure | P1-3, P1-4 |
| Pencil / Pencil-KG에서 관찰한 AI context 구조 | AI Context / Orchestration | explicit scope, AI provenance, job-compatible contract | P1-5E |
| Self-hosted LLM 구상 | AI Execution | task contract, LLM abstraction, routing, self-hosted serving | P1-5A~F |
| 기존 Travel Blocks domain/evaluation | Deterministic Assessment | geography, hours, density, integrity, future route time | P1-2, P1-3, later provider-backed work |
| 위 trust metadata의 사용자 표현 | Trust UI | fact/inference/unknown/warning presentation | P1-6 |

`Data Provider Layer`와 `AI Provider Layer`는 별개이며, feasibility는 LLM router 내부 책임이 아닙니다.

```text
Source input
    ↓
Data providers → verified facts + provenance + quality
    ↓
AI task orchestration → LLM router → Gemini / self-hosted LLM
    ↓
Structured output + application validation
    ↓
Deterministic feasibility assessment
    ↓
Persistence
    ↓
Trust / explainability UI
```

## P0 — Production baseline hardening

**Status: COMPLETE**

Established provider boundaries, structured AI output, grounding, PostgreSQL, security controls, CI, deployment templates, backup and recovery procedures. P0 is the baseline that P1 must extend rather than replace.

## P1 — Quality, feasibility, trust and AI execution

### P1-1 — Deterministic evaluation baseline

**Status: COMPLETE**
**Evidence:** `c7e8ef870fdcaff5abbaec667417a7e58949968f`

- 8 curated travel scenarios
- expected intent, constraints and quality rules
- known-good and intentionally-bad plans
- repeatable, network-independent evaluation
- CI `npm run eval`

### P1-2 — Geographic feasibility

**Status: COMPLETE**
**Evidence:** `fc1adedce459e357df05e74f6b1e442c9f91274b`

- deterministic Haversine straight-line distance
- consecutive and daily geographic-spread thresholds
- explicit evaluated/skipped coverage
- warning-only evaluation rule
- no route API, travel-time claim, public schema or DB migration

### P1-3 — Opening-hours feasibility foundation

**Status: COMPLETE**
**Evidence:** `01e29ac845e9df97eba8577c78d1190a2b44efcc`

- provider-neutral hours snapshot and schedule periods
- current/regular schedules, business status, timezone
- provider identity, source, retrieval time and quality flags
- lazy Google Place Details capability
- overnight and 24-hour handling
- deterministic `feasible` / `caution` / `infeasible` / `unknown`
- explicit trip date and strict block-time parsing
- no runtime/API/DB behavior change

### P1-4 — Provider Resilience & Regression Quality Gate

**Status: COMPLETE**

P1-4 makes failure and incomplete data behavior measurable before a second LLM provider is introduced.

#### Scope

- Data provider failure matrix: timeout, 429/quota, 5xx, network, invalid response, not found
- Gemini failure matrix: timeout, 429, transient server failure, missing text, invalid JSON, schema failure
- explicit ownership for timeout, retry and retry budget
- partial candidate failure policy: fail, return partial with flags, or reject; never silent drop
- normalized provider health/result metadata without raw payload logging
- regression fixtures for missing coordinates, missing hours, regular-only hours and provider unavailability
- quality flags and coverage propagated to deterministic evaluation where applicable
- prompt regression checks using fixed fixtures; no live Gemini calls in CI

#### Exclusions

- no multi-LLM router
- no self-hosted model
- no Redis, queue, worker or durable jobs
- no real route-time provider
- no trust UI
- no fine-tuning

#### Completion gate

- all provider/AI failure categories have deterministic tests
- retry remains bounded and is not duplicated across layers
- partial failure is never reported as complete success without metadata
- existing 8/8 evaluation scenarios and all P1-2/P1-3 regressions pass
- `npm run verify`, `npm run eval`, `npm audit --omit=dev` pass
- Quality, E2E and PostgreSQL CI succeed
- `CURRENT_STATUS.md` and relevant provider/evaluation docs are updated

### P1-5 — AI Execution Platform

**Status: COMPLETE**

Full name: **LLM Provider Abstraction · Model Routing · Self-hosted LLM · Scope · Provenance**

**Status: IN PROGRESS**

P1-5 is not a rewrite of `TravelAiProvider`. It evolves the existing boundary so task execution can be routed while domain contracts and factual provider ownership remain unchanged.

#### Target structure

```text
Application use case
    ↓
AI task contract + explicit scope
    ↓
LLM gateway / router
    ├─ Gemini provider
    └─ Self-hosted LLM provider
    ↓
Structured output
    ↓
Zod + semantic validation
    ↓
Grounding / canonicalization
    ↓
Deterministic feasibility assessment
```

#### Global boundaries

- Existing public API and domain schema stay stable unless a substage explicitly proves a change is required.
- Google Places and future factual providers never go through the LLM router.
- Deterministic assessment never moves into the LLM router.
- Self-hosted inference is a separate deployable service accessed over an internal HTTP boundary.
- Underlying model/runtime must be replaceable behind a stable application adapter.
- Actual queue/worker runtime is deferred. Contracts should remain compatible with future jobs.
- Fine-tuning is beyond P1 and requires evaluation evidence first.
- No local model receives production traffic until P1-5F gates pass.

#### P1-5A — AI Task Contracts

**Status: COMPLETE**

Define task metadata and type-safe execution contracts for `extractIntent`, `generateTrip`, `analyzeText`, and `rankPlaces`. Record capability and timeout class without changing user-visible behavior. Establish the Gemini-only baseline used for later comparisons.

#### P1-5B — LLM Gateway / Router Skeleton

**Status: COMPLETE**

Add the provider-neutral gateway and router boundary. Gemini remains the only enabled provider, so routing is deterministic and behavior-preserving. Model/provider names stop leaking into application use cases.

#### P1-5C — Self-hosted LLM PoC

**Status: COMPLETE**

Introduce a separate internal inference-service contract and application adapter. Limit the first capability to `extractIntent` or a simpler classification subtask. The PoC must be testable without downloading a model or making live calls in CI.

#### P1-5D — Explicit Routing Policy

**Status: COMPLETE**

Implement a typed, deterministic pre-execution policy. The safe default is Gemini-only. `hybrid` may select self-hosted only for `extract_intent` when the provider is explicitly enabled and registered, declares `intent_extraction`, and injected readiness is `healthy`; all other tasks remain Gemini-only. This decision is not execution fallback: the selected provider is called once, and any provider error is propagated unchanged. No cost/latency routing, quality gate, circuit breaker, or post-execution fallback is part of P1-5D.

#### P1-5E — Scope + AI Provenance

Make the context boundary explicit: which Trip, Day, verified places and prior results an AI task may access. Attach safe execution provenance: provider, model, task, scope/source IDs, latency and fallback metadata. Do not store prompt or raw provider response.


**Status: COMPLETE**

P1-5E adds a provider-neutral, payload-free execution scope and terminal provenance observer at the Router boundary. Execution ID and clock are injectable; routing and provenance share the same ID. The scope records task/capability/selection metadata, not user content. Terminal provenance records provider/model/routing/outcome/duration and an existing normalized provider failure category when available. It does not persist to the DB or public API, and does not change routing, retry, fallback, prompts, schemas, or domain ownership.
#### P1-5F — Benchmark / Production Quality Gate

Compare Gemini and self-hosted candidates using fixed datasets. Measure schema success, task correctness, latency and failure behavior. Enable production routing only for provider-task pairs that pass declared thresholds; otherwise retain Gemini or fail explicitly.

### P1-6 — Trust / Explainability UI

**Status: PLANNED**

- distinguish provider-confirmed facts from AI inference
- show unknown/unverified information without pretending certainty
- show quality warnings and feasibility status
- expose last verified/retrieved time where useful
- explain partial provider coverage in user language
- avoid raw internal issue objects, provider payloads or sensitive telemetry

P1-6 consumes the trust/provenance contracts built in P1-3~P1-5. It must not invent a second independent quality model in the frontend.

## Deferred beyond P1

- real route and traffic-time provider integration
- durable background jobs with Redis/BullMQ/worker/DLQ, when long-running workloads require them
- large-scale RAG or knowledge graph
- fine-tuning or custom classifier training
- provider-agnostic booking/payment/price comparison
- collaboration and full account system

---

## P1-5 Codex execution prompts

아래 프롬프트는 **P1-4가 COMPLETE가 된 뒤 A → F 순서로 한 단계씩** 사용합니다. 한 프롬프트에서 다음 substage까지 선행 구현하지 않습니다. 각 단계가 끝나면 `CURRENT_STATUS.md`를 갱신하고 다음 프롬프트에는 새 HEAD를 사용합니다.

### Prompt P1-5A — AI Task Contracts

```text
Travel Blocks AI 저장소에서 P1-5A — AI Task Contracts를 구현하라.

작업 전 필수:
1. git status, branch, HEAD, origin/main 동기화를 확인한다. working tree가 dirty하면 사용자 변경을 보존하고 중단·보고한다.
2. AGENTS.md, docs/INVARIANTS.md, docs/CURRENT_STATUS.md, docs/ROADMAP.md, docs/ARCHITECTURE.md, docs/AI_PROVIDER.md, docs/EVALUATION.md를 읽는다.
3. CURRENT_STATUS에서 P1-4가 COMPLETE인지 확인한다. 아니면 코드를 수정하지 말고 blocker를 보고한다.
4. TravelAiProvider, Gemini adapter, task-specific prompt/schema, ai_generation_runs, 관련 tests를 실제로 읽고 기존 abstraction을 재사용한다.

목표:
- extractIntent, generateTrip, analyzeText, rankPlaces를 명시적인 AI task contract로 표현한다.
- task별 input schema, output schema, capability, timeout class, fallback 허용 여부를 한 곳에서 type-safe하게 정의한다.
- Gemini-only 현재 동작과 public API를 변경하지 않는다.
- 이후 provider/router가 application/domain contract를 바꾸지 않고 붙을 수 있게 한다.
- 후속 benchmark가 비교할 Gemini baseline metadata를 안전하게 수집할 수 있게 한다.

필수 설계:
- task name은 기존 observability 이름과 호환되게 유지한다.
- TaskDefinition은 TypeScript discriminated union 또는 동등한 compile-time contract를 사용한다.
- input/output source of truth는 기존 shared/domain Zod schema를 재사용하며 중복 schema를 만들지 않는다.
- timeout class는 short/long 등 의미 기반 값으로 정의하고 adapter 내부의 실제 ms 설정과 연결한다.
- capability는 provider가 지원 여부를 선언할 수 있게 하되 아직 router나 두 번째 provider를 구현하지 않는다.
- fallback policy는 선언만 가능하게 하고 P1-5A에서 실제 provider fallback을 추가하지 않는다.
- raw prompt, user text, provider response, secret을 baseline/telemetry에 저장하지 않는다.

금지:
- self-hosted service, LocalLlmProvider, multi-provider router 구현
- public request/response 변경, DB migration, UI 변경
- data provider와 LLM provider 통합
- feasibility를 AI task로 이동
- live Gemini/Places/Routes 호출
- 새 framework 또는 불필요한 dependency

테스트/검증:
- 모든 task definition의 input/output/capability/timeout mapping unit test
- 기존 Gemini adapter가 동일 task contract를 만족하는 compile/runtime test
- 기존 behavior regression test
- npm run verify
- npm run eval
- npm audit --omit=dev
- 가능하면 Quality/E2E/PostgreSQL CI 확인

문서:
- docs/AI_PROVIDER.md에 현재 task contract를 반영한다.
- docs/ARCHITECTURE.md는 현재 구현만 설명한다.
- docs/CURRENT_STATUS.md에 P1-5A 상태, 검증 HEAD와 결과를 반영한다.
- docs/ROADMAP.md의 P1-5A만 COMPLETE로 바꾸고 후속 단계는 미구현으로 유지한다.

커밋:
- 하나의 논리적 commit으로 작성한다. 권장 메시지: feat(ai): define task execution contracts
- force push하지 않는다.

최종 보고:
- starting/final HEAD와 commit
- changed files와 핵심 contract
- behavior/API/schema/DB 변화 여부
- 테스트, eval, audit, CI 결과
- external call 수
- P1-5B를 시작해도 되는지
```

### Prompt P1-5B — LLM Gateway / Router Skeleton

```text
Travel Blocks AI 저장소에서 P1-5B — LLM Gateway / Router Skeleton을 구현하라.

선행 조건:
- AGENTS.md와 docs/INVARIANTS.md, CURRENT_STATUS.md, ROADMAP.md, ARCHITECTURE.md, AI_PROVIDER.md를 먼저 읽는다.
- git status가 clean이고 P1-5A가 COMPLETE인지 확인한다. 불일치 시 수정하지 말고 보고한다.
- 현재 TravelAiProvider 호출 위치, provider construction/config, Gemini tests와 observability 흐름을 읽는다.

목표:
- application use case가 특정 Gemini 구현이 아니라 provider-neutral AI execution boundary를 호출하게 한다.
- LLM gateway/router skeleton을 추가하되, 활성 provider는 Gemini 하나뿐으로 유지한다.
- 현재 public API, output, timeout/retry semantics, error mapping을 보존한다.

필수 설계:
- provider는 capability와 provider ID를 선언한다.
- router는 task definition을 받아 적격 provider를 고르고 실행한다.
- P1-5B routing table은 모든 task를 Gemini로 결정적으로 선택한다.
- provider-specific model/config는 adapter/config 계층에만 둔다.
- application/domain은 Gemini class나 model name을 import하지 않는다.
- AI lifecycle event의 provider/model/task/status/latency 의미를 유지한다.
- provider 실행 결과와 application validation 책임을 분리한다.
- data provider, source pipeline, grounding, deterministic feasibility는 변경하지 않는다.

금지:
- LocalLlmProvider/self-hosted endpoint 추가
- fallback/circuit breaker를 성급히 구현
- public schema/DB/UI 변경
- provider failure를 Mock 결과로 대체
- live provider 호출

테스트/검증:
- task별 Gemini route selection
- unsupported capability의 명시적 오류
- router를 거쳐도 기존 error/observability semantics가 보존되는지 검증
- 기존 API/evaluation regression
- npm run verify, npm run eval, npm audit --omit=dev

문서/상태:
- 현재 Gemini-only router 구조를 AI_PROVIDER/ARCHITECTURE에 기록한다.
- 미래 Local provider를 구현된 것처럼 쓰지 않는다.
- CURRENT_STATUS와 ROADMAP의 P1-5B 상태를 검증 증거와 함께 갱신한다.

커밋:
- 권장 메시지: refactor(ai): add provider-neutral task router

최종 보고에는 starting/final HEAD, changed files, routing table, behavior/API/DB 변화, 검증 결과, external call 수와 P1-5C readiness를 포함한다.
```

### Prompt P1-5C — Self-hosted LLM PoC

```text
Travel Blocks AI 저장소에서 P1-5C — Self-hosted LLM PoC를 구현하라.

선행 조건:
- 필수 문서와 현재 코드를 읽고 P1-5A/B COMPLETE, clean tree, origin/main 일치를 확인한다.
- 현재 배포 구조와 secret/config 규칙을 읽는다.
- 기존 Gemini task quality를 기준선으로 보존한다.

목표:
- 별도 배포 가능한 Self-hosted LLM Inference Service의 최소 계약을 정의한다.
- Travel API에 SelfHostedLlmProvider adapter를 추가한다.
- 첫 capability는 extractIntent 또는 더 작은 classification task 하나로 제한한다.
- 기본 production routing은 계속 Gemini이며 self-hosted provider는 명시적 opt-in development/benchmark mode에서만 활성화한다.

서비스 경계:
- Travel API → internal HTTP → inference service
- health/readiness와 한 개의 structured generation endpoint를 제공한다.
- application adapter는 stable internal contract를 사용한다. underlying open-weight model/runtime은 교체 가능해야 한다.
- base URL, model ID, timeout, optional internal auth token은 환경변수/config로 관리한다.
- public browser에서 inference service에 직접 접근하지 못하게 한다.
- Render Private Service는 향후 배포 대상이 될 수 있지만 이 단계에서 실제 배포·과금·GPU 사용을 수행하지 않는다.

PoC 원칙:
- CI는 모델을 다운로드하거나 live inference를 호출하지 않는다.
- fake HTTP server/fixture로 success, timeout, unavailable, malformed output, schema failure를 재현한다.
- structured output은 동일 application Zod schema로 재검증한다.
- 원문 prompt/raw response/secret은 log/DB에 저장하지 않는다.
- model response가 factual place data를 생성해 authoritative provider를 우회하지 못하게 한다.
- service가 없는 기본 환경에서 app startup과 기존 Gemini 경로가 깨지지 않아야 한다.

금지:
- production traffic routing 활성화
- generateTrip/rankPlaces까지 범위 확대
- real queue/worker/Redis 추가
- fine-tuning
- public API/DB/UI 변경
- live Gemini/Places/Routes/self-hosted 외부 호출

필수 산출물:
- internal inference request/response contract
- SelfHostedLlmProvider adapter와 error normalization
- example environment variables and safe defaults
- local-only 실행/검증 문서
- deterministic contract tests

검증:
- npm run verify, npm run eval, npm audit --omit=dev
- inference adapter success/failure contract tests
- self-hosted config가 없을 때 기존 Gemini behavior regression
- secret/raw payload가 telemetry에 들어가지 않는 test

상태/커밋:
- CURRENT_STATUS와 ROADMAP에 PoC와 production routing의 차이를 정확히 기록한다.
- 권장 메시지: feat(ai): add self-hosted inference provider poc

최종 보고에는 실제 모델/외부 호출/배포가 없었음을 명시하고 P1-5D readiness를 판단한다.
```

### Prompt P1-5D — Explicit Routing Policy

```text
Travel Blocks AI 저장소에서 P1-5D — Explicit Routing Policy를 구현하라.

선행 조건:
- 필수 문서, P1-5A~C 구현, 현재 provider health/error semantics를 읽는다.
- P1-5C가 COMPLETE이고 deterministic adapter tests가 통과하는지 확인한다.

목표:
- task, capability, provider enablement, health, latency/cost class, quality eligibility를 입력으로 하는 명시적 routing policy를 구현한다.
- fallback을 task별 allowlist 정책으로 만든다.
- route decision과 fallback 사용 여부를 안전한 metadata로 관찰 가능하게 한다.

초기 정책:
- extractIntent: self-hosted provider가 enabled + healthy + quality-eligible이면 self-hosted, 아니면 Gemini. 명시적으로 허용된 failure만 Gemini fallback.
- generateTrip: Gemini only.
- analyzeText: Gemini only.
- rankPlaces: Gemini only until 별도 quality gate.
- schema/semantic invalid output을 무조건 fallback할지 여부는 task policy에 명시하고 중첩 retry를 금지한다.

필수 설계:
- 환경변수 하나의 임시 if/else가 아니라 typed policy/config를 사용한다.
- provider retry와 router fallback을 구분한다.
- 전체 timeout budget을 넘지 않게 한다.
- no eligible provider는 sanitized explicit error를 반환한다.
- circuit breaker가 필요하면 작고 결정적인 state machine과 fake clock test를 사용한다. 필요성이 입증되지 않으면 health/eligibility contract만 두고 과구현하지 않는다.
- fallback된 낮은 품질 결과를 조용한 성공으로 숨기지 않는다.
- route decision은 provider/model/task/fallback/reason code만 기록하고 민감한 입력은 기록하지 않는다.

금지:
- data provider routing과 통합
- feasibility를 모델 선택 신호나 LLM 결과로 대체
- production에서 quality gate 미통과 provider 활성화
- public API/DB/UI 변경
- queue/worker/fine-tuning/live calls

테스트:
- 정책 decision table 전체
- healthy/unhealthy/disabled/not-quality-eligible
- allowed/disallowed fallback
- timeout budget과 retry/fallback 중복 방지
- no eligible provider
- Gemini-only task가 Local로 가지 않는 regression
- npm run verify, npm run eval, npm audit --omit=dev

문서/커밋:
- AI_PROVIDER에 현재 routing matrix와 failure policy를 기록한다.
- CURRENT_STATUS/ROADMAP을 갱신한다.
- 권장 메시지: feat(ai): add explicit task routing policy

최종 보고에 production에서 실제 활성화된 route와 비활성 route를 분리해서 적는다.
```

### Prompt P1-5E — Scope + AI Provenance

```text
Travel Blocks AI 저장소에서 P1-5E — Scope + AI Provenance를 구현하라.

선행 조건:
- 필수 문서와 P1-5A~D를 읽고 clean/synced 상태와 완료 증거를 확인한다.
- ai_generation_runs schema와 observer boundary, user/session isolation, provider grounding을 읽는다.

목표:
- AI task가 볼 수 있는 context를 explicit scope contract로 제한한다.
- AI 결과가 어떤 provider/model/task/scope/source를 사용했는지 안전하게 추적한다.
- future job execution에서도 그대로 직렬화할 수 있는 request envelope를 만든다.

Scope 예시 필드:
- tripId (있을 때만)
- relevantDayIds
- verifiedPlace/source IDs
- includeSavedPlaces
- includePreviousAiResults

규칙:
- scope는 current user ownership 검증 뒤에 구성한다.
- 다른 사용자 ID나 관련 없는 Trip/Day를 포함할 수 없다.
- task별 허용 scope 필드를 whitelist한다.
- 기본값은 최소 권한이며 history 전체 포함을 기본으로 하지 않는다.
- provider facts는 provenance source ID로 참조하며 AI가 원본을 덮어쓰지 않는다.

AI provenance metadata:
- provider, model, task, capability
- scope summary와 safe source IDs
- latency, status, fallbackUsed, routing reason
- schema/semantic validation status
- prompt/raw user text/raw provider response/secret은 제외

Persistence:
- 기존 ai_generation_runs로 요구사항을 충족할 수 있는지 먼저 평가한다.
- DB migration은 필요한 최소 metadata를 지속 보존해야 한다는 근거가 있을 때만 추가한다.
- migration이 필요하면 forward/rollback/compatibility와 기존 row 처리 test를 포함한다.
- 단순 관찰 가능성만 필요하면 typed event metadata로 유지하고 불필요한 JSON dump column을 만들지 않는다.

Job compatibility:
- request envelope가 future queue에 전달 가능하도록 serializable하고 versioned여야 한다.
- Redis/BullMQ/worker/job endpoint는 구현하지 않는다.

금지:
- 사용자 원문/prompt/raw response 저장
- scope 없는 암묵적 repository 전체 조회
- KG/RAG/queue로 범위 확대
- UI 변경 및 live external calls

테스트/검증:
- task별 scope whitelist와 cross-user rejection
- safe provenance redaction
- fallback route provenance
- serialization/version compatibility
- 기존 observability regression
- npm run verify, npm run eval, npm audit --omit=dev
- DB 변경 시 npm run test:postgres 및 migration 검증

문서/커밋:
- DATA_MODEL, SECURITY, AI_PROVIDER, ARCHITECTURE 중 실제 변경된 책임만 수정한다.
- CURRENT_STATUS와 ROADMAP을 갱신한다.
- 권장 메시지: feat(ai): add scoped execution provenance

최종 보고에 DB migration 여부와 저장되는/저장되지 않는 정보를 명확히 표로 적는다.
```

### Prompt P1-5F — Benchmark / Production Quality Gate

```text
Travel Blocks AI 저장소에서 P1-5F — Benchmark / Production Quality Gate를 구현하라.

선행 조건:
- 필수 문서와 P1-5A~E 구현을 읽는다.
- 기존 8개 deterministic evaluation과 Gemini baseline, self-hosted provider가 실제로 지원하는 task를 확인한다.
- clean tree, origin/main 동기화와 P1-5E COMPLETE를 확인한다.

목표:
- Gemini와 self-hosted provider를 같은 고정 dataset/task contract로 비교한다.
- schema success, semantic/task correctness, latency, failure behavior를 측정한다.
- provider-task pair가 선언된 threshold를 통과한 경우에만 production routing eligibility를 부여한다.
- 품질 미달이면 Gemini 유지 또는 명시적 실패로 종료한다.

평가 구조:
- deterministic fixture mode는 CI에서 항상 재현 가능해야 한다.
- live benchmark는 별도 명시적 command이며 기본 CI에서 실행하지 않는다.
- live result에는 secret/raw prompt/raw response를 저장하지 않는다.
- dataset version, provider, model, task, run time, sample count, metric summary를 기록한다.
- 같은 dataset으로 baseline과 candidate를 비교하고 임의의 anecdotal sample로 승인하지 않는다.

초기 gate:
- self-hosted는 P1-5C에서 선언한 제한 task에만 후보가 된다.
- schema success와 task accuracy threshold를 문서에 숫자로 명시한다.
- p95 latency와 timeout/failure ceiling을 명시한다.
- sample size가 부족하면 PASS가 아니라 INSUFFICIENT_EVIDENCE로 판정한다.
- generateTrip/rankPlaces/analyzeText는 별도 통과 증거가 없으면 Gemini-only를 유지한다.

필수 산출물:
- provider-neutral benchmark runner
- versioned fixtures/expected results
- machine-readable summary와 사람이 읽을 수 있는 concise report
- pass/fail/insufficient-evidence gate logic
- routing eligibility가 gate 결과 또는 승인된 config와 일치하는 test
- baseline regression guard

금지:
- benchmark 통과 전 production local routing 기본 활성화
- 한두 예시의 수동 인상 평가
- 외부 API를 CI에서 호출
- fine-tuning, queue, UI, factual provider 변경

검증:
- benchmark evaluator unit tests
- known-pass/known-fail/insufficient-evidence fixtures
- routing eligibility integration tests
- npm run verify, npm run eval, npm audit --omit=dev
- 관련 Quality/E2E/PostgreSQL CI
- live benchmark를 실행했다면 비용/모델/표본/결과를 별도 보고하고, 실행하지 않았다면 NOT RUN으로 명시한다.

문서/상태:
- EVALUATION.md에 benchmark와 deterministic itinerary evaluation의 차이를 설명한다.
- AI_PROVIDER.md에 승인된 provider-task routing matrix를 기록한다.
- CURRENT_STATUS에서 P1-5 전체 완료 여부를 evidence 기반으로 판단한다.
- ROADMAP의 P1-5F와 P1-5 parent status를 실제 결과대로 갱신한다.

커밋:
- 권장 메시지: feat(eval): gate ai providers by benchmark quality

최종 보고:
- provider/task별 metrics와 gate outcome
- 현재 production routing matrix
- disabled provider/task와 이유
- starting/final HEAD, commit, changed files
- verify/eval/audit/CI/live-call 결과
- P1-6 readiness와 남은 위험
```

P1-4 implementation evidence: deterministic provider failure matrix, bounded retry ownership regression, prompt/data-boundary checks, partial-category fail-closed behavior, and local verification are in the focused resilience commit. CI is the final completion gate before P1-5 starts.
