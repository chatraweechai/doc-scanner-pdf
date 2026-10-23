# CLAUDE.md

## Project

This repository is `chatraweechai/doc-scanner-pdf`: the web app and the Android app of doc-scanner-pdf in one repository.
On 2026-10-22 the owner asked to merge everything (code, files, settings) of `chatraweechai/doc-scanner-pdf-code` and
`chatraweechai/doc-scanner-pdf-android` into it. Their whole history came along unchanged (same commit ids): each repository was moved into its folder by a
pure-rename commit and merged. The tag `v1.0.21` could not be pushed from the session (the git proxy refuses tags), so
releases made before the merge are recorded in `doc-scanner-pdf-android/tools/release/former-releases.json` and count
as release tags. Earlier names: `chatrawichai-tech/claude4code`
(named `claude` until 2026-09-28) and `chatrawichai-tech/claude4app` — owner quotes below keep the names they used
(`claude`/`claude4code` = the web app, `claude4app` = the Android app). The only other linked repository is the web site
`doc-scanner-pdf/doc-scanner-pdf.github.io` → https://doc-scanner-pdf.github.io/ (clone it next to this repository as
`../doc-scanner-pdf.github.io`). The former repositories stay as they were; they are no longer worked on.

- `doc-scanner-pdf-code/` — the web app (was `chatraweechai/doc-scanner-pdf-code`):
  - `doc-scanner-pdf/` — static web app (Thai and English UI) that turns document photos into PDFs: auto/free crop,
    brightness, shadow removal, color/B&W modes, OCR (Thai + English), searchable PDF, HEIC/HEIF/WebP photos,
    PDF → JPG (small/standard/high) and PDF → Word (.docx) with exact Thai text (`js/pdf-tools.js`, PDF.js).
    **HTML + CSS + JavaScript only** — no PHP, TypeScript, Python, bundler or build step.
    Published to the top of the site repository → https://doc-scanner-pdf.github.io/ (owner, 2026-10-23: the web app is
    the site's start page; the old address /doc-scanner-pdf/ is gone), next to the Android download page `android/`.
  - `tools/tests/` — Playwright browser tests (`node run-all.js`), see its README.
  - `tools/publish-site.sh` — publishes a commit to the top of the site (git archive + `tools/stamp-build.sh`, which
    stamps the commit and commit time for cache busting; same commit → identical files; commits from before the merge
    work too). It replaces only the web app's own entries (listed in `.web-app-files` for the next publish) — never
    `android/`, `.git` or the site's other files — leaves out the app's README.md and adds, on the site only, the link to
    the Android download page on the start page (the app's own index.html stays unchanged, so the Android app does not).
  - `tools/opencv-build/` — config + smoke test for the vendored OpenCV.js builds (`opencv-build.yml`).
  - `CHANGELOG.md` — what changed for users of the web app, newest first (Thai).
- `doc-scanner-pdf-android/` — the Android app, phones + tablets (was `chatraweechai/doc-scanner-pdf-android`).
  The package name `io.github.chatrawichaitech.docscanner` never changes (installed apps and Google Play depend on it).
  - `doc-scanner-pdf-android/` — Gradle project (Kotlin, AGP 9, minSdk 26). A WebView shows `app/src/main/assets/www/`
    at `https://appassets.androidplatform.net/` (served by `AssetRouter.kt`, no INTERNET permission). `MainActivity.kt`
    adds what a WebView cannot do: camera permission, device camera / image picker, save (system "save as") and share
    through `DocScannerBridge` (WebMessageListener, protocol in `BridgeProtocol.kt`), back button, insets,
    render-process recovery. `WebSession.kt` (ViewModel) keeps the WebView and pending work across activity recreation.
  - `app/src/main/assets/www/` and `source.json` are **generated** by `tools/convert/build.js --source ../doc-scanner-pdf-code`
    (run in `doc-scanner-pdf-android/`) — never edit them by hand; change the web app (or `tools/convert/templates/platform.js`)
    and convert again. The app's JS/CSS stay byte-identical to the web app; platform differences go through
    `window.AppPlatform` hooks. `source.json`/`android/platform.js` record the repository and folder of the converted
    commit as that commit has them: `chatraweechai/doc-scanner-pdf` + `doc-scanner-pdf-code/doc-scanner-pdf` for commits
    of this repository, `chatraweechai/doc-scanner-pdf-code` + `doc-scanner-pdf` for commits from before the merge
    (the current app, v1.0.21, was converted from `a0577f5`) — so the merge itself changed no app file.
  - `CHANGELOG.md` — **its top heading is the app version** (`## v1.0.N — date`): Gradle versionName/versionCode
    (major×1,000,000 + minor×1,000 + patch), the page's "เวอร์ชัน v1.0.N (Android)" (user agent → `AppPlatform.versionLabel`),
    release notes and the download page. `tools/release/version.js --decide` (build + release jobs) releases only a new
    version of a changed app (`APP_PATHS`, compared by tree id, so tags from before the merge count); docs/CI/test-only
    changes → no release; app change without a new version, a new version without an app change (fake version) or an
    older number → CI fails.
  - Releases are always signed with the permanent key: without the `ANDROID_KEYSTORE_*` secrets the release job fails
    with instructions instead of publishing a temporary-key APK (checked by the convert suite). Releases up to v1.0.21 are
    in `chatraweechai/doc-scanner-pdf-android`; the `site` and Play upload jobs fetch those from there
    (`version.js --release vX.Y.Z` → commit + repository, from `former-releases.json`), newer ones from this repository.
  - After the Release, the `site` job pushes the same APK (refused unless signed with the permanent key) and its
    download page (`tools/site/build-page.js`, relative links only: its own `site.css`, the web app as `../index.html` —
    the owner's layout of 2026-10-22) to the site repository, folder `android/` →
    https://doc-scanner-pdf.github.io/android/, with the write deploy key in the secret `SITE_DEPLOY_KEY`
    (README: หน้าดาวน์โหลดบนเว็บไซต์). Only that job may use it (checked by the convert suite).
  - Google Play (`PLAY_STORE.md` = the owner's steps in Thai): the release job also builds the `.aab` (same signing key =
    the Play upload key). `tools/store/` makes the store listing from the real app (texts `listing/<th|en-US>/*.txt`,
    Play limits checked by the `play` suite; `build.js` images, `video.js` promo videos → `tools/store/out/`, gitignored).
    `play.yml` (manual only) builds them as the artifact `store-listing` and, when asked, uploads the `.aab` of the GitHub
    Release (refused if debug-signed) and the listing with `tools/play/publish.js`; `PLAY_SERVICE_ACCOUNT_JSON` is given
    to that one step only. Store texts must stay true to the app (no "best/#1/100 %", offline claims need no INTERNET
    permission). The privacy policy is `privacy.html` of the download page — keep it and the Data safety answers in
    `PLAY_STORE.md` true when the app changes.
  - `tools/tests/` — Chromium tests of the page as the WebView runs it (`node run-all.js`: convert, webview, screens,
    parity, play) with `CLAUDE4CODE_SRC` = the web app at the commit in `source.json`:
    `CLAUDE4CODE_SRC="$(../ci/source-checkout.sh /tmp/code-src)" node run-all.js` (a git worktree; remove it afterwards
    with `git worktree remove /tmp/code-src`). `app/src/test` — JUnit; `app/src/androidTest` — the real app on emulators.
- `.github/workflows/` — all CI of both: `tests.yml` (web tests), `published-site.yml` (daily, over HTTPS: the live site
  serves `publish-site.sh`'s output byte for byte and the latest web app — no key needed, the site repository may be private),
  `opencv-build.yml`, `android.yml` (sync → page tests → build → emulators → Release → download page), `play.yml`.
  Repository secrets (Settings → Secrets and variables → Actions of this repository, set by the owner — never sent in
  chat): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`,
  `SITE_DEPLOY_KEY`, `PLAY_SERVICE_ACCOUNT_JSON`.
- `handoff.md` — state of the work and open items; read it first and update it with every commit/push.

## Owner's working rules (2026-10-22, every session)

1. Reply in Thai and check the facts before answering.
2. Read `handoff.md` first, check it and continue whatever is unfinished.
3. Commit/push to `main` only.
4. Commit/push first, then review for bugs and vulnerabilities, then commit/push again when done.
5. Every file may be changed.
6. Work economically (tokens and session limits).
7. Record all work in `handoff.md` with every commit/push.

## Required workflow for every change

The owner asked (2026-09-27): *"ต่อไปนี้ทุกครั้งที่แก้ไข ปรับปรุง เพิ่มเติมฟังก์ชัน/ความสามารถ ต้องตรวจสอบการทำงานจริง
บั๊ก ช่องโหว่ และแก้ไข commit/push main"* — every fix, improvement or new feature must be verified in a real
browser, checked for bugs and vulnerabilities, fixed, then committed and pushed to `main`. And (2026-09-27):
*"ต่อไปเมื่อแก้ claude ต้องการให้แปลงและทดสอบใน claude4app ด้วยทุกครั้ง"* — every web app change is also converted to
the Android app and tested. Concretely:

1. **Test the web app for real.** `cd doc-scanner-pdf-code/tools/tests && npm ci --ignore-scripts && node run-all.js`.
   New behavior gets new checks — never skip or weaken an existing check to get green.
2. **Review for bugs and vulnerabilities** in the diff: user data only through `textContent` (never `innerHTML`),
   CSP in `index.html` stays strict (no inline script, no external script hosts), validate inputs/messages
   (worker ops, sizes, quads, file names), release canvases / OpenCV Mats, handle races (page deleted while
   processing), keep `file://` working (OCR excepted). Android: bridge messages and file names validated natively, no
   `addJavascriptInterface`, no new permissions (no INTERNET), FileProvider paths minimal, signing secrets only in the
   build step of release builds of `main` (`RELEASE_BUILD`, checked by the convert suite), lint clean.
3. **Changelog.** The owner asked (2026-09-28): *"ต่อไปนี้ให้ทำ changelogs กำกับไว้ด้วย"* — every change gets an entry
   (Thai, what changed for users and why) in the same commit: `doc-scanner-pdf-code/CHANGELOG.md` under today's date;
   `doc-scanner-pdf-android/CHANGELOG.md` only with a new app version (below).
4. **Android app — only real changes.** The owner asked (2026-09-28): *"ต่อไปนี้หากการเปลี่ยนแปลง claude4code ไม่ได้มีความแตกต่างจากเดิม
   แต่ยังสอดคล้องกันอยู่ ไม่ต้องแก้ไข claude4app เพื่อไม่ให้เกิดการสร้าง deploy / release ซ้ำของเดิม หรือเกิดเวอร์ชั่นใหม่ปลอม
   (เวอร์ชั่นเก่า แค่เปลี่ยนเลขใหม่) เด็ดขาด"* — never. After committing a web change, in `doc-scanner-pdf-android/` run
   `node tools/convert/build.js --source ../doc-scanner-pdf-code --check --as-commit <commit in doc-scanner-pdf-android/source.json>`.
   **OK = the app would get byte-identical files → no conversion, no new version.** Differences → convert
   (`node tools/convert/build.js --source ../doc-scanner-pdf-code`, the web change must be committed first), add a new
   version with its changelog at the top of `doc-scanner-pdf-android/CHANGELOG.md`, run its tests (above) and
   `cd doc-scanner-pdf-android && ./gradlew lintDebug testDebugUnitTest assembleDebug assembleRelease assembleDebugAndroidTest`
   (the sandbox has no Android SDK/KVM: the build and emulator jobs run in CI), commit. A change to the Android code
   itself (Kotlin, manifest, Gradle) also needs a new version; CI/test/doc-only changes need none. The `sync` job of
   `android.yml` fails on any push whose web app changes the app without a conversion. The version shown when the app
   opens is the release `v` number without "เปิดเมื่อ".
5. **Push `main`** and confirm the workflows are green: `tests.yml` and `android.yml`, including every emulator job
   (phone, small phone, tablet), the Release and the `site` job (the download page serves the new version).
6. **Publish the web site** (only after the tests pass on the pushed commit): clone `doc-scanner-pdf/doc-scanner-pdf.github.io`
   next to this repository (`../doc-scanner-pdf.github.io`), run `doc-scanner-pdf-code/tools/publish-site.sh` (defaults to
   the top of `../doc-scanner-pdf.github.io`), review the diff (`android/` must be untouched), commit and push that
   repository's `main`. Confirm that https://doc-scanner-pdf.github.io/version.json reports the new commit and run
   `published-site.yml` (Run workflow) — it checks the live site file by file, and daily that nothing is left unpublished.

## Platform-neutral app code

Keep app code platform-neutral: load files only through `window.AppPlatform` (`resolve`, `loadScript`, optional `ocrOptions`,
optional `inAppCamera: false` when the platform's frame blocks getUserMedia), never by URL directly, so the converter can
embed the code unchanged. Optional hooks for platforms without web downloads / Web Share (the Android app):
`saveFile(blob, name) → Promise<boolean>` (false = cancelled), `shareFile(blob, name)`, `shareText(text, title)`,
`cameraHelp(reason) → string` — always go through `PdfExport.download/share/shareText` and keep the web fallback when a
hook is absent. `versionLabel` (string): the platform's own release version shown instead of the commit and opening time
(the Android app: `v1.0.N`).

## Conventions

- Web: CSS/JS are loaded by `js/boot.js`, which appends `?v=<commit>-<open time>` (vendor files: `?v=<commit>`).
  Add new app scripts to `SCRIPTS` in `boot.js`, not to `index.html`; vendor libraries are loaded on demand with
  `AppPlatform.loadScript(path, true)` and other files resolved with `AppPlatform.resolve(path, isVendor)`.
  `__APP_BUILD__` placeholders are replaced only at deploy time.
- Vendored libraries live in `doc-scanner-pdf-code/doc-scanner-pdf/vendor/<name>/` with license, README/source and
  `SHA256SUMS` (CI verifies the checksums). Do not load scripts from CDNs.
- PDF.js (`vendor/pdfjs/`) must stay the **legacy** build: the modern build needs JavaScript that Android WebView 124
  (the tablet emulator in CI, still common on tablets) does not have. It is an ES module, so PDF conversion needs
  http(s) — on `file://` the button explains that, like OCR.
- Thai text taken from PDFs goes through `js/thai-text.js` and `/ActualText` (`js/pdf-actualtext.js`) — never drop
  characters silently: pages whose text may be incomplete are reported to the user (`badPages`).
- **Reply to the owner in Thai, every time** (owner, 2026-09-28: *"ขอเป็นภาษาไทยทุกครั้ง"*; 2026-10-01: *"ขอข้อความภาษาไทยเท่านั้น"*):
  chat replies, questions, status reports and summaries — Thai only. Code, commit messages and English docs keep their own conventions.
- UI text is written in Thai in the code and in `index.html`, and that Thai text is the key of the English dictionary in
  `js/i18n.js` (`I18n.t('เพิ่ม {n} หน้าแล้ว', { n })`, plural forms as `[one, other]`; errors shown to users go through
  `I18n.msg(e)`, which also translates the Thai messages of Web Workers). Every new or changed Thai text needs its English
  entry — `doc-scanner-pdf-code/tools/tests/suites/i18n.js` fails on a missing, stale or mismatched translation. The language
  follows the browser/device (any Thai in its languages → Thai, otherwise English) until the user picks one.
  Android: `templates/platform.js` adds English for its own messages and the Thai errors of `BridgeProtocol.kt`/`TransferStore.kt`
  (`I18n.add`) and tells the app the page's language (bridge op `lang`) so native texts match (`UiLanguage.kt`:
  `res/values` = English default, `res/values-th` = Thai; lint fails on a missing translation). Page test contexts are
  Thai (`locale: 'th-TH'`); the webview suite and `MainActivityTest` check English (the CI emulators are English).
- Animations: CSS in `css/style.css` (fill-mode `backwards`, never a lasting transform on an ancestor of fixed/sticky
  elements) and `js/motion.js` for the page list (FLIP slides, fading ghosts of deleted pages). The DOM always changes at
  once — nothing waits for an animation — and everything respects `prefers-reduced-motion` (`tools/tests/suites/motion.js`).
- Code comments follow the surrounding file (Kotlin comments in Thai like the web code, tests in English).
- Android `targetSdk` = the newest Android version whose emulator job passes in CI (now 36; `compileSdk` 37 for androidx).
  Raise it only together with an emulator job on that version.
- Actions pinned to commit SHAs; Gradle wrapper = official Gradle (checksums verified in CI and the `convert` suite —
  update the table there when upgrading Gradle).
- Commit messages: imperative summary line, body explaining what and why.
