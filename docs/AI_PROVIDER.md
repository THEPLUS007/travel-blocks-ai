# AI provider

`TravelAiProvider`는 `extractIntent`, `generateTrip`, `analyzeText`, `rankPlaces`를 정의합니다. Gemini 구현은 server-only API key, timeout, retry, concurrency 제한, 동일 요청 dedupe, 오류 분류, Zod 출력 검증, usage callback을 제공합니다.

The API composition root injects a provider-neutral `AiTaskRouter`. Its static baseline table remains Gemini for all four logical tasks, while `AiRoutingPolicy` makes one explicit, deterministic selection before delegation. `AI_ROUTING_MODE=gemini_only` is the default and retains Gemini for every task. `hybrid` is a separate traffic opt-in: self-hosted can be selected only for `extract_intent` when `SELF_HOSTED_LLM_ENABLED=true`, its registration declares `intent_extraction`, and injected `SELF_HOSTED_LLM_READINESS=healthy`. `generate_trip`, `analyze_text`, and `rank_places` always use Gemini. Unknown routing mode fails configuration validation; omitted settings remain safe defaults. Google Places and LLM providers remain separate boundaries, and grounding/feasibility stay outside routing.

기본 모델은 2026-07-09 공식 모델 문서에서 stable로 안내된 `gemini-3.5-flash`이며 `GEMINI_MODEL`로 고정 모델을 교체할 수 있습니다. 사용자 입력은 `<user_data>` 경계 안 데이터로 전달합니다. 원문 prompt/provider response는 production log나 observability table에 기록하지 않습니다. URL 입력은 API의 safe source pipeline이 추출한 정규화 text만 AI에 전달합니다.

production provider 실패 시 Mock 일정이 아니라 `AI_PROVIDER_UNAVAILABLE`과 `retryable`을 반환합니다.

AI 작업은 `extractIntent`, `generateTrip`, `analyzeText`, `rankPlaces` 전용 prompt builder로 분리됩니다. system instruction과 JSON 직렬화된 `<user_data>`를 별도로 전달하며, user data 내부 지시는 실행하지 않고 secret·환경변수·내부 prompt를 노출하지 않도록 명시합니다. `analyzeText`는 text만 분석하며 URL을 가져오지 않습니다.

추천은 Place provider가 서버 내부에서 검증 후보를 검색한 뒤 AI가 후보 ID와 이유만 선택합니다. 클라이언트는 후보 목록을 제공할 수 없고, 장소명·주소·좌표·provider ID는 AI 결과가 아니라 원래 `VerifiedPlace`에서 최종 TravelBlock으로 합성합니다.

네 작업 모두 `@travel-blocks/shared` Zod response schema를 `zod-to-json-schema`로 변환해 Gemini `generationConfig.responseJsonSchema`에 전달합니다. Gemini가 지원하는 JSON Schema subset만 전송하며, unsupported keyword는 제거합니다. 동일한 Zod schema로 응답을 다시 검증하므로 structured output을 application validation의 대체물로 간주하지 않습니다. Ranking은 추가로 unknown/duplicate candidate ID와 5개 초과 선택을 거부하며 empty selection은 허용합니다.

`extractIntent`는 `TravelIntent` Zod schema와 structured output을 사용해 명시적 또는 강하게 뒷받침되는 destination, duration, travelers, budget, preferences, avoidances, mobility, categories만 추출합니다. `GEMINI_INTENT_MODEL`이 있으면 intent task에만 사용하고 없으면 `GEMINI_MODEL`로 fallback합니다.

## AI run observability

Gemini의 각 logical operation은 HTTP retry attempt 수와 무관하게 `extract_intent`, `generate_trip`, `analyze_text`, `rank_places` 중 하나의 lifecycle event를 생성합니다. Event에는 provider, 실제 선택 model, task, success/error status, 전체 latency, provider가 제공한 input/output token 수, 알려진 error code만 포함됩니다. Prompt, 원문 provider response, API key는 포함하지 않습니다. Observer는 callback boundary이므로 `packages/ai`는 PostgreSQL을 import하지 않습니다. Telemetry insert 실패는 sanitized server log에만 기록되고 성공한 AI 결과를 실패시키지 않습니다.

## Free-tier guardrails and safe diagnostics

Production serializes Gemini work with `GEMINI_MAX_CONCURRENCY=1`. `extract_intent` uses `GEMINI_INTENT_TIMEOUT_MS` (30 seconds by default); `rank_places` retains `GEMINI_TIMEOUT_MS` (15 seconds by default); `generate_trip` and `analyze_text` use `GEMINI_LONG_TASK_TIMEOUT_MS` (40 seconds by default) with `GEMINI_LONG_TASK_RETRY_BUDGET_MS` (45 seconds by default).

