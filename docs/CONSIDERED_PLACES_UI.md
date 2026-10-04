# Considered-place UI preparation (P2-DE-5)

## Current status

The reusable UI, strict browser client, and contract are implemented, but **P2-DE-5 is not complete**. The current web application has no provider-backed, pre-decision candidate set that it can truthfully submit to the Decision API.

`POST /api/v1/ai/recommendations` retrieves up to 40 provider candidates only on the server, ranks them there, and returns already-composed `TravelBlock` recommendation previews to the browser. A user click turns one preview into an itinerary block. The browser never receives the original candidate IDs/reference set. Recasting returned previews or existing `TravelBlock` values as decision candidates would incorrectly evaluate a final itinerary/recommendation artifact and violate the P2 candidate boundary.

The closest safe composition seam is the optional `decisionReview` slot in `RecommendationPanel`. It intentionally remains unused until a route exposes a real provider-backed candidate set and an explicit decision action.

## User-facing contract

When a future real candidate flow is available, the panel title is:

> 일정 생성 과정에서 함께 검토한 장소

It receives only a validated `decision_api_response_v1`, joins `response.candidates` and `decisionResult.decisions` by `candidateId`, and presents three mutually exclusive states:

- `selected` — 일정에 포함
- `rejected` — 이번 일정에서는 제외
- `unresolved` — 정보 확인 필요

The browser does not generate decision states, scores, facts, or reasons. A missing/duplicate/unknown join fails closed with a safe error rather than rendering a partial result. Internal IDs, provider references, policy data, raw score, raw reason code, raw response, provider/model data, timestamps, and AI reasoning are not placed in the view model or DOM.

## Safe copy boundaries

`apps/web/src/features/consideredPlaces/model.ts` owns the exhaustive Korean `REASON_COPY` table keyed by the shared `DecisionReasonCode`. Its mapping is product copy, not a new decision policy or reason enum. The same module exhaustively maps API-wide coverage (`complete`, `partial`, `unknown`, `unavailable`) and safe judge skip summaries.

Coverage describes the whole response's information state; it is not a claim about a single place. An applied judge is described only as considering input preference conditions. A skipped judge is described as use of basic criteria without exposing technical skip reason, provider, model, or API status.

## Trust and persistence boundaries

`장소 확인됨` remains a separate P1-6 badge meaning that a `TravelBlock` has a provider identity connection. It does not mean the place is selected by a Decision Result, open, suitable, or AI-approved. Conversely, decision status does not create or change a verification badge.

`selected`/`rejected`/`unresolved` review data is in-memory only when a future flow composes `useDecisionReview`; it is never added to `Trip`, `TravelBlock`, localStorage, IndexedDB, PostgreSQL, or the Trip save payload. Refreshing loses it. P2-DE-6 will own snapshots and decision evaluation. P3 service/Docker work remains unimplemented.

## Verification

The web mapper/client tests use deterministic fixtures only; no Gemini, Places, Routes, self-hosted, or other provider call is made. The fixture covers one selected, one rejected, and one unresolved candidate, safe reason copy, partial coverage, disabled judge copy, invalid join fail-closed behavior, invalid JSON/schema response behavior, strict error parsing, retryability, and abort handling. The component is rendered to static markup for heading/state/internal-data assertions.
