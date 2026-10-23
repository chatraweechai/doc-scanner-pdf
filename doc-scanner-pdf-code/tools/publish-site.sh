#!/usr/bin/env bash
# Builds the public web site of doc-scanner-pdf in the site repository doc-scanner-pdf/doc-scanner-pdf.github.io
# (GitHub Pages user site). The web app is the top of the site → https://doc-scanner-pdf.github.io/ (owner, 2026-10-23),
# next to the Android app's download page android/ (made by the Android release job, doc-scanner-pdf-android/tools/site).
# All app code stays in chatraweechai/doc-scanner-pdf (folder doc-scanner-pdf-code/); the site repository only receives
# this build output.
#
#   tools/publish-site.sh [--commit <rev>] [<site-dir>]
#
#   <site-dir>  default: ../doc-scanner-pdf.github.io (the site repository cloned next to this repository)
#   --commit    commit to publish (default: HEAD). Only committed files are published (git archive), never local edits.
#               Commits from before the merge into chatraweechai/doc-scanner-pdf (2026-10-22, app at the top level) work too.
#
# The output is doc-scanner-pdf/ at that commit without its README.md (documentation of this repository), stamped by
# tools/stamp-build.sh with the commit and the commit time, plus — on the site only — a link to the Android app's
# download page on the start page. Publishing the same commit always produces identical files (published-site.yml
# relies on it). Only the web app's own entries at the top of <site-dir> are replaced: the ones it has now and the ones
# the previous publish listed in .web-app-files (removed when the app no longer has them). Everything else — android/,
# .git, the site repository's own files — is left as it is.
set -euo pipefail

APP=doc-scanner-pdf
MANIFEST=.web-app-files
# entries of the site that never belong to the web app (refused if the app or the manifest names one)
PROTECTED=' android CNAME README.md CLAUDE.md LICENSE '
ANDROID_LINK='      <center><p><a href="android/index.html">สแกนเอกสาร PDF — แอป Android (The app Doc Scanner PDF — Android app)</a></p></center>'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base="$(cd "$here/.." && pwd -P)"
root="$(cd "$(git -C "$here" rev-parse --show-toplevel)" && pwd -P)"
prefix="$(git -C "$base" rev-parse --show-prefix)"  # doc-scanner-pdf-code/ in chatraweechai/doc-scanner-pdf

rev=HEAD
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) rev="${2:?--commit needs a revision}"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    -*) echo "publish-site: unknown option $1" >&2; exit 2 ;;
    *) [ -z "$out" ] || { echo "publish-site: only one output folder" >&2; exit 2; }; out="$1"; shift ;;
  esac
done
if [ -z "$out" ]; then
  out="$root/../doc-scanner-pdf.github.io"
  [ -d "$out/.git" ] || { echo "publish-site: clone the site repository first: git clone https://github.com/doc-scanner-pdf/doc-scanner-pdf.github.io $out" >&2; exit 1; }
fi

commit="$(git -C "$root" rev-parse --verify --quiet "${rev}^{commit}")" || { echo "publish-site: unknown commit '$rev'" >&2; exit 1; }
build="${commit:0:12}"
built_at="$(TZ=UTC0 git -C "$root" log -1 --format=%cd --date=format-local:%Y-%m-%dT%H:%M:%SZ "$commit")"
# where the app is at that commit: this folder, or the top level (chatraweechai/doc-scanner-pdf-code before the merge)
if git -C "$root" cat-file -e "$commit:$prefix$APP/index.html" 2>/dev/null; then tree="$commit:$prefix"
elif git -C "$root" cat-file -e "$commit:$APP/index.html" 2>/dev/null; then tree="$commit:"
else echo "publish-site: $APP/ not found at $build" >&2; exit 1
fi

# Where to write: never the file system root, the home folder, this repository, a folder holding its files or one that
# contains it
mkdir -p "$out"
out="$(cd "$out" && pwd -P)"
case "$out" in
  /|"$HOME"|"$root"|"$base") echo "publish-site: refusing to write to $out" >&2; exit 1 ;;
esac
case "$root/" in
  "$out"/*) echo "publish-site: $out contains this repository" >&2; exit 1 ;;
esac
case "$out/" in
  "$root"/*) [ -z "$(git -C "$root" ls-files -- "$out")" ] || { echo "publish-site: $out holds files of this repository" >&2; exit 1; } ;;
esac

entry_ok() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$PROTECTED" != *" $1 "* ]]; }

tmp="$(mktemp -d "$(dirname "$out")/.publish-$APP.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
git -C "$root" archive --format=tar "$tree" "$APP" | tar -x -C "$tmp"
app="$tmp/$APP"
rm -f "$app/README.md"
bash "$here/stamp-build.sh" "$app" "$build" "$built_at" > /dev/null
# site only: a link to the Android app's download page on the start page (the app's own files stay as they are)
awk -v link="$ANDROID_LINK" '!done && /<input id="fileInput"/ { print link; print ""; done = 1 } { print } END { exit done ? 0 : 1 }' \
  "$app/index.html" > "$tmp/index.html" || { echo "publish-site: no place for the Android link on the start page" >&2; exit 1; }
mv "$tmp/index.html" "$app/index.html"

entries=()
while IFS= read -r e; do
  entry_ok "$e" || { echo "publish-site: the web app has '$e', which the site keeps for itself" >&2; exit 1; }
  entries+=("$e")
done < <(cd "$app" && ls -A | LC_ALL=C sort)
[ "${#entries[@]}" -gt 0 ] || { echo "publish-site: empty web app" >&2; exit 1; }
old=()
if [ -f "$out/$MANIFEST" ]; then
  while IFS= read -r e; do
    [ -n "$e" ] || continue
    entry_ok "$e" || { echo "publish-site: $out/$MANIFEST lists '$e', which is not a web app entry — nothing changed" >&2; exit 1; }
    old+=("$e")
  done < "$out/$MANIFEST"
fi

for e in ${old[@]+"${old[@]}"} "${entries[@]}"; do rm -rf "${out:?}/$e"; done
for e in "${entries[@]}"; do mv "$app/$e" "$out/$e"; done
printf '%s\n' "${entries[@]}" > "$out/$MANIFEST"

files="$(cd "$out" && find "${entries[@]}" -type f | wc -l | tr -d ' ')"
size="$(cd "$out" && du -shc "${entries[@]}" | tail -1 | cut -f1)"
echo "published $APP at $build ($built_at) → $out (${entries[*]}: $files files, $size; other entries kept)"
