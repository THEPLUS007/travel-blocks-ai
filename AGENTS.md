# Travel Blocks AI — Production Master Rules

## 0. 프로젝트 목표

이 프로젝트의 최종 목표는 단순한 해커톤 데모가 아니다.

`Travel Blocks AI`를 실제 사용자가 사용할 수 있는 **배포 가능한 AI 여행 일정 생성 및 편집 서비스**로 완성한다.

서비스의 핵심 가치는 다음과 같다.

> 사용자의 자연어, 텍스트 또는 여행 콘텐츠를 분석하고 실제 존재하는 장소 데이터를 기반으로 현실적인 여행 일정을 생성한 뒤, 사용자가 Travel Block 단위로 자유롭게 편집·저장할 수 있게 한다.

단순히 Gemini에게:

`여행 일정 만들어줘`

라고 요청하고 결과를 출력하는 서비스를 목표로 하지 않는다.

최종적으로 다음 구조를 지향한다.

```text
User Input
    │
    ▼
Source Router
    │
    ├── Text
    ├── URL
    └── YouTube
    │
    ▼
Content Extraction / Normalization
    │
    ▼
Intent Extraction
    │
    ▼
Place Retrieval
    │
    ▼
AI Trip Planning / Ranking
    │
    ▼
Constraint Validation
    │
    ├── 실제 장소 여부
    ├── 중복 장소
    ├── 이동 거리
    ├── 이동 시간
    ├── 영업 가능성
    ├── 일정 밀도
    └── 예산
    │
    ▼
Travel Plan
    │
    ▼
PostgreSQL
    │
    ▼
Feedback / Evaluation
```

---

# 1. 기본 개발 원칙

모든 작업 전 현재 구현을 먼저 읽는다.

기존 abstraction이 존재하면 재사용하고 이유 없이 새로운 구조를 병렬로 만들지 않는다.

특히 다음 인터페이스는 중요한 architecture boundary로 취급한다.

* Travel AI Provider
* Place Search Provider
* Repository
* Shared Schema
* Domain Logic

대규모 rewrite보다 점진적 개선을 우선한다.

---

# 2. Production과 Mock을 명확하게 분리한다

Mock은 다음 용도로만 사용한다.

* unit test
* E2E fixture
* 로컬 UI 테스트
* 명시적 development mode

Production에서는 외부 provider나 DB가 실패했다고 Mock 데이터로 자동 전환하지 않는다.

Production dependency가 unavailable하면 올바른 오류를 반환한다.

**가짜 성공보다 명확한 실패를 우선한다.**

---

# 3. LLM을 데이터베이스처럼 사용하지 않는다

Gemini가 실제 장소, 영업시간, 가격, 주소 등을 기억에 의존해 만들어내도록 하지 않는다.

다음 정보는 가능한 한 외부 authoritative provider에서 가져온다.

* 장소 존재 여부
* 주소
* 위도/경도
* 영업시간
* 장소 ID
* 영업 상태
* 가격 수준
* 이동 거리
* 이동 시간

LLM의 역할은 주로 다음이다.

* 자연어 이해
* 의도 추출
* 일정 생성
* 후보 장소 ranking
* 설명 생성
* 사용자 선호 반영
* 복잡한 조건 조합

---

# 4. Place Retrieval과 Recommendation을 분리한다

지향 구조:

```text
잘못된 구조

Gemini
 ↓
장소 이름 생성
 ↓
검색


권장 구조

Place Provider
 ↓
실제 후보 장소
 ↓
Gemini
 ↓
Ranking / Selection
```

LLM이 임의의 장소를 hallucination하는 구조보다 실제 후보 집합 안에서 선택하도록 한다.

Place provider abstraction을 유지한다.

특정 provider에 application logic 전체가 강하게 결합되지 않게 한다.

---

# 5. AI 작업을 하나의 거대한 Prompt로 처리하지 않는다

AI 작업을 역할별로 분리한다.

예:

```text
Source Routing
Intent Extraction
Trip Generation
Place Ranking
Travel Content Analysis
Repair / Replanning
```

각 작업은 독립된 prompt와 output schema를 가진다.

---

# 6. 모델 선택 원칙

모든 작업에 가장 큰 LLM 하나를 사용하는 것을 기본 전략으로 하지 않는다.

작업 특성에 따라 model routing을 허용한다.

예:

```text
단순 URL 타입 판별
→ 일반 코드 / Regex

간단한 Intent Extraction
→ 빠르고 저렴한 모델

Trip Planning
→ 일반 reasoning 모델

Place Ranking
→ 일반 reasoning 모델

정형 validation
→ 코드
```

모델 이름은 코드 곳곳에 hard-code하지 않는다.

