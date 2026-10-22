#!/usr/bin/env bash
# Checks out the web app the Android app was converted from (the commit in doc-scanner-pdf-android/source.json) as a
# git worktree and prints the folder that holds doc-scanner-pdf/ — for build.js --source and CLAUDE4CODE_SRC (tests).
#
#   tools/ci/source-checkout.sh <new-folder>
#
# The commit is in this repository's history: a commit of chatraweechai/doc-scanner-pdf (web app in
# doc-scanner-pdf-code/) or one from before the merge of 2026-10-22 (chatraweechai/doc-scanner-pdf-code, app at the
# top level). Needs all history (actions/checkout: fetch-depth: 0). Remove it with: git worktree remove <new-folder>
set -euo pipefail
dir="${1:?usage: source-checkout.sh <new-folder>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base="$(cd "$here/../.." && pwd)"
commit="$(node -e 'process.stdout.write(String(require(process.argv[1]).commit))' "$base/doc-scanner-pdf-android/source.json")"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "source-checkout: invalid commit in source.json" >&2; exit 1; }
git -C "$base" cat-file -e "$commit^{commit}" 2>/dev/null || { echo "source-checkout: commit $commit is not in this repository (fetch all history)" >&2; exit 1; }
[ ! -e "$dir" ] || { echo "source-checkout: $dir already exists" >&2; exit 1; }
git -C "$base" worktree add -q --detach "$dir" "$commit" >&2
dir="$(cd "$dir" && pwd)"
if [ -f "$dir/doc-scanner-pdf-code/doc-scanner-pdf/index.html" ]; then echo "$dir/doc-scanner-pdf-code"
elif [ -f "$dir/doc-scanner-pdf/index.html" ]; then echo "$dir"
else echo "source-checkout: no web app at $commit" >&2; exit 1
fi
