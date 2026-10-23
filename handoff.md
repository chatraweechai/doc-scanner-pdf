# Handoff — doc-scanner-pdf (สถานะ 2026-10-23 เวลาไทย)

**repo หลักคือ `chatraweechai/doc-scanner-pdf`** — เว็บแอป `doc-scanner-pdf-code/`, แอป Android `doc-scanner-pdf-android/`,
CI `.github/workflows/`, **เว็บไซต์ = GitHub Pages ของ repo นี้** → https://chatraweechai.github.io/doc-scanner-pdf/
กฎของเจ้าของอยู่ใน `CLAUDE.md` (ตอบภาษาไทยเท่านั้น, ทดสอบจริงก่อน push main, changelog, ห้ามเวอร์ชันปลอม/ออก release ซ้ำ,
ห้ามส่งกุญแจทางแชต, ห้ามเปลี่ยน package name) · repo เดิม `doc-scanner-pdf-code` / `doc-scanner-pdf-android` ไม่ใช้ทำงานต่อ
(CLAUDE.md/handoff.md ของสอง repo นั้นชี้มาที่นี่) · เว็บไซต์เดิม `doc-scanner-pdf/doc-scanner-pdf.github.io` ไม่ได้อัปเดตจากที่นี่แล้ว

## 0. งานที่ทำแล้ว

### 2026-10-22 รวม repo
- รวมประวัติทั้งสอง repo (commit เดิม SHA เดิม) — ตัวแอปไม่เปลี่ยนแม้แต่ไบต์เดียว (ยังเป็น v1.0.21)
- `build.js` บันทึก repo/โฟลเดอร์ตามโครงสร้างของ commit, `version.js` เทียบไฟล์แอปด้วย tree id, `tools/ci/source-checkout.sh`
  (worktree ที่ commit ใน source.json), CI ทั้งหมดย้ายมาที่ root, งาน `sync` ตรวจทุก push
- push tag ไม่ได้ (git proxy ตอบ 403) → `doc-scanner-pdf-android/tools/release/former-releases.json` ใช้แทน tag

### 2026-10-23 เว็บแอปที่ root + ย้ายเว็บไซต์และ Release มาที่ repo นี้ (เจ้าของ: "ตั้งใจใช้ และย้ายเว็บไซต์+release v 1.0.20-1.0.21 มาด้วย")
- `publish-site.sh <site-dir>`: เว็บแอปที่ root ของเว็บไซต์ แทนที่เฉพาะรายการของเว็บแอป (`.web-app-files`) ไม่แตะ `android/`,
  ไม่นำ README ขึ้นเว็บ, ใส่ลิงก์ `android/index.html` บนหน้าแรกเฉพาะบนเว็บ (index.html ของแอปไม่เปลี่ยน), ปฏิเสธ repo/โฟลเดอร์ที่ครอบ repo,
  ไม่เขียนผ่าน symlink, ต้องระบุโฟลเดอร์เสมอ
- `build-page.js`: หน้าดาวน์โหลดแบบที่เจ้าของแก้บนเว็บ (`site.css` ของโฟลเดอร์เอง, ลิงก์ `../index.html`, ติดต่อผ่านอีเมล Google Play) —
  ลองสร้างแล้ว index.html/privacy.html/site.css/APK ตรงกับหน้าเว็บจริงทุกไบต์; ลบรายการ "ย้ายหน้าดาวน์โหลด…" ออกจาก CHANGELOG v1.0.21
  ให้ตรงกับที่เจ้าของลบจากหน้าเว็บ (ไม่ใช่ไฟล์แอป)
- **`pages.yml`** (ใหม่): หลัง Web tests หรือ Android ผ่านบน main → สร้างเว็บ: เว็บแอปของ commit ใหม่สุดที่ Web tests ผ่าน +
  `android/` จาก APK ของ Release ใหม่สุด (ตรวจลายเซ็นกุญแจถาวรคนเดียว) → deploy ด้วย `actions/deploy-pages` (ไม่ต้องใช้กุญแจใด ๆ)
