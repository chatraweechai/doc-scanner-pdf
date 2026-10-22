# Handoff — doc-scanner-pdf (สถานะ 2026-10-21 เวลาไทย)

ไฟล์นี้มีเนื้อหาเดียวกันใน `chatraweechai/doc-scanner-pdf-code`, `chatraweechai/doc-scanner-pdf-android` และ `chatraweechai/doc-scanner-pdf`
กฎการทำงานของเจ้าของอยู่ใน `CLAUDE.md` ของ repo โค้ดและ Android เช่น ตอบเป็นภาษาไทยเท่านั้น ทดสอบจริงก่อน push main
ทำ changelog ห้ามออกเวอร์ชันปลอม ห้ามส่งกุญแจทางแชต ห้ามแตะ doc-scanner-pdf-gas และห้ามเปลี่ยน package name

## 0. ความคืบหน้า (session 2026-10-20 ช่วงดึก)

ทำเสร็จและ push main แล้ว:
- **repo โค้ด `a0577f5`**: อัปเกรด libheif 1.23.2 → 1.23.5 (ปิดช่องโหว่ HEIC: GHSA-x8r2-mggj-j6wr heap overflow,
  GHSA-8fmq-r4pf-7m57 deadlock, OOB read, memory exhaustion) — ไฟล์ตรงกับ npm `libheif-js@1.23.5` ทุกไบต์
  (ตรวจ integrity sha512 แล้ว และตรงกับไฟล์ใน repo `chatraweechai/doc-scanner-pdf` ที่เคยอัปเกรดไว้เมื่อ 2026-10-14)
  ถอดรหัส HEIC ทดสอบได้พิกเซลเหมือน 1.23.2 ทุกไบต์ · แก้คอมเมนต์ GAS ใน boot.js · คืนสิทธิ์รันได้ (+x)
  ให้ `tools/publish-site.sh`, `tools/stamp-build.sh` · CHANGELOG 2026-10-20 · ชุดทดสอบผ่าน 10/10
- **repo Android `792cba0` = v1.0.21**: แปลงจาก `a0577f5` (การเปลี่ยนแอปจริง จึงออกรุ่นใหม่ได้ตามคำสั่งเจ้าของ)
  `SOURCE_REPO` = `chatraweechai/doc-scanner-pdf-code`, source.json ชี้ commit ที่มีอยู่จริงแล้ว (แก้ปัญหา `2bdc6e8`)
  · คืนสิทธิ์ +x ให้ `gradlew` และสคริปต์ใน `tools/` (สาเหตุที่ CI Android ล้มทุกรอบตั้งแต่กู้ไฟล์:
  `verify-gradle-wrapper.sh: Permission denied`, emulator เริ่มไม่ได้) · CHANGELOG v1.0.21 · ชุดทดสอบผ่านครบ
  (convert 37/37, webview 28, screens 11, parity 12, play 19)
- เว็บไซต์ใหม่ออนไลน์แล้ว (เจ้าของสร้างเอง): https://doc-scanner-pdf.github.io/doc-scanner-pdf/ (version.json ยังเป็น
  commit เก่า `3a6c8a6`), https://doc-scanner-pdf.github.io/android/ (ยังเป็น 1.0.20), privacy.html ตอบ 200

ผล CI หลัง push: ดูข้อ 0.1 (อัปเดตท้าย session)

### 0.1 ผล CI

- repo โค้ด tests.yml บน `a0577f5`: ✓ ผ่าน
- repo Android android.yml บน `792cba0` (run 39462102374): ✓ sync, build/lint/unit tests, page tests, emulator ครบ 3 เครื่อง
  (phone, small-phone, tablet), ✓ **GitHub Release v1.0.21** (APK sha256 `5d30780b…`, AAB `fb32f570…`) — ตรวจแล้วว่า APK
  เซ็นด้วยกุญแจถาวร (ใบรับรอง SHA-256 `fbbc185c…db45` ตรงกับข้อ 1) แสดงว่าเจ้าของตั้ง `ANDROID_KEYSTORE_*` แล้ว
  ✗ งาน `site` ล้ม: ยังไม่มี secret `SITE_DEPLOY_KEY` → หน้าดาวน์โหลดยังเป็น 1.0.20 (ดูข้อ 1.1)

## 1. ยังค้าง — ต้องทำโดยเจ้าของ

