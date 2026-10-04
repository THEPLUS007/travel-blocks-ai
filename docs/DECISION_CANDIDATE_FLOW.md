# Decision candidate discovery flow (P2-DE-5A)

## Why this boundary exists

Before P2-DE-5A, `/api/v1/ai/recommendations` retrieved provider candidates, ranked them, and immediately composed `TravelBlock` previews. The browser received only those previews, so it could not truthfully call the Decision API without treating a preview or final itinerary block as a new candidate.

`TravelBlock` remains an editable/final itinerary aggregate. A discovery candidate is a provider-backed, pre-decision transport value. A candidate is not a block, does not contain time/day/memo, and has no decision state, fact snapshot, score, provenance, or raw provider payload.

## Contract and endpoint

`@travel-blocks/decision-api-contract` owns these strict V1 schemas:

- `decision_candidate_discovery_request_v1`
- `decision_candidate_discovery_response_v1`
- `decision_candidate_discovery_error_v1`

`POST /api/v1/decision-candidates/discover` accepts normalized trip context, categories/preferences/avoidances, and a bounded candidate limit. It uses the shared `DECISION_API_MAX_CANDIDATES` cap. There is no unversioned alias.

The response has a server-generated candidate-set ID, echoed normalized context/constraints, canonical `candidate_id_ascending` order, and safe candidates containing only a stable candidate ID, provider-neutral reference, display name, optional address, and category. Empty candidate sets are successful responses. Duplicate provider references are removed; category transport failures fail closed rather than being converted to partial results.

## Runtime flow

```text
RecommendationPanel → “장소 후보 검토하기”
  → candidate discovery
  → strict candidate-set validation
  → empty check
  → POST /api/v1/decisions/evaluate
  → strict Decision Result validation and candidate join
  → ConsideredPlacesPanel
```

The existing recommendation endpoint and preview/add flow remain separate and unchanged. Discovery never composes a `TravelBlock`; rejected/unresolved candidates never become blocks. The current P2-DE-5 path displays the Decision Result only, so `selected` is labelled `일정에 포함할 장소`, not as a saved or completed itinerary block. A user must still use the existing preview/add flow to create a `TravelBlock`.

Candidate sets and Decision Results are in-memory UI state only. They are not stored in Trip, TravelBlock, browser storage, PostgreSQL, or a snapshot; refresh loses them. P2-DE-6 owns snapshots/evaluation. P3 service/Docker remains unimplemented.

## Safety and verification

The web starts no discovery on render. The review state machine is `idle → discovering_candidates → evaluating_decision → success|empty|error`; duplicate clicks share one active request, retries are explicit/retryable-only, a changed request resets old results, and unmount aborts the request. Candidate discovery and decision errors have distinct safe Korean copy.

Tests use fake providers and route-intercepted fixtures only. No Gemini, Places, Routes, self-hosted, or other live provider is called.
