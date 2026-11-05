---
name: openspec-update-change
description: Update an OpenSpec change by revising its existing planning artifacts and keeping them coherent with one another. Use when the user wants to revise a change's plan, fold new decisions into it, or reconcile its artifacts after an edit. Also use when the user says "openspec update change" or "opsx update". If the user means the openspec update CLI command, which refreshes generated files, run that command instead. Never edits code.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.16.0"
  customizedFor: "travel-blocks-ops-01"
---

Repository adaptation of OpenSpec 1.16.0. Follow [the governance map](../../../docs/OPENSPEC_GOVERNANCE.md) before using this workflow. It references the authoritative documents and shared command/path checks; do not duplicate or override them here. User authorization persists across steps.

Revise existing planning artifacts within the user's requested scope; do not implement code. Read all artifacts from status, obtain instructions for affected artifact IDs, and reconcile dependent scope/design/tasks. Preserve completed work and unrelated content. Existing user authorization covers requested reversible edits; ask only about material ambiguity or scope expansion. Missing artifacts are reported, not silently invented. Run strict change validation and report remaining gaps. Do not turn proposed decisions into CURRENT_STATUS completion claims.