- **`releases-import.yml`** (ใหม่, ทำงานเมื่อ push `former-releases.json`/ตัวเอง, ทุกวัน หรือกดรัน): สร้าง Release ที่ยังไม่มีใน repo นี้ —
  v1.0.21 (tag ที่ `792cba0`, APK+AAB จาก repo เดิม ตรวจ SHA-256 + ใบรับรอง `fbbc185c…db45`, Latest) และ v1.0.20 (tag ที่ `3e50abd`,
  บันทึกจาก CHANGELOG — **ไฟล์ไม่มีให้คัดลอก**: Release เดิมหายไปกับบัญชีเดิม, APK 1.0.20 บนเว็บไซต์เดิมถูกแทนด้วย 1.0.21 แล้ว)
- เอางาน `site` (push ไป repo เว็บไซต์ด้วย `SITE_DEPLOY_KEY`) ออกจาก `android.yml`; `play.yml` และ `pages.yml` ดึงไฟล์จาก Release ของ repo นี้
  ก่อน แล้วจึงถอยไป repo เดิมถ้ายังไม่ได้คัดลอก; `published-site.yml` ตรวจ https://chatraweechai.github.io/doc-scanner-pdf/ ผ่าน HTTPS
- `version.js`: `--latest-release`, `--notes-of <X.Y.Z> <file>`; former-releases.json เก็บ commit, SHA-256 ของไฟล์, ใบรับรอง
- เอกสารทั้งหมดใช้ที่อยู่ใหม่ (CLAUDE.md, README ทุกไฟล์, PLAY_STORE.md, CHANGELOG เว็บ 2026-10-23)
- ทดสอบในเครื่อง: Android convert 44/44, play 19/19, เว็บ cache-busting 29/29 (+ ทุกชุดของเว็บผ่านใน CI) — แอปไม่เปลี่ยน (`--as-commit` OK,
  `version.js --decide` = skip)

### ผล CI
- `719b4fb` (ก่อนย้ายเว็บไซต์): ✓ Web tests, ✓ Android ทุกงานยกเว้น `site` (ขาด `SITE_DEPLOY_KEY` — งานนี้เอาออกแล้ว)
- `d435dd7`: ✓ Web tests · ✗ Import former releases: `HTTP 403 Resource not accessible by integration` ตอนสร้าง Release — token ของ
  Actions (มี contents: write) สร้าง tag ที่ commit เก่าไม่ได้ เพราะ commit เหล่านั้นมี `.github/workflows/` ต่างจาก main (ต้องมีสิทธิ์ workflows)
  และ session push tag ไม่ได้ → แก้ workflow: ใช้ tag ที่เจ้าของ push ไว้ (`--verify-tag`), ถ้ายังไม่มีจะบอกคำสั่ง (ข้อ 1.2) — ทดลองรันในเครื่อง
  ด้วย gh จำลองแล้วทั้งกรณีไม่มี tag และมี tag (v1.0.20 ไม่มีไฟล์ ไม่ใช่ latest; v1.0.21 APK+AAB ตรวจ SHA-256/ใบรับรอง เป็น latest)

## 1. ยังค้าง — ต้องทำโดยเจ้าของ

1. **เปิดให้ `pages.yml` deploy ได้**: repo นี้ → Settings → Pages → Build and deployment → Source: **GitHub Actions**
   (ตอนนี้เป็น Deploy from a branch ซึ่งแสดง README) แล้ว Actions → Pages → Run workflow (หรือรอ push ถัดไป)
