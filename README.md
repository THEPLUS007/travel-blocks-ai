# Travel Blocks AI

Day와 Travel Block 단위로 여행 일정을 편집하고 PostgreSQL에 영구 저장하는 React/Fastify 서비스입니다. 해커톤 원본은 `hackathon-submission-2026-07-10` 태그에 보존돼 있습니다.

## 지원 기능

- Day/Block 생성·수정·삭제·복사·이동·정렬과 교통 연결
- PostgreSQL Trip CRUD, version 기반 optimistic concurrency, transaction 저장
- 서버 발급 httpOnly 익명 세션과 사용자별 Trip 격리
- Gemini adapter 기반 일정 생성·텍스트 분석·추천
- provider 검증 장소만 추천 블록으로 반환
- 저장하지 않은 변경 경고와 내보내기

YouTube 자막/블로그 크롤링, 상용 장소 provider, 로그인 UI, 예약·결제는 지원하지 않습니다. production AI 실패는 Mock 일정이 아니라 503 오류입니다.

## 개발 및 E2E

```bash
npm ci
npm run test:server -w @travel-blocks/api
npm run dev:web
```

`test:server`는 메모리 저장소와 test provider만 사용합니다.

## PostgreSQL production

실제 값은 Git에서 무시되는 root `.env` 또는 서버 환경변수에만 설정합니다.

```bash
npm ci
npm run migrate -w @travel-blocks/api
npm run build
npm run start -w @travel-blocks/api
# 별도 터미널
npm run preview -w @travel-blocks/web
```

- `GET /api/v1/health`: process liveness
- `GET /api/v1/ready`: PostgreSQL readiness
- DB 연결 실패 시 시작을 중단하며 Memory repository로 전환하지 않습니다.
- 현재 HTTP proxy는 `COOKIE_SECURE=false`, HTTPS 운영은 `COOKIE_SECURE=true`를 사용합니다.
- Gemini key가 없으면 CRUD는 동작하지만 AI endpoint는 503을 반환합니다.

## 검증 명령

깨끗한 clone의 공식 baseline 검증은 다음 두 명령입니다. `npm test`도 필요한 내부 workspace package를 먼저 빌드하므로 독립 실행할 수 있습니다.

```bash
npm ci
npm run verify
```

`verify`는 lint, typecheck, unit/API/MCP test, application build를 순서대로 실행합니다. 외부 환경이 필요한 검증은 별도입니다.

```bash
npm run test:postgres  # 전용 PostgreSQL과 DATABASE_URL 필요
npm run test:e2e      # Playwright Chromium 필요
```

상세 내용은 [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Data Model](docs/DATA_MODEL.md), [Security](docs/SECURITY.md), [Deployment](docs/DEPLOYMENT.md)를 참고하세요.