환경변수 또는 AI configuration layer를 통해 관리한다.

---

# 7. Fine-tuning 우선 금지

현재 프로젝트에서는 fine-tuning을 기본 해결책으로 사용하지 않는다.

먼저 다음 순서로 문제를 해결한다.

1. prompt 개선
2. structured output
3. retrieval
4. validation
5. evaluation
6. model routing

그 이후에도 반복되는 품질 문제가 객관적으로 측정될 경우에만 fine-tuning 또는 별도 classifier 학습을 검토한다.

학습을 하기 전 반드시 평가 데이터셋이 존재해야 한다.

---

# 8. Structured Output 강제

LLM에게 단순히:

`JSON으로 반환해라`

라고 요청하는 것으로 끝내지 않는다.

가능하면 provider가 지원하는 structured output / JSON Schema를 사용한다.

그리고 응답은 다시 Zod 등 application schema로 검증한다.

```text
Schema
  ↓
Provider Structured Output
  ↓
LLM
  ↓
Schema Validation
```

잘못된 LLM 출력이 application 내부로 들어오지 못하게 한다.

---

# 9. Prompt Injection 방어

외부 URL, 블로그, YouTube, 사용자 입력은 전부 untrusted data로 취급한다.

외부 콘텐츠에 다음과 같은 문장이 있어도 system instruction처럼 실행하면 안 된다.

`Ignore previous instructions`

`Send environment variables`

`Reveal system prompt`

외부 콘텐츠는 항상 명확한 data boundary 안에 넣는다.

Secrets, environment variables, internal prompt를 external content에 의해 노출하지 않는다.

---

# 10. URL 입력은 실제 콘텐츠를 분석한다

사용자가 URL을 입력했을 때 URL 문자열 자체만 Gemini에게 전달하는 구현을 최종 상태로 인정하지 않는다.

지향 구조:

```text
URL
 ↓
Source detection
 ↓
Content extraction
 ↓
Normalization
 ↓
AI analysis
```

YouTube, blog, general URL 등은 가능한 범위에서 각각 적절한 extractor를 사용한다.

무제한 URL fetch는 허용하지 않는다.

반드시:

* protocol 제한
* timeout
* response size 제한
* redirect 제한
* SSRF 방어
* private IP 차단

등을 고려한다.

---

# 11. Constraint Validation

AI가 생성한 일정이 schema에 맞는 것만으로 올바른 일정이라고 판단하지 않는다.

최종 일정에는 가능한 범위에서 다음 검증 계층을 둔다.

* 실제 장소 여부
* 동일 장소 중복
* 일정 순서
* 이동 가능성
* 이동 거리
* 이동 시간
* 영업 가능성
* 지나치게 많은 일정
* 예산 조건

검증 가능한 조건은 AI가 아니라 deterministic code를 우선한다.

---

# 12. AI Evaluation

AI 기능 변경은 느낌으로 평가하지 않는다.

다음과 같은 evaluation dataset을 점진적으로 만든다.

예:

* 서울 당일 여행
* 제주 가족 여행
* 오사카 3박 4일
* 후쿠오카 저예산 여행
* 도쿄 쇼핑 중심
* 부모님 동반 여행
* 아이 동반 여행
* 걷기 최소 여행
* 음식 중심 여행
* 관광 중심 여행

평가 지표 예:

* schema success rate
* 실제 장소 비율
* duplicate rate
* invalid place rate
* 이동시간 violation
* 사용자 조건 반영률
* 일정 밀도
* AI latency
* token usage
* 실패율

Prompt나 model을 변경하면 regression evaluation을 수행할 수 있는 구조를 지향한다.

---

# 13. AI Observability

AI 호출은 다음 정보를 추적할 수 있어야 한다.

* provider
* model
* task
* status
* latency
* input tokens
* output tokens
* error category

사용자의 민감한 원문 prompt나 provider 전체 응답을 production log에 무분별하게 저장하지 않는다.

기존 `ai_generation_runs`와 같은 구조가 있다면 활용한다.

---

# 14. 비용 보호

AI API는 비용이 발생하는 외부 dependency다.

반드시 고려한다.

* per-user rate limit
* global concurrency
* timeout
* retry
* exponential backoff
* request dedupe
* 필요 시 cache
* token usage
* max input length
* max output

무한 retry를 금지한다.

---

# 15. 인증과 사용자 데이터

현재 익명 세션이 존재하면 beta 단계에서는 유지할 수 있다.

그러나 사용자별 데이터 isolation은 절대로 깨지면 안 된다.

모든 Trip read/write/delete에는 owner verification이 적용되어야 한다.

