# CLAUDE.md

## Project

This repository is `chatrawichai-envbr/doc-scanner-pdf-code`. Until 2026-10-01 it was `chatrawichai-tech/claude4code` (named
`claude` until 2026-09-28); those repositories are gone and the owner restored all four into the `chatrawichai-envbr` account:

| was | now |
|---|---|
| `chatrawichai-tech/claude4code` (this one) | `chatrawichai-envbr/doc-scanner-pdf-code` |
| `chatrawichai-tech/claude4gas` (Apps Script twin) | `chatrawichai-envbr/doc-scanner-pdf-gas` |
| `chatrawichai-tech/claude4app` (Android twin) | `chatrawichai-envbr/doc-scanner-pdf-android` |
| `chatrawichai-tech/chatrawichai-tech.github.io` (web site) | `chatrawichai-envbr/chatrawichai-envbr.github.io` → https://chatrawichai-envbr.github.io/ |

Owner quotes below keep the names they used (`claude`, `claude-gas`, `claude4gas`, `claude4app`). Clone the four
repositories next to each other under their new names (`../doc-scanner-pdf-code`, `../doc-scanner-pdf-gas`,
`../doc-scanner-pdf-android`, `../chatrawichai-envbr.github.io`).

- `doc-scanner-pdf/` — static web app (Thai and English UI) that turns document photos into PDFs: auto/free crop,
  brightness, shadow removal, color/B&W modes, OCR (Thai + English), searchable PDF, HEIC/HEIF/WebP photos,
  PDF → JPG (small/standard/high) and PDF → Word (.docx) with exact Thai text (`js/pdf-tools.js`, PDF.js).
  **HTML + CSS + JavaScript only** — no PHP, TypeScript, Python, bundler or build step.
  The public web site is the build output published to `chatrawichai-envbr/chatrawichai-envbr.github.io` (GitHub Pages user site),
  folder `doc-scanner-pdf/` → https://chatrawichai-envbr.github.io/doc-scanner-pdf/. All code stays here.
- `tools/tests/` — Playwright browser tests (`node run-all.js`), see its README.
- `tools/publish-site.sh` — builds the site folder from a commit (git archive + `tools/stamp-build.sh`, which stamps
  the commit and commit time for cache busting; same commit → identical files).
- `tools/opencv-build/` — config + smoke test for the vendored OpenCV.js builds (`opencv-build.yml`).
- `CHANGELOG.md` — what changed for users, newest first (Thai).

## Required workflow for every change

The owner asked (2026-09-27): *"ต่อไปนี้ทุกครั้งที่แก้ไข ปรับปรุง เพิ่มเติมฟังก์ชัน/ความสามารถ ต้องตรวจสอบการทำงานจริง
บั๊ก ช่องโหว่ และแก้ไข commit/push main"* — every fix, improvement or new feature must be verified in a real
browser, checked for bugs and vulnerabilities, fixed, then committed and pushed to `main`. Concretely:

1. **Test for real.** Run the suites (`cd tools/tests && npm ci --ignore-scripts && node run-all.js`).
   New behavior gets new checks in `tools/tests/suites/` — never skip or weaken an existing check to get green.
2. **Review for bugs and vulnerabilities** in the diff: user data only through `textContent` (never `innerHTML`),
   CSP in `index.html` stays strict (no inline script, no external script hosts), validate inputs/messages
   (worker ops, sizes, quads, file names), release canvases / OpenCV Mats, handle races (page deleted while
   processing), keep `file://` working (OCR excepted). Fix everything found and re-run the tests.
