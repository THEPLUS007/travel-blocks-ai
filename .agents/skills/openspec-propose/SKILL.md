---
name: openspec-propose
description: Propose a new OpenSpec change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation. Also use when the user says "openspec propose" or "opsx propose".
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.16.0"
  customizedFor: "travel-blocks-ops-01"
---

Repository adaptation of OpenSpec 1.16.0. Follow [the governance map](../../../docs/OPENSPEC_GOVERNANCE.md) before using this workflow. It references the authoritative documents and shared command/path checks; do not duplicate or override them here. User authorization persists across steps.

Create planning artifacts only, within the requested scope. Use `openspec new change <name>` to scaffold a new change; do not overwrite an existing one. Run status, then `openspec instructions <artifact> --change <name> --json` in dependency order. Read dependencies from disk and follow returned templates, project context and artifact rules subject to repository governance. Use returned concrete output paths within changeRoot. Respect skipped artifacts. Stop after presenting artifacts; do not implement a planning request. Report missing artifacts honestly rather than expanding scope.
