# Handoff — doc-scanner-pdf (สถานะ 2026-10-20 เวลาไทย)

ไฟล์นี้มีเนื้อหาเดียวกันใน `chatraweechai/doc-scanner-pdf-code` และ `chatraweechai/doc-scanner-pdf-android`
กฎการทำงานของเจ้าของอยู่ใน `CLAUDE.md` ของแต่ละ repo เช่น ตอบเป็นภาษาไทยเท่านั้น ทดสอบจริงก่อน push main ทำ changelog
ห้ามออกเวอร์ชันปลอม ห้ามส่งกุญแจทางแชต ห้ามแตะ doc-scanner-pdf-gas และห้ามเปลี่ยน package name

## 1. เกิดอะไรขึ้น

- repo ชุดเดิมของบัญชี `chatrawichai-envbr` ใช้งานไม่ได้แล้ว
  - **doc-scanner-pdf-code:** เข้าไม่ถึง
  - **doc-scanner-pdf-android:** ถูกสร้างใหม่เมื่อ 2026-10-11 เหลือแค่ไฟล์หน้าดาวน์โหลด 5 ไฟล์ ได้แก่ APK 1.0.20 ตัวจริง
    (sha256 `939c54ce…`), index.html, privacy.html, site.css และ version.json
  - **chatrawichai-envbr.github.io:** ถูกลบแล้ว
- เจ้าของกู้ไฟล์ขึ้น repo ใหม่ในบัญชี **chatraweechai** (public) เมื่อ 2026-10-20 เป็น commit `recovery all files`:
  - `chatraweechai/doc-scanner-pdf-code` → `cbeb414` (128 ไฟล์)
  - `chatraweechai/doc-scanner-pdf-android` → `3e50abd` (165 ไฟล์)
- **ไม่ได้กลับมา:** ประวัติ commit, tag, GitHub Release (v1.0.20), artifacts และ secrets ของ Actions ซึ่งต้องตั้งใหม่ทั้งหมด
- **ไฟล์ที่กู้มาไม่ใช่สถานะล่าสุด:** เป็นสถานะเช้าวันที่ 2026-10-02 คือ repo โค้ด = `ec6ef1b`, repo Android = `878fd65`
  งานหลังจากนั้นหายไป ดังนี้:
  - `3a6c8a6` (โค้ด) + `daf8481` (Android) **เลิกเชื่อมโยง doc-scanner-pdf-gas**
    - CLAUDE.md ของทั้งสอง repo ยังพูดถึง GAS (โค้ด 9 จุด, Android 5 จุด) และ `doc-scanner-pdf/README.md` ยังลิงก์เวอร์ชัน Apps Script
    - ต้องทำใหม่: เหลือ 3 repo ที่เชื่อมกัน, ห้ามแตะ/กล่าวถึง GAS, ลบหัวข้อ "Apps Script twin" (เก็บกฎ AppPlatform ไว้),
      เพิ่ม CHANGELOG ของ repo โค้ด
    - คำสั่งของเจ้าของ (2026-10-02): *"ต่อไปนี้ไม่ต้องดำเนินการใดๆ กับ repo doc-scanner-pdf-gas อีกต่อไป มีเพียง
      doc-scanner-pdf-code, doc-scanner-pdf-android และ chatrawichai-envbr.github.io ที่เชื่อมโยงกันเท่านั้น"*
  - `f551880` (Android) **แก้เทสต์ screens:** เดิมนับหน้าต่อแถวระหว่างที่แอนิเมชันยังเล่น ทำให้ CI ล้มเป็นบางครั้ง
    — patch อยู่ในข้อ 6
  - `3425e6b` (Android) **PLAY_STORE.md วิธีแก้ 403 และตำแหน่งเมนูหน้าร้าน** — patch อยู่ในข้อ 6
  - `faffe8a` / `f5f23cb` เอกสารเรื่อง repo private — **ไม่ต้องกู้** เพราะตอนนี้ repo เป็น public แล้ว

## 2. ผลตรวจความครบถ้วน (2026-10-20)

