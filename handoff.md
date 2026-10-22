# Handoff — doc-scanner-pdf (สถานะ 2026-10-22 เวลาไทย)

**repo หลักตอนนี้คือ `chatraweechai/doc-scanner-pdf`** (repo รวม) — เว็บแอปอยู่ใน `doc-scanner-pdf-code/`, แอป Android อยู่ใน
`doc-scanner-pdf-android/`, CI ทั้งหมดอยู่ใน `.github/workflows/` · กฎการทำงานของเจ้าของอยู่ใน `CLAUDE.md` (ตอบภาษาไทยเท่านั้น
ทดสอบจริงก่อน push main, changelog, ห้ามออกเวอร์ชันปลอม, ห้ามส่งกุญแจทางแชต, ห้ามเปลี่ยน package name)
repo เดิม `chatraweechai/doc-scanner-pdf-code` และ `chatraweechai/doc-scanner-pdf-android` ไม่ใช้ทำงานต่อแล้ว (handoff.md ของสอง repo นั้นชี้มาที่นี่)

## 0. ความคืบหน้า (session 2026-10-22)

งาน: รวมโค้ด ไฟล์ทุกไฟล์ และการตั้งค่าทั้งหมดของ `doc-scanner-pdf-code` และ `doc-scanner-pdf-android` มาที่ `doc-scanner-pdf`
(repo นี้ว่างเปล่าก่อนเริ่ม — สำเนาเว็บแอปจาก Google Drive ที่เคยอยู่ที่นี่ไม่มีแล้ว)

ทำแล้ว:
- **ประวัติ commit ครบ, SHA เดิม**: แต่ละ repo ย้ายไฟล์ทั้งหมดเข้าโฟลเดอร์ของตัวเองด้วย commit ที่เป็นการ rename ล้วน แล้ว merge
  เข้าด้วยกัน (`git log --follow` ใช้ได้) — commit ต้นทางของแอป `a0577f5` และ commit ของ v1.0.21 `792cba0` อยู่ในประวัติ
- **push tag `v1.0.21` ไม่ได้** (git proxy ของ session ตอบ 403 กับ tag) → บันทึกรุ่นก่อนรวม repo ไว้ใน
  `doc-scanner-pdf-android/tools/release/former-releases.json` (v1.0.21 → `792cba0`, Release อยู่ใน repo Android เดิม) — `version.js`
  ใช้แทน tag จึงไม่ออก v1.0.21 ซ้ำ; `version.js --release v1.0.21` บอก commit/repo ให้งาน `site` และ Play
- **ตัวแอปไม่เปลี่ยนแม้แต่ไบต์เดียว** (ไม่มีรุ่นใหม่ปลอม — ยังเป็น v1.0.21): `build.js` บันทึก repo/โฟลเดอร์ต้นทางตามโครงสร้างของ
  commit นั้นเอง (commit ก่อนรวม → `chatraweechai/doc-scanner-pdf-code`; commit ใหม่ → `chatraweechai/doc-scanner-pdf` +
  `doc-scanner-pdf-code/doc-scanner-pdf`) · `version.js` เทียบไฟล์แอปด้วย tree id ข้ามโครงสร้าง → `skip` (v1.0.21 ออกแล้ว แอปไม่เปลี่ยน)
- **CI ย้ายมาที่ root**: `tests.yml` (ชื่อใหม่ "Web tests"), `published-site.yml`, `opencv-build.yml`, `android.yml`, `play.yml`
  ปรับ path ทั้งหมด; Android ไม่ checkout repo โค้ดอื่นแล้ว — ใช้ `doc-scanner-pdf-android/tools/ci/source-checkout.sh`
  (git worktree ที่ commit ใน source.json จากประวัติของ repo เอง); `sync` ตรวจทุก push ว่าเว็บแอปของ commit นั้นให้แอปเดียวกัน
- Release ก่อนรวม (≤ v1.0.21) อยู่ใน `chatraweechai/doc-scanner-pdf-android` → งาน `site` และอัปโหลด Play ดึง APK/AAB จากที่นั่น
  (รุ่นใหม่: GitHub Release ของ repo นี้ — tag สร้างโดย `gh release create` ฝั่ง GitHub)
