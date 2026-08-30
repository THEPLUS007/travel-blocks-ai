# Data model

- User 1:N Trip
- Trip 1:N TravelDay, TravelSource, AiGenerationRun
- TravelDay 1:N TravelBlock, TravelConnection

모든 테이블은 UUID와 `createdAt`, `updatedAt`을 갖습니다. Trip은 optimistic concurrency용 `version`을 가집니다. Day/Block/Connection 교체 저장은 한 transaction에서 수행되며 FK는 `ON DELETE CASCADE`입니다. 브라우저의 Day/Block ID는 `client_id`로 보존하고 DB 관계에는 UUID를 사용합니다.

`ai_generation_runs`는 AI logical operation마다 provider, model, task, status, latency, input/output token 수와 오류 코드만 저장합니다. 생성 시점에는 저장된 Trip이 없을 수 있으므로 `trip_id`는 nullable이며 fake ID를 만들지 않습니다. Migration `0002_ai_run_observability.sql`은 기존 row를 `task=legacy`, `latency_ms=0`으로 backfill한 뒤 두 column을 NOT NULL로 전환합니다.
