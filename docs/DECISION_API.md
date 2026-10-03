# Versioned Decision API

`POST /api/v1/decisions/evaluate` is the P2-DE-4 application boundary. There is no unversioned alias.

The strict `decision_api_request_v1` accepts only stable candidate IDs, provider references, normalized trip context/preferences/categories, and an optional policy-compatible selection limit. It does not accept factual provenance/timestamps, facts, scores, result IDs, decision state, provider/model selection, or judge-force flags. Server code resolves provider-backed display/category data, creates IDs/timestamps, runs enrichment, and constructs the P2 decision request.

The strict `decision_api_response_v1` includes server request/decision/result IDs, policy identity, safe display candidates, factual coverage, the validated `DecisionResultV1`, and only an `applied` or typed `skipped` judge outcome. Public AI provenance, prompts, completions, provider payloads/endpoints, headers, tokens, and reasoning are excluded. Errors use `decision_api_error_v1` with only a safe category/message/retryability/request ID.

## Orchestration

```text
HTTP V1 request → DecisionApplicationServiceV1 → provider candidate resolution
→ factual enrichment → deterministic engine → optional bounded judge
→ strict reconciliation → V1 response
```

Factual transport/protocol failures are explicit dependencies failures; a successful missing field remains an enrichment `unknown`. The deterministic engine owns hard decisions and the total selected/rejected/unresolved partition. The server-side `DECISION_AI_JUDGE_ENABLED` default is `false`; a disabled or ineligible judge is a successful typed skip, while a started provider or malformed-full-ranking failure is an explicit API error.

## Full-ranking and compatibility

Legacy `rank_places` remains the existing partial-selection contract. The AI package adds `rankBoundedPlaces(BoundedJudgeRequestV1)`, a separately typed `bounded_full_ranking_v1` operation using the same `rank_places` / `place_ranking` Router capability, execution scope, provider-owned retry, and Gemini error normalization. It requires an exact complete permutation. Self-hosted remains ineligible for `place_ranking`; default routing is unchanged.

This endpoint does not persist data, modify Trip/TravelBlock, call existing recommendation/trip-generation routes, add UI, or introduce a decision service/Docker. P2-DE-5 adds considered/rejected UI; P2-DE-6 adds snapshots/evaluation; P3 is the deferred service/Docker boundary.
