# สแกนเอกสาร PDF — แอป Android

แอป Android (มือถือและแท็บเล็ต) ที่แปลงภาพถ่ายเอกสารเป็นไฟล์ PDF: ครอปอัตโนมัติตามขอบกระดาษหรือครอปเองอิสระ,
ปรับแสง, ลบเงา, โหมดสีสดคมชัด/ขาวดำตัวอักษรคม, แปลงภาพเป็นข้อความ (OCR ไทย + อังกฤษ) และ PDF ที่ค้นหาข้อความได้
— แปลงอัตโนมัติจากเว็บแอป [`chatrawichai-envbr/doc-scanner-pdf-code`](https://github.com/chatrawichai-envbr/doc-scanner-pdf-code) (โฟลเดอร์ `doc-scanner-pdf`)
โดยโค้ดของแอปเหมือนเวอร์ชันเว็บทุกไบต์

repo นี้คือ `chatrawichai-envbr/doc-scanner-pdf-android` — กู้คืนเมื่อ 2026-10-01 จาก `chatrawichai-tech/claude4app` (บัญชีเดิมใช้ไม่ได้แล้ว);
repo ต้นทาง `claude4code` เป็น `chatrawichai-envbr/doc-scanner-pdf-code` และเว็บไซต์เป็น `chatrawichai-envbr/chatrawichai-envbr.github.io`

- ทำงานในเครื่องทั้งหมด **ไม่ต้องใช้อินเทอร์เน็ต** (แอปไม่ขอสิทธิ์อินเทอร์เน็ตเลย) — ภาพเอกสารไม่ถูกส่งไปที่ใด
- **กล้องในแอป** ถ่ายหลายหน้าต่อเนื่องพร้อมกรอบตรวจจับเอกสารแบบสด หรือใช้ **กล้องของเครื่อง** / **เลือกรูปภาพ**
  (JPEG, PNG, WebP และ **HEIC/HEIF** จาก iPhone/มือถือหลายรุ่น — ถอดรหัสในแอป)
- **แปลงไฟล์ PDF เป็นรูป JPG** (Small / Standard / High) หรือ **Word (.docx) ภาษาไทยตรงตามต้นฉบับ** — เลือกไฟล์ PDF
  ผ่านหน้าต่างของ Android หน้าที่เป็นภาพสแกนอ่านด้วย OCR และบอกให้ตรวจทาน
- **บันทึก PDF / .txt / .docx / .jpg / .zip** ผ่านหน้าต่าง "บันทึกเป็น" ของ Android (เลือกโฟลเดอร์ Downloads, Google Drive ฯลฯ ได้) และ **แชร์** ไปแอปอื่น
- รองรับจอทุกขนาด: มือถือจอเล็ก (320dp), มือถือแนวนอน, แท็บเล็ต 7–12 นิ้ว, จอพับ, แยกหน้าจอ — หมุนจอหรือปรับขนาดหน้าต่างแล้วหน้าที่สแกนไว้ไม่หาย
- **ภาษาไทยและภาษาอังกฤษ** ตามภาษาของเครื่อง เปลี่ยนได้ด้วยปุ่มรูปลูกโลกมุมขวาบนของหน้าแรก — ข้อความของแอปเอง
  (แจ้งเตือน ข้อผิดพลาดการบันทึก/แชร์) เปลี่ยนตามด้วย, แอนิเมชันนุ่มนวลทั้งแอป (ปิดเองเมื่อเครื่องลดการเคลื่อนไหว)
- ต้องการ Android 8.0 ขึ้นไป

## ติดตั้งและอัปเดต

1. เปิดหน้า **https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/** บนมือถือ/แท็บเล็ต (ไม่ต้องล็อกอิน GitHub)
   แล้วกดดาวน์โหลด `doc-scanner-pdf-1.0.<เลข>.apk` — หน้านี้มีเฉพาะรุ่นล่าสุดที่เซ็นด้วยกุญแจถาวร พร้อมรายการ "มีอะไรใหม่"
   (หรือจากหน้า [Releases](https://github.com/chatrawichai-envbr/doc-scanner-pdf-android/releases) ของ repo นี้)
2. เปิดไฟล์ที่ดาวน์โหลด — ครั้งแรก Android จะให้อนุญาต "ติดตั้งแอปที่ไม่รู้จัก" ให้เบราว์เซอร์ที่ใช้ดาวน์โหลด
3. เปิดแอป **สแกนเอกสาร PDF** — ครั้งแรกที่ใช้กล้องในแอป Android จะถามสิทธิ์กล้อง

เลขรุ่นที่ติดตั้งอยู่แสดงท้ายหน้าแรกของแอป ("เวอร์ชัน v1.0.17 (Android)") — ตรงกับเลข Release และหัวข้อใน
[`CHANGELOG.md`](CHANGELOG.md) ซึ่งบอกว่าแต่ละรุ่นเปลี่ยนอะไร

**การอัปเดต:** ติดตั้งไฟล์ APK รุ่นใหม่ทับได้เลย — ทุก Release เซ็นด้วยกุญแจถาวรของโปรเจกต์ (ด้านล่าง)
ถ้ายังไม่ได้ตั้งกุญแจ CI จะ**ไม่ออก Release** (งาน release ล้มพร้อมบอกให้ตั้ง) เพื่อไม่ให้มี APK ที่เซ็นด้วยกุญแจชั่วคราวเผยแพร่ออกไป

### ตั้งค่ากุญแจเซ็นแอปถาวร (ทำครั้งเดียว — สำหรับเจ้าของ repo)

**ถ้ายังมีไฟล์กุญแจเดิม (`doc-scanner-release.jks`) ที่ใช้กับ repo เดิม `chatrawichai-tech/claude4app` ให้ใช้ไฟล์เดิม** (ข้ามคำสั่ง
`keytool` ด้านล่าง ทำเฉพาะขั้น base64 และเพิ่ม secrets) — ผู้ที่ติดตั้งแอปไว้แล้วจะติดตั้งรุ่นใหม่ทับได้ และใบรับรองตรงกับ Release เดิม

ถ้าไม่มีแล้ว สร้างกุญแจใหม่บนเครื่องของคุณเอง (ต้องมี Java) แล้วเก็บไฟล์และรหัสผ่านไว้ให้ปลอดภัย — **ห้าม commit ไฟล์กุญแจลง repo**
และถ้าทำกุญแจหาย จะอัปเดตทับแอปที่ติดตั้งไว้ไม่ได้อีก (ผู้ที่ติดตั้งรุ่นที่เซ็นด้วยกุญแจเดิมต้องถอนแอปเก่าก่อน):

```bash
keytool -genkeypair -v -keystore doc-scanner-release.jks -alias docscanner -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 doc-scanner-release.jks > keystore.b64     # macOS: base64 -i doc-scanner-release.jks -o keystore.b64
# Windows (PowerShell) — คัดลอกลงคลิปบอร์ดแล้ววางใน secret ได้เลย:
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\doc-scanner-release.jks")) | Set-Clipboard
```

แล้วเพิ่ม **Repository secrets** 4 รายการที่ Settings → Secrets and variables → Actions → Secrets ของ repo นี้:

| ชื่อ | ค่า |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | เนื้อหาไฟล์ `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | รหัสผ่านของ keystore |
| `ANDROID_KEY_ALIAS` | `docscanner` (หรือ alias ที่ตั้ง) |
| `ANDROID_KEY_PASSWORD` | รหัสผ่านของกุญแจ (ถ้าไม่ได้ตั้งแยก ใช้รหัสเดียวกับ keystore) |

CI ส่ง secrets เหล่านี้ให้เฉพาะขั้นตอน build ของ `main` ที่จะออก Release (push หรือ Run workflow) และลบไฟล์กุญแจทันทีหลังใช้
— build ของ branch อื่น, pull request และรอบตรวจรายวันไม่ได้รับกุญแจ (APK ของรอบเหล่านั้นเซ็นด้วยกุญแจ debug)

## การเข้าถึง repo doc-scanner-pdf-code จาก CI

repo ต้นทาง `chatrawichai-envbr/doc-scanner-pdf-code` (เดิม `chatrawichai-tech/claude4code`) เป็น public — CI อ่านโค้ดต้นทางได้โดยไม่ต้องตั้งค่าอะไร
ถ้าภายหลังเปลี่ยน repo นั้นเป็น private ให้สร้าง deploy key แบบอ่านอย่างเดียวและใส่เป็น secret `CLAUDE_REPO_KEY` ของ repo นี้
(ขั้นตอนเดียวกับใน README ของ repo `doc-scanner-pdf-gas` หัวข้อ "การเข้าถึง repo doc-scanner-pdf-code จาก CI") — CI ใช้กุญแจนั้นเมื่อมีเท่านั้น

## หน้าดาวน์โหลดบนเว็บไซต์ (ทำครั้งเดียว — สำหรับเจ้าของ repo)

หลังออก Release ทุกครั้ง งาน `site` ของ CI จะ push APK รุ่นเดียวกันพร้อมหน้าดาวน์โหลดไปที่ repo เว็บไซต์ `chatrawichai-envbr/chatrawichai-envbr.github.io`
(เดิม `chatrawichai-tech/chatrawichai-tech.github.io`) โฟลเดอร์ `doc-scanner-pdf-android/`
→ https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/
(`tools/site/build-page.js`: `index.html` ไม่มีสคริปต์ + CSP เข้มงวด + ลิงก์แบบสัมพัทธ์, APK รุ่นล่าสุดไฟล์เดียว, `privacy.html`,
`version.json` พร้อม SHA-256 และลายนิ้วมือใบรับรอง) — งานนี้ตรวจก่อนว่า APK เซ็นด้วยกุญแจถาวร (ไม่ใช่กุญแจ debug) และมีผู้เซ็นคนเดียว

งานนี้ใช้ **deploy key ที่เขียนได้** ของ repo เว็บไซต์ (เขียนได้เฉพาะ repo นั้น ไม่เกี่ยวกับ repo อื่น):

1. สร้างกุญแจบนเครื่องของคุณ — ถ้าถาม passphrase ให้กด Enter ว่างไว้ 2 ครั้ง:
   ```bash
   ssh-keygen -t ed25519 -C "doc-scanner-pdf-android-site" -f site_deploy_key
   ```
2. repo **doc-scanner-pdf** (เว็บไซต์) → Settings → **Deploy keys** → **Add deploy key**: Title `doc-scanner-pdf-android release (APK)`,
   Key = เนื้อหาไฟล์ `site_deploy_key.pub` — **ติ๊ก Allow write access**
3. repo **doc-scanner-pdf-android** (repo นี้) → Settings → Secrets and variables → Actions → **New repository secret**:
   ชื่อ `SITE_DEPLOY_KEY` ค่า = เนื้อหาไฟล์ `site_deploy_key` ทั้งหมด (รวมบรรทัด `-----BEGIN…` และ `-----END…`)
4. ลบไฟล์กุญแจทั้งสองในเครื่องได้เลย

CI ส่งกุญแจนี้ให้เฉพาะงาน `site` ของ `main` (หลังออก Release แล้ว) — ถ้ายังไม่ได้ตั้ง งาน `site` จะแจ้ง error `SITE_DEPLOY_KEY`
(Release ยังออกตามปกติ) ตั้งแล้วกด Re-run failed jobs ของรอบนั้นได้เลย

## ความปลอดภัย

- สิทธิ์ที่ขอมีสิทธิ์เดียว: **กล้อง** — ไม่มีสิทธิ์อินเทอร์เน็ต ไม่มีสิทธิ์อ่านไฟล์ในเครื่อง (เลือกรูป/บันทึกผ่านหน้าต่างของระบบ)
- หน้าเว็บเปิดจากไฟล์ในแอปที่ `https://appassets.androidplatform.net/` (`AssetRouter.kt`) — คำขอไปโดเมนอื่นถูกปิดกั้นทั้งหมด
  ป้องกัน path traversal, เสิร์ฟเฉพาะชนิดไฟล์ที่รู้จัก, `nosniff`; Content-Security-Policy ของหน้าเว็บไม่อนุญาตโดเมนภายนอก
- WebView: ปิดการเข้าถึงไฟล์/`content://`, ไม่มี `addJavascriptInterface`, ไม่เปิดหน้าต่างใหม่, ลิงก์ภายนอกเปิดในเบราว์เซอร์,
  เปิด debugging เฉพาะ debug build; ถ้าตัวประมวลผลหน้าเว็บล่ม แอปสร้างหน้าใหม่แทนการปิดตัว
- ช่องทางหน้าเว็บ → แอป (`DocScannerBridge`, WebMessageListener) รับข้อความจากหน้าเว็บของแอปเท่านั้น
  ทุกข้อความตรวจรูปแบบ/ขนาด/ลำดับ (`BridgeProtocol.kt`, `TransferStore.kt`), ชื่อไฟล์ถูกทำให้ปลอดภัย (`FileNames.kt`)
- ไฟล์ชั่วคราว (รูปจากกล้อง, ไฟล์ที่แชร์) อยู่ใน cache ของแอป ส่งให้แอปอื่นผ่าน `FileProvider` แบบอ่านอย่างเดียวชั่วคราว
  และถูกลบอัตโนมัติ; ไม่สำรองข้อมูลแอป (`allowBackup=false`)
- ไลบรารี (OpenCV, jsPDF, Tesseract, ฟอนต์) ตรวจ SHA-256 ตอนแปลง; Gradle wrapper ตรวจกับ services.gradle.org ก่อน build ใน CI

## โครงสร้าง repo

```
doc-scanner-pdf-android/                 โปรเจกต์ Android (เปิดด้วย Android Studio ได้)
  app/src/main/assets/www/               หน้าเว็บของแอป — สร้างโดย tools/convert/build.js ห้ามแก้เอง
  app/src/main/java/.../MainActivity.kt  WebView, สิทธิ์กล้อง, กล้องของเครื่อง/เลือกรูป/เลือก PDF, บันทึก/แชร์, ปุ่มย้อนกลับ
  app/src/main/java/.../AssetRouter.kt   เสิร์ฟ assets/www และปิดกั้นคำขออื่น
  app/src/main/java/.../BridgeProtocol.kt, TransferStore.kt, FileNames.kt   รับไฟล์จากหน้าเว็บอย่างปลอดภัย
  app/src/test/                          unit tests (JUnit)
  app/src/androidTest/                   ทดสอบแอปจริงบน emulator
  source.json                            commit ต้นทางใน repo doc-scanner-pdf-code + SHA-256 ของทุกไฟล์ต้นทาง
tools/convert/build.js                   ตัวแปลง doc-scanner-pdf-code → Android (templates/platform.js = AppPlatform ของ Android)
tools/tests/                             ทดสอบหน้าเว็บของแอปใน Chromium: convert, webview, screens, parity, play
tools/site/build-page.js                 หน้าดาวน์โหลด APK + นโยบายความเป็นส่วนตัว (privacy.html) บน chatrawichai-envbr.github.io/doc-scanner-pdf-android/
tools/store/                             หน้าร้าน Google Play: ข้อความไทย/อังกฤษ (listing/), รูปหน้าร้าน (build.js), วิดีโอโปรโมต (video.js)
tools/play/publish.js                    อัปโหลดแอป + หน้าร้านขึ้น Google Play (Android Publisher API)
tools/ci/                                สคริปต์ของ CI (ตรวจ Gradle wrapper, เปิด emulator)
.github/workflows/android.yml            CI: sync → ทดสอบ → build → emulator → Release → หน้าดาวน์โหลดบนเว็บไซต์
.github/workflows/play.yml               Google Play (กดรันเอง): รูปหน้าร้าน/วิดีโอ → อัปโหลดขึ้น Play — ขั้นตอนทั้งหมดใน PLAY_STORE.md
```

## Google Play

ขั้นตอนของเจ้าของแอป (สมัครบัญชีนักพัฒนา สร้างแอป ตอบแบบฟอร์ม service account ทดสอบแบบปิด ส่งรีวิว) อยู่ใน
[`PLAY_STORE.md`](PLAY_STORE.md) — ข้อความหน้าร้านอยู่ใน `tools/store/listing/<th|en-US>/`, รูปหน้าร้านและวิดีโอสร้างจากแอปจริง:

```bash
cd tools/tests && npm ci --ignore-scripts && npx playwright install chromium && cd ../..
node tools/store/build.js            # tools/store/out/<th|en-US>/: icon, featureGraphic, phone/7"/10" screenshots + ข้อความ
node tools/store/video.js            # tools/store/out/<th|en-US>/promo.mp4 (ต้องมี ffmpeg; FFMPEG=<path> ถ้าไม่อยู่ใน PATH)
```

## อัปเดตตาม repo doc-scanner-pdf-code

```bash
git clone https://github.com/chatrawichai-envbr/doc-scanner-pdf-code ../doc-scanner-pdf-code     # ถ้ายังไม่มี
node tools/convert/build.js --source ../doc-scanner-pdf-code                      # แปลงใหม่ (repo ต้นทางต้อง commit แล้ว)
cd tools/tests && npm ci --ignore-scripts && npx playwright install chromium && node run-all.js
cd ../../doc-scanner-pdf-android && ./gradlew lintDebug testDebugUnitTest assembleDebug
```

ก่อนแปลง ตรวจก่อนว่าการเปลี่ยนแปลงใน doc-scanner-pdf-code ทำให้แอปต่างจากเดิมหรือไม่:
`node tools/convert/build.js --source ../doc-scanner-pdf-code --check --as-commit <commit ใน doc-scanner-pdf-android/source.json>`
— ถ้า OK (เช่น แก้แค่ README/ชุดทดสอบของ doc-scanner-pdf-code) **ไม่ต้องแปลง ไม่ต้อง commit** และไม่มีรุ่นใหม่

ถ้าแอปเปลี่ยน: เพิ่มรุ่นใหม่ที่หัว [`CHANGELOG.md`](CHANGELOG.md) (`## v1.0.<เลขถัดไป> — วันที่` + รายการการเปลี่ยนแปลง)
แล้ว commit/push `main` — CI ตรวจความสอดคล้องกับ repo doc-scanner-pdf-code, ทดสอบบน emulator มือถือและแท็บเล็ต
แล้วออก Release และหน้าดาวน์โหลดรุ่นใหม่ให้อัตโนมัติ

**เลขรุ่น (versionName/versionCode) มาจากหัวข้อบนสุดของ CHANGELOG.md** (`tools/release/version.js`):
- แอปเปลี่ยน + มีรุ่นใหม่ → ออก Release (versionCode = major×1,000,000 + minor×1,000 + patch)
- แก้แค่ CI/ชุดทดสอบ/เอกสาร → ไม่ออกรุ่นใหม่ (ไม่มี Release ซ้ำของเดิม)
- แอปเปลี่ยนแต่ไม่เพิ่มรุ่นใหม่ หรือเพิ่มรุ่นใหม่แต่แอปไม่เปลี่ยน (รุ่นปลอม) → CI ไม่ผ่านตั้งแต่ขั้น build

CI ยังตรวจทุกวันว่ามีการเปลี่ยนแปลงใน repo doc-scanner-pdf-code ที่ทำให้แอปต่างไปแต่ยังไม่ได้แปลงหรือไม่

## Build เอง

ต้องมี JDK 17+ และ Android SDK (platform 37): เปิดโฟลเดอร์ `doc-scanner-pdf-android` ด้วย Android Studio
หรือ `./gradlew assembleDebug` (ไฟล์อยู่ที่ `app/build/outputs/apk/debug/`) — ทดสอบบนเครื่องจริง/emulator: `./gradlew connectedDebugAndroidTest`
