# Travel Blocks AI

Day와 Travel Block 단위로 여행 일정을 편집하고 PostgreSQL에 영구 저장하는 React/Fastify 서비스입니다. 해커톤 원본은 `hackathon-submission-2026-07-10` 태그에 보존돼 있습니다.

## Runtime

이 저장소는 Node.js 22 LTS를 사용합니다. 지원 범위는 `>=22.12 <23`이며 `.nvmrc`에 검증 기준 patch 버전을 기록합니다.

## 지원 기능

- Day/Block 생성·수정·삭제·복사·이동·정렬과 교통 연결
- PostgreSQL Trip CRUD, version 기반 optimistic concurrency, transaction 저장
- 서버 발급 httpOnly 익명 세션과 사용자별 Trip 격리
- Gemini adapter 기반 일정 생성·텍스트 분석·추천
- task별 prompt, Gemini JSON Schema structured output, Zod 재검증
- structured TravelIntent 추출과 task별 optional model routing
- provider 검증 장소만 추천 블록으로 반환
- Google Places API (New) server-side Text Search와 Place Details
- SSRF 방어가 적용된 public HTML/text source 분석
- 저장하지 않은 변경 경고와 내보내기

YouTube 자막 추출, 다중 장소 provider 선택, 로그인 UI, 예약·결제는 지원하지 않습니다. production AI 실패는 Mock 일정이 아니라 503 오류입니다.

## 개발 및 E2E

```bash
npm ci
npm run test:server -w @travel-blocks/api
npm run dev:web
```

`test:server`는 메모리 저장소와 test provider만 사용합니다.

## Production

Node 22에서 build한 API는 non-root systemd service로 `127.0.0.1:3000`에 bind하고, web `apps/web/dist`는 별도 release 디렉터리로 배포하여 Nginx가 HTTPS same-origin으로 제공합니다. `vite preview`와 web `serve` script는 로컬/Playwright 전용입니다.

[Deployment runbook](docs/DEPLOYMENT.md)에 stable Node runtime, systemd, Nginx/HTTPS, DB backup/restore, deployment/rollback 절차가 있습니다. Repository template은 실제 host에 자동 설치되지 않습니다. `.github/workflows/ci.yml`은 Quality, app-contract E2E, ephemeral PostgreSQL backup/restore integration을 검증하며 production 자동 배포나 live billing API 호출은 하지 않습니다.

- `GET /api/v1/health`: process liveness
- `GET /api/v1/ready`: PostgreSQL readiness
- DB 실패 시 Memory repository로 전환하지 않습니다.
- HTTPS 운영은 `COOKIE_SECURE=true`, 신뢰할 수 있는 Nginx 뒤에서는 `TRUST_PROXY=true`입니다.
- Gemini/Google Places key가 없으면 해당 provider 기능은 503을 반환하며 CRUD는 사용할 수 있습니다.

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
