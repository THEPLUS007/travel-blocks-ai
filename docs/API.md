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

Place provider 오류는 raw Google payload나 API key 없이 다음 application code로 변환합니다: rate limit은 `PLACE_PROVIDER_RATE_LIMIT`/429, 미설정·인증·timeout·network·provider 장애는 `PLACE_PROVIDER_UNAVAILABLE`/503입니다. 검색 결과 없음은 정상 빈 배열이며 Place Details의 없는 ID는 404입니다.

`POST /ai/analyze-source`는 `{ "input": "text or URL" }`을 받아 server-side로 text, HTTP(S) URL, YouTube URL을 판별합니다. Text는 정규화 후 분석하고 public URL은 안전한 extractor를 사용합니다. YouTube transcript provider는 아직 없으므로 `SOURCE_UNSUPPORTED`를 반환합니다. Source 오류는 `SOURCE_INVALID`, `SOURCE_UNSUPPORTED`, `SOURCE_FETCH_TIMEOUT`, `SOURCE_TOO_LARGE`, `SOURCE_CONTENT_TYPE_UNSUPPORTED`, `SOURCE_UNSAFE_URL`, `SOURCE_EMPTY`, `SOURCE_UNAVAILABLE`로 구분합니다.
