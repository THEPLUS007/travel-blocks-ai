# Data model

- User 1:N Trip
- Trip 1:N TravelDay, TravelSource, AiGenerationRun
- TravelDay 1:N TravelBlock, TravelConnection

모든 테이블은 UUID와 `createdAt`, `updatedAt`을 갖습니다. Trip은 optimistic concurrency용 `version`을 가집니다. Day/Block/Connection 교체 저장은 한 transaction에서 수행되며 FK는 `ON DELETE CASCADE`입니다. 브라우저의 Day/Block ID는 `client_id`로 보존하고 DB 관계에는 UUID를 사용합니다.
