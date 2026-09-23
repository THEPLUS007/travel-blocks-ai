# P1-5F local-model bake-off

Run date: **2026-09-23**. This is a completed isolated PoC, not a deployment approval.

## Scope and host

- Host: ARM Neoverse-N1, 2 vCPU, 11 GiB RAM, no swap, no GPU.
- Runtime: llama.cpp `v0.4.1`, commit `b29c606e28a01b1bc8c1351026a0fa6e616bf6c4`, built with GNU 13.3.0 for Linux aarch64. The isolated CMake 4.1.1 build helper and runtime stayed under `/home/ubuntu/dev/tools`; model files stayed under `/home/ubuntu/dev/model-cache/travel-ai`.
- Runtime policy: `127.0.0.1` only, separate ports 11434/11435, bearer authentication at the wrapper and llama.cpp API-key-file authentication upstream, `extract_intent` and exact-model allowlists, concurrency 1, two CPU threads, context 4096, output ceiling 256, `nice +10` for llama.cpp. The wrapper preserves `POST /v1/generate { task, model, input } -> { content }`.
- No API, Nginx, PostgreSQL, systemd, `.env`, Docker, routing, public endpoint, database migration, or production process was changed. At every recorded safety check `http://127.0.0.1:3000/api/v1/health` returned `{"status":"ok"}`.

## Candidate provenance

| Candidate | Repository/revision | File / quantization / bytes | SHA256 | License | Result |
|---|---|---:|---|---|---|
| A — Qwen3.5-4B | Base `Qwen/Qwen3.5-4B@851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`; proposed community quant `unsloth/Qwen3.5-4B-GGUF@e87f176479d0855a907a41277aca2f8ee7a09523` | `Qwen3.5-4B-Q4_K_M.gguf`, 2,740,937,888 | not downloaded | Apache-2.0 | Excluded before download/run: model card identifies Unsloth/base model but does not record the exact llama.cpp conversion version required for reproducible community-conversion provenance. |
| B — Qwen3-4B | `Qwen/Qwen3-4B-GGUF@bc640142c66e1fdd12af0bd68f40445458f3869b` | `Qwen3-4B-Q4_K_M.gguf`, Q4_K_M, 2,497,280,256 | `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` | Apache-2.0 | Loaded, then first synthetic warm-up exceeded 30 s. |
| C — Gemma 4 E2B | `google/gemma-4-E2B-it-qat-q4_0-gguf@675cff42a74c774d6cb76f76d8eacb49b48c9b93` | `gemma-4-E2B_q4_0-it.gguf`, Q4_0, 3,349,516,256 | `fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634` | Apache-2.0 | Loaded text-only without image projector, then first synthetic warm-up exceeded 30 s. |

Downloaded GGUF total: 5,846,796,512 bytes. No model weight, binary, build artifact, token, raw prompt, or raw response is in Git.

## Dataset, gate, and deterministic coverage

`p1-5f-intent-v1` contains 34 provider-neutral, synthetic-only fixtures: Korean/English, domestic/international locations, explicit/relative/invalid dates, duration, travelers, budget, food/sightseeing/rest preferences, missing data, empty input, long input, injection, non-travel, schema-boundary, and hallucination probes. It provides a stratified 6-case smoke set and 20-case final set. Empty input is an expected application-contract rejection because `GenerateTripRequestSchema` is non-empty.

The deterministic gate is: at least 20 model calls; schema-valid >=95%; field accuracy >=90%; timeout/failure <=5%; P95 <=30,000 ms; hallucinations 0. The existing stable `TravelIntent` schema has no date/start/end field. Date-bearing fixtures score that unsupported field as a contract gap rather than silently accepting an invented extension; this is a blocking accuracy limitation for staging until a separately approved contract change is evaluated.

The runner stores only safe aggregate metrics in a mode-0600 `/tmp` result. It has no retry or fallback, samples sequentially, checks API health and MemAvailable around every call, and stops on a resource guard. Unit tests cover known-pass, known-fail, insufficient-evidence, fixture cardinality, and the date-contract gap with no inference/network call.

## Live results

| Candidate | Smoke/final calls | Schema-valid | Field accuracy | Hallucinations | mean / P50 / P95 | timeout/failure | Load time | Peak RSS | Safety |
|---|---:|---:|---:|---:|---|---|---:|---:|---|
| A | 0 / 0 | N/A | N/A | N/A | N/A | N/A | N/A | N/A | provenance gate prevented download/run |
| B | 1 warm-up attempt / 0 | 0/1 (0%) | 0% (no valid result) | 0 observed | >30,000 / >30,000 / >30,000 ms | 100% timeout | 16.64 s | 3,125,600 KiB | MemAvailable stayed above 9.7 GiB; API health unaffected |
| C | 1 warm-up attempt / 0 | 0/1 (0%) | 0% (no valid result) | 0 observed | >30,000 / >30,000 / >30,000 ms | 100% timeout | 25.63 s | 3,487,104 KiB | MemAvailable stayed above 10.1 GiB; API health unaffected |

Warm-up is counted in the 70-call cap. B and C were stopped immediately after their first model-compute call, as required by the single-fixture hard-timeout safety rule; therefore the six-case smoke comparison and 20-case final comparison were not eligible to continue. C's recorded prefill was 199 tokens at about 6.74 tokens/s and was cancelled before output. Qwen was also cancelled before a structured response. `thinking` was disabled via `--reasoning off`; Qwen also received `/no_think` in the wrapper instruction. Output-token count is unavailable for both timeout cases.

## Decision and boundaries

No candidate meets the eligibility gate. B and C fail timeout/failure and schema-valid requirements; A is not reproducible enough to run. There is no selected staging model and no JEV-inspired live experiment. The default routing remains exactly:

```text
extract_intent -> Gemini
generate_trip  -> Gemini
analyze_text   -> Gemini
rank_places    -> Gemini
```

Six future-only bounded-decision fixtures (`JEV-001` through `JEV-006`) contain only opaque candidate IDs and supplied price/open/travel-time/conflict/tag facts. A later, separately approved experiment may return only `candidateId`, `selected|alternative|rejected`, deterministic reason codes, and confidence. It must fail if it invents a place, price, hours, or travel time. This is not itinerary routing, an API/DB/UI feature, JEV package/API use, or a production capability.

## External activity

- External managed inference: Gemini 0, Places 0, Routes 0, Groq 0, NVIDIA 0, OpenRouter 0.
- Self-hosted model-compute calls: B 1, C 1; two pre-compute Qwen authentication rejections are excluded from inference count.
- Downloads: llama.cpp source 1, isolated CMake helper 1, official B GGUF 1, official C GGUF 1; Candidate A GGUF 0. No image projector was downloaded.
