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

Warning checks do not change the process exit status: `requested_category_presence`, `mobility_preference_basic_check`, and optional `requested_avoidance_violation`. Minimal-walking/accessibility checks only count declared `walk` connections; they do not estimate real distance or route duration.

The evaluator delegates structural checks to `validateItinerary` in `@travel-blocks/domain`. It adds request-adherence checks rather than duplicating domain validation.

## Run

```bash
npm run eval
```

The runner prints each scenario's PASS/FAIL, deterministic passed/total score, and failed rules. It exits `1` when an error-severity check fails and `0` when only warnings fail. No JSON report artifact is written.

`apps/api/test/evaluation.test.ts` verifies all good fixtures, the intentional error and warning cases, and repeatability. CI Quality runs `npm run eval` after the existing verification suite.

## Current limits

This baseline does not judge subjective itinerary quality, live model differences, actual route duration/distance, opening hours, costs, or provider availability. Those require P1-2+ provider-backed evaluation and remain outside this deterministic baseline.