3. **Changelog.** The owner asked (2026-09-28): *"ต่อไปนี้ให้ทำ changelogs กำกับไว้ด้วย"* — every change gets an
   entry in `CHANGELOG.md` (under today's date, in Thai, what changed for users and why), in the same commit.
4. **Commit and push to `main`** (also push the working branch if one is in use); `tests.yml` runs every suite
   again — confirm it is green.
5. **Publish the web site** (only after the tests pass on the pushed commit): clone/attach `chatrawichai-envbr/chatrawichai-envbr.github.io`
   next to this repo (as `../chatrawichai-envbr.github.io`), run `tools/publish-site.sh` (defaults to
   `../chatrawichai-envbr.github.io/doc-scanner-pdf`),
   review the diff, commit and push that repo's `main` following its CLAUDE.md. Its workflow waits for GitHub Pages and
   checks the live site file by file — confirm it is green and that
   https://chatrawichai-envbr.github.io/doc-scanner-pdf/version.json reports the new commit. `published-site.yml` here
   checks daily that the published folder is exactly `publish-site.sh`'s output and that nothing is left unpublished.

## Apps Script twin: `chatrawichai-envbr/doc-scanner-pdf-gas` (required for every change)

The owner asked (2026-09-27): *"ต่อไปนี้ทุกครั้งที่มีการสร้าง แก้ไข ปรับปรุง เพิ่มเติมใดๆ ใน repo claude ต้องทำแบบเดียวกัน
แปลงเป็น code สำหรับ google app script ใน repo claude-gas ด้วย และต่อไปต้องตรวจความสอดคล้องของทั้งสอง repo
ทดสอบการทำงานจริง บั๊ก ช่องโหว่ และแก้ไข commit/push main ทั้งสอง repo ด้วย"* (that repo was `claude4gas`, now
`chatrawichai-envbr/doc-scanner-pdf-gas`).

