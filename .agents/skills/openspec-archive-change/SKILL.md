---
name: openspec-archive-change
description: Archive a completed OpenSpec change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete. Also use when the user says "openspec archive" or "opsx archive".
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.16.0"
  customizedFor: "travel-blocks-ops-01"
---

Repository adaptation of OpenSpec 1.16.0. Follow [the governance map](../../../docs/OPENSPEC_GOVERNANCE.md) before using this workflow. It references the authoritative documents and shared command/path checks; do not duplicate or override them here. User authorization persists across steps.

Archive only a delivered change with all tasks complete and AGENTS.md evidence recorded. Read status, list task counts and `openspec instructions archive --change <name> --json`; fail closed on missing governance/context or evidence. CLI warnings are not permission to bypass repository completion rules. Inspect any delta/main-spec differences and use openspec-sync-specs only for implemented, verified behavior. Run strict validation before `openspec archive <name>`; inspect help for installed options. Never force archive, skip validation, manually move a change, or archive the unimplemented P2-DE-6 draft as complete.