1. **Secret `SITE_DEPLOY_KEY` ใน repo Android** (Settings → Secrets and variables → Actions; ห้ามส่งกุญแจทางแชต):
   สร้าง deploy key แบบ **Allow write access** ใน repo `doc-scanner-pdf/doc-scanner-pdf.github.io` แล้วใส่ private key
   เป็น secret นี้ จากนั้น Actions → Android → run 39462102374 → **Re-run failed jobs** → หน้าดาวน์โหลดเป็น v1.0.21
   (secrets `ANDROID_KEYSTORE_*` ตั้งแล้ว — Release v1.0.21 ออกได้; `PLAY_SERVICE_ACCOUNT_JSON` ยังไม่ได้ตรวจ ใช้เฉพาะ `play.yml`)
2. **เผยแพร่เว็บแอปรุ่นใหม่** ไปที่ `doc-scanner-pdf/doc-scanner-pdf.github.io` โฟลเดอร์ `doc-scanner-pdf/`:
   session นี้ไม่มีสิทธิ์ push repo เว็บไซต์ (add_repo: ต้องมี push access) — ให้สิทธิ์ Claude GitHub App กับ org
   `doc-scanner-pdf` หรือรันเอง: clone ไว้ข้าง repo โค้ดเป็น `../doc-scanner-pdf.github.io` แล้ว
   `tools/publish-site.sh` (ค่าเริ่มต้นเขียนลง `../doc-scanner-pdf.github.io/doc-scanner-pdf`) → commit/push main ของ repo เว็บ
   — `published-site.yml` (ตรวจรายวัน) จะล้มจนกว่าจะเผยแพร่ commit ล่าสุด
3. **Google Play**: Release v1.0.21 มีแล้ว — อัปโหลด `.aab` ผ่าน workflow `play.yml` (ทำเองแบบ manual) แล้วกด Publish
   ใน Publishing overview (Managed publishing เปิดอยู่)

## 2. ยังไม่ได้ทำในเครื่อง (ทำใน CI แทน)

- Gradle `lintDebug testDebugUnitTest assembleDebug assembleRelease assembleDebugAndroidTest` และ emulator:
  เครื่อง session ไม่มี Android SDK — งาน build/emulator ใน CI ทำแทน (การเปลี่ยน Kotlin มีแค่คอมเมนต์ 1 บรรทัด)

## 3. สถานะ Google Play

- แอป `io.github.chatrawichaitech.docscanner` v1.0.20 (versionCode 1000020) อยู่ใน **Closed testing (Alpha)** ตั้งแต่ 2026-10-02
- ต้องมีผู้ทดสอบ ≥ 12 คนต่อเนื่อง 14 วัน จึงจะ Apply for production ได้
- เจ้าของเปลี่ยน Privacy policy / Website ใน Play Console เป็นที่อยู่ใหม่แล้ว (https://doc-scanner-pdf.github.io/android/privacy.html)

## 4. ประวัติการกู้คืน (สรุป)

- repo ชุดเดิม (`chatrawichai-tech`, ต่อมา `chatrawichai-envbr`) ใช้ไม่ได้แล้ว เจ้าของกู้ไฟล์ขึ้น `chatraweechai/*` เมื่อ 2026-10-20
  (สถานะเช้า 2026-10-02) — ประวัติ commit, tag, GitHub Release v1.0.20, artifacts และ secrets ไม่กลับมา
- session 2026-10-20 ช่วงแรก: ใส่ patch ที่หายกลับ (screens test, PLAY_STORE.md 403), เปลี่ยนชื่อ repo เป็น `chatraweechai`,
  ย้ายเว็บไซต์ไป `doc-scanner-pdf/doc-scanner-pdf.github.io`, เลิกเชื่อมโยง GAS ในเอกสาร
- ไฟล์แอป Android ใน repo ตรงกับ APK 1.0.20 ที่ปล่อยจริงทุกไฟล์ (ตรวจเมื่อ 2026-10-20) ก่อนเปลี่ยนเป็น v1.0.21
- `chatraweechai/doc-scanner-pdf` = สำเนาเว็บแอปที่นำเข้าจาก Google Drive (2026-10-14) ไม่ได้เชื่อมกับ CI/เว็บไซต์;
  ต้นฉบับจริงคือ `doc-scanner-pdf-code` (ตอนนี้ libheif 1.23.5 เท่ากันแล้ว)

## 5. ที่อยู่สำคัญ

- repo: `chatraweechai/doc-scanner-pdf-code` (ต้นฉบับ), `chatraweechai/doc-scanner-pdf-android`, `chatraweechai/doc-scanner-pdf` (สำเนา)
- เว็บไซต์: `doc-scanner-pdf/doc-scanner-pdf.github.io` → https://doc-scanner-pdf.github.io/
- APK 1.0.20 ตัวจริง: https://doc-scanner-pdf.github.io/android/doc-scanner-pdf-1.0.20.apk (sha256 `939c54ce…`)
- คู่มือ Google Play: `PLAY_STORE.md` (repo Android)
