# OPS-01: OpenSpec governance and evidence

OpenSpec is a repository-local planning layer. It does not replace engineering governance or prove that a feature is implemented. P2-DE-6 remains planned and unimplemented.

## Governance mapping

| Concern | Authority | OpenSpec responsibility |
|---|---|---|
| Work procedure, branches, tests, commits | [AGENTS.md](../AGENTS.md) | Reference and follow; do not restate engineering rules |
| Product/data boundaries | [INVARIANTS.md](INVARIANTS.md) | Constrain each task-specific delta |
| Actual implementation and verified state | [CURRENT_STATUS.md](CURRENT_STATUS.md) | Record evidence there; checkboxes are not phase status |
| Phase scope/order/completion gates | [ROADMAP.md](ROADMAP.md) | Link the relevant phase; do not maintain a second roadmap |
| Current structure and boundary decisions | [ARCHITECTURE.md](ARCHITECTURE.md), relevant topic docs/ADRs | Ground proposals in source/tests and cite documents |
| Task-specific proposed changes | `openspec/changes/<name>/` | Proposal, design, tasks and later behavioral deltas |
| Implemented task-specific behavior | `openspec/specs/` after verification | Narrow behavior contracts, never a copy of governance |

Read the authoritative documents in AGENTS.md order before work. Resolve discrepancies using code, tests and Git evidence; report conflicts rather than silently choosing a new source of truth. `openspec/config.yaml` injects document references and per-artifact rules. The six adapted skills reference this mapping instead of repeating it.

## Shared workflow checks

Run commands from the repository root. Run `openspec list --json` and `openspec context --json` before a workflow write, require the returned root to be this repository, then use `openspec status --change <name> --json` for actual artifact paths. No external store is configured; do not silently create/use one. Stop and report root/config resolution failures. Do not follow symlinked output paths outside the resolved root. Read relevant source, nearby tests and existing artifacts before drafting. Obtain current `openspec instructions <artifact> --change <name> --json`, including context/rules, before writing artifacts. Preserve explicit user scope and existing authorization.

Use `$openspec-propose` in Codex for new plans. `$openspec-update-change` revises plans; `$openspec-explore` is read-only unless capturing requested artifacts. `$openspec-apply-change` requires implementation authorization; `$openspec-sync-specs` and `$openspec-archive-change` require delivered evidence. These names are skill invocations, not shell commands. CLI structural validation, planning status and task counts are separate evidence.

For the initial P2-DE-6 draft, OPS-01 authorizes proposal/design/tasks only. Its `.openspec.yaml` has `skip_specs: true` because this delivery adopts no behavioral changes. Strict validation accepts zero deltas for that marker; it does not validate future behavior. Before any P2-DE-6 implementation, remove the marker and create reviewed behavioral scenarios. Do not follow the CLI's generic apply suggestion as authorization. Durable user history is deferred; the proposed snapshot is synthetic offline evaluation data.

## Generated skill audit

All six complete generated SKILL.md files were inspected before adaptation (OpenSpec 1.16.0, 2026-11-05). Each keeps its name/license/generator metadata and is marked `customizedFor: travel-blocks-ops-01`. They are concise repository adapters; upstream instructions can be regenerated in a disposable checkout for comparison.

| Generated skill | Conflict or duplication observed | Repository adaptation |
|---|---|---|
| openspec-propose | Extensive repeated root/store/context text; default demands behavior specs even for this restricted draft | Shared checks by reference; planning-only scope; explicit documented skip marker |
| openspec-apply-change | Workflow claims controlling priority over project context; task checkoff alone can look like delivery; `allowed-tools` limits Bash to openspec despite implementation/test work | Existing governance and verification control completion; respect blocked state; remove mismatched tool allowlist |
| openspec-archive-change | Allows archive with incomplete tasks/artifacts after confirmation; ignores context lookup failure; permits manual move and skipped sync | Require delivered evidence and all tasks; fail closed on missing context; CLI archive after strict validation; no force/manual move |
| openspec-sync-specs | Long duplicate store/schema guidance; could sync proposed behavior before implementation | Implemented evidence only; preserve semantic merge and path checks; no governance migration |
| openspec-update-change | Requires confirmation for every edit, even already authorized reversible edits | Existing authorization persists; clarify only material ambiguity/scope expansion |
| openspec-explore | Repeated setup/capture confirmation and extensive generic examples | Read-only exploration and scoped capture; no repeat approvals for requested artifacts |

No sub-agents were used. The archive text's optional delegation is not applicable here. All six generated `allowed-tools: Bash(openspec:*)` declarations were removed because this repository uses ordinary read/edit/check tools as part of these workflows; session/tool permissions continue to apply. Root AGENTS.md was preserved byte-for-byte.

## Setup evidence

Date: 2026-11-05. Repository origin: `https://github.com/THEPLUS007/travel-blocks-ai.git`.

