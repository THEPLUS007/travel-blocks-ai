# Deterministic evaluation baseline

P1-1 provides a repeatable local baseline for detecting regression when prompts, model routing, or planning logic change. It is not a live benchmark: it uses only curated static plans and fixture candidate IDs. It never calls Gemini, Google Places, route services, a database, or the network.

## Dataset

The dataset lives in `packages/test-fixtures/src/evaluation/`.

Each scenario has `id`, `name`, `prompt`, structured `expectedIntent`, `constraints`, and `qualityRules`. `samplePlans.ts` supplies one expected-good and one intentionally-bad static plan per scenario.

- `EVAL-001` — Seoul First Trip
- `EVAL-002` — Busan Food Focus
- `EVAL-003` — Osaka Minimal Walking
- `EVAL-004` — Jeju Rental Car
- `EVAL-005` — Tokyo Budget
- `EVAL-006` — Gyeongju Parents Minimal Walking
- `EVAL-007` — Seoul Family With Children
- `EVAL-008` — Busan Solo Cafe And Sightseeing

Fixture place IDs are synthetic `fixture:*` identities, not API response dumps or production data.

## Rules and severity

Error checks fail a scenario: `destination_match`, `duration_match`, `day_number_continuity`, `max_blocks_per_day`, `duplicate_block_id`, `duplicate_provider_place`, `verified_place_contract`, and `connection_reference_integrity`.

Warning checks do not change the process exit status: `requested_category_presence`, `mobility_preference_basic_check`, `route_distance_feasibility`, and optional `requested_avoidance_violation`. Minimal-walking/accessibility checks only count declared `walk` connections; they do not estimate real distance or route duration.

The evaluator delegates structural checks to `validateItinerary` in `@travel-blocks/domain`. It adds request-adherence checks rather than duplicating domain validation.

## Run

```bash
npm run eval
```

The runner prints each scenario's PASS/FAIL, deterministic passed/total score, and failed rules. It exits `1` when an error-severity check fails and `0` when only warnings fail. No JSON report artifact is written.

`apps/api/test/evaluation.test.ts` verifies all good fixtures, the intentional error and warning cases, and repeatability. CI Quality runs `npm run eval` after the existing verification suite.

## Route feasibility (P1-2)

`route_distance_feasibility` is a deterministic geographic heuristic. It reads the verified places in each Day in block-array order, ignores non-place blocks, and evaluates each consecutive verified-place pair with the Haversine great-circle calculation. The result is named `straightLineKm`; it is not a driving, walking, transit, or route distance, and it never estimates travel time, traffic, cost, or a transport mode.

Coordinates are minimal curated evaluation data in `placeCoordinates.ts`, keyed by the canonical `provider:providerPlaceId` identity. They are not Google Places response dumps. The route check does not add coordinates to `TravelBlock`, change an API response schema, or require a database migration.

Scenarios may configure `maxConsecutiveStraightLineKm` and `maxDailyStraightLineKm`. Exceeding either threshold emits warning-severity `long_consecutive_distance` or `excessive_daily_geographic_spread`; warnings lower the deterministic quality score but do not make a scenario fail. Thresholds are scenario heuristics, not universal travel rules.

Every result records coverage: possible, evaluated, and skipped consecutive segments. Missing or invalid coordinates are skipped with an explicit unavailable reason; they are never replaced with `0,0` or a zero-distance segment. Daily metrics include consecutive segment count, maximum consecutive straight-line distance, and total straight-line path distance. That total is also a heuristic, not actual travel distance.

## Current limits

This baseline does not judge subjective itinerary quality, live model differences, actual routed duration or distance, costs, or live provider availability. Opening-hours feasibility is evaluated only from deterministic snapshots and fixtures described below; it does not prove live provider coverage. Actual routing requires a future routing provider and remains outside this network-independent baseline.

## Opening Hours Feasibility (P1-3)

Opening-hours evaluation keeps provider facts separate from feasibility decisions. A lazy place-details capability normalizes Google `currentOpeningHours` and `regularOpeningHours` into provider-neutral periods with `source`, provider identity, `retrievedAt`, timezone, business status, and data-quality flags. Search candidates do not trigger opening-hours lookups.

The pure domain check accepts an explicit trip start date and the free-form block time only when it is an unambiguous `HH:MM` or `HH:MM-HH:MM` value. It handles Google weekday numbering, overnight periods, and 24-hour periods. `currentHours` is preferred when its date coverage includes the target date; regular hours are a heuristic and produce `caution` because special closures are not guaranteed. Missing hours, dates, or parseable times produce `unknown`; no AI/category guessing is used. Permanent closure is `infeasible`, while temporary closure is conservative `caution`.

This is geographic/schedule feasibility only, not a routing API or travel-time estimate. The evaluation rule is warning-only, deterministic, and network-independent. Coordinate coverage and opening-hours coverage remain explicit; TravelBlock and Trip schemas are unchanged, and CI performs no live provider calls.

## Provider resilience regression gate (P1-4)

Provider failure fixtures are kept outside the evaluation dataset and never call Gemini, Places, Routes, or a database. Places tests cover timeout, 429, transient 5xx, network rejection, malformed responses, not-found, and missing opening-hours fields. Gemini tests cover missing text, JSON parsing, schema/semantic validation, bounded retry, Retry-After, terminal long-task timeout, and sanitized observability. Recommendation category retrieval remains `Promise.all`: one transport failure fails the complete request instead of silently dropping a category. Missing factual data remains a domain result (`unknown`, `caution`, `infeasible`, or skipped coverage), not provider success.