- `publish-site.sh` ใช้ได้ทั้ง commit ใหม่และ commit ก่อนรวม; `published-site.yml` เทียบด้วย tree id
- เอกสาร: `CLAUDE.md` เดียวที่ root (รวมกฎทั้งสอง repo + กฎ 7 ข้อของเจ้าของวันที่ 2026-10-22), `README.md` ที่ root,
  README/PLAY_STORE ของ Android และ README เว็บแอปชี้ repo รวม, CHANGELOG เว็บ 2026-10-22
- ทดสอบในเครื่อง: Android convert 40/40 (การทดสอบใหม่ 3 ข้อ: ตัดสิน release หลังย้ายโฟลเดอร์, repo ต้นทางตามโครงสร้าง commit,
  รุ่นก่อนรวม repo),
  play 19/19, `build.js --check` ที่ `a0577f5` OK, `--as-commit` จากเว็บแอปปัจจุบัน OK, `publish-site.sh` ทั้งสองโครงสร้าง OK

ผลทดสอบทั้งหมดและ CI หลัง push: ดูข้อ 0.1

- เจ้าของเพิ่ม `.claude/settings.json` (อนุญาต `git tag -a v*`, `git push origin v*`) — ลอง push tag `v1.0.21` อีกครั้งแล้วยังได้ 403
  จาก git proxy (ไม่ใช่สิทธิ์ของ Claude Code) จึงใช้ `former-releases.json` ต่อ; ถ้าเจ้าของ push tag เองจากเครื่อง
  (`git fetch https://github.com/chatraweechai/doc-scanner-pdf-android v1.0.21:refs/tags/v1.0.21 && git push origin v1.0.21`) ก็ใช้ได้เหมือนกัน
- review รอบหลัง push: ขั้น "The web app at the source commit" ใน `android.yml`/`play.yml` เดิมไม่ล้มเมื่อ `source-checkout.sh` ล้ม
  (`echo "$(…)"` กลืน exit code) → แก้ให้ล้มทันที

### 0.1 ผลทดสอบ/CI

- ในเครื่อง: เว็บ 10/10 ชุดผ่าน (cache-busting 26 รวมการเผยแพร่เว็บจาก repo รวม, detect 7, e2e 26, edge 33, formats 8, i18n 35,
  motion 25, ocr 14, pdf-convert 55, searchable-pdf 23); Android convert 40/40, play 19/19
- CI `af652e4`: งาน sync (แอป Android = เว็บแอปที่แปลงแล้ว) ✓ — ที่เหลือ (อัปเดตท้าย session)
- CI `6c3cda7` (push แรก): งาน release คาดว่าล้ม (ยังไม่มี `former-releases.json` → ตัดสินว่า "รุ่นแรก" แต่ไม่มีกุญแจ → ไม่ออก Release
  ตามที่ออกแบบไว้) — แก้แล้วใน `af652e4`

## 1. ยังค้าง — ต้องทำโดยเจ้าของ

