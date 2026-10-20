# CLAUDE.md

## Project

This repository is `chatraweechai/doc-scanner-pdf-android`: the Android app (phones + tablets) of the doc-scanner-pdf web app
from `chatraweechai/doc-scanner-pdf-code`. Until 2026-10-01 they were `chatrawichai-tech/claude4app` and
`chatrawichai-tech/claude4code`; those repositories are gone and the owner restored all four into `chatrawichai-envbr`
(Apps Script twin `chatrawichai-envbr/doc-scanner-pdf-gas`, web site `chatrawichai-envbr/chatrawichai-envbr.github.io`). Owner quotes below keep the
names they used. Clone the repositories next to each other under their new names (`../doc-scanner-pdf-code`).
The package name `io.github.chatrawichaitech.docscanner` never changes (installed apps and Google Play depend on it).

- `doc-scanner-pdf-android/` — Gradle project (Kotlin, AGP 9, minSdk 26). A WebView shows
  `app/src/main/assets/www/` at `https://appassets.androidplatform.net/` (served by `AssetRouter.kt`, no INTERNET
  permission). `MainActivity.kt` adds what a WebView cannot do: camera permission, device camera / image picker,
  save (system "save as") and share through `DocScannerBridge` (WebMessageListener, protocol in `BridgeProtocol.kt`),
  back button, insets, render-process recovery.
- `app/src/main/assets/www/` and `source.json` are **generated** by `tools/convert/build.js --source ../doc-scanner-pdf-code` —
  never edit them by hand; change `chatraweechai/doc-scanner-pdf-code` (or `tools/convert/templates/platform.js`) and convert again.
  The app's JS/CSS must stay byte-identical to doc-scanner-pdf-code; platform differences go through `window.AppPlatform` hooks.
  `SOURCE_REPO` in `build.js` (embedded in `android/platform.js` and `source.json`) still records the old name of the
  commit the current app was converted from: switch it to `chatraweechai/doc-scanner-pdf-code` together with the next real app
  change, never on its own (that would change the app files without changing the app — a fake version).
- `doc-scanner-pdf-code` is public, so CI checks it out without credentials; every checkout of it passes the optional
  read-only deploy key `CLAUDE_REPO_KEY` (`ssh-key:`), used only if that repository is made private again.
- Releases are always signed with the permanent key: without the `ANDROID_KEYSTORE_*` secrets the release job fails with
  instructions instead of publishing a temporary-key APK (checked by the convert suite).
- After the Release, the `site` job pushes the same APK (refused unless signed with the permanent key) and its download
  page (`tools/site/build-page.js`, relative links only — the site is the account's GitHub Pages user site; the pages also work from a sub-folder)
  to `chatrawichai-envbr/chatrawichai-envbr.github.io`, folder `doc-scanner-pdf-android/`
  → https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/, with the write deploy key in the secret
  `SITE_DEPLOY_KEY` (README: หน้าดาวน์โหลดบนเว็บไซต์). Only that job may use it (checked by the convert suite).
- `CHANGELOG.md` — **its top heading is the app version** (`## v1.0.N — date`): Gradle versionName/versionCode
  (major×1,000,000 + minor×1,000 + patch), the page's "เวอร์ชัน v1.0.N (Android)" (user agent → `AppPlatform.versionLabel`),
  release notes and the download page. `tools/release/version.js --decide` (build + release jobs) releases only a new
  version of a changed app (`APP_PATHS`); docs/CI/test-only changes → no release; app change without a new version,
  a new version without an app change (fake version) or an older number → CI fails.
- `WebSession.kt` (ViewModel) keeps the WebView and pending work across activity recreation (system relaunch, e.g.
  Android 12+ theme colours after a wallpaper change) so scanned pages are not lost; `MainActivity` attaches to it.
- Google Play (`PLAY_STORE.md` = the owner's steps in Thai): the release job also builds the `.aab` (same signing key =
  the Play upload key). `tools/store/` makes the store listing from the real app — texts `listing/<th|en-US>/*.txt`
  (Play limits checked by the `play` suite), `build.js` icon/feature graphic/phone + 7" + 10" screenshots, `video.js`
  the promo videos (ffmpeg) — into `tools/store/out/` (gitignored). `.github/workflows/play.yml` (manual only) builds
  them as the artifact `store-listing` and, when asked, uploads the `.aab` of the GitHub Release (refused if
  debug-signed) and the listing with `tools/play/publish.js`; the service-account key `PLAY_SERVICE_ACCOUNT_JSON` is
  given to that one step only (checked by the `play` suite). Store texts must stay true to the app (no "best/#1/100 %",
  offline claims need no INTERNET permission). The privacy policy is `privacy.html` of the download page
  (`tools/site/build-page.js`) — keep it and the Data safety answers in `PLAY_STORE.md` true when the app changes.
- `tools/tests/` — Chromium tests of the page as the WebView runs it (`node run-all.js`: convert, webview, screens,
  parity, play). `app/src/test` — JUnit; `app/src/androidTest` — the real app on emulators (CI: phone, small phone, tablet).

## Required workflow for every change

Same rules as `chatraweechai/doc-scanner-pdf-code` (owner, 2026-09-27): verify for real, review for bugs and vulnerabilities,
fix, then commit and push `main`. The owner also asked (2026-09-27): *"ต่อไปเมื่อแก้ claude ต้องการให้แปลงและทดสอบใน
claude4app ด้วยทุกครั้งเหมือน claude4gas"* (`claude` is now `chatraweechai/doc-scanner-pdf-code`, `claude4app` this repository,
`claude4gas` `chatrawichai-envbr/doc-scanner-pdf-gas`) — every change in doc-scanner-pdf-code is converted and tested here in the same
session, after doc-scanner-pdf-code and doc-scanner-pdf-gas are pushed.

