---
name: openspec-sync-specs
description: Sync delta specs from an OpenSpec change to main specs. Use when the user wants to update main specs with changes from a delta spec, without archiving the change. Also use when the user says "openspec sync" or "opsx sync".
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.16.0"
  customizedFor: "travel-blocks-ops-01"
---

Repository adaptation of OpenSpec 1.16.0. Follow [the governance map](../../../docs/OPENSPEC_GOVERNANCE.md) before using this workflow. It references the authoritative documents and shared command/path checks; do not duplicate or override them here. User authorization persists across steps.

Sync only user-authorized, implemented and verified behavior into openspec/specs. Resolve delta paths from status artifactPaths.specs.existingOutputPaths; if absent or skipped, report no delta and stop. Read delta and main specs and fetch `openspec instructions specs --change <name> --json` before writing. Preserve unmentioned requirements/scenarios and existing Purpose; merge operation blocks into canonical Requirements/Scenario format, never copy a delta wholesale. Reject missing MODIFIED/RENAMED targets, ambiguous destructive changes, or paths outside the resolved specs root. Do not retire capabilities without explicit scoped authorization. Run `openspec validate --specs --strict --no-interactive` and review the diff. Never sync governance documents into specs.
