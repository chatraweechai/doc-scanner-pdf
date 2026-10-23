# สแกนเอกสารเป็น PDF (Doc Scanner PDF)

แปลงรูปภาพ/ภาพถ่ายเอกสารเป็นไฟล์ PDF — ครอปอัตโนมัติ ปรับแสง ลบเงา OCR ไทย + อังกฤษ PDF ค้นหาข้อความได้
ทุกอย่างประมวลผลในเครื่องของผู้ใช้ ไม่อัปโหลดภาพไปที่ใด

| โฟลเดอร์ | คืออะไร | ใช้งาน |
|---|---|---|
| [`doc-scanner-pdf-code/`](doc-scanner-pdf-code) | เว็บแอป (HTML + CSS + JavaScript ล้วน) + ชุดทดสอบ + เครื่องมือเผยแพร่เว็บไซต์ | https://chatraweechai.github.io/doc-scanner-pdf/ |
| [`doc-scanner-pdf-android/`](doc-scanner-pdf-android) | แอป Android (มือถือ + แท็บเล็ต) แปลงอัตโนมัติจากเว็บแอป โค้ดเหมือนกันทุกไบต์ | https://chatraweechai.github.io/doc-scanner-pdf/android/ |
| [`.github/workflows/`](.github/workflows) | CI ทั้งหมด: ทดสอบเว็บ, Android (ทดสอบ → emulator → Release), เว็บไซต์ (GitHub Pages ของ repo นี้), ตรวจเว็บไซต์รายวัน, ย้าย Release เดิม, OpenCV.js, Google Play | |

repo นี้รวม `chatraweechai/doc-scanner-pdf-code` และ `chatraweechai/doc-scanner-pdf-android` เข้าด้วยกันเมื่อ 2026-10-22
พร้อมประวัติ commit ทั้งหมด และตั้งแต่ 2026-10-23 เว็บไซต์คือ GitHub Pages ของ repo นี้ (`pages.yml`) และ Release v1.0.20–v1.0.21
ย้ายมาอยู่ที่ [Releases](https://github.com/chatraweechai/doc-scanner-pdf/releases) ของ repo นี้ (`releases-import.yml`)
— เว็บไซต์เดิม https://doc-scanner-pdf.github.io/ (repo `doc-scanner-pdf/doc-scanner-pdf.github.io`) ไม่ได้อัปเดตจากที่นี่แล้ว

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
| `PLAY_SERVICE_ACCOUNT_JSON` | อัปโหลดขึ้น Google Play (`play.yml`, กดรันเอง) |

เว็บไซต์: Settings → Pages → Build and deployment → Source: **GitHub Actions** (ตั้งครั้งเดียว — `pages.yml` สร้างและ deploy เอง)