The owner asked (2026-09-28): *"ต่อไปนี้หากการเปลี่ยนแปลง claude4code ไม่ได้มีความแตกต่างจากเดิม แต่ยังสอดคล้องกันอยู่
ไม่ต้องแก้ไข claude4gas และ claude4app เพื่อไม่ให้เกิดการสร้าง deploy / release ซ้ำของเดิม หรือเกิดเวอร์ชั่นใหม่ปลอม
(เวอร์ชั่นเก่า แค่เปลี่ยนเลขใหม่) เด็ดขาด"* and *"ต่อไปนี้ให้ทำ changelogs กำกับไว้ด้วย"*, and that the version shown when
the app opens is the release `v` number without "เปิดเมื่อ".

0. First check whether the doc-scanner-pdf-code change reaches the app:
   `node tools/convert/build.js --source ../doc-scanner-pdf-code --check --as-commit <commit in doc-scanner-pdf-android/source.json>`.
   **OK → stop: no conversion, no commit, no release.** Differences → continue, and add a new version with its
   changelog at the top of `CHANGELOG.md`. A change to the Android code itself (Kotlin, manifest, Gradle) also needs a
   new version; CI/test/doc-only changes here need none.
1. Convert from the committed doc-scanner-pdf-code checkout, then run everything that can run locally:
   `node tools/convert/build.js --source ../doc-scanner-pdf-code`, `cd tools/tests && node run-all.js` (CLAUDE4CODE_SRC = a
   checkout of doc-scanner-pdf-code at the commit in source.json, default ../doc-scanner-pdf-code),
   `cd doc-scanner-pdf-android && ./gradlew lintDebug testDebugUnitTest assembleDebug assembleRelease assembleDebugAndroidTest`.
   New behavior gets new checks; never skip or weaken a test.
2. Review: bridge messages and file names validated natively, no `addJavascriptInterface`, no new permissions
   (no INTERNET), FileProvider paths minimal, signing secrets only in the build step of release builds of `main`
   (`RELEASE_BUILD`, checked by the convert suite), lint clean.
3. Push `main` and confirm the Android workflow is green, including the emulator jobs (the sandbox has no KVM,
   emulator tests only run in CI), the Release and the `site` job (the download page serves the new version).

## Conventions

- UI text is Thai and English. The page's texts come from doc-scanner-pdf-code (`js/i18n.js`); `templates/platform.js` adds
  English for its own messages and for the Thai errors of `BridgeProtocol.kt`/`TransferStore.kt` (`I18n.add`) and tells the
  app the page's language (bridge op `lang`) so native texts match (`UiLanguage.kt`: `res/values` = English default,
  `res/values-th` = Thai; lint fails on a missing translation). Page test contexts are Thai (`locale: 'th-TH'`); the
  webview suite and `MainActivityTest` check English (the CI emulators are English).
- Kotlin comments in Thai like the web code, tests in English.
- `targetSdk` = the newest Android version whose emulator job passes in CI (now 36; `compileSdk` 37 for androidx).
  Raise it only together with an emulator job on that version.
- Actions pinned to commit SHAs; Gradle wrapper = official Gradle (checksums verified in CI and `convert` suite —
  update the table there when upgrading Gradle).
- Commit messages: imperative summary, body with what and why.
- Reply to the owner in Thai only (owner, 2026-10-01: *"ขอข้อความภาษาไทยเท่านั้น"*).
