#!/usr/bin/env bash
# Builds the public web site of doc-scanner-pdf for the site repository doc-scanner-pdf/doc-scanner-pdf.github.io
# (GitHub Pages user site → https://doc-scanner-pdf.github.io/doc-scanner-pdf/). All app code stays in
# this repository; the site repository only receives this build output, in a folder named after the app.
#
#   tools/publish-site.sh [--commit <rev>] [<out-dir>]
#
#   <out-dir>  default: ../doc-scanner-pdf.github.io/doc-scanner-pdf (the site repository cloned next to this one)
#   --commit   commit to publish (default: HEAD). Only committed files are published (git archive), never local edits.
#
# The output is doc-scanner-pdf/ at that commit, stamped by tools/stamp-build.sh with the commit and the commit time,
# so publishing the same commit always produces identical files (the daily check in published-site.yml relies on it).
set -euo pipefail

APP=doc-scanner-pdf
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"

rev=HEAD
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) rev="${2:?--commit needs a revision}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    -*) echo "publish-site: unknown option $1" >&2; exit 2 ;;
    *) [ -z "$out" ] || { echo "publish-site: only one output folder" >&2; exit 2; }; out="$1"; shift ;;
  esac
done
if [ -z "$out" ]; then
  site="$root/../doc-scanner-pdf.github.io"
  [ -d "$site/.git" ] || { echo "publish-site: clone the site repository first: git clone https://github.com/doc-scanner-pdf/doc-scanner-pdf.github.io $site" >&2; exit 1; }
  out="$site/$APP"
fi

commit="$(git -C "$root" rev-parse --verify --quiet "${rev}^{commit}")" || { echo "publish-site: unknown commit '$rev'" >&2; exit 1; }
build="${commit:0:12}"
built_at="$(TZ=UTC0 git -C "$root" log -1 --format=%cd --date=format-local:%Y-%m-%dT%H:%M:%SZ "$commit")"
git -C "$root" cat-file -e "$commit:$APP/index.html" 2>/dev/null || { echo "publish-site: $APP/ not found at $build" >&2; exit 1; }

# The output folder is replaced as a whole — refuse anything that is not a plain folder for the site
parent="$(mkdir -p "$(dirname "$out")" && cd "$(dirname "$out")" && pwd -P)"
out="$parent/$(basename "$out")"
case "$out" in
  /|"$HOME"|"$root") echo "publish-site: refusing to write to $out" >&2; exit 1 ;;
esac
# never replace files of this repository (only ignored output folders, e.g. tools/tests/out)
case "$out/" in
  "$root"/*) [ -z "$(git -C "$root" ls-files -- "$out")" ] || { echo "publish-site: $out holds files of this repository" >&2; exit 1; } ;;
esac
if [ -e "$out/.git" ] || [ -L "$out" ] || { [ -e "$out" ] && [ ! -d "$out" ]; }; then
  echo "publish-site: refusing to replace $out (not a plain site folder)" >&2; exit 1
fi

tmp="$(mktemp -d "$parent/.publish-$APP.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
git -C "$root" archive --format=tar "$commit" "$APP" | tar -x -C "$tmp"
bash "$here/stamp-build.sh" "$tmp/$APP" "$build" "$built_at" > /dev/null
rm -rf "$out"
mv "$tmp/$APP" "$out"

files="$(find "$out" -type f | wc -l | tr -d ' ')"
size="$(du -sh "$out" | cut -f1)"
echo "published $APP at $build ($built_at) → $out ($files files, $size)"
