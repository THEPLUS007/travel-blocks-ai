# API

모든 제품 API는 `/api/v1` prefix를 사용합니다.

- `GET /health`: process liveness
- `GET /ready`: PostgreSQL `SELECT 1` readiness; 실패 시 503
- `POST /trips`, `GET /trips`, `GET /trips/:tripId`, `PATCH /trips/:tripId`, `DELETE /trips/:tripId`
- `POST /ai/generate-trip`, `POST /ai/analyze-text`, `POST /ai/recommendations`
- `GET /places/search`, `GET /places/:placeId`

Trip 생성은 `{ trip, days, connections }`, 수정은 여기에 현재 `version`을 추가합니다. 충돌은 409, 다른 사용자 또는 없는 Trip은 404입니다. body limit는 64 KiB입니다.

오류 계약:

```json
{"error":{"code":"ERROR_CODE","message":"사용자 메시지","retryable":false,"requestId":"..."}}
```
