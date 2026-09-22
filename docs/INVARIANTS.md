# Travel Blocks AI Invariants

이 문서는 구현 방식이나 현재 진척도가 아니라, 모든 단계에서 반드시 지켜야 하는 제품·데이터 불변 규칙을 정의합니다.

- 작업 절차는 루트 `AGENTS.md`를 따릅니다.
- 실제 구현 상태는 `CURRENT_STATUS.md`를 따릅니다.
- 미래 작업의 범위와 순서는 `ROADMAP.md`를 따릅니다.
- 현재 구조의 세부 설명은 `ARCHITECTURE.md`와 관련 주제 문서를 따릅니다.

## 1. Trust boundaries

1. **Provider fact, AI inference, deterministic assessment를 구분합니다.**
   - Provider fact: 장소 ID, 좌표, 주소, 영업시간처럼 authoritative provider가 반환한 사실
   - AI inference: 의도, 선호, 순위, 설명, 일정 구성처럼 모델이 추론하거나 생성한 결과
   - Deterministic assessment: 스키마, 참조 무결성, 거리, 영업 가능성, 일정 밀도처럼 코드가 재현 가능하게 판정한 결과

2. **LLM을 factual database로 사용하지 않습니다.** 실제 장소와 현실 세계의 사실은 가능한 한 authoritative data provider에서 가져옵니다.

3. **AI는 provider fact를 임의로 만들거나 변경할 수 없습니다.** 최종 이름, 주소, 좌표, category, provider ID는 검증된 provider 원본으로 canonicalize합니다.

4. **Deterministic하게 검증할 수 있는 조건은 LLM 판정으로 대체하지 않습니다.** AI planning 이후 application/domain 계층이 독립적으로 검증합니다.

5. **Data provider와 LLM provider는 별도 abstraction입니다.** 현실 세계의 사실을 조회하는 provider routing과 모델 실행을 선택하는 LLM routing을 하나의 manager로 합치지 않습니다.

## 2. Provenance and data quality

6. **중요한 provider fact는 출처를 추적할 수 있어야 합니다.** 최소한 provider, provider place ID, source, `retrievedAt`을 보존하거나 결과와 연결할 수 있어야 합니다.

7. **불완전한 데이터는 완전한 데이터처럼 표현하지 않습니다.** 누락·오래된 정보·검증 불가·부분 실패는 `unknown`, `caution`, coverage, quality flag 같은 명시적 상태로 전달합니다.

8. **정보가 없다는 사실은 성공적인 `unknown`일 수 있습니다.** 예를 들어 정상적인 장소 상세 조회에 영업시간이 없으면 값을 추측하거나 provider 실패로 위장하지 않습니다.

9. **Provider raw response 전체를 영구 저장하거나 로그에 남기지 않습니다.** application이 필요한 최소 정규화 형태와 안전한 provenance/quality metadata만 사용합니다.

## 3. AI execution

10. **AI task는 명시적인 input/output contract를 가집니다.** 모든 AI output은 provider의 structured output 사용 여부와 관계없이 application의 Zod schema 및 semantic validation을 통과해야 합니다.

11. **AI provider 교체가 domain/application contract를 바꾸지 않아야 합니다.** Gemini, self-hosted LLM 또는 미래 provider는 동일한 task boundary 뒤에 위치합니다.

12. **AI에게는 task 수행에 필요한 최소 scope만 제공합니다.** 다른 사용자 데이터나 관련 없는 Trip/Day/history를 암묵적으로 포함하지 않습니다.

13. **중요한 AI 실행은 안전한 metadata로 추적 가능해야 합니다.** provider, model, task, status, latency, token usage, fallback 여부, scope/source 식별자를 기록할 수 있어야 하며 prompt 원문, provider raw response, secret은 기록하지 않습니다.

14. **Fallback은 task별 명시적 정책입니다.** 품질 계약을 충족하지 못하는 provider로 무조건 성공 처리하지 않으며, 허용되지 않은 경우 명확하게 실패합니다.

15. **Self-hosted라는 이유만으로 production routing을 허용하지 않습니다.** 고정 평가셋에서 schema success, task 품질, latency, failure behavior 기준을 통과해야 합니다.

## 4. Failure and persistence

16. **Production dependency 실패를 Mock 성공으로 숨기지 않습니다.** Mock은 test fixture, 로컬 UI 테스트, 명시적 development mode에서만 사용합니다.

17. **Production PostgreSQL 실패 시 memory repository로 fallback하지 않습니다.** 저장 성공 여부와 사용자에게 보이는 결과가 달라져서는 안 됩니다.

18. **부분 실패는 관찰 가능하고 결정적이어야 합니다.** timeout, quota, 일부 candidate 누락, provider unavailable을 조용히 삼키지 않으며, 정책에 따라 실패·부분 결과·경고 중 하나로 일관되게 처리합니다.

19. **Retry는 유한하고 소유 계층이 명확해야 합니다.** 중첩 retry와 무한 retry를 금지하며 timeout budget, idempotency, 비용을 함께 고려합니다.

## 5. Security and ownership

20. **사용자 데이터 isolation을 깨지 않습니다.** 모든 Trip read/write/delete는 owner verification을 통과해야 합니다.

21. **외부 콘텐츠와 사용자 입력은 untrusted data입니다.** prompt instruction과 data를 분리하고, SSRF·prompt injection·secret 노출 방어를 유지합니다.

22. **Secret과 민감한 원문은 코드, Git, 응답, 일반 application log에 포함하지 않습니다.** `.env`는 추적하지 않고 `.env.example`만 계약으로 관리합니다.

## 6. Truthful delivery

23. **현재 구현과 목표 구조를 문서에서 구분합니다.** 구현되지 않았거나 배포되지 않은 기능을 완료 또는 운영 중인 것으로 기록하지 않습니다.

24. **완료는 검증 증거를 요구합니다.** 관련 test, lint, typecheck, build, evaluation과 문서 정리가 끝나지 않은 변경을 완료로 표시하지 않습니다.

25. **P1의 품질 검증은 외부 호출 없이 재현 가능해야 합니다.** live provider 검증은 별도의 명시적 절차이며 기본 CI와 deterministic evaluation에 섞지 않습니다.
