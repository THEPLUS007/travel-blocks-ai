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

현재 provider/application 모델에는 경로 소요 시간과 영업시간 데이터가 없으므로 route feasibility와 opening-hours feasibility는 의도적으로 **DEFERRED**입니다. 구현되지 않은 검증을 완료된 것으로 간주하지 않습니다.

## Production serving boundary

Nginx가 HTTPS same-origin의 static web release와 `/api/*` reverse proxy를 담당합니다. Production Vite build는 root base(`/`)를 사용해 SPA nested route에서도 asset/API URL을 유지합니다. API는 systemd 아래 non-root로 `127.0.0.1:3000`에 bind하고 local PostgreSQL에 연결합니다. Repository `deploy/` template과 `scripts/`는 phase 5 적용을 준비하며 CI는 배포 없이 검증만 수행합니다.
