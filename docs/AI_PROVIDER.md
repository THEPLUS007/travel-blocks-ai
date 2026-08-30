# AI provider

`TravelAiProvider`는 `generateTrip`, `analyzeText`, `recommendPlaces`를 정의합니다. Gemini 구현은 server-only API key, timeout, retry, concurrency 제한, 동일 요청 dedupe, 오류 분류, Zod 출력 검증, usage callback을 제공합니다.

기본 모델은 2026-07-09 공식 모델 문서에서 stable로 안내된 `gemini-3.5-flash`이며 `GEMINI_MODEL`로 고정 모델을 교체할 수 있습니다. 사용자 입력은 `<user_data>` 경계 안 데이터로 전달합니다. 원문 prompt/provider response는 production log에 기록하지 않습니다. URL은 가져오지 않습니다.

production provider 실패 시 Mock 일정이 아니라 `AI_PROVIDER_UNAVAILABLE`과 `retryable`을 반환합니다.

AI 작업은 `generateTrip`, `analyzeTravelContent`, `rankPlaces` 전용 prompt builder로 분리됩니다. system instruction과 JSON 직렬화된 `<user_data>`를 별도로 전달하며, user data 내부 지시는 실행하지 않고 secret·환경변수·내부 prompt를 노출하지 않도록 명시합니다. `analyzeText`는 text만 분석하며 URL을 가져오지 않습니다.

추천은 Place provider가 서버 내부에서 검증 후보를 검색한 뒤 AI가 후보 ID와 이유만 선택합니다. 클라이언트는 후보 목록을 제공할 수 없고, 장소명·주소·좌표·provider ID는 AI 결과가 아니라 원래 `VerifiedPlace`에서 최종 TravelBlock으로 합성합니다.
