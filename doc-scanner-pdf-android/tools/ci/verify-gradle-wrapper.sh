#!/usr/bin/env bash
# ตรวจว่า gradle-wrapper.jar และ distributionSha256Sum เป็นของ Gradle ทางการ (เทียบกับ services.gradle.org)
# ก่อนรัน ./gradlew ใน CI — กันไฟล์ wrapper ที่ถูกแก้ไขรันโค้ดในเครื่อง build
set -euo pipefail
dir="${1:-doc-scanner-pdf-android}"
props="$dir/gradle/wrapper/gradle-wrapper.properties"
version="$(sed -n 's|^distributionUrl=.*/gradle-\([0-9.]*\)-bin\.zip$|\1|p' "$props")"
[[ "$version" =~ ^[0-9]+(\.[0-9]+)+$ ]] || { echo "::error::cannot read the Gradle version from $props"; exit 1; }
grep -q '^distributionUrl=https\\://services\.gradle\.org/distributions/' "$props" || { echo "::error::distributionUrl must point to services.gradle.org"; exit 1; }
jar_official="$(curl -fsSL --retry 3 "https://services.gradle.org/distributions/gradle-$version-wrapper.jar.sha256")"
bin_official="$(curl -fsSL --retry 3 "https://services.gradle.org/distributions/gradle-$version-bin.zip.sha256")"
jar_actual="$(sha256sum "$dir/gradle/wrapper/gradle-wrapper.jar" | cut -d' ' -f1)"
bin_pinned="$(sed -n 's/^distributionSha256Sum=//p' "$props")"
[ "$jar_actual" = "$jar_official" ] || { echo "::error::gradle-wrapper.jar is not the official Gradle $version wrapper"; exit 1; }
[ "$bin_pinned" = "$bin_official" ] || { echo "::error::distributionSha256Sum is not the official checksum of Gradle $version"; exit 1; }
echo "Gradle $version wrapper and distribution checksum verified against services.gradle.org"
