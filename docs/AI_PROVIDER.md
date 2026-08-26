# AI provider

`TravelAiProvider`는 `generateTrip`, `analyzeText`, `recommendPlaces`를 정의합니다. Gemini 구현은 server-only API key, timeout, retry, concurrency 제한, 동일 요청 dedupe, 오류 분류, Zod 출력 검증, usage callback을 제공합니다.

기본 모델은 2026-07-09 공식 모델 문서에서 stable로 안내된 `gemini-3.5-flash`이며 `GEMINI_MODEL`로 고정 모델을 교체할 수 있습니다. 사용자 입력은 `<user_data>` 경계 안 데이터로 전달합니다. 원문 prompt/provider response는 production log에 기록하지 않습니다. URL은 가져오지 않습니다.

production provider 실패 시 Mock 일정이 아니라 `AI_PROVIDER_UNAVAILABLE`과 `retryable`을 반환합니다.