| ตรวจ | ผล |
|---|---|
| repo โค้ด: `vendor/*/SHA256SUMS` (fonts, jspdf, libheif, opencv, pdfjs, tesseract) | ✓ ผ่านทุกไฟล์ |
| repo โค้ด: `tools/tests` ทุกชุด (cache-busting, detect, e2e, edge, formats, i18n, motion, ocr, pdf-convert, searchable-pdf) | ✓ ผ่าน 10/10 |
| repo Android: `app/src/main/assets/www` เทียบกับ APK 1.0.20 ที่ปล่อยจริง | ✓ ตรงทุกไฟล์ (86 ไฟล์) ส่วน `*.traineddata.gz` แตกไฟล์แล้วตรงกับใน APK |
| repo โค้ด `doc-scanner-pdf/` เทียบกับ APK | ✓ ต่างเฉพาะส่วนที่ตัวแปลงเปลี่ยนตามที่ออกแบบไว้ (index.html, boot.js → android/, README.md) |
| repo Android: `tools/tests` ชุด webview, screens, parity, play | ✓ ผ่าน |
| repo Android: ชุด convert | ✗ ผ่าน 34/37 — 3 ข้อไม่ผ่านเพราะ commit `2bdc6e8` ใน `source.json` ไม่มีในประวัติแล้ว ไฟล์ไม่ได้ผิด (ดูข้อ 4.3) |
| repo Android: ชุด screens หลังใส่ patch ในข้อ 6 | ✓ ผ่าน 11/11 |
| Gradle (lint, unit tests, build) และ emulator | ยังไม่ได้รัน เพราะเครื่องนี้ไม่มี Android SDK และ emulator รันได้เฉพาะใน CI |

## 3. สถานะ Google Play

- แอป `io.github.chatrawichaitech.docscanner` รุ่น v1.0.20 (versionCode 1000020) เผยแพร่ใน **Closed testing (Alpha)**
  แล้วเมื่อ 2026-10-02 (Google รีวิวผ่าน)
- **Managed publishing เปิดอยู่:** ทุกครั้งที่ Google อนุมัติ ต้องกด Publish ใน Publishing overview เอง
- **ต้องมีผู้ทดสอบ ≥ 12 คน ต่อเนื่อง 14 วัน** จึงจะกด Apply for production ได้ (เมื่อ 2026-10-05 ยังมี 0 คน)
- ⚠️ **URL นโยบายความเป็นส่วนตัวใน Play Console ตอนนี้เปิดไม่ได้ (404):**
  `https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/privacy.html` และ Website ก็ตายเช่นกัน
  เสี่ยงโดน Google ติเรื่องนโยบาย ต้องแก้ก่อนเรื่องอื่น (ข้อ 4.1)

## 4. งานที่ต้องทำต่อ (เรียงตามความเร่งด่วน)

1. **กู้เว็บไซต์และหน้านโยบายความเป็นส่วนตัว:**
   - สร้าง repo เว็บไซต์ใหม่ เช่น `chatraweechai/chatraweechai.github.io` (user site) แล้วเปิด GitHub Pages
   - เผยแพร่เว็บแอปด้วย `tools/publish-site.sh` ของ repo โค้ด
   - เผยแพร่หน้าดาวน์โหลด Android + `privacy.html` ด้วย `tools/site/build-page.js` ของ repo Android (APK 1.0.20 ตัวจริงอยู่ใน repo หน้าดาวน์โหลดเดิม)
   - เปลี่ยน **Privacy policy** และ **Website** ใน Play Console เป็นที่อยู่ใหม่
2. **เปลี่ยนชื่อที่อ้างถึง** `chatrawichai-envbr` → `chatraweechai` ทั้งสอง repo:
   - repo โค้ด: 8 ไฟล์ และ workflow อ้าง repo เว็บไซต์ 4 จุด
   - repo Android: 10 ไฟล์ และ workflow อ้าง repo โค้ด 11 จุด, repo เว็บไซต์ 3 จุด, ตัวเอง 1 จุด
   - repo โค้ดเป็น public จึงไม่ต้องใช้ `CLAUDE_REPO_KEY`
3. **ผูก repo Android กับ commit ใหม่ของ repo โค้ด:**
   - รัน `node tools/convert/build.js --source ../doc-scanner-pdf-code`
   - คำสั่งนี้จะเปลี่ยนเลข commit ที่ฝังใน `www/index.html`, `www/android/platform.js` และ `source.json` และเปลี่ยน `SOURCE_REPO` เป็น `chatraweechai/doc-scanner-pdf-code`
   - เมื่อไฟล์แอปเปลี่ยน CI จะบังคับให้ออกรุ่นใหม่ (**v1.0.21** + CHANGELOG) ตัวแอปทำงานเหมือนเดิม เปลี่ยนแค่ตราประทับ
     เพราะประวัติ git หายไป **ต้องให้เจ้าของตัดสินใจ** ตามกฎเรื่องเวอร์ชันปลอมก่อนทำ
