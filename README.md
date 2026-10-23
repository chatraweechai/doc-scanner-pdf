# สแกนเอกสารเป็น PDF (Doc Scanner PDF)

แปลงรูปภาพ/ภาพถ่ายเอกสารเป็นไฟล์ PDF — ครอปอัตโนมัติ ปรับแสง ลบเงา OCR ไทย + อังกฤษ PDF ค้นหาข้อความได้
ทุกอย่างประมวลผลในเครื่องของผู้ใช้ ไม่อัปโหลดภาพไปที่ใด

| โฟลเดอร์ | คืออะไร | ใช้งาน |
|---|---|---|
| [`doc-scanner-pdf-code/`](doc-scanner-pdf-code) | เว็บแอป (HTML + CSS + JavaScript ล้วน) + ชุดทดสอบ + เครื่องมือเผยแพร่เว็บไซต์ | https://doc-scanner-pdf.github.io/ |
| [`doc-scanner-pdf-android/`](doc-scanner-pdf-android) | แอป Android (มือถือ + แท็บเล็ต) แปลงอัตโนมัติจากเว็บแอป โค้ดเหมือนกันทุกไบต์ | https://doc-scanner-pdf.github.io/android/ |
| [`.github/workflows/`](.github/workflows) | CI ทั้งหมด: ทดสอบเว็บ, ตรวจเว็บไซต์รายวัน, OpenCV.js, Android (ทดสอบ → emulator → Release → หน้าดาวน์โหลด), Google Play | |

repo นี้รวม `chatraweechai/doc-scanner-pdf-code` และ `chatraweechai/doc-scanner-pdf-android` เข้าด้วยกันเมื่อ 2026-10-22
พร้อมประวัติ commit ทั้งหมดและ tag `v1.0.21` (Release ของแอป Android จนถึง v1.0.21 อยู่ที่
[repo เดิม](https://github.com/chatraweechai/doc-scanner-pdf-android/releases))
เว็บไซต์อยู่ใน repo [`doc-scanner-pdf/doc-scanner-pdf.github.io`](https://github.com/doc-scanner-pdf/doc-scanner-pdf.github.io)

- รายละเอียดเว็บแอป: [`doc-scanner-pdf-code/doc-scanner-pdf/README.md`](doc-scanner-pdf-code/doc-scanner-pdf/README.md),
  บันทึกการเปลี่ยนแปลง [`doc-scanner-pdf-code/CHANGELOG.md`](doc-scanner-pdf-code/CHANGELOG.md)
- รายละเอียดแอป Android (ติดตั้ง, กุญแจเซ็นแอป, หน้าดาวน์โหลด, build เอง): [`doc-scanner-pdf-android/README.md`](doc-scanner-pdf-android/README.md),
  Google Play [`doc-scanner-pdf-android/PLAY_STORE.md`](doc-scanner-pdf-android/PLAY_STORE.md),
  บันทึกรุ่น [`doc-scanner-pdf-android/CHANGELOG.md`](doc-scanner-pdf-android/CHANGELOG.md)
- กฎการทำงานและขั้นตอนทุกครั้งที่แก้ไข: [`CLAUDE.md`](CLAUDE.md) · สถานะงานล่าสุด: [`handoff.md`](handoff.md)

## Secrets ของ repo นี้ (เจ้าของตั้งเอง: Settings → Secrets and variables → Actions)

| secret | ใช้ทำอะไร |
|---|---|
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | เซ็นแอป Android ด้วยกุญแจถาวร (ไม่มี = ไม่ออก Release) — วิธีสร้างใน README ของแอป Android |
| `SITE_DEPLOY_KEY` | deploy key แบบเขียนได้ของ repo เว็บไซต์ — งาน `site` ส่ง APK + หน้าดาวน์โหลดขึ้นเว็บไซต์ |
| `PLAY_SERVICE_ACCOUNT_JSON` | อัปโหลดขึ้น Google Play (`play.yml`, กดรันเอง) |