2. **push tag ของ Release เดิม 2 ตัว** (session/Actions ทำไม่ได้ — ใช้ clone ใดก็ได้ของ repo นี้ด้วยบัญชีของเจ้าของ เช่น Codespaces):
   `git push https://github.com/chatraweechai/doc-scanner-pdf 3e50abd001bc4f882ba630154703cdb4ec6e2f8f:refs/tags/v1.0.20 792cba0a070c51569340109fdb4bbd5e6caf81dc:refs/tags/v1.0.21`
   แล้ว Actions → Import former releases → Run workflow (หรือรอรอบรายวัน) — tag ที่ commit เก่าจะทำให้ workflow `android.yml` รุ่นเก่าของ commit นั้น
   รันหนึ่งรอบต่อ tag (ไม่ออก Release เพราะไม่ใช่ main ยกเลิกได้)
   จากนั้น **แนบไฟล์ต้นฉบับของ v1.0.20** ที่ Release v1.0.20 ของ repo นี้ (Releases → v1.0.20 → Edit → แนบไฟล์):
   APK อยู่ในประวัติของ repo เว็บไซต์เดิม: `git clone https://github.com/doc-scanner-pdf/doc-scanner-pdf.github.io site && cd site &&
   c=$(git rev-list -n1 HEAD -- android/doc-scanner-pdf-1.0.20.apk) && git show "$c^:android/doc-scanner-pdf-1.0.20.apk" > doc-scanner-pdf-1.0.20.apk`
   (sha256 ต้องขึ้นต้นด้วย `939c54ce`); AAB ดาวน์โหลดได้จาก Play Console → App bundle explorer (versionCode 1000020)
3. **Google Play Console**: เปลี่ยน Privacy policy เป็น https://chatraweechai.github.io/doc-scanner-pdf/android/privacy.html และ Website เป็น
   https://chatraweechai.github.io/doc-scanner-pdf/android/ (หลังข้อ 1 deploy แล้ว) · อัปโหลด `.aab` v1.0.21 ผ่าน `play.yml` แล้วกด Publish
4. **Secrets ของ repo นี้** (Settings → Secrets and variables → Actions; ห้ามส่งกุญแจทางแชต): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (ค่าเดียวกับ repo Android เดิม — ต้องมีก่อนออกรุ่นใหม่), `PLAY_SERVICE_ACCOUNT_JSON` (เฉพาะ `play.yml`)
   — `SITE_DEPLOY_KEY` ไม่ต้องใช้แล้ว
5. **เว็บไซต์เดิม https://doc-scanner-pdf.github.io/**: ไม่ได้อัปเดตจากที่นี่แล้ว — เก็บไว้จนเปลี่ยนที่อยู่ใน Play Console แล้ว จากนั้นจะทำหน้าย้ายที่อยู่
   (redirect) หรือปิดก็ได้ (Claude ทำให้ได้ถ้าได้สิทธิ์ push repo นั้น)
6. (แนะนำ) Archive repo เดิมทั้งสองเมื่อ Release ย้ายครบแล้ว (อย่าลบ repo Android เดิมจนกว่าข้อ 2 เสร็จ)

## 2. ทำในเครื่อง session ไม่ได้ (CI ทำแทน)

- Gradle build/lint/unit tests และ emulator (ไม่มี Android SDK/KVM) — งานใน `android.yml`
- push tag, ตั้งค่า Pages/secrets, อ่าน/เขียน repo เว็บไซต์เดิม (proxy/สิทธิ์ไม่อนุญาต)

## 3. สถานะ Google Play

- `io.github.chatrawichaitech.docscanner` v1.0.20 (versionCode 1000020) อยู่ใน **Closed testing (Alpha)** ตั้งแต่ 2026-10-02 —
  ต้องมีผู้ทดสอบ ≥ 12 คนต่อเนื่อง 14 วัน จึงจะ Apply for production ได้

## 4. ที่อยู่สำคัญ

- เว็บไซต์: https://chatraweechai.github.io/doc-scanner-pdf/ (เว็บแอป) · https://chatraweechai.github.io/doc-scanner-pdf/android/ (ดาวน์โหลด + privacy.html)
- Release: https://github.com/chatraweechai/doc-scanner-pdf/releases (v1.0.21 APK sha256 `5d30780b…b9d454`, AAB `fb32f570…dc9f6e`)
- repo เดิม: `chatraweechai/doc-scanner-pdf-code`, `chatraweechai/doc-scanner-pdf-android` (Release v1.0.21 ต้นฉบับ) · เว็บไซต์เดิม `doc-scanner-pdf/doc-scanner-pdf.github.io`
- คู่มือ Google Play: `doc-scanner-pdf-android/PLAY_STORE.md`
