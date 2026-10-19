# ขึ้น Google Play — ขั้นตอนสำหรับเจ้าของแอป

ไฟล์นี้บอกทุกอย่างที่ต้องทำเพื่อให้แอป **สแกนเอกสาร PDF** (`io.github.chatrawichaitech.docscanner`) อยู่บน Google Play
ส่วนที่ต้องใช้บัญชีของเจ้าของ (สมัคร ยืนยันตัวตน ตอบแบบฟอร์ม กดส่งรีวิว) ทำได้เฉพาะเจ้าของใน Play Console —
ส่วนที่เหลือ (รูปหน้าร้าน ข้อความ วิดีโอ ไฟล์แอป การอัปโหลด การแก้ตามที่ Google ติ) repo นี้เตรียมและทำให้อัตโนมัติ

> **ห้ามส่งกุญแจ/ไฟล์ JSON ของ service account/รหัสผ่านใด ๆ ทางแชต** — ใส่เป็น GitHub secret เท่านั้น (ขั้นที่ 7)

## สิ่งที่ repo นี้เตรียมไว้แล้ว

| สิ่งที่ Google Play ต้องการ | อยู่ที่ |
|---|---|
| ไฟล์แอป (Android App Bundle `.aab`) เซ็นด้วยกุญแจถาวร (= upload key) | GitHub Release ทุกรุ่น: `doc-scanner-pdf-1.0.N.aab` |
| ชื่อแอป (≤30), คำอธิบายสั้น (≤80), คำอธิบายเต็ม (≤4000), มีอะไรใหม่ (≤500) — ไทยและอังกฤษ | `tools/store/listing/th/`, `tools/store/listing/en-US/` |
| ไอคอน 512×512, ภาพกราฟิกเด่น 1024×500, ภาพหน้าจอมือถือ 8 ภาพ, แท็บเล็ต 7" และ 10" อย่างละ 4 ภาพ — ไทยและอังกฤษ | `node tools/store/build.js` หรือ workflow **Google Play** (artifact `store-listing`) |
| วิดีโอโปรโมต (MP4 1920×1080 ~40 วินาที) ไทยและอังกฤษ + ภาพปก | `node tools/store/video.js` หรือ workflow **Google Play** ติ๊ก *video* — Google Play รับเป็นลิงก์ YouTube |
| นโยบายความเป็นส่วนตัว (ไทย + อังกฤษ) | https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/privacy.html |
| อัปโหลดแอป + หน้าร้านอัตโนมัติ (Google Play Android Publisher API) | `.github/workflows/play.yml`, `tools/play/publish.js` |

ภาพทุกภาพถ่ายจากแอปจริง (หน้าเว็บของแอปแบบเดียวกับที่ WebView ของ Android แสดง ฟอนต์ Noto Sans Thai) จึงตรงกับแอปเสมอ —
แอปเปลี่ยนเมื่อไร รัน workflow ใหม่ก็ได้ภาพใหม่

## 1. สมัครบัญชีนักพัฒนา Google Play (ครั้งเดียว)

1. เปิด https://play.google.com/console/signup ด้วยบัญชี Google ที่จะใช้ดูแลแอป
2. เลือกประเภทบัญชี — **ส่วนตัว (Personal)** ถ้าเผยแพร่ในนามบุคคล, **องค์กร (Organization)** ถ้ามีนิติบุคคล
   (องค์กรต้องมีเลข D-U-N-S)
3. ชำระค่าลงทะเบียน 25 USD (ครั้งเดียว) และ **ยืนยันตัวตน** ตามที่ Console ขอ (บัตรประชาชน/พาสปอร์ต, ที่อยู่,
   เบอร์โทรศัพท์, อีเมลติดต่อ) — Google ใช้เวลาตรวจตั้งแต่ไม่กี่ชั่วโมงถึงหลายวัน
4. **บัญชีส่วนตัวที่สร้างหลัง 13 พ.ย. 2023** ต้องทดสอบแบบปิด (closed testing) กับผู้ทดสอบ **อย่างน้อย 12 คนต่อเนื่อง 14 วัน**
   ก่อนขอเผยแพร่จริง (ขั้นที่ 8) — เริ่มหาผู้ทดสอบ (อีเมล Gmail ของเพื่อน/ครอบครัว/ทีม) ไว้ตั้งแต่ตอนนี้

