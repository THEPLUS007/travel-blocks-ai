# Travel Blocks AI

Travel Blocks AI turns a travel request or travel-related text into an editable itinerary organized by day and Travel Block. It combines AI with verified place data, then validates and stores the resulting plan.

## Project Status

- **Production:** Deployed
- **CI:** Quality, E2E, PostgreSQL
- **Runtime:** Node.js 22 (`>=22.12 <23`)

## Overview

The service helps users move from unstructured travel information to a plan they can edit and save. It supports AI itinerary generation, travel-text analysis, verified-place grounding, Day/Travel Block editing, and PostgreSQL persistence.

## Key Features

- AI itinerary generation from a natural-language request
- Travel-text analysis into a structured itinerary
- TravelIntent extraction before trip planning
- Google Places API (New) candidate retrieval and verified-place grounding
- Structured output with Zod and domain validation
- Day / Travel Block editing, ordering, and travel connections
- Place recommendations from provider-verified candidates
- PostgreSQL persistence with optimistic concurrency and session isolation
- Safe public text/HTML source pipeline with SSRF protections
- Production delivery through Nginx, systemd, and GitHub Actions validation

## Architecture

```mermaid
flowchart LR
  User[User] --> Nginx[Nginx / HTTPS]
  Nginx --> Web[React web]
  Nginx --> API[Fastify API]
  API --> DB[(PostgreSQL)]
  API --> Gemini[Gemini]
  API --> Places[Google Places API (New)]
```

See [Architecture](docs/ARCHITECTURE.md) for application boundaries, source handling, and validation details.

## AI Generation Flow

The canonical trip-generation path is:

```text
GenerateTripRequest
→ extractIntent
→ Google Places candidate retrieval
→ planTrip
→ structured output
→ Zod validation
→ grounding
→ candidate integrity validation
→ domain validation
→ response
```

Travel-text analysis follows a separate, source-aware path:

```text
Travel text
→ Gemini structured analysis
→ task-specific normalization
→ Zod validation
→ domain validation
```

Only places verified by the place provider are treated as verified places. See [AI Provider](docs/AI_PROVIDER.md) and [Gemini compatibility](docs/GEMINI-COMPATIBILITY.md) for the provider contract.

## Repository Structure

```text
.
├── apps/
│   ├── web/             # React/Vite editor
│   ├── api/             # Fastify HTTP API
│   └── mcp/             # Isolated JSON-RPC MCP server
├── packages/
│   ├── ai/              # AI provider abstraction and Gemini adapter
│   ├── domain/          # Pure itinerary and editing rules
│   ├── shared/          # Zod contracts and shared types
│   └── test-fixtures/   # Mock providers and fixtures
├── deploy/              # Nginx and systemd templates
├── scripts/             # Deployment and operational checks
├── docs/                # Detailed documentation
└── .github/             # GitHub Actions workflow
```

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js 22, Fastify, TypeScript
- **Database:** PostgreSQL, Drizzle ORM
- **AI:** Gemini with Zod structured validation
- **Places:** Google Places API (New)
- **Operations:** Nginx, systemd, GitHub Actions

## Getting Started

```bash
git clone https://github.com/THEPLUS007/travel-blocks-ai.git
cd travel-blocks-ai
nvm use
npm ci
```

Copy `.env.example` to a local `.env` and configure the providers and database for your environment. Do not commit credentials.

## Environment Variables

`.env.example` is the source of truth for the complete supported configuration.

| Category | Key variables |
|---|---|
| Database | `DATABASE_URL` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_INTENT_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_INTENT_TIMEOUT_MS`, `GEMINI_MAX_RETRIES`, `GEMINI_MAX_CONCURRENCY` |
| Places | `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_TIMEOUT_MS` |
| Server | `API_HOST`, `API_PORT`, `COOKIE_SECURE`, `TRUST_PROXY` |

## Development

```bash
npm run dev
# or run one service
npm run dev:web
npm run dev:api
```

## Testing & Validation

The local baseline is:

```bash
npm ci
npm run verify
```

Additional checks:

```bash
npm run test:e2e
npm run test:postgres
npm audit --omit=dev
```

GitHub Actions runs the `Quality`, `E2E`, and `PostgreSQL` jobs. These checks use test fixtures or isolated services; they do not use production Gemini or Google Places credentials.

## Production

```text
Internet → Nginx HTTPS → static React web
                         └→ /api → Fastify on localhost → PostgreSQL
```

Nginx provides the public HTTPS boundary, while the Fastify API runs under systemd. See the [deployment runbook](docs/DEPLOYMENT.md) for release, rollback, backup, and operator procedures.

## Documentation

| Document | Purpose |
|---|---|
| [Product Scope](docs/PRODUCT_SCOPE.md) | Supported product scope and exclusions |
| [Architecture](docs/ARCHITECTURE.md) | Application boundaries and data flow |
| [API](docs/API.md) | HTTP API contract |
| [Data Model](docs/DATA_MODEL.md) | Persistence and data model |
| [AI Provider](docs/AI_PROVIDER.md) | Gemini tasks, safety, retries, and observability |
| [Gemini Compatibility](docs/GEMINI-COMPATIBILITY.md) | Structured-output compatibility rules |
| [Places Compatibility](docs/PLACES-COMPATIBILITY.md) | Google Places API response handling |
| [Security](docs/SECURITY.md) | Security controls and trust boundaries |
| [Deployment](docs/DEPLOYMENT.md) | Production deployment and rollback runbook |
| [Evaluation](docs/EVALUATION.md) | Deterministic AI quality baseline |

The [documentation index](docs/README.md) groups these references by topic.

## Current Limitations

- YouTube transcript extraction is not supported.
- Multiple place-provider selection is not supported.
- A full login UI is not included.
- Booking, payment, price comparison, and collaboration are not included.

## Project History

- Started as a 2026 AX hackathon prototype.
- Hardened into a production-oriented architecture with explicit provider, validation, persistence, and deployment boundaries.
- The original hackathon version is preserved in the `hackathon-submission-2026-07-10` tag.
