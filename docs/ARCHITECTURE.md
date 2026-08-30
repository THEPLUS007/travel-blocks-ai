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
