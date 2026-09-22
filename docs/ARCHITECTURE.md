# Architecture

`apps/web`은 기존 React/Vite 편집 UI, `apps/api`는 개발·production에서 동일하게 실행되는 Fastify API, `apps/mcp`는 격리된 JSON-RPC MCP입니다. `packages/shared`가 Zod 계약과 inferred 타입을, `packages/domain`이 순수 편집 규칙을, `packages/ai`가 provider adapter를, `packages/test-fixtures`가 외부 서비스 없는 테스트 provider를 제공합니다.

웹은 Vite middleware를 사용하지 않으며 개발 시 `/api`만 독립 API 서버로 proxy합니다. API 요청은 auth → Zod 검증 → repository/provider → 계약 응답 순서로 처리됩니다.

## Place provider

`PlaceSearchProvider`가 application boundary이며 production 구현은 Google Places API (New)의 server-side Text Search와 Place Details를 사용합니다. 응답은 provider object를 노출하지 않고 `VerifiedPlace`로 변환합니다. 검색은 `places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.addressComponents`, 상세 조회는 동일 Place fields만 명시적으로 요청하며 wildcard field mask를 사용하지 않습니다.

## Retrieval-first recommendations

```text
Public RecommendationRequest
→ server candidate queries
→ PlaceSearchProvider
→ VerifiedPlace candidates
→ internal PlaceRankingInput
→ TravelAiProvider.rankPlaces
→ server-side TravelBlock composition
```

Public request와 AI ranking input은 분리됩니다. AI는 후보에 없는 factual 장소 데이터를 생성하지 않으며 candidate ID와 추천 이유만 반환합니다.

## Structured AI output

```text
Shared Zod schema
→ supported JSON Schema subset
→ Gemini responseJsonSchema
→ JSON parse
→ same Zod schema validation
→ ranking candidate semantic validation
```

Gemini가 지원하지 않는 JSON Schema keyword는 adapter에서 제거하지만 application contract는 shared Zod schema가 계속 source of truth입니다.

## Source pipeline

Source type은 client hint가 아니라 server의 WHATWG URL parser가 최종 결정합니다. Plain text는 직접 정규화하고, public HTTP(S)는 DNS-pinned safe extractor를 거치며, YouTube는 일반 URL로 fetch하지 않고 explicit unsupported를 반환합니다. HTML은 parser로 script/style/noscript/nav noise를 제거한 뒤 AI input limit으로 자릅니다.

## Grounded trip planning

`POST /ai/generate-trip`의 public `{prompt}` contract는 유지됩니다. 내부에서는 `extractIntent` → destination/category 기반 Place retrieval → `TripPlanningInput` → structured Gemini planning → provider candidate canonicalization 순서로 실행합니다. AI가 verified candidate의 이름·주소·category를 바꾸더라도 provider 원본을 사용하며 후보에 없는 `verified:true` place는 invalid output으로 거부합니다.

## Itinerary constraint validation

AI `generateTrip`과 `analyzeText` 결과는 API 응답 전에 `packages/domain`의 pure validator를 통과해야 합니다. Validator는 Day/Block/Connection ID와 참조 무결성, 순차 Day 번호, verified-place identity/candidate membership, 일정 밀도 상한을 검사하고 안정적인 machine-readable issue code를 생성합니다. 유효하지 않은 AI 결과는 provider 원문이나 내부 issue를 노출하지 않는 `ITINERARY_INVALID` API 오류로 변환됩니다.

P1-2는 verified place 좌표를 이용한 deterministic straight-line geographic feasibility 경고를 domain/evaluation에 제공합니다. 이는 실제 경로·이동 시간·교통·비용을 계산하지 않으며 runtime 응답, TravelBlock schema, DB에는 저장하지 않습니다.

P1-3는 provider fact와 feasibility decision을 분리한 opening-hours foundation을 추가했습니다. `PlaceOpeningHoursProvider`가 Google Place Details의 business status, timezone, current/regular periods를 lazy lookup하고 provider-neutral snapshot, provenance, quality flag로 정규화합니다. 순수 domain rule은 명시적 trip date와 `HH:MM` 또는 `HH:MM-HH:MM` block time을 사용해 `feasible`, `caution`, `infeasible`, `unknown`을 판정하며 overnight/24-hour period를 처리합니다.

P1-2와 P1-3 결과는 현재 deterministic domain/evaluation foundation입니다. 실제 route-time provider와 production trip-generation path의 opening-hours lookup은 구현되지 않았고, public TravelBlock/Trip schema와 DB에는 저장되지 않습니다.

## Trust and execution boundaries

Application은 `TravelAiProvider` 호환 `AiTaskRouter`를 호출하고, Router는 `AiRoutingPolicy`의 단일 pre-execution decision과 capability 검증을 거쳐 선택된 provider에 정확히 한 번 위임합니다. 기본 policy는 Gemini-only이며, explicit `hybrid` opt-in에서는 enabled·registered·`intent_extraction` capability·`healthy` readiness를 모두 만족한 self-hosted provider만 `extract_intent`에 선택될 수 있습니다. `generate_trip`, `analyze_text`, `rank_places`는 계속 Gemini-only입니다. Gemini와 self-hosted adapter는 prompt/model/HTTP/structured output/retry/observability를 각각 소유하고, Router는 prompt, parsing, retry, timeout, fallback, grounding, feasibility를 소유하지 않습니다. Post-execution fallback과 dynamic quality/cost/latency routing은 구현되지 않았습니다.

Opening-hours snapshot에는 provider, provider place ID, source, `retrievedAt`과 quality flag가 포함됩니다. 더 넓은 provider resilience, AI scope/provenance, model routing은 현재 구조가 아니라 [Roadmap](ROADMAP.md)의 P1-4~P1-5 목표입니다. 경계 규칙은 [Invariants](INVARIANTS.md), 실제 구현 상태는 [Current Status](CURRENT_STATUS.md)를 따릅니다.

## Production serving boundary

Nginx가 HTTPS same-origin의 static web release와 `/api/*` reverse proxy를 담당합니다. Production Vite build는 root base(`/`)를 사용해 SPA nested route에서도 asset/API URL을 유지합니다. API는 systemd 아래 non-root로 `127.0.0.1:3000`에 bind하고 local PostgreSQL에 연결합니다. Repository `deploy/` template과 `scripts/`는 phase 5 적용을 준비하며 CI는 배포 없이 검증만 수행합니다.

## AI task contract layer (P1-5A)

`packages/ai/src/tasks.ts` defines the four logical AI task contracts consumed by adapters. Each definition reuses the shared input/output Zod schema identity and declares capability, timeout class, and explicit-failure fallback policy. `packages/ai/src/router.ts` keeps an exhaustive Gemini static baseline table and startup capability validation; `packages/ai/src/routingPolicy.ts` adds typed policy decisions and an injectable `healthy`/`unhealthy`/`unknown` readiness source. Routing-decision observation is safe metadata only and observer failure cannot alter task execution.
