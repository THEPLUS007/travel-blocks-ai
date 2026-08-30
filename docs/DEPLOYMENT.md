# Deployment


## Runtime

Production과 CI는 Node.js 22 LTS(`>=22.12 <23`)를 사용합니다. `.nvmrc`의 버전으로 local/CI/runtime을 맞춥니다.
## 현재 서버

PostgreSQL은 같은 Ubuntu 호스트의 `127.0.0.1:5432`에서 실행됩니다. code-server는 8080에서 `/proxy/5173/`을 web preview로 전달합니다. web preview는 prefix-relative `/api`를 `127.0.0.1:3000`으로 전달합니다.

## 개발/E2E 전용

```bash
npm run test:server -w @travel-blocks/api
```

이 명령은 메모리 저장소이므로 production에 사용하지 않습니다.

## PostgreSQL production

```bash
cd /home/ubuntu/submission
systemctl status postgresql --no-pager
pg_isready
npm ci
npm run lint
npm run migrate -w @travel-blocks/api
npm run build
npm run start -w @travel-blocks/api
# 별도 터미널
npm run preview -w @travel-blocks/web
```

`migrate` 재실행은 안전하며 적용 내역은 `drizzle.__drizzle_migrations`에 기록됩니다. API는 DB 연결과 migration 성공 후 시작해야 합니다. `/api/v1/health`와 `/api/v1/ready`를 모두 확인하세요.

필수 환경변수는 `DATABASE_URL`입니다. 포트, cookie/proxy 정책, pool timeout은 `.env.example`을 참고합니다. `GEMINI_API_KEY`가 없으면 AI endpoint만 503이며 Mock으로 전환하지 않습니다. `WEB_ORIGIN`은 향후 cross-origin 배포용이며 현재는 same-origin proxy를 사용합니다.

`SIGINT` 또는 `SIGTERM`은 HTTP server와 PostgreSQL pool을 정상 종료합니다. 동일 cookie로 Trip을 생성한 뒤 API를 재시작하고 목록을 조회하면 persistence를 검증할 수 있습니다.

## Test scope and external integration baseline

현재 Playwright app-contract smoke는 실제 frontend service layer와 API contract 및 생성, 추천, 저장, 재조회의 주요 사용자 흐름을 검증합니다. Backend는 in-memory repository와 Test AI/Place provider를 사용하므로 실제 Gemini, Place provider, PostgreSQL 또는 배포 환경을 검증하지 않습니다. 실제 배포 후에는 HTTPS endpoint, production provider, PostgreSQL persistence를 대상으로 별도의 deployment smoke test를 추가해야 합니다.

PostgreSQL integration test는 전용 test database와 명시적인 `DATABASE_URL`이 있을 때만 실행합니다.

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DEDICATED_TEST_DB npm run test:postgres
```

개발·production database나 archive의 credential을 재사용하지 않습니다. 테스트가 만든 데이터는 정리되지만 database 단위 격리를 기본 원칙으로 합니다. 향후 CI에서는 ephemeral PostgreSQL service container를 사용합니다.

Migration은 `npm run migrate -w @travel-blocks/api`로 실행합니다. 실제 deployment DB에서는 migration 전에 복구 가능한 backup을 만들고, migration 후 health/readiness와 동일 session의 Trip persistence를 검증합니다.
