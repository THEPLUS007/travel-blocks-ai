# Documentation

Use this index for detailed design and operator references. The repository [README](../README.md) is the quick project overview.

## Product

- [Product Scope](PRODUCT_SCOPE.md) — supported capabilities and explicit exclusions.

## Architecture

- [Architecture](ARCHITECTURE.md) — application boundaries, source handling, provider flow, and validation.
- [Data Model](DATA_MODEL.md) — persisted entities, ownership, and concurrency model.
- [API](API.md) — HTTP API contract and request/response behavior.

## AI & Providers

- [AI Provider](AI_PROVIDER.md) — Gemini task boundaries, retry policy, safe telemetry, and quotas.
- [Gemini Compatibility](GEMINI-COMPATIBILITY.md) — structured-output schema compatibility.
- [Places Compatibility](PLACES-COMPATIBILITY.md) — Google Places API response normalization.

## Operations

- [Security](SECURITY.md) — trust boundaries and security controls.
- [Deployment](DEPLOYMENT.md) — production release, rollback, backup, and recovery procedure.
