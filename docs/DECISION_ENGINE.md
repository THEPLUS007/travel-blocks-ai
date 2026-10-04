# Deterministic Decision Engine

## P2-DE-2 scope

`@travel-blocks/decision-engine` evaluates one validated `DecisionRequestV1` with an explicit policy and evaluation context:

```text
request + policy + { resultId, evaluatedAt }
  → hard rules → required facts → score → rank → select → validated DecisionResultV1
```

It is a pure package function (`evaluateDecision`). It makes no provider, AI, HTTP, database, filesystem, environment, clock, random, or cache call. The caller supplies the safe result ID and timestamp. It is not connected to API, trip generation, UI, persistence, or a deployed service.

## Default policy

`DETERMINISTIC_POLICY_V1` is immutable and identifies itself as:

- ID: `deterministic-travel-selection`
- version: `v1`
- selection limit: `5`
- minimum selection score: `0`
- incomplete-data handling: `unresolved_required_fact`
- tie-break: final score descending, then candidate ID ascending

The enabled hard rule is priority 1 `permanently_closed`. Required factual coverage is `business_status`. A candidate with a permanently-closed known business status is rejected before required-fact or score evaluation. A temporary or future-opening status is not treated as permanent closure, but remains unresolved because V1 carries no reopening date/window capable of establishing operational availability.

Unknown business status yields `missing_required_facts`; unavailable yields `fact_unavailable`; invalid or untrusted yields `fact_untrusted`. The enclosing fact snapshot availability is checked too. These are valid unresolved outcomes, not engine errors.

## Scoring, ranking, and selection

Only hard-rule survivors with the required operational fact are scored. V1 has one `category_match` integer dimension. Its score is 1000 when the candidate category appears in `requestedCategories`, 0 when it does not, and 500 when no categories were requested. These values and the dimension weight are explicit policy fields.

`finalScore = round(categoryMatchScore × categoryMatchWeight / 1000)`

All scores are 0–1000 finite integers; V1 weights are positive integers and must total 1000. Candidates below `minimumSelectionScore` are rejected with `selection_threshold`. The remaining candidates are sorted by final score descending then `candidateId` ascending. The first `selectionLimit` candidates are selected; other eligible candidates are retained as `rejected` with `selection_limit`. The emitted result itself is canonicalized by `candidateId` ascending.

Every request candidate appears exactly once in the result. Each item has a safe fact and policy evidence reference plus caller-safe trace/timestamp provenance. Result semantic validation rechecks request identity, policy identity, total/exclusive partition, and coverage.

## Considered-place UI boundary (P2-DE-5 preparation)

The browser consumes only the public `decision_api_response_v1` contract and must join display candidates to decisions by `candidateId`. It may map the existing safe reason enum to product copy, but it cannot create a reason, score, fact, or state. Failed total/exclusive joins are display errors, not an excuse to omit candidates. `selected` is a Decision Result state; it does not itself create a `TravelBlock`, and `rejected`/`unresolved` never become `TravelBlock` values.

## Deferred rules

The V1 request carries opening-hours, price, and route facts, but does not carry their corresponding explicit constraints. It has no candidate visit time/window, price/budget comparison limit, route duration/distance maximum with requested transport mode, or structured category exclusions. Therefore P2-DE-2 deliberately does not activate opening-hours, budget, route, or category-exclusion rules. It does not infer a timezone, make a route from coordinates, apply currency conversion, or use textual/AI category matching. Future work must version the policy/request inputs before enabling those rules.

## Factual enrichment boundary

P2-FE-1's `@travel-blocks/factual-enrichment` package sits before this package and supplies provider-neutral `CandidateFactSnapshot` values. It retrieves/normalizes facts but does not call `evaluateDecision`, activate rules, calculate feasibility, or create TravelBlocks. Missing factual fields remain field-level `unknown`; source failures propagate rather than becoming unknown. Its result can be used to construct a future DecisionRequest without changing DecisionRequest V1.

## Bounded AI judge (P2-DE-3)

The deterministic engine remains final owner of DecisionResult. `@travel-blocks/decision-judge` consumes an already validated deterministic result through a provider-neutral port. It considers only deterministic selections and `selection_limit` rejections whose required facts are known; permanently closed/hard-rejected, threshold-rejected, and unresolved candidates cannot enter the allowlist. The V1 policy bounds this set to 2–5 candidates by score descending/candidate ID ascending. A strict, complete ranking permutation is reconciled with the existing result and selection limit; all protected decisions and facts remain unchanged. Skips are typed and retain the deterministic result; started execution failures propagate without retry, fallback, or partial application. No API or production runtime calls this package yet.

P2-DE-4 is the first API composition consumer. It injects the existing engine policy/result ID/evaluation timestamp; it does not add API-specific rules to this package or recompute scores outside the engine. The final response is the validated DecisionResult and preserves its total/exclusive partition.