`extract_intent`, `generate_trip`, and `analyze_text` client timeouts are terminal and are not retried, because inference may already have consumed quota. Retryable 429 and transient 500/502/503/504 responses retain bounded provider-owned retry with valid `Retry-After` preferred over jittered exponential backoff. `rank_places` retains its existing short-task bounded timeout behavior. There is no outer shell or validation retry.

Lifecycle events include provider attempt count and whether a `Retry-After` delay was used. The server journals only safe event metadata before sending the existing persistent fields to observability storage; this requires no database migration.

Invalid structured output is classified as `missing_text`, `json_parse`, or `schema_validation`. Safe metadata may include candidate count, finish reason, text presence, and capped Zod issue codes/paths. Generated text, raw JSON responses, issue values, prompts, API keys, and credentials are never included.

## P1-4 regression quality gate

The provider adapter owns bounded transport retry. Application use cases, domain checks, and the evaluation runner do not wrap provider calls in another retry loop. Long-task client timeouts are terminal because inference may already have consumed quota; retryable 429 and transient 5xx responses use the adapter budget and injected delay in tests. Structured-output failures (`missing_text`, `json_parse`, `schema_validation`) are non-retryable and remain distinct from transport errors. Recommendation retrieval fails closed when any category query has a provider transport failure. All regression fixtures use injected fetches and never record prompts, generated text, raw JSON, provider responses, credentials, or issue values.

## P1-5A task contracts

The Gemini adapter consumes the immutable `AI_TASK_DEFINITIONS` map in `packages/ai/src/tasks.ts`. It is metadata and type contract only; it does not select providers or execute fallback routing.

| Task | Input | Output | Capability | Timeout class | Fallback |
|---|---|---|---|---|---|
| `extract_intent` | `GenerateTripRequestSchema` | `TravelIntentSchema` | `intent_extraction` | `intent` | `fail_explicitly` |
| `generate_trip` | `TripPlanningInputSchema` | `GenerateTripResponseSchema` | `trip_planning` | `long` | `fail_explicitly` |
| `analyze_text` | `AnalyzeTextRequestSchema` | `GenerateTripResponseSchema` | `travel_content_analysis` | `long` | `fail_explicitly` |
| `rank_places` | `PlaceRankingInputSchema` | `PlaceRankingResultSchema` | `place_ranking` | `short` | `fail_explicitly` |

`planTrip(TripPlanningInput)` is the provider operation for the logical `generate_trip` task. `generateTrip(GenerateTripInput)` remains the existing compatibility/convenience method and preserves the public API flow. Ranking candidate semantic refinement, analyze-text source-only normalization, structured-output validation, and observability task names remain unchanged. `AiTaskRouter` obtains one policy decision, validates the chosen registration capability, emits safe routing metadata, and delegates once without prompt construction, parsing, retry, timeout, dedupe, concurrency, grounding, or feasibility work. Router failure handling does not retry, wrap, or convert provider errors.

## P1-5C self-hosted adapter foundation

`SelfHostedTravelAiProvider` is an injectable internal transport adapter. It supports only `extract_intent`, validates the existing task input/output schemas, normalizes timeout/network/HTTP/auth/invalid-output failures to `AiProviderError`, and records only safe lifecycle metadata. `SELF_HOSTED_LLM_ENABLED` is false by default; when enabled, endpoint, model, optional token, and timeout are configuration-only inputs. The internal HTTP transport posts `{ task, model, input }` to `/v1/generate` and expects `{ content: string }`. The inference service is not deployed and tests use fake transport only.

## P1-5D explicit routing policy

`AiRoutingPolicy` returns task, required capability, selected provider, routing mode, reason, self-hosted eligibility, readiness, and selection timestamp. Reasons distinguish the Gemini-only default, non-target task, disabled traffic, unregistered provider, missing capability, unhealthy/unknown readiness, and selected self-hosted. `StaticAiProviderHealthSource` is an injectable deterministic boundary; Router never sends a health request or runs polling. Routing metadata contains no token, authorization header, prompt, raw output, or traveler content. Existing adapter lifecycle events retain provider/model/task/success-or-error/latency metadata, and observer failures do not change a task result.

Gemini selection caused by an ineligible self-hosted provider happens before execution and is not fallback. Once self-hosted is selected, its error propagates unchanged; Gemini is not called. There is no post-execution fallback, failover, parallel/shadow traffic, circuit breaker, cost/latency/quality routing, new capability, public API change, DB migration, or live inference call. P1-5E remains scope/provenance work; P1-5F remains the benchmark/quality gate.