After every change here is committed and pushed, in the same session:
clone/attach `chatrawichai-envbr/doc-scanner-pdf-gas` next to this repo, check whether the change reaches it (below), and if it
does run `node tools/convert/build.js --source ../doc-scanner-pdf-code` there, run its tests (`tools/tests`: convert,
server, app, parity — the parity suite requires web and Apps Script to produce identical results), review, then commit
and push its `main`. Follow its CLAUDE.md. Do not remind the owner or suggest setting up its Apps Script deploy
(`CLASPRC_JSON`, `GAS_SCRIPT_ID`) — owner, 2026-10-01: *"ไม่ต้องแจ้งเตือน เสนอแนะ ให้ Apps Script ใช้ตัวที่แก้แล้ว อีกต่อไป"*. Keep app code
platform-neutral: load files only through `window.AppPlatform` (`resolve`, `loadScript`, optional `ocrOptions`,
optional `inAppCamera: false` when the platform's frame blocks getUserMedia), never by URL directly, so the
converter can embed the code unchanged. Optional hooks for platforms without web downloads / Web Share (the Android
app, `chatrawichai-envbr/doc-scanner-pdf-android`): `saveFile(blob, name) → Promise<boolean>` (false = cancelled),
`shareFile(blob, name)`, `shareText(text, title)`, `cameraHelp(reason) → string` — always go through
`PdfExport.download/share/shareText` and keep the web fallback when a hook is absent. `versionLabel` (string): the
platform's own release version shown instead of the commit and opening time (the Android app: `v1.0.N`).

## Android twin: `chatrawichai-envbr/doc-scanner-pdf-android` (required for every change)

The owner asked (2026-09-27): *"ต่อไปเมื่อแก้ claude ต้องการให้แปลงและทดสอบใน claude4app ด้วยทุกครั้งเหมือน claude4gas"* —
every change here is also converted to the Android app (that repo was `claude4app`, now `chatrawichai-envbr/doc-scanner-pdf-android`)
and tested, exactly like the Apps Script twin.

After every change here is committed and pushed (and the Apps Script twin is done), in the same session:
clone/attach `chatrawichai-envbr/doc-scanner-pdf-android` next to this repo, check whether the change reaches it (below), and if it
does run `node tools/convert/build.js --source ../doc-scanner-pdf-code` there, add its `CHANGELOG.md` version entry, run its tests (`tools/tests`: convert, webview, screens, parity — web and Android must produce identical
results) and `cd doc-scanner-pdf-android && ./gradlew lintDebug testDebugUnitTest assembleDebug assembleRelease
assembleDebugAndroidTest`, review, then commit and push its `main`. Follow its CLAUDE.md. The emulator tests
(phone, small phone, tablet) run only in its CI: confirm the Android workflow is green, including every emulator job,
and that it published the new Release with the APK and the download page on the web site. New behavior gets checks there too (page suites and, for anything a
device does differently, `MainActivityTest`).

### Only real changes reach the twins

The owner asked (2026-09-28): *"ต่อไปนี้หากการเปลี่ยนแปลง claude4code ไม่ได้มีความแตกต่างจากเดิม แต่ยังสอดคล้องกันอยู่
ไม่ต้องแก้ไข claude4gas และ claude4app เพื่อไม่ให้เกิดการสร้าง deploy / release ซ้ำของเดิม หรือเกิดเวอร์ชั่นใหม่ปลอม
(เวอร์ชั่นเก่า แค่เปลี่ยนเลขใหม่) เด็ดขาด"* — never. Before converting, run in each twin
`node tools/convert/build.js --source ../doc-scanner-pdf-code --check --as-commit <commit in its source.json>`: it converts this
repository's current files but names the twin's recorded commit. **OK = the twin would get byte-identical app files
(e.g. a README, test or tooling change here) → leave the twin untouched: no conversion, no commit, no push.** Only when
it reports differences, convert, test, add the twin's changelog entry and push. The twins' daily check uses the same
comparison, so an unconverted change that does not affect them is not an error.

This repository is public (the owner restored it as public on 2026-10-01), so the twins' CI checks it out without
credentials. If it is made private again, add a read-only deploy key here (write access off) and its private key as the
secret `CLAUDE_REPO_KEY` in each twin — their workflows use it whenever it is set.

## Conventions

- CSS/JS are loaded by `js/boot.js`, which appends `?v=<commit>-<open time>` (vendor files: `?v=<commit>`).
  Add new app scripts to `SCRIPTS` in `boot.js`, not to `index.html`; vendor libraries are loaded on demand with
  `AppPlatform.loadScript(path, true)` and other files resolved with `AppPlatform.resolve(path, isVendor)`.
  `__APP_BUILD__` placeholders are replaced only at deploy time.
- Vendored libraries live in `doc-scanner-pdf/vendor/<name>/` with license, README/source and `SHA256SUMS`
  (CI verifies the checksums). Do not load scripts from CDNs.
- PDF.js (`vendor/pdfjs/`) must stay the **legacy** build: the modern build needs JavaScript that Android WebView 124
  (the tablet emulator in the Android twin's CI, still common on tablets) does not have. It is an ES module, so PDF
  conversion needs http(s) — on `file://` the button explains that, like OCR.
- Thai text taken from PDFs goes through `js/thai-text.js` and `/ActualText` (`js/pdf-actualtext.js`) — never drop
  characters silently: pages whose text may be incomplete are reported to the user (`badPages`).
- **Reply to the owner in Thai, every time** (owner, 2026-09-28: *"ขอเป็นภาษาไทยทุกครั้ง"*; 2026-10-01: *"ขอข้อความภาษาไทยเท่านั้น"*):
  chat replies, questions, status reports and summaries — Thai only. Code, commit messages and English docs keep their own conventions.
- UI text is written in Thai in the code and in `index.html`, and that Thai text is the key of the English dictionary in
  `js/i18n.js` (`I18n.t('เพิ่ม {n} หน้าแล้ว', { n })`, plural forms as `[one, other]`; errors shown to users go through
  `I18n.msg(e)`, which also translates the Thai messages of Web Workers). Every new or changed Thai text needs its English
  entry — `tools/tests/suites/i18n.js` fails on a missing, stale or mismatched translation. The language follows the
  browser/device (any Thai in its languages → Thai, otherwise English) until the user picks one with the language button.
  Code comments follow the surrounding file.
- Animations: CSS in `css/style.css` (fill-mode `backwards`, never a lasting transform on an ancestor of fixed/sticky
  elements) and `js/motion.js` for the page list (FLIP slides, fading ghosts of deleted pages). The DOM always changes at
  once — nothing waits for an animation — and everything respects `prefers-reduced-motion` (`tools/tests/suites/motion.js`).
- Commit messages: imperative summary line, body explaining what and why.
