#!/usr/bin/env bash
# Stamps the deployed site with its build id (cache busting, see doc-scanner-pdf/js/boot.js).
#
#   tools/stamp-build.sh <site-dir> <build-id> [<built-at>]
#
# - replaces __APP_BUILD__ in index.html and js/boot.js with <build-id> (short git commit)
# - writes <site-dir>/version.json, which boot.js checks to reload a stale cached page once;
#   builtAt = <built-at> (UTC, YYYY-MM-DDTHH:MM:SSZ — tools/publish-site.sh passes the commit time so the same
#   commit always gives the same files) or the current time
# Used by tools/publish-site.sh and by the cache-busting test (tools/tests).
set -euo pipefail

site="${1:?usage: stamp-build.sh <site-dir> <build-id>}"
build="${2:?usage: stamp-build.sh <site-dir> <build-id>}"
built_at="${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if [[ ! "$build" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "stamp-build: build id must be a hex git commit, got '$build'" >&2
  exit 1
fi
if [[ ! "$built_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  echo "stamp-build: built-at must be YYYY-MM-DDTHH:MM:SSZ, got '$built_at'" >&2
  exit 1
fi

files=("$site/index.html" "$site/js/boot.js")
sed -i.bak "s/__APP_BUILD__/${build}/g" "${files[@]}"
rm -f "$site/index.html.bak" "$site/js/boot.js.bak"

if grep -n "__APP_BUILD__" "${files[@]}"; then
  echo "stamp-build: placeholder left unstamped" >&2
  exit 1
fi
grep -q "js/boot.js?v=${build}\"" "$site/index.html" || { echo "stamp-build: boot.js tag not stamped" >&2; exit 1; }
grep -q "var BUILD = '${build}';" "$site/js/boot.js" || { echo "stamp-build: boot.js not stamped" >&2; exit 1; }

printf '{"commit":"%s","builtAt":"%s"}\n' "$build" "$built_at" > "$site/version.json"
echo "stamped $site with build $build"