- Starting branch: `refactor/remove-legacy-and-consolidate-clients`.
- Starting HEAD: `70babadcf3f8a3b8fe7937638701e2b11688b2a2`.
- `git status --porcelain=v1`: empty before creating `ops/ops-01-openspec-governance` via `git switch -c ops/ops-01-openspec-governance`.
- `node --version`: `v22.23.2`; `npm list -g --depth=0`: Codex/corepack/npm only; `command -v openspec`: absent. No existing `.agents/`, `.codex/` or `openspec/` integration found (rg reported missing paths).
- `npm view @fission-ai/openspec version engines --json`: `1.16.0`, Node `>=22.12.0`.
- User explicitly approved installation with “승인” after exact command/scope/file effects were presented.
- `npm install -g @fission-ai/openspec@1.16.0`: exit 0, 57 packages added under the current nvm Node prefix. `openspec --version`: `1.16.0`.
- `openspec init --tools codex` at repo root: exit 0, six skills under `.agents/`, commands skipped for Codex, root config created. No sudo, shell-startup edit, package.json or lockfile change.
- `openspec new change p2-de-6-decision-snapshots-evaluation`: exit 0, default spec-driven schema and CLI metadata created. `openspec instructions proposal/design/tasks --change p2-de-6-decision-snapshots-evaluation --json` obtained templates; design/tasks were refreshed after prerequisite artifacts existed.

Official references inspected: [installation](https://openspec.dev/docs/installation), [setup](https://openspec.dev/docs/setup), [project configuration](https://openspec.dev/docs/project-config), [CLI](https://openspec.dev/docs/cli), plus the installed CLI help/source for skip_specs. Installed CLI behavior, not older third-party setup pages, determined actual paths. Init reported anonymous telemetry; later tooling commands use per-command opt-out when specified. No claim is made that the initial invocation sent zero telemetry.

## Changed-file inventory

- `.agents/skills/.openspec-target`: generated integration marker.
- `.agents/skills/openspec-{propose,apply-change,archive-change,sync-specs,update-change,explore}/SKILL.md`: six reviewed/adapted workflows.
- `openspec/config.yaml`: references, task rules and operation guidance.
- `openspec/specs/.gitkeep`, `openspec/changes/archive/.gitkeep`: empty baseline/archive placeholders.
- `openspec/changes/p2-de-6-decision-snapshots-evaluation/.openspec.yaml`: CLI metadata and documentation-only skip marker.
- The same change directory's `proposal.md`, `design.md`, `tasks.md`: initial future-work plan, all nine implementation tasks unchecked.
- `docs/OPENSPEC_GOVERNANCE.md`: mapping, conflict audit, inventory and evidence.
- `docs/CURRENT_STATUS.md`: dated OPS-01 tooling evidence addendum only.

## Validation evidence

All checks below were run locally on 2026-11-05 against the OPS-01 worktree based on starting HEAD above.

| Exact command/check | Result |
|---|---|
| `openspec validate p2-de-6-decision-snapshots-evaluation --strict --no-interactive` | exit 0; valid; INFO for intentional skip_specs |
| `OPENSPEC_TELEMETRY=0 openspec validate --all --strict --no-interactive --json` | exit 0; 1 change passed, 0 failed, 0 baseline specs |
| `OPENSPEC_TELEMETRY=0 openspec schema validate spec-driven` | exit 0; schema valid |
| `openspec status --change p2-de-6-decision-snapshots-evaluation` | 3/3 planning artifacts, specs skipped; planning only |
| `openspec list --json` | root is repository; 0/9 implementation tasks complete |
| `npm run verify` | exit 0; lint, package builds, Vitest 326 tests (30 domain, 96 AI, 16 engine, 10 enrichment, 7 judge, 6 API contract, 37 web, 124 API), MCP tests and app builds passed |
| `npm run typecheck` | exit 0; existing workspace TypeScript lint alias |
| `npm run eval` | exit 0; 8/8 scenarios and 98/98 checks |
| `git diff --check` / staged equivalent | passed; final staged diff reviewed before commit |
| Local Markdown link and skill checks (Python, inline) | all local links in 15 new files resolve; all six skills reference governance and remove mismatched tool allowlist |
| `git diff --exit-code 70babadcf3f8a3b8fe7937638701e2b11688b2a2 -- AGENTS.md docs/INVARIANTS.md docs/ROADMAP.md docs/ARCHITECTURE.md package.json package-lock.json apps packages deploy .github` | exit 0; no changes in protected governance/product/deployment paths |

`npm run verify` already executes package/app builds; no separate build rerun was necessary. Output logs were captured in `/tmp/ops-01-{verify,typecheck,eval}.log` for this session, not committed. Initial sandbox commands failed before execution with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; checks were rerun through approved escalation. Initial file discovery returned exit 2 for absent optional integration directories; init itself returned exit 0. No P2-DE-6 evaluation runner exists yet; existing itinerary evaluation is not evidence that the proposed decision evaluator works.

## Risks and next action

Generated adapters are intentionally customized: `openspec init`/`openspec update` can overwrite them. Review regeneration on a feature branch, inspect all six diffs and reapply this mapping before use; do not automatically refresh them in CI. The global CLI belongs to Node v22.23.2's nvm installation and is not a pinned repo dependency. Reproduce with the exact approved install command; reassess updates deliberately. The config/skills are prompt-level constraints, not an enforced security or CI gate.

Next action: review the P2-DE-6 offline snapshot scope/design, then in a separately authorized implementation task remove skip_specs and author behavioral deltas before apply. Do not archive this draft as delivered functionality. No production source, API contract, DB schema, LLM routing, deployments or secrets were changed; no product-provider call or deployment was requested/performed. Remote CI, PostgreSQL integration and browser E2E are not claimed for this documentation/tooling change.