1. **Secrets ของ repo รวม** (Settings → Secrets and variables → Actions ของ `chatraweechai/doc-scanner-pdf`; secrets คัดลอกข้าม repo
   ไม่ได้ ต้องใส่ใหม่ — ห้ามส่งกุญแจทางแชต): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD` (ค่าเดียวกับใน repo Android เดิม — ไม่มีก็ยังทำงานได้จนกว่าจะออกรุ่นใหม่ ซึ่งจะล้มพร้อมบอกวิธี),
   `SITE_DEPLOY_KEY` (deploy key แบบ **Allow write access** ของ `doc-scanner-pdf/doc-scanner-pdf.github.io` — ทำให้หน้าดาวน์โหลดเป็น
   v1.0.21; ตอนนี้ยังเป็น 1.0.20), `PLAY_SERVICE_ACCOUNT_JSON` (เฉพาะ `play.yml`)
2. **เผยแพร่เว็บแอปรุ่นใหม่** ไปที่ `doc-scanner-pdf/doc-scanner-pdf.github.io` โฟลเดอร์ `doc-scanner-pdf/` (version.json ยังเป็น `3a6c8a6`
   ซึ่งไม่อยู่ในประวัติใดแล้ว → `published-site.yml` ล้มรายวันจนกว่าจะเผยแพร่): session ไม่มีสิทธิ์ push repo เว็บไซต์ — ให้สิทธิ์
   Claude GitHub App กับ org `doc-scanner-pdf` หรือรันเอง: clone ไว้ข้าง repo นี้เป็น `../doc-scanner-pdf.github.io` แล้ว
   `doc-scanner-pdf-code/tools/publish-site.sh` → commit/push main ของ repo เว็บไซต์
3. **Google Play**: อัปโหลด `.aab` v1.0.21 ผ่าน `play.yml` ของ repo นี้ (ดึง AAB จาก Release ของ repo Android เดิมให้อัตโนมัติ)
   แล้วกด Publish ใน Publishing overview (Managed publishing เปิดอยู่)
4. (แนะนำ) เมื่อ CI ของ repo รวมเขียวแล้ว **Archive** repo เดิมทั้งสอง (Settings → Archive) เพื่อไม่ให้ CI รายวันของ repo เดิมทำงานซ้ำ
   — อย่าลบ repo Android เดิม เพราะ Release v1.0.21 (APK/AAB) อยู่ที่นั่น

## 2. ยังไม่ได้ทำในเครื่อง (ทำใน CI แทน)

- Gradle `lintDebug testDebugUnitTest assembleDebug assembleRelease assembleDebugAndroidTest` และ emulator: เครื่อง session ไม่มี
  Android SDK/KVM — งาน build/emulator ใน `android.yml` ทำแทน (ไม่มีการแก้ Kotlin/Gradle ใน session นี้)

## 3. สถานะ Google Play

- แอป `io.github.chatrawichaitech.docscanner` v1.0.20 (versionCode 1000020) อยู่ใน **Closed testing (Alpha)** ตั้งแต่ 2026-10-02
- ต้องมีผู้ทดสอบ ≥ 12 คนต่อเนื่อง 14 วัน จึงจะ Apply for production ได้
- Privacy policy / Website ใน Play Console = https://doc-scanner-pdf.github.io/android/privacy.html

## 4. ประวัติ (สรุป)

- repo ชุดเดิม (`chatrawichai-tech`, ต่อมา `chatrawichai-envbr`) ใช้ไม่ได้แล้ว เจ้าของกู้ไฟล์ขึ้น `chatraweechai/*` เมื่อ 2026-10-20
  (สถานะเช้า 2026-10-02) — ประวัติก่อนนั้น, tag, Release v1.0.20, artifacts และ secrets ไม่กลับมา
- 2026-10-20: libheif 1.23.5 (ปิดช่องโหว่ HEIC) → repo โค้ด `a0577f5`; แอป Android v1.0.21 (`792cba0`) Release แล้ว
  (APK sha256 `5d30780b…`, AAB `fb32f570…`, ใบรับรอง SHA-256 `fbbc185c…db45` = กุญแจถาวร); งาน `site` ล้มเพราะยังไม่มี `SITE_DEPLOY_KEY`
- 2026-10-22: รวมทุกอย่างมาที่ `chatraweechai/doc-scanner-pdf` (ข้อ 0)

## 5. ที่อยู่สำคัญ

- repo: `chatraweechai/doc-scanner-pdf` (หลัก) · เดิม: `chatraweechai/doc-scanner-pdf-code`, `chatraweechai/doc-scanner-pdf-android` (Release ≤ v1.0.21)
- เว็บไซต์: `doc-scanner-pdf/doc-scanner-pdf.github.io` → https://doc-scanner-pdf.github.io/ (เว็บแอป `/doc-scanner-pdf/`, หน้าดาวน์โหลด `/android/`)
- APK 1.0.20 ตัวจริง: https://doc-scanner-pdf.github.io/android/doc-scanner-pdf-1.0.20.apk (sha256 `939c54ce…`)
- คู่มือ Google Play: `doc-scanner-pdf-android/PLAY_STORE.md`
