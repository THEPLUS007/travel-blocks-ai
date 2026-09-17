#!/usr/bin/env bash
set -euo pipefail

expected_origin='https://github.com/THEPLUS007/travel-blocks-ai.git'
script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if ! repository_root=$(git -C "$script_root" rev-parse --show-toplevel 2>/dev/null); then
  echo 'Deployment provenance check requires a Git checkout.' >&2
  exit 1
fi
[[ "$repository_root" = "$script_root" ]] || { echo 'Deployment provenance check must run from the repository root.' >&2; exit 1; }
origin=$(git -C "$repository_root" remote get-url origin)
case "$origin" in
  "$expected_origin") ;;
  *) echo 'Deployment provenance check rejected a non-canonical origin.' >&2; exit 1 ;;
esac
branch=$(git -C "$repository_root" branch --show-current)
[[ "$branch" = main ]] || { echo 'Deployment provenance check requires branch main.' >&2; exit 1; }
head=$(git -C "$repository_root" rev-parse HEAD)
origin_main=$(git -C "$repository_root" rev-parse origin/main)
[[ "$head" = "$origin_main" ]] || { echo 'Deployment provenance check requires HEAD to equal origin/main.' >&2; exit 1; }
git -C "$repository_root" diff --quiet
git -C "$repository_root" diff --cached --quiet
git -C "$repository_root" merge-base --is-ancestor "$head" origin/main
git -C "$repository_root" merge-base --is-ancestor origin/main "$head"
printf 'repository=THEPLUS007/travel-blocks-ai\n'
printf 'commit=%s\n' "$head"
printf 'build_timestamp_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
