# 중복 코드 및 복잡도 정리 감사

검사·정리일: 2026-10-29 UTC. 시작 커밋: `857e12fbd798abd3420cf9bb637e42e962e72e76`. 시작 작업 트리는 clean이었습니다.

## 확인 및 수정

| 발견 사항 | 근거 | 정리 |
|---|---|---|
| 구형 Gemini 클라이언트 | private AI 패키지의 public entrypoint에서 export하지 않고 저장소 import·사용처 없음. 현재 `GeminiTravelAiProvider`와 별도 retry/queue 구현 | `packages/ai/src/legacyGeminiClient.ts` 및 해당 ignored 빌드 잔여물 제거 |
| 해커톤 타입의 중복 정의 | `travel.ts`는 shared 타입을 재사용하며 `travel.hackathon.ts` 참조 없음 | 사용하지 않는 복제 타입 제거 |
| 이전 mock 재export 파일 | 실제 mock adapter는 `travelTestData.ts`를 직접 사용하며 `travelMockData.ts` 참조 없음 | 재export 파일 제거, development mock과 fixture 원본 유지 |
| 분석 서비스 전달 래퍼 | `travelAnalysisService.ts`는 다른 함수를 전달할 뿐이고 사용처 없음 | 래퍼 제거 |
| 두 Decision HTTP 클라이언트의 전송 처리 반복 | 요청 검증·POST·same-origin·JSON 파싱·오류/취소 분류가 동일 | `decisionHttpClient.ts`로 통합. 각 endpoint의 strict schema·semantic parser·안전한 한국어 오류 문구는 endpoint adapter가 유지 |
| editor/domain 날짜 번호 함수 중복 | 두 `renumberDays` 구현이 동일 | 기존 `@travel-blocks/domain` 구현 재사용 |
| 큰 일정 편집 훅의 역할 혼합 | React 상태/요청 흐름과 이동·복제 변환 함수가 한 파일에 존재 | 변환 함수를 `utils/travelPlanEditing.ts`로 이동. 훅 839 → 736줄, 동작 유지 |
| 연결 검사 반복 복사 | 조회만 하면서 배열을 복사하고 이미 찾은 source를 다시 검색 | 원본을 변경하지 않고 직접 조회. 공개 copy helper의 기존 계약 유지 |
| verify의 동일 검사 2회 실행 | root `typecheck`가 root `lint`와 같은 workspace 명령 | verify에서 중복 호출 1회 제거. workspace TypeScript 검사·web `tsc -b`·ESLint·테스트·빌드 유지. standalone typecheck alias 유지 |
| 한 줄에 압축된 여행 API 서비스 | timeout, session, 저장 요청이 읽기 어려운 형태로 압축 | `realTravelApi.ts`, `travelApi.ts`를 읽기 쉬운 형태로 정리. 함수/timeout/mock 선택/오류 동작 유지 |

사용되지 않는 소스 4개, 합계 469줄을 제거했습니다. 이는 전체 diff 순감소나 번들 크기 감소를 뜻하지 않습니다. 테스트·설명·읽기 쉬운 서식은 추가됐습니다. 사용자 체감 속도나 LLM 지연 개선을 측정했다고 주장하지 않습니다.

## 유지한 경계와 남은 복잡도

- production과 development mock은 의도된 별도 구현이며 통합하지 않았습니다. 실패 시 mock으로 전환하지 않습니다.
- provider candidate discovery와 recommendation preview는 서로 다른 계약입니다. API의 실제 검색 구현은 이미 `retrieveRecommendationCandidates`를 공유하고 있어 새 retrieval 계층을 만들지 않았습니다.
- UI 연결 규칙은 바로 다음 블록/중복 연결까지 검사하고, domain 연결 검사는 참조 무결성을 검사합니다. 이름이 같아도 계약이 달라 강제로 합치지 않았습니다.
- web/local block movement와 domain `moveBlock`은 invalid target 및 reorder 경계 동작이 달라 무조건 교체하지 않았습니다.
- 일반 Trip API의 timeout/exception 계약과 Decision API의 discriminated result/caller AbortSignal 계약도 다릅니다. 일반 API를 Decision transport로 강제로 통합하지 않았습니다.
- `useTravelPlanner`는 여전히 AI 요청, 저장, 선택 상태와 drag/drop 상태를 함께 소유합니다. 다음 정리는 상태 전이 테스트를 기반으로 저장 흐름과 AI 흐름을 단계적으로 분리하는 것이 적절합니다. 이번 작업으로 저장소 전체의 모든 복잡도가 없어졌다고 주장하지 않습니다.

## 검증

- PASS: 최종 `npm run verify` — lint, workspace TypeScript 검사, unit/API/MCP tests, packages/apps build, web TypeScript build.
- PASS: web 37 tests. 기존 9개에 endpoint transport 회귀 20개, 연결 규칙 3개, 편집 변환 5개 추가.
- PASS: 전체 Vitest 326 tests + MCP suite.
- PASS: `npm run eval` — 8/8 시나리오, 98/98 checks.
- PASS: Chromium E2E — 생성, 추천, 저장, 재열기, 연결, 새로고침, 후보 discovery/Decision UI 기존 흐름.
- E2E는 기존 설정을 기반으로 `/tmp`의 임시 설정에서 fake-provider API `127.0.0.1:33001`과 preview `127.0.0.1:5174`를 사용했습니다. production `3000`을 중단·재시작하거나 production API로 fixture를 보내지 않았습니다. 임시 설정의 module 경로/ESM 형식을 바로잡은 후 통과했습니다.
- PASS: `git diff --check`, 운영 `3000/api/v1/health` 응답 유지.
- 이번 변경에서 외부 AI/Places/Routes 호출, DB migration, 모델 변경, dependency 추가, 운영 배포·재시작·remote push 없음.
- PostgreSQL integration과 remote CI, live provider 품질, npm registry 보안 감사는 이번 유지보수에서 새로 실행하지 않았습니다. 기존 기록을 새 검증 결과로 주장하지 않습니다.

P2-DE-6 구현 상태와 기능 로드맵은 변경하지 않았습니다.
