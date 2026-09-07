#!/usr/bin/env bash
set -euo pipefail
# Run as the deployment owner; no sudo or build commands inside this script.
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir="$repo/apps/web/dist"
target=${1:-/var/www/travel-blocks-ai}
[[ "$target" = /* && "$target" != / && "$target" != */ && "$target" != *'/../'* && "$target" != */.. ]] || { echo 'Use an absolute, non-root target without trailing slash or ..' >&2; exit 1; }
[[ -s "$source_dir/index.html" && -d "$source_dir/assets" ]] || { echo 'Complete npm run build first (index.html/assets missing).' >&2; exit 1; }
[[ -n "$(find "$source_dir/assets" -type f -print -quit)" ]] || { echo 'Build assets are empty.' >&2; exit 1; }
[[ -z "$(find "$source_dir" -type l -print -quit)" ]] || { echo 'Symlinks in dist are not supported.' >&2; exit 1; }
[[ ! -e "$target" || -L "$target" ]] || { echo 'Target must be absent or a release symlink; do not overwrite a directory.' >&2; exit 1; }
parent=$(dirname -- "$target")
[[ -d "$parent" && -w "$parent" ]] || { echo 'Deployment parent must already exist and be writable.' >&2; exit 1; }
umask 022
release=$(mktemp -d "${target}.release.XXXXXXXX")
link="${release}.link"
published=false
cleanup() {
  rm -f -- "$link"
  if [[ "$published" = false ]]; then rm -rf -- "$release"; fi
}
trap cleanup EXIT
cp -R -- "$source_dir/." "$release/"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -s -- "$release" "$link"
mv -Tf -- "$link" "$target"
published=true
printf 'Published web release: %s\n' "$release"
# Prior releases remain for explicit rollback; never automatically prune them.