4. **Secrets ที่เจ้าของต้องตั้งใหม่ใน repo Android** (ห้ามส่งทางแชต):
   - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
     - ต้องเป็น**กุญแจถาวรเดิม** ลายนิ้วมือใบรับรอง SHA-256 `FB:BC:18:5C:BF:F5:AB:E1:A1:B2:80:84:DF:36:FF:59:06:33:E6:7A:86:34:1A:E8:D4:49:63:D4:C1:08:DB:45`
     - ถ้าเป็นกุญแจอื่น Google Play จะไม่รับไฟล์อัปโหลด
   - `PLAY_SERVICE_ACCOUNT_JSON` (บัญชีบริการเดิมที่เชิญไว้ใน Play Console แล้ว)
   - `SITE_DEPLOY_KEY`: deploy key ใหม่ที่เขียนได้ ของ repo เว็บไซต์ใหม่
5. **GitHub Release หายไป:** ตั้ง secrets แล้ว push ครั้งถัดไป งาน release จะออก Release ให้ใหม่
   - ถ้ายังเป็น 1.0.20 ไฟล์ที่ build จากต้นฉบับเดิมเคยได้ผล byte-identical
   - `play.yml` ใช้ไฟล์ `.aab` จาก Release และใช้ bundle ที่มีอยู่บน Google Play ซ้ำ ถ้า sha256 ตรงกัน
6. **Session ใหม่ต้องใช้ repo `chatraweechai/*` เป็น source:**
   - session เดิมผูกชื่อ `envoccbr/doc-scanner-pdf-*` ไว้ จึงแนบชื่อเดียวกันซ้ำไม่ได้
   - **ไฟล์นี้ยังไม่ได้ commit** ให้ commit ใน session ใหม่ทั้งสอง repo

## 6. Patch ที่ต้องใส่กลับใน repo Android (`f551880` + `3425e6b`)

บันทึกเนื้อหาด้านล่างเป็นไฟล์ `restore.patch` ที่ root ของ repo Android แล้วรัน `git apply restore.patch`
(ผ่านการตรวจด้วย `git apply --check` กับไฟล์ที่กู้มาแล้ว)

```diff
diff --git a/PLAY_STORE.md b/PLAY_STORE.md
index 7a3bd8f..856c8c1 100644
--- a/PLAY_STORE.md
+++ b/PLAY_STORE.md
@@ -75,7 +75,7 @@
 
 - **Store settings**: App category = **Productivity** · Tags: Scanner, PDF, Document · Contact details: อีเมลติดต่อ (บังคับ, แสดงบนหน้าร้าน)
   · Website ใส่ `https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/` ได้
-- **Main store listing**: ตั้ง service account (ขั้นที่ 6–7) แล้วรัน workflow แบบ *listing only* — ข้อความ ไอคอน ภาพกราฟิกเด่น
+- **Main store listing** (เมนู Grow users → Store presence → Store listings หรือพิมพ์ `store listing` ในช่องค้นหาของ Play Console): ตั้ง service account (ขั้นที่ 6–7) แล้วรัน workflow แบบ *listing only* — ข้อความ ไอคอน ภาพกราฟิกเด่น
   ภาพหน้าจอ ทั้งไทยและอังกฤษ ถูกใส่ให้ครบ หรือดาวน์โหลด artifact `store-listing` แล้วอัปโหลดเองใน Console ก็ได้
 - **วิดีโอโปรโมต**: อัปโหลด `promo.mp4` ของแต่ละภาษา (artifact `store-listing`, โฟลเดอร์ `th/` และ `en-US/`) ขึ้น YouTube
   แบบ **Public หรือ Unlisted**, ปิดโฆษณา, ไม่จำกัดอายุ แล้วส่งลิงก์ YouTube มา — จะใส่ใน `tools/store/listing/<ภาษา>/video_url.txt`
@@ -92,6 +92,12 @@
    *View app information*, *Release to production, exclude devices, and use Play App Signing*, *Release apps to testing tracks*,
    *Manage testing tracks and edit tester lists*, *Manage store presence* → **Invite user** (ไม่ต้องให้สิทธิ์ระดับบัญชี/การเงิน)
 
+**ถ้า workflow แจ้ง `403 PERMISSION_DENIED: The caller does not have permission`** (หลัง "signed in with the service account key")
+แปลว่า Google รับกุญแจแล้วแต่ service account ยังไม่มีสิทธิ์ในแอป: ตรวจว่าอีเมลของ service account อยู่ใน **Users and permissions**
+(ถ้าไม่มี = ยังไม่ได้ทำข้อ 5) และเป็นอีเมลเดียวกับ `client_email` ในไฟล์ `.json` ของ secret · สิทธิ์ใหม่อาจใช้เวลาถึง 24 ชั่วโมงกว่าจะมีผล —
+แก้ข้อความหน้าร้านเล็กน้อยแล้วบันทึก (เช่น Short description) มักทำให้มีผลทันที (2026-10-02: ทันทีหลังเชิญยังได้ 403 —
+แก้ Short description แล้วรอบถัดไปผ่าน ราว 15 นาทีหลังเชิญ)
+
 ## 7. ใส่กุญแจเป็น GitHub secret (ครั้งเดียว)
 
 repo **doc-scanner-pdf-android** → Settings → Secrets and variables → Actions → **New repository secret**
diff --git a/tools/tests/suites/screens.js b/tools/tests/suites/screens.js
index 1500234..1da2315 100644
--- a/tools/tests/suites/screens.js
+++ b/tools/tests/suites/screens.js
@@ -56,13 +56,17 @@ run(async () => {
     await page.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg', 'photo-lightbg.jpg'].map(fixture));
     await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 3, null, { timeout: 60000 });
     await waitIdle(page);
+    // motion.js slides pages in and FLIPs them when the list changes: measure and shoot the final layout
+    await page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' &&
+      a.effect && a.effect.target instanceof Element && a.effect.target.closest('.page-grid')), null, { timeout: 5000 });
     await page.evaluate(() => window.scrollTo(0, 0));
     let m = await measure(page, ['#btnCamera', '#btnPick', '#btnExport', '#btnOcrAll', '.page-item', '.page-grid']);
     if (m.overflowX > 1) problems.push(`home: sideways scroll ${m.overflowX}px`);
     for (const s of ['#btnCamera', '#btnPick']) if (!inX(m, m.items[s]) || !tappable(m.items[s])) problems.push(`home: ${s} ${JSON.stringify(m.items[s])}`);
     for (const s of ['#btnExport', '#btnOcrAll']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`home: ${s} not on screen ${JSON.stringify(m.items[s])}`);
     const cols = await page.evaluate(() => {
-      const items = [...document.querySelectorAll('.page-item')].map(e => Math.round(e.getBoundingClientRect().top));
+      // offsetTop = the row in the layout (a transform of a still-running animation does not move it)
+      const items = [...document.querySelectorAll('.page-item')].map(e => e.offsetTop);
       return items.filter(y => y === items[0]).length;
     });
     if (size.tablet && cols < 3) problems.push(`home: tablet shows only ${cols} page(s) per row`);
```