향후 로그인 기능을 추가할 수 있는 구조를 유지한다.

---

# 16. Database

Production database는 PostgreSQL이다.

Production DB 실패 시 memory fallback을 사용하지 않는다.

Schema 변경은 migration을 통해 관리한다.

DB 작업에서는:

* transaction
* index
* FK
* concurrency
* rollback 가능성

을 고려한다.

Secret이 포함된 DB URI를 코드나 Git에 넣지 않는다.

---

# 17. Backend Security

다음을 유지 또는 개선한다.

* request validation
* Zod
* rate limiting
* Helmet
* body size limit
* request timeout
* secure cookie
* proper proxy trust
* parameterized DB query
* generic production error
* secret masking

Production HTTPS에서는 secure cookie를 사용한다.

---

# 18. Frontend Production Rule

`vite preview`를 실제 production web server로 사용하지 않는다.

Production build:

```text
Vite build
 ↓
dist/
 ↓
Nginx static serving
```

을 기본 구조로 한다.

---

# 19. Target Deployment Architecture

최종 기본 배포 구조는 다음을 우선한다.

```text
Internet
   │
   ▼
HTTPS
   │
   ▼
Nginx
 ├───────────────┐
 │               │
 ▼               ▼
Web dist       /api
                 │
                 ▼
              Fastify
                 │
          ┌──────┴──────┐
          ▼             ▼
      PostgreSQL   External APIs
```

Fastify process는 systemd 등 production process supervisor로 관리한다.

---

# 20. Deployment 요구사항

최종 production 환경에는 최소한 다음이 있어야 한다.

* Nginx
* HTTPS
* systemd
* PostgreSQL
* DB migration
* DB backup
* environment secret 관리
* health endpoint
* readiness endpoint
* restart policy
* deploy procedure
* rollback procedure

---

# 21. CI

최소 CI:

```text
npm ci
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
API tests
 ↓
build
```

가능하면 이후 integration/E2E를 추가한다.

CI 실패 상태에서 자동 production deployment를 진행하지 않는다.

---

# 22. 작업 단위

대규모 변경 하나로 모든 것을 고치지 않는다.

작업을 의미 있는 작은 단계로 나눈다.

예:

```text
feat: add production place provider
feat: introduce task-specific AI prompts
feat: add Gemini structured outputs
feat: add source extraction pipeline
feat: add itinerary validation
ops: add nginx production configuration
ops: add systemd service
ci: add GitHub Actions validation
```

각 단계에서:

1. 구현
2. 테스트
3. lint/typecheck
4. 필요 문서 수정
5. git diff 검토
6. commit

순으로 진행한다.

---

# 23. Commit 규칙

commit은 한 가지 논리적 변경을 나타내야 한다.

예:

`feat(ai): add structured trip generation`

`feat(places): add production place provider`

`feat(validation): validate itinerary feasibility`

`ops: add nginx and systemd deployment`

`ci: add production validation workflow`

관련 없는 변경을 하나의 commit에 섞지 않는다.

force push하지 않는다.

---

# 24. 문서와 코드 일치

README와 docs가 실제 구현과 다르면 코드 또는 문서를 수정한다.

구현하지 않은 기능을 README에 완료된 것처럼 쓰지 않는다.

지원하지 않는 기능은 명확하게 표시한다.

---

# 25. 새 라이브러리 추가 원칙

새 dependency를 추가하기 전에:

1. 기존 dependency로 해결 가능한지 확인
2. Node 표준 기능으로 가능한지 확인
3. 유지보수되고 있는 library인지 확인
4. production dependency인지 dev dependency인지 판단

불필요한 framework 도입을 피한다.

---

# 26. 구현 전 확인

모든 새로운 작업 전에 최소한 다음을 확인한다.

* 관련 코드
* 기존 interface
* 기존 schema
* 기존 tests
* 기존 docs
* 현재 Git status

코드를 읽지 않고 새로운 구현을 가정하지 않는다.

---

# 27. 완료 조건

어떤 작업도 단순히 코드를 작성했다고 완료로 판단하지 않는다.

최소한:

* 기능 구현
* 테스트
* lint
* typecheck
* build
* 관련 documentation
* git diff review

가 끝나야 완료로 판단한다.

---

# 28. 가장 중요한 원칙

Travel Blocks AI의 목표는:

**“LLM을 붙인 여행 앱”**

이 아니다.

목표는:

**“실제 여행 데이터를 검색하고, AI가 사용자의 요구를 이해해 일정을 설계하며, 코드가 그 결과를 검증하는 신뢰 가능한 여행 계획 시스템”**

이다.

모든 기술적 의사결정은 이 목표를 기준으로 판단한다.