## 2. สร้างแอปใน Play Console

**Home → Create app**

- App name: `สแกนเอกสาร PDF – OCR ภาษาไทย` (เปลี่ยนภายหลังได้)
- Default language: **Thai – th** (ภาษาอังกฤษ en-US เพิ่มเป็นคำแปลในหน้าร้าน — workflow ทำให้)
- App or game: **App** · Free or paid: **Free**
- ติ๊กยอมรับ Developer Program Policies และ US export laws → **Create app**

## 3. อัปโหลดไฟล์แอปครั้งแรก (ต้องทำใน Console เอง — API ใช้ได้หลังแอปมีไฟล์แรกแล้ว)

1. ดาวน์โหลด `doc-scanner-pdf-1.0.N.aab` รุ่นล่าสุดจากหน้า [Releases](https://github.com/chatrawichai-envbr/doc-scanner-pdf-android/releases)
   (ล็อกอิน GitHub) — ไฟล์ `.aab` ติดตั้งบนมือถือไม่ได้ ใช้อัปโหลดขึ้น Play เท่านั้น
2. **Test and release → Testing → Internal testing → Create new release**
3. **App signing** — กด **Choose signing key → Use Google-generated key** (แนะนำ: Google เก็บกุญแจเซ็นแอปที่ส่งถึงผู้ใช้,
   กุญแจถาวรของ repo นี้ (secret `ANDROID_KEYSTORE_BASE64`) กลายเป็น *upload key* — ถ้ากุญแจนี้หายหรือรั่ว ขอเปลี่ยนกับ Google ได้)
   - ผลที่ตามมา: แอปจาก Play กับ APK จากหน้าดาวน์โหลดบนเว็บไซต์เซ็นคนละกุญแจ — ผู้ที่ติดตั้งจาก APK อยู่แล้ว
     ถ้าจะเปลี่ยนไปใช้รุ่นจาก Play ต้องถอนการติดตั้งรุ่นเดิมก่อน (แอปไม่เก็บเอกสารไว้ในเครื่อง จึงไม่มีข้อมูลหาย)
4. ลากไฟล์ `.aab` ลงช่อง App bundles · Release name ปล่อยตามค่าเริ่มต้น (`1000020 (1.0.20)`)
   · Release notes คัดลอกจาก `tools/store/listing/th/release_notes.txt` และ `en-US/release_notes.txt`
5. **Next → Save and publish** (internal testing ไม่ต้องรอรีวิวนาน) · แท็บ **Testers**: สร้างรายชื่ออีเมล (ใส่อีเมลตัวเอง)
   แล้วเปิดลิงก์ *Join on Android* บนมือถือเพื่อติดตั้งจาก Play และลองใช้

## 4. ตอบแบบฟอร์ม App content (Policy and programs → App content)

แอปนี้ทำงานในเครื่องทั้งหมด ไม่มีสิทธิ์อินเทอร์เน็ต ไม่มีโฆษณา ไม่มีบัญชีผู้ใช้ — คำตอบที่ตรงกับแอป:

| หัวข้อ | คำตอบ |
|---|---|
| **Privacy policy** | `https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/privacy.html` |
| **App access** | *All functionality is available without any access restrictions* |
| **Ads** | *No, my app does not contain ads* |
| **Content rating** | อีเมลติดต่อ → Category: **All Other App Types** (หรือ Utility, Productivity, Communication or Other) → ทุกข้อ **No** (ไม่มีความรุนแรง เนื้อหาทางเพศ ภาษาหยาบ ยาเสพติด การพนัน ผู้ใช้ไม่ได้สื่อสารกันหรือแชร์ตำแหน่ง) → ได้เรต 3+ / Everyone |
| **Target audience and content** | อายุ **13–15, 16–17, 18 ขึ้นไป** (ไม่เลือกต่ำกว่า 13 — ไม่ได้ออกแบบสำหรับเด็ก) · Appeal to children: **No** |
| **Data safety** | *Does your app collect or share any of the required user data types?* **No** — (ภาพและเอกสารประมวลผลในเครื่องเท่านั้น ไม่ส่งออกจากเครื่อง ยกเว้นเมื่อผู้ใช้กดแชร์/บันทึกเอง ซึ่ง Google ไม่นับเป็นการเก็บข้อมูล) → Submit |
| **Advertising ID** | **No** (แอปไม่ใช้ Advertising ID) |
| **Government apps** | No · **Financial features**: My app doesn't provide any financial features · **Health**: My app does not have any health features |
| **News apps** | No · **COVID-19 contact tracing and status apps**: My app is not … |

ถ้ามีคำถามที่ไม่ได้อยู่ในตาราง ส่งข้อความคำถาม (หรือภาพหน้าจอ) มาให้ได้ — จะตอบให้ตรงกับที่แอปทำจริง

## 5. หน้าร้าน (Grow users → Store presence)

- **Store settings**: App category = **Productivity** · Tags: Scanner, PDF, Document · Contact details: อีเมลติดต่อ (บังคับ, แสดงบนหน้าร้าน)
  · Website ใส่ `https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/` ได้
- **Main store listing**: ตั้ง service account (ขั้นที่ 6–7) แล้วรัน workflow แบบ *listing only* — ข้อความ ไอคอน ภาพกราฟิกเด่น
  ภาพหน้าจอ ทั้งไทยและอังกฤษ ถูกใส่ให้ครบ หรือดาวน์โหลด artifact `store-listing` แล้วอัปโหลดเองใน Console ก็ได้
- **วิดีโอโปรโมต**: อัปโหลด `promo.mp4` ของแต่ละภาษา (artifact `store-listing`, โฟลเดอร์ `th/` และ `en-US/`) ขึ้น YouTube
  แบบ **Public หรือ Unlisted**, ปิดโฆษณา, ไม่จำกัดอายุ แล้วส่งลิงก์ YouTube มา — จะใส่ใน `tools/store/listing/<ภาษา>/video_url.txt`
  ให้ workflow ใส่ในหน้าร้าน (หรือวางลิงก์ในช่อง YouTube URL ของ Main store listing เอง)

## 6. Service account สำหรับอัปโหลดอัตโนมัติ (ครั้งเดียว)

1. https://console.cloud.google.com → สร้างโปรเจกต์ใหม่ (เช่น `doc-scanner-play`)
2. **APIs & Services → Library** → ค้นหา **Google Play Android Developer API** → **Enable**
3. **IAM & Admin → Service accounts → Create service account** · ชื่อ `play-upload` → Done (ไม่ต้องให้ role ในโปรเจกต์)
4. เปิด service account ที่สร้าง → **Keys → Add key → Create new key → JSON** → ไฟล์ `.json` ถูกดาวน์โหลด
5. Play Console → **Users and permissions → Invite new users** → ใส่อีเมลของ service account
   (`play-upload@<โปรเจกต์>.iam.gserviceaccount.com`) → แท็บ **App permissions → Add app** เลือกแอปนี้ แล้วติ๊ก:
   *View app information*, *Release to production, exclude devices, and use Play App Signing*, *Release apps to testing tracks*,
   *Manage testing tracks and edit tester lists*, *Manage store presence* → **Invite user** (ไม่ต้องให้สิทธิ์ระดับบัญชี/การเงิน)

## 7. ใส่กุญแจเป็น GitHub secret (ครั้งเดียว)

repo **doc-scanner-pdf-android** → Settings → Secrets and variables → Actions → **New repository secret**
- Name: `PLAY_SERVICE_ACCOUNT_JSON`
- Secret: เปิดไฟล์ `.json` จากขั้นที่ 6 ด้วยโปรแกรมแก้ข้อความ คัดลอก **ทั้งไฟล์** มาวาง → Add secret
- จากนั้น **ลบไฟล์ `.json` ในเครื่อง** — ห้ามส่งทางแชต/อีเมล/commit เข้า repo

workflow ส่งกุญแจนี้ให้ขั้นตอนอัปโหลดขั้นเดียว (ตรวจโดยชุดทดสอบ `play`) และไม่แสดงกุญแจ อีเมล หรือ access token ใน log

## 8. อัปโหลดด้วย workflow

repo **doc-scanner-pdf-android** → **Actions → Google Play → Run workflow** (branch `main`):

| ตัวเลือก | ใช้เมื่อ |
|---|---|
| ไม่ติ๊ก *upload* | สร้างภาพหน้าร้าน (และวิดีโอถ้าติ๊ก *video*) เป็น artifact `store-listing` อย่างเดียว — ไม่ต้องมี secret |
| *upload* + *listing only* | ใส่ข้อความ/ภาพหน้าร้านไทย+อังกฤษ |
| *upload* + *app and listing* + track **internal** | รุ่นใหม่ขึ้น Internal testing พร้อมหน้าร้าน |
| *upload* + *app only* + track **alpha** | รุ่นใหม่ขึ้น Closed testing (ทดสอบแบบปิด 12 คน × 14 วัน) |
| track **production** | หลัง Google อนุมัติสิทธิ์เผยแพร่จริงแล้ว |
| *validate only* | ให้ Google ตรวจทุกอย่างโดยไม่บันทึก |

- *version* ว่าง = รุ่นล่าสุดใน `CHANGELOG.md` · workflow ใช้ไฟล์ `.aab` จาก GitHub Release ของรุ่นนั้นเท่านั้น
  และไม่ยอมอัปโหลดไฟล์ที่เซ็นด้วยกุญแจ debug — ถ้าไฟล์เดียวกันอยู่บน Google Play แล้ว (เช่น ไฟล์แรกที่อัปโหลดเองใน Console)
  จะใช้ไฟล์นั้นซ้ำ ไม่อัปโหลดใหม่ (Google ไม่รับ version code ซ้ำ)
- *status* **draft** (ค่าเริ่มต้น) — แอปที่ยังไม่เคยผ่านรีวิวรับได้เฉพาะ draft: เข้า Play Console → **Publishing overview →
  Send changes for review** เพื่อส่งรีวิว · หลังแอปเผยแพร่แล้วเลือก **completed** เพื่อปล่อยทันทีที่ผ่านรีวิว

### ทดสอบแบบปิดและขอเผยแพร่จริง (บัญชีส่วนตัว)

1. **Testing → Closed testing → Alpha → Testers**: เพิ่มผู้ทดสอบอย่างน้อย 12 คน (รายชื่ออีเมลหรือ Google Group)
   แล้วส่ง *opt-in link* ให้ทุกคนกดเข้าร่วมและติดตั้งแอปจาก Play — ต้องอยู่ในการทดสอบต่อเนื่องครบ 14 วัน
2. รัน workflow: *upload*, *app and listing*, track **alpha** → Publishing overview → **Send changes for review**
3. ครบ 14 วัน: **Dashboard → Apply for production** ตอบคำถามเรื่องการทดสอบ (ผู้ทดสอบใช้อะไร พบปัญหาอะไร แก้อะไร)
   — Google ตอบภายในประมาณ 7 วัน
4. ได้สิทธิ์แล้ว: รัน workflow track **production** → Send changes for review (รีวิวครั้งแรกมักใช้ 1–7 วัน)

## 9. เมื่อ Google ติหรือไม่อนุมัติ

Google แจ้งทางอีเมลของบัญชีนักพัฒนาและที่ **Policy and programs → Policy status** / **Inbox** ใน Play Console —
ส่งข้อความที่ Google แจ้ง (คัดลอกข้อความหรือภาพหน้าจอ **ที่ไม่มีข้อมูลลับ**) มาในแชต จะ:

1. แก้แอป/หน้าร้าน/นโยบายความเป็นส่วนตัวตามที่ติ ทดสอบครบทุกชุด (รวม emulator) และออกรุ่นใหม่ตามกติกาของ repo
2. อัปโหลดรุ่นใหม่หรือหน้าร้านใหม่ด้วย workflow
3. บอกคำตอบที่ต้องกรอกใน Console (เช่น แบบฟอร์ม Data safety, คำอธิบายการใช้สิทธิ์กล้อง, การอุทธรณ์) ให้เจ้าของกดส่งรีวิวอีกครั้ง

ข้อที่ Google ติบ่อยและแอปนี้เตรียมไว้แล้ว: ต้องมีนโยบายความเป็นส่วนตัวเพราะขอสิทธิ์กล้อง (มี), คำตอบ Data safety ต้องตรงกับแอป
(แอปไม่มีสิทธิ์อินเทอร์เน็ตและปิดการส่งสถิติของ WebView), ภาพหน้าร้านต้องเป็นแอปจริงไม่มีข้อความเกินจริง
(ถ่ายจากแอปจริง ไม่มีคำว่า "ดีที่สุด/อันดับ 1" — ตรวจโดยชุดทดสอบ `play`), targetSdk ต้องใหม่พอ (36), ไม่มี native library
(ไม่ติดข้อกำหนด 16 KB page size)