## 7. ข้อความสำหรับเริ่ม session ใหม่ (คัดลอกไปวางได้เลย)

เปิด session ใหม่ที่มี `chatraweechai/doc-scanner-pdf-code` และ `chatraweechai/doc-scanner-pdf-android` เป็น source
แล้ววางข้อความนี้:

> อ่าน handoff.md ใน repo doc-scanner-pdf-android แล้วดำเนินการต่อตามข้อ 4 และ 6 ให้เสร็จ
> - commit handoff.md ลงทั้งสอง repo
> - ใส่ patch ในข้อ 6
> - ทำงานที่หายไปตามข้อ 1 ใหม่ (เลิกเชื่อมโยง GAS)
> - เปลี่ยนชื่อที่อ้างถึง chatrawichai-envbr เป็น chatraweechai
> - เปลี่ยน url เว็บไซต์ใหม่เป็น https://doc-scanner-pdf.github.io/android/ และเปลี่ยน url หน้านโยบายความเป็นส่วนตัวใหม่เป็น https://doc-scanner-pdf.github.io/android/privacy.html และไม่ต้องบอกที่อยู่ใหม่สำหรับ Play Console (ดำเนินการด้วยตนเองไปแล้ว)
> - เรื่องเวอร์ชัน v1.0.21 ในข้อ 4.3 ไม่ต้องออกเวอร์ชันใหม่ จนกว่าจะมีการดำเนินการใดๆ กับโค้ด (เพิ่มเติม แก้ไข ปรับปรุง)
> - ทดสอบจริงก่อน push main ทุกครั้ง ตอบเป็นภาษาไทยเท่านั้น และประหยัด session limit

## 5. ที่อยู่สำคัญ

- **repo:** `chatraweechai/doc-scanner-pdf-code`, `chatraweechai/doc-scanner-pdf-android`
  (มีเฉพาะเว็บแอป: `chatraweechai/doc-scanner-pdf` ซึ่ง libheif เป็น 1.23.5 ใหม่กว่า)
- **APK 1.0.20 ตัวจริง:** `chatrawichai-envbr/doc-scanner-pdf-android` (repo หน้าดาวน์โหลด) ไฟล์ `doc-scanner-pdf-1.0.20.apk`
- **คู่มือ Google Play:** `PLAY_STORE.md` (repo Android) — ขั้นตอนเจ้าของ, Data safety, แก้ 403
