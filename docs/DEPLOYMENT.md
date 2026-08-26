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
