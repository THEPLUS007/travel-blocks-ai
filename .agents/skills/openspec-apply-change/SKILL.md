---
name: openspec-apply-change
description: Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks. Also use when the user says "openspec apply", "opsx apply", or "openspec implement".
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.16.0"
  customizedFor: "travel-blocks-ops-01"
---

Repository adaptation of OpenSpec 1.16.0. Follow [the governance map](../../../docs/OPENSPEC_GOVERNANCE.md) before using this workflow. It references the authoritative documents and shared command/path checks; do not duplicate or override them here. User authorization persists across steps.

Implement only when the user has authorized implementation of this change. Run `openspec instructions apply --change <name> --json`, read all contextFiles and applicable context/guidance. A blocked CLI state must be resolved before implementation. Reuse existing interfaces and tests. Complete tasks under AGENTS.md verification requirements before checking them off; rerun instructions to confirm progress. Surface material scope changes without silently weakening acceptance criteria. Do not apply the OPS-01 P2-DE-6 draft: it requires behavioral specs before implementation.
