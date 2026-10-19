/*
 * i18n.js — ภาษาของหน้าจอ: ไทย (th) หรืออังกฤษ (en)
 *
 * ข้อความในโค้ดและใน index.html เขียนเป็นภาษาไทยเหมือนเดิม และข้อความไทยนั้นเองคือ key ของพจนานุกรม EN
 *   I18n.t('เพิ่ม {n} หน้าแล้ว', { n: 3 })  → ไทย: "เพิ่ม 3 หน้าแล้ว"   อังกฤษ: "Added 3 pages"
 *   ค่าใน EN เป็น [เอกพจน์, พหูพจน์] ได้ — เลือกตาม params.n (1 = เอกพจน์; ไม่มี n = พหูพจน์)
 *   I18n.msg(e)        ข้อความของ Error/ข้อความสำเร็จรูป แปลถ้าอยู่ในพจนานุกรม (ข้อผิดพลาดจาก Web Worker ส่งข้อความไทยมา)
 *   I18n.lang          'th' | 'en'
 *   I18n.set(lang)     เปลี่ยนภาษา (จำไว้ใน localStorage 'lang') แปลข้อความในหน้าใหม่ แล้วเรียกผู้ฟังจาก onChange
 *   I18n.onChange(fn)  ให้ส่วนที่สร้างข้อความเอง (เช่น รายการหน้า) แสดงใหม่เมื่อเปลี่ยนภาษา
 *   I18n.add(dict)     เพิ่มคำแปล (สำหรับโค้ดของแพลตฟอร์ม เช่น แอป Android) — ไม่ทับคำแปลที่มีอยู่
 *
 * ข้อความคงที่ใน HTML (text node และ aria-label/title/placeholder/alt) ถูกแปลอัตโนมัติ
 * ข้อความที่โค้ดใส่ภายหลังด้วย I18n.t แบบไม่มีตัวแปร ก็ถูกแปลใหม่ตอนเปลี่ยนภาษาเช่นกัน (หา key ย้อนจากคำแปล)
 * ภาษาเริ่มต้น: ที่ผู้ใช้เลือกไว้ → ภาษาของเบราว์เซอร์/เครื่อง (มีภาษาไทยในรายการ = ไทย, ไม่มี = อังกฤษ)
 *
 * ชุดทดสอบ tools/tests/suites/i18n.js ตรวจว่าข้อความไทยทุกข้อความในโค้ดและ HTML มีคำแปล และคำแปลทุกข้อยังถูกใช้อยู่
 * — แก้ข้อความไทยต้องแก้ key ในพจนานุกรมนี้ด้วย
 */
(function () {
  'use strict';

  var EN = {
    // ---- index.html ----
    'สแกนเอกสารเป็น PDF': 'Scan Documents to PDF',
    'แปลงรูปภาพเอกสารหรือภาพถ่ายจากกล้องเป็นไฟล์ PDF พร้อมครอปอัตโนมัติ ลบเงา และปรับภาพให้คมชัด ทำงานในเบราว์เซอร์ทั้งหมด':
      'Turn document photos and camera shots into PDF files with automatic cropping, shadow removal and sharpening. Everything runs in your browser.',
    'สแกนเอกสาร': 'Doc Scanner',
    'กำลังโหลดตัวประมวลผลภาพ…': 'Loading the image engine…',
    'ลองใหม่': 'Retry',
    'แปลงภาพเอกสารเป็น PDF': 'Turn document photos into PDF',
    'ถ่ายภาพหรือเลือกรูปเอกสาร ระบบจะตรวจจับขอบกระดาษ ครอป ลบเงา และปรับให้คมชัดอัตโนมัติ ภาพทั้งหมดประมวลผลในเครื่องของคุณ ไม่มีการอัปโหลดไปที่ใด':
      'Take a photo or choose images of a document. The paper edges are found, cropped, cleaned of shadows and sharpened automatically. ' +
      'Everything is processed on your device — nothing is uploaded.',
    'ถ่ายภาพ': 'Take photo',
    'กล้องของเครื่อง': 'Device camera',
    'เลือกรูปภาพ': 'Choose images',
    'หรือลากไฟล์รูปภาพ (หรือไฟล์ PDF เพื่อแปลง) มาวางที่หน้านี้': 'Or drop image files (or a PDF to convert) on this page',
    'แปลงไฟล์ PDF เป็นรูป JPG / Word': 'Convert PDF to JPG / Word',
    'หน้าเอกสาร': 'Pages',
    'ลบทั้งหมด': 'Delete all',
    'แตะที่หน้าเพื่อครอปหรือปรับแสง/สี': 'Tap a page to crop it or adjust light and color',
    'เพิ่มรูป': 'Add',
    'แปลงทุกหน้าเป็นข้อความ (OCR)': 'Convert all pages to text (OCR)',
    'ข้อความ': 'Text',
    'สร้าง PDF': 'Create PDF',
    'เสร็จ': 'Done',
    'หน้าก่อนหน้า': 'Previous page',
    'หน้าถัดไป': 'Next page',
    'ภาพตัวอย่างผลลัพธ์': 'Result preview',
    'กำลังประมวลผล…': 'Processing…',
    'ครอป / ปรับขอบ': 'Crop / edges',
    'หมุนซ้าย 90 องศา': 'Rotate left 90°',
    'หมุนซ้าย': 'Rotate left',
    'หมุนขวา 90 องศา': 'Rotate right 90°',
    'หมุนขวา': 'Rotate right',
    'แปลงหน้านี้เป็นข้อความ (OCR)': 'Convert this page to text (OCR)',
    'รูปแบบภาพ': 'Image style',
    'ต้นฉบับ': 'Original',
    'สีสดคมชัด': 'Vivid color',
    'ขาวดำตัวอักษรคม': 'Sharp B&W text',
    'โทนเทา': 'Grayscale',
    'ลบเงาดำ': 'Remove shadows',
    'ปรับพื้นกระดาษให้สว่างเรียบ ลบเงามือ/เงาโทรศัพท์': 'Evens out the paper and removes hand and phone shadows',
    'ความสว่าง': 'Brightness',
    'ความคมชัด (คอนทราสต์)': 'Contrast',
    'ความเข้มตัวอักษร': 'Text darkness',
    'ใช้การตั้งค่านี้กับทุกหน้า': 'Apply to all pages',
    'รีเซ็ต': 'Reset',
    'ลบหน้านี้': 'Delete page',
    'ยกเลิก': 'Cancel',
    'ครอปภาพ': 'Crop image',
    'ยืนยัน': 'Apply',
    'ลากจุดที่มุมหรือขอบเพื่อครอปอย่างอิสระ': 'Drag the corners or edges to crop freely',
    'ตามขอบกระดาษ (อัตโนมัติ)': 'Fit to paper (auto)',
    'เต็มภาพ': 'Full image',
    'กล้องถ่ายเอกสาร': 'Document camera',
    'ปิดกล้อง': 'Close camera',
    'วางเอกสารให้อยู่ในกรอบ': 'Fit the document in the frame',
    'เปิด/ปิดไฟแฟลช': 'Flash on/off',
    'หน้า': ['page', 'pages'],
    'เปิดกล้องในแอปไม่ได้': 'Can’t open the in-app camera',
    'ใช้กล้องของเครื่อง': 'Use device camera',
    'ลองอีกครั้ง': 'Try again',
    'สร้างไฟล์ PDF': 'Create PDF file',
    'ชื่อไฟล์': 'File name',
    'ขนาดกระดาษ': 'Paper size',
    'A4 (210×297 มม.)': 'A4 (210×297 mm)',
    'Letter (8.5×11 นิ้ว)': 'Letter (8.5×11 in)',
    'Legal (8.5×14 นิ้ว)': 'Legal (8.5×14 in)',
    'A5 (148×210 มม.)': 'A5 (148×210 mm)',
    'ตามขนาดภาพ': 'Fit to image',
    'แนวกระดาษ': 'Orientation',
    'อัตโนมัติตามภาพ': 'Auto (match image)',
    'แนวตั้ง': 'Portrait',
    'แนวนอน': 'Landscape',
    'ขอบกระดาษ': 'Margins',
    'ไม่มีขอบ': 'None',
    'แคบ (5 มม.)': 'Narrow (5 mm)',
    'ปกติ (10 มม.)': 'Normal (10 mm)',
    'คุณภาพ / ขนาดไฟล์': 'Quality / file size',
    'สูง (ไฟล์ใหญ่)': 'High (large file)',
    'กลาง': 'Medium',
    'เล็ก (ส่งทางแชต)': 'Small (for chat)',
    'ค้นหาข้อความได้ (OCR)': 'Searchable text (OCR)',
    'ฝังข้อความที่อ่านได้ไว้ใต้ภาพ — ค้นหา เลือก และคัดลอกข้อความใน PDF ได้ ภาพไม่เปลี่ยน (ใช้เวลาเพิ่มหน้าละหลายวินาที)':
      'Embeds the recognized text under the image so you can search, select and copy it in the PDF. ' +
      'The image stays the same (adds a few seconds per page).',
    'ภาษาในเอกสาร': 'Document language',
    'ไทย + อังกฤษ': 'Thai + English',
    'ไทย': 'Thai',
    'อังกฤษ': 'English',
    'กำลังเตรียม…': 'Preparing…',
    'ปิด': 'Close',
    'แชร์': 'Share',
    'ดาวน์โหลด PDF': 'Download PDF',
    'แปลงภาพเป็นข้อความ (OCR)': 'Image to text (OCR)',
    'ข้อความที่อ่านได้': 'Recognized text',
    'ข้อความที่อ่านได้จะแสดงที่นี่': 'The recognized text appears here',
    'ตรวจทานข้อความก่อนนำไปใช้ — แก้ไขในช่องนี้ได้โดยตรง': 'Check the text before you use it — you can edit it right here',
    'บันทึก .txt': 'Save .txt',
    'คัดลอก': 'Copy',
    'แปลงไฟล์ PDF': 'Convert PDF',
    'เลือกไฟล์ PDF': 'Choose PDF',
    'ยังไม่ได้เลือกไฟล์': 'No file selected',
    'ไฟล์นี้มีรหัสผ่าน — ใส่รหัสผ่านเพื่อเปิด': 'This file is password-protected — enter the password to open it',
    'เปิดไฟล์': 'Open',
    'แปลงเป็น': 'Convert to',
    'รูปภาพ JPG': 'JPG images',
    'ขนาด / คุณภาพรูป': 'Image size / quality',
    'Small — เล็ก 96 dpi (ส่งทางแชต)': 'Small — 96 dpi (for chat)',
    'Standard — มาตรฐาน 150 dpi': 'Standard — 150 dpi',
    'High — สูง 300 dpi (สำหรับพิมพ์)': 'High — 300 dpi (for print)',
    'อ่านข้อความจาก': 'Read text from',
    'ข้อความในไฟล์ + OCR หน้าที่เป็นภาพ': 'Text in the file + OCR for image pages',
    'ข้อความในไฟล์เท่านั้น': 'Text in the file only',
    'OCR ทุกหน้า (ไฟล์สแกน)': 'OCR every page (scanned files)',
    'ฟอนต์ในไฟล์ Word': 'Font in the Word file',
    'ภาษาในเอกสาร (OCR)': 'Document language (OCR)',
    'หน้าที่จะแปลง': 'Pages to convert',
    'ทุกหน้า หรือ เช่น 1-3, 5': 'All pages, or e.g. 1-3, 5',
    'แปลงเป็น JPG': 'Convert to JPG',
    'วางไฟล์รูปภาพหรือ PDF ที่นี่': 'Drop images or a PDF here',

    // ---- app.js ----
    'หน้าถูกลบแล้ว': 'The page was deleted',
    'ข้าม "{name}" — ภาพมีความละเอียดสูงเกินไป': 'Skipped "{name}" — the image resolution is too high',
    'เปิด "{name}" ไม่ได้ (ไฟล์เสียหรือรูปแบบที่เบราว์เซอร์ไม่รองรับ)':
      'Can’t open "{name}" (the file is damaged or in a format this browser doesn’t support)',
    'เพิ่มได้สูงสุด {max} หน้าต่อไฟล์': 'You can add up to {max} pages per file',
    'ข้าม "{name}" — ไม่ใช่ไฟล์รูปภาพ': 'Skipped "{name}" — not an image file',
    'ข้าม "{name}" — ไฟล์ใหญ่เกิน {size}': 'Skipped "{name}" — larger than {size}',
    'ข้าม "{name}" — ไฟล์ว่างเปล่า': 'Skipped "{name}" — the file is empty',
    'แปลงไฟล์ PDF ได้ครั้งละ 1 ไฟล์ — เปิด "{name}"': 'You can convert one PDF at a time — opening "{name}"',
    'เพิ่ม {n} หน้าแล้ว': ['Added 1 page', 'Added {n} pages'],
    'ประมวลผลไม่สำเร็จ': 'Processing failed',
    'รอตัวประมวลผลภาพ…': 'Waiting for the image engine…',
    'แก้ไขหน้า {n}': 'Edit page {n}',
    'เลื่อนหน้า {n} ไปก่อนหน้า': 'Move page {n} back',
    'ลบหน้า {n}': 'Delete page {n}',
    'เลื่อนหน้า {n} ไปถัดไป': 'Move page {n} forward',
    '({n} หน้า)': ['(1 page)', '({n} pages)'],
    'หน้า {n} / {total}': 'Page {n} / {total}',
    'โหมดขาวดำลบเงาให้อัตโนมัติเสมอ': 'B&W mode always removes shadows',
    'ประมวลผลภาพไม่สำเร็จ: {msg}': 'Image processing failed: {msg}',
    'ใช้การตั้งค่านี้กับอีก {n} หน้าแล้ว': ['Applied to 1 other page', 'Applied to {n} other pages'],
    'มีเพียงหน้าเดียว': 'There is only one page',
    'ลบหน้า {n} ใช่หรือไม่?': 'Delete page {n}?',
    'เปิดภาพไม่สำเร็จ': 'Couldn’t open the image',
    'กรอบไม่ถูกต้อง (มุมไขว้กันหรือเล็กเกินไป) กรุณาปรับจุดมุม': 'Invalid frame (the corners cross or it is too small) — adjust the corners',
    'ตรวจพบขอบกระดาษแล้ว': 'Paper edges found',
    'ไม่พบขอบกระดาษ กรุณาลากจุดมุมเอง': 'No paper edges found — drag the corners yourself',
    'ตรวจจับขอบไม่สำเร็จ': 'Edge detection failed',
    'กล้อง-หน้า-{n}.jpg': 'camera-page-{n}.jpg',
    'เพิ่มจากกล้อง {n} หน้า': ['Added 1 page from the camera', 'Added {n} pages from the camera'],
    'หยุด': 'Stop',
    'กำลังหยุด…': 'Stopping…',
    'ยังไม่มีหน้าเอกสาร': 'No pages yet',
    'กรุณารอให้โหลดตัวประมวลผลภาพเสร็จก่อน (ดูสถานะที่มุมขวาบน)': 'Please wait until the image engine has loaded (see the status at the top right)',
    'กำลังทำงาน…': 'Working…',
    'กำลังอ่านข้อความหน้า {n} / {total} — {pct}%': 'Reading text on page {n} / {total} — {pct}%',
    'กำลังสร้างหน้า {n} / {total}': 'Creating page {n} / {total}',
    '(ไม่ได้ครอป/ปรับภาพ เพราะโหลดตัวประมวลผลภาพไม่สำเร็จ)': '(not cropped or enhanced because the image engine didn’t load)',
    'ยังไม่ได้บันทึกไฟล์ (กด "{button}" อีกครั้งเพื่อบันทึก)': 'the file isn’t saved yet (press "{button}" again to save it)',
    'บันทึกไฟล์ไม่สำเร็จ: {msg}': 'couldn’t save the file: {msg}',
    'ค้นหาข้อความได้ {n} จาก {total} หน้า (อ่านข้อความบางหน้าไม่สำเร็จ)':
      'text searchable on {n} of {total} pages (some pages couldn’t be read)',
    'อ่านข้อความไม่สำเร็จ ไฟล์นี้จึงค้นหาข้อความไม่ได้: {msg}': 'text recognition failed, so this file isn’t searchable: {msg}',
    'ค้นหาข้อความได้': 'searchable text',
    'ไม่พบข้อความในภาพ': 'no text found in the images',
    'สร้าง "{name}" สำเร็จ — {summary}, {size}': 'Created "{name}" — {summary}, {size}',
    '{n} หน้า': ['1 page', '{n} pages'],
    'หยุดการสร้าง PDF แล้ว': 'PDF creation stopped',
    'สร้าง PDF ไม่สำเร็จ: {msg}': 'Couldn’t create the PDF: {msg}',
    'ต้องเปิดผ่านเว็บไซต์ (https) — ไม่รองรับการเปิดไฟล์จากเครื่องโดยตรง':
      'Needs the website opened over https — not available when the file is opened directly from your device',
    'แชร์ไม่สำเร็จ: {msg}': 'Sharing failed: {msg}',
    'กำลังโหลดตัวอ่านข้อความ…': 'Loading the text reader…',
    'กำลังเตรียมตัวอ่านข้อความ…': 'Preparing the text reader…',
    'กำลังโหลดข้อมูลภาษา…': 'Loading language data…',
    'กำลังอ่านข้อความ {pct}%': 'Reading text {pct}%',
    'กำลังอ่านข้อความ หน้า {n} ({i}/{total}) {pct}%': 'Reading text, page {n} ({i}/{total}) {pct}%',
    'กำลังเตรียมภาพ…': 'Preparing the image…',
    'กำลังเตรียมภาพ หน้า {n} ({i}/{total})…': 'Preparing the image, page {n} ({i}/{total})…',
    'เตรียมภาพไม่สำเร็จ': 'Couldn’t prepare the image',
    'ยกเลิกแล้ว': 'Cancelled',
    'การแปลงเป็นข้อความต้องเปิดผ่านเว็บไซต์ (https) — ไม่รองรับการเปิดไฟล์จากเครื่องโดยตรง':
      'Text recognition needs the website opened over https — it isn’t available when the file is opened directly from your device',
    '— หน้า {n} —': '— Page {n} —',
    'ไม่พบข้อความในภาพ — ลองครอปให้ชิดเอกสาร หรือถ่ายภาพให้ชัดขึ้น': 'No text found — crop closer to the document or take a sharper photo',
    'ความมั่นใจเฉลี่ย {avg}% (ต่ำ) — ภาพอาจไม่ชัด กรุณาตรวจทานข้อความให้ละเอียด':
      'Average confidence {avg}% (low) — the image may be unclear; check the text carefully',
    'ความมั่นใจเฉลี่ย {avg}% — ตรวจทานข้อความก่อนนำไปใช้ แก้ไขในช่องนี้ได้โดยตรง':
      'Average confidence {avg}% — check the text before you use it; you can edit it right here',
    'แปลงเป็นข้อความไม่สำเร็จ: {msg}': 'Text recognition failed: {msg}',
    'คัดลอกข้อความแล้ว': 'Text copied',
    'คัดลอกไม่สำเร็จ — กดค้างที่ข้อความเพื่อคัดลอกเอง': 'Copy failed — press and hold the text to copy it yourself',
    'บันทึก "{name}" แล้ว': 'Saved "{name}"',
    'ยังไม่ได้บันทึกไฟล์': 'The file isn’t saved',
    'บันทึกไม่สำเร็จ: {msg}': 'Save failed: {msg}',
    'หน้า {n}': 'Page {n}',
    'ทุกหน้า ({n} หน้า)': ['All pages (1 page)', 'All pages ({n} pages)'],
    'แชร์ไม่สำเร็จ': 'Sharing failed',
    'พร้อมใช้งาน': 'Ready',
    'โหลดตัวประมวลผลภาพไม่สำเร็จ': 'Couldn’t load the image engine',
    'OpenCV.js {build} · {mode} · โหลด {sec} วินาที': 'OpenCV.js {build} · {mode} · loaded in {sec} s',
    'มาตรฐาน': 'standard',
    'Web Worker สูงสุด {n} ตัว': ['up to 1 Web Worker', 'up to {n} Web Workers'],
    'ประมวลผลในหน้าเว็บ': 'processing in the page',
    'ลบทุกหน้า ({n} หน้า) ใช่หรือไม่?': ['Delete all pages (1 page)?', 'Delete all pages ({n} pages)?'],
    'เวอร์ชัน {v}': 'Version {v}',
    'พัฒนา (dev)': 'development (dev)',
    'เปิดเมื่อ {when}': 'opened {when}',

    // ---- camera.js ----
    'ไม่ได้รับอนุญาตให้ใช้กล้องในแอป': 'No permission to use the in-app camera',
    'ถ่ายด้วยกล้องของเครื่องแทนได้เลย': 'You can take the photos with the device camera instead',
    'ไม่พบกล้อง': 'No camera found',
    'ใช้กล้องของเครื่อง หรือเลือกรูปภาพแทน': 'Use the device camera or choose images instead',
    'กล้องกำลังถูกใช้งานโดยแอปอื่น': 'Another app is using the camera',
    'ปิดแอปที่ใช้กล้องอยู่แล้วกด "ลองอีกครั้ง" หรือใช้กล้องของเครื่องแทน':
      'Close the app that is using the camera and press "Try again", or use the device camera instead',
    'กล้องในแอปต้องเปิดผ่าน HTTPS': 'The in-app camera needs HTTPS',
    'เบราว์เซอร์นี้เปิดกล้องในแอปไม่ได้': 'This browser can’t open the in-app camera',
    'คุณเปิดหน้านี้ในแอป {app} ซึ่งมักไม่อนุญาตให้เว็บใช้กล้อง — ถ้าต้องการกล้องในแอป (ถ่ายหลายหน้าต่อเนื่อง) ให้เปิดลิงก์นี้ใน Chrome หรือ Safari (เมนู ⋮ หรือ ⋯ → เปิดในเบราว์เซอร์)':
      'You opened this page inside {app}, which usually doesn’t let websites use the camera. For the in-app camera ' +
      '(several pages in a row), open this link in Chrome or Safari (menu ⋮ or ⋯ → Open in browser)',
    'วิธีอนุญาตกล้องในแอป: แตะ "aA" ที่ช่องที่อยู่เว็บ → การตั้งค่าเว็บไซต์ → กล้อง → อนุญาต แล้วกด "ลองอีกครั้ง"':
      'To allow the in-app camera: tap "aA" in the address bar → Website Settings → Camera → Allow, then press "Try again"',
    'วิธีอนุญาตกล้องในแอป: แตะไอคอนหน้าช่องที่อยู่เว็บ → สิทธิ์ (การตั้งค่าเว็บไซต์) → กล้อง → อนุญาต แล้วกด "ลองอีกครั้ง" (ถ้ายังไม่ได้ ให้อนุญาตกล้องให้แอปเบราว์เซอร์ในการตั้งค่าของเครื่องด้วย)':
      'To allow the in-app camera: tap the icon at the start of the address bar → Permissions (Site settings) → Camera → Allow, ' +
      'then press "Try again" (if it still doesn’t work, also allow the camera for the browser app in your device settings)',
    'กำลังเปิดกล้อง…': 'Opening the camera…',
    'วางเอกสารให้อยู่ในกรอบ แล้วกดถ่าย': 'Fit the document in the frame, then take the photo',
    'พบเอกสารแล้ว กดถ่ายได้เลย': 'Document found — take the photo',
    'ถ่ายแล้ว {n} หน้า — ถ่ายต่อ หรือกด "เสร็จ"': ['1 page taken — keep going or press "Done"', '{n} pages taken — keep going or press "Done"'],
    'ถ่ายภาพไม่สำเร็จ ลองอีกครั้ง': 'Couldn’t take the photo — try again',

    // ---- crop-editor.js ----
    'กรอบครอป': 'Crop frame',
    'มุมบนซ้าย': 'Top-left corner',
    'มุมบนขวา': 'Top-right corner',
    'มุมล่างขวา': 'Bottom-right corner',
    'มุมล่างซ้าย': 'Bottom-left corner',
    'ขอบบน': 'Top edge',
    'ขอบขวา': 'Right edge',
    'ขอบล่าง': 'Bottom edge',
    'ขอบซ้าย': 'Left edge',
    '{name} (ลากหรือใช้ปุ่มลูกศรเพื่อเลื่อน)': '{name} (drag, or move with the arrow keys)',

    // ---- ตัวประมวลผลภาพ (cv-core.js, cv-engine.js, cv-worker.js) ----
    'รูปแบบภาพไม่ถูกต้อง': 'Invalid image format',
    'ขนาดภาพผลลัพธ์ไม่ถูกต้อง': 'Invalid output image size',
    'กรอบครอปไม่ถูกต้อง': 'Invalid crop frame',
    'ไม่พบ AppPlatform (js/boot.js)': 'AppPlatform not found (js/boot.js)',
    'โหลด OpenCV นานเกินไป': 'OpenCV took too long to load',
    'Worker ทำงานผิดพลาด': 'Worker error',
    'ตัวประมวลผลภาพหยุดทำงาน': 'The image engine stopped',
    'ตัวประมวลผลภาพยังไม่พร้อม': 'The image engine isn’t ready',
    'ไม่พบ OpenCV': 'OpenCV not found',
    'ตัวประมวลผลภาพถูกเริ่มใหม่': 'The image engine was restarted',
    'อนุญาตเฉพาะไฟล์จากเว็บไซต์เดียวกัน': 'Only files from the same website are allowed',
    'OpenCV ยังไม่พร้อม': 'OpenCV isn’t ready',
    'คำสั่งไม่ถูกต้อง': 'Invalid command',

    // ---- HEIC (heic.js, heic-worker.js) ----
    'ผลการถอดรหัส HEIC ไม่ถูกต้อง': 'Invalid HEIC decoding result',
    'ตัวถอดรหัส HEIC ทำงานผิดพลาด': 'HEIC decoder error',
    'ถอดรหัส HEIC นานเกินไป': 'HEIC decoding took too long',
    'โหลดตัวถอดรหัส HEIC ไม่สำเร็จ': 'Couldn’t load the HEIC decoder',
    'ไม่ใช่ไฟล์ HEIC/HEIF ที่อ่านได้': 'Not a readable HEIC/HEIF file',
    'ขนาดภาพไม่ถูกต้อง': 'Invalid image size',
    'ภาพใหญ่เกินไป': 'The image is too large',
    'ถอดรหัส HEIC ไม่สำเร็จ': 'HEIC decoding failed',
    'ไม่ใช่ไฟล์ HEIC/HEIF': 'Not a HEIC/HEIF file',
    'ไม่มีข้อมูลภาพ': 'No image data',

    // ---- ocr.js ----
    'โหลดตัวอ่านข้อความไม่สำเร็จ': 'Couldn’t load the text reader',
    'โหลดตัวอ่านข้อความไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต': 'Couldn’t load the text reader — check your internet connection',
    'เริ่มตัวอ่านข้อความนานเกินไป': 'The text reader took too long to start',
    'เริ่มตัวอ่านข้อความไม่สำเร็จ': 'Couldn’t start the text reader',

    // ---- pdf-export.js ----
    'แปลงภาพเป็น JPEG ไม่สำเร็จ': 'Couldn’t convert the image to JPEG',
    'โหลดไลบรารี jsPDF ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ': 'Couldn’t load the jsPDF library — please reload the page',
    'ไฟล์ฟอนต์ไม่ถูกต้อง': 'Invalid font file',
    'โหลดฟอนต์สำหรับข้อความใน PDF ไม่สำเร็จ ({msg})': 'Couldn’t load the font for the PDF text ({msg})',

    // ---- zip.js ----
    'ข้อมูลไฟล์ใน ZIP ไม่ถูกต้อง': 'Invalid file data in the ZIP',
    'ไม่มีไฟล์ให้รวม': 'No files to pack',
    'ชื่อไฟล์ใน ZIP ไม่ถูกต้อง: {name}': 'Invalid file name in the ZIP: {name}',
    'ชื่อไฟล์ซ้ำใน ZIP: {name}': 'Duplicate file name in the ZIP: {name}',
    'ไฟล์ ZIP ใหญ่เกินไป': 'The ZIP file is too large',

    // ---- boot.js, pdf-worker.js ----
    'โหลดไฟล์ {src} ไม่สำเร็จ': 'Couldn’t load {src}',
    'PDF.js worker: ที่อยู่ไฟล์ไม่ถูกต้อง': 'PDF.js worker: invalid file address',

    // ---- pdf-convert.js ----
    'แปลงแต่ละหน้าเป็นรูป JPG — หน้าเดียวได้ไฟล์ .jpg หลายหน้ารวมเป็นไฟล์ .zip (แตกไฟล์เพื่อดูรูป)':
      'Each page becomes a JPG image — one page gives a .jpg file, several pages are packed into a .zip file (extract it to see the images)',
    'ข้อความภาษาไทยดึงจากไฟล์ PDF ตรงตามต้นฉบับทุกตัวอักษร คงบรรทัดและย่อหน้าเดิม (ไม่รวมรูปภาพและเส้นตาราง) — หน้าที่เป็นภาพสแกนไม่มีข้อความในไฟล์ จึงต้องอ่านด้วย OCR ซึ่งอาจอ่านผิดได้ ต้องตรวจทานทุกครั้ง':
      'The text (Thai included) is taken from the PDF exactly as in the original, keeping its lines and paragraphs ' +
      '(images and table lines are left out). Scanned pages have no text in the file, so they are read with OCR, ' +
      'which can make mistakes — always check the result.',
    'แปลงเป็น Word': 'Convert to Word',
    'รหัสผ่านไม่ถูกต้อง — ลองอีกครั้ง': 'Wrong password — try again',
    'รอรหัสผ่าน…': 'Waiting for the password…',
    'กำลังเปิดไฟล์…': 'Opening the file…',
    'กำลังแปลงไฟล์อยู่ — รอให้เสร็จหรือกด "หยุด" ก่อน': 'A conversion is running — wait for it to finish or press "Stop" first',
    '"{name}" ไม่ใช่ไฟล์ PDF': '"{name}" is not a PDF file',
    '{name} — {n} หน้า, {size}': ['{name} — 1 page, {size}', '{name} — {n} pages, {size}'],
    'แปลงไฟล์ PDF ได้เมื่อเปิดผ่านเว็บไซต์ (https) เท่านั้น — ไม่รองรับการเปิดไฟล์จากเครื่องโดยตรง':
      'Converting PDF files needs the website opened over https — it isn’t available when the file is opened directly from your device',
    'กำลังรวมไฟล์ .zip…': 'Packing the .zip file…',
    'กำลังบันทึก…': 'Saving…',
    'กำลังแปลงหน้า {page} ({i} / {total})': 'Converting page {page} ({i} / {total})',
    'กำลังสร้างไฟล์ Word…': 'Creating the Word file…',
    'กำลังอ่านข้อความหน้า {page} ({i} / {total})': 'Reading the text of page {page} ({i} / {total})',
    'หน้า {page} เป็นภาพ — กำลังอ่านด้วย OCR {pct}%': 'Page {page} is an image — reading it with OCR {pct}%',
    'ข้อความตรงตามต้นฉบับในไฟล์ PDF ทุกหน้า': 'text exactly as in the PDF on every page',
    'หน้า {pages}: ข้อความตรงตามต้นฉบับในไฟล์ PDF': 'pages {pages}: text exactly as in the PDF',
    'หน้า {pages} เป็นภาพสแกน อ่านด้วย OCR — กรุณาตรวจทานข้อความ': 'pages {pages} are scanned images read with OCR — please check the text',
    'หน้า {pages} ฟอนต์ในไฟล์ไม่บอกรหัสตัวอักษรบางตัว ข้อความอาจไม่ครบ — ตรวจทาน หรือเลือก "OCR ทุกหน้า"':
      'pages {pages}: the fonts in the file don’t identify some characters, so the text may be incomplete — check it, or choose "OCR every page"',
    'หน้า {pages} ไม่มีข้อความ': 'pages {pages} have no text',
    '(อ่านด้วย OCR ไม่สำเร็จ)': '(OCR failed)',
    '(เป็นภาพ — เลือกอ่านด้วย OCR)': '(they are images — choose to read them with OCR)',
    '{n} รูปในไฟล์ .zip': ['1 image in a .zip file', '{n} images in a .zip file'],
    '1 รูป': '1 image',
    'หยุดการแปลงแล้ว': 'Conversion stopped',
    'แปลงไฟล์ไม่สำเร็จ: {msg}': 'Conversion failed: {msg}',

    // ---- pdf-tools.js ----
    'โหลดตัวอ่านไฟล์ PDF ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่': 'Couldn’t load the PDF reader — check your internet connection and try again',
    'โหลดตัวอ่านไฟล์ PDF ไม่สำเร็จ': 'Couldn’t load the PDF reader',
    'ไม่รู้จักไฟล์ {name}': 'Unknown file {name}',
    'ไม่พบไฟล์': 'File not found',
    'ไฟล์ว่างเปล่า': 'The file is empty',
    'ไฟล์ใหญ่เกิน {size} MB': 'The file is larger than {size} MB',
    'ไฟล์นี้ไม่ใช่ไฟล์ PDF': 'This file is not a PDF',
    'ไฟล์นี้มีรหัสผ่าน — ต้องใส่รหัสผ่านเพื่อเปิด': 'This file is password-protected — a password is needed to open it',
    'เปิดไฟล์ PDF ไม่ได้ — ไฟล์อาจเสียหาย': 'Can’t open the PDF — the file may be damaged',
    'รูปแบบเลขหน้าไม่ถูกต้อง (ตัวอย่าง: 1-3, 5)': 'Invalid page numbers (example: 1-3, 5)',
    'รูปแบบเลขหน้าไม่ถูกต้อง: "{part}"': 'Invalid page numbers: "{part}"',
    'ไฟล์นี้มี {n} หน้า — ไม่มีหน้า "{part}"': ['This file has 1 page — there is no page "{part}"', 'This file has {n} pages — there is no page "{part}"'],
    'ช่วงหน้าไม่ถูกต้อง: "{part}"': 'Invalid page range: "{part}"',
    'ยังไม่ได้เลือกหน้า': 'No pages selected',
    'ขนาดหน้า {n} ไม่ถูกต้อง': 'Page {n} has an invalid size',
    'แปลงเป็นรูปได้ครั้งละไม่เกิน {max} หน้า — เลือกช่วงหน้า เช่น 1-{max}': 'You can convert up to {max} pages to images at a time — choose a page range such as 1-{max}',
    'เตรียมภาพหน้า {n} ไม่สำเร็จ': 'Couldn’t prepare the image of page {n}',
    'แปลงเป็น Word ได้ครั้งละไม่เกิน {max} หน้า': 'You can convert up to {max} pages to Word at a time',
    'อ่านข้อความจากภาพ (OCR) ได้เมื่อเปิดผ่านเว็บไซต์ (https) เท่านั้น': 'Reading text from images (OCR) needs the website opened over https'
  };

  var LANGS = ['th', 'en'];
  var STORE_KEY = 'lang';
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var listeners = [];
  var reverse = null;   // คำแปลอังกฤษ → key ไทย (ใช้กับข้อความที่โค้ดใส่ไว้แล้วในภาษาเดิม)
  var lang = detect();

  function detect() {
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (LANGS.indexOf(saved) >= 0) return saved;
    } catch (_) { /* ignore */ }
    var list = [];
    try {
      list = navigator.languages && navigator.languages.length ? Array.prototype.slice.call(navigator.languages) : [navigator.language];
    } catch (_) { list = []; }
    list = list.filter(Boolean).map(String);
    if (!list.length) return 'th'; // ไม่รู้ภาษาของเครื่อง: ใช้ภาษาไทยเหมือนเดิม
    for (var i = 0; i < list.length; i++) if (/^th(-|_|$)/i.test(list[i])) return 'th';
    return 'en';
  }

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  function pick(v, params) {
    if (!Array.isArray(v)) return v;
    return v[params && Number(params.n) === 1 ? 0 : 1];
  }

  function fill(s, params) {
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return has(params, k) ? String(params[k]) : m; });
  }

  /** ข้อความในภาษาปัจจุบัน — key คือข้อความภาษาไทย ({ชื่อ} = ตัวแปรจาก params) */
  function t(key, params) {
    key = String(key);
    var s = lang === 'en' && has(EN, key) ? pick(EN[key], params) : key;
    return fill(s, params);
  }

  /** ข้อความของ Error (หรือข้อความ) — แปลถ้าเป็นข้อความในพจนานุกรม */
  function msg(e) {
    var s = e && typeof e === 'object' && 'message' in e ? e.message : e;
    s = String(s == null ? '' : s);
    return lang === 'en' && has(EN, s) && typeof EN[s] === 'string' ? EN[s] : s;
  }

  function reverseMap() {
    if (!reverse) {
      reverse = Object.create(null);
      Object.keys(EN).forEach(function (k) {
        if (/\{\w+\}/.test(k)) return; // ข้อความที่มีตัวแปร: เจ้าของข้อความแสดงใหม่เอง (onChange)
        var v = EN[k];
        (Array.isArray(v) ? v : [v]).forEach(function (x) { if (!(x in reverse)) reverse[x] = k; });
      });
    }
    return reverse;
  }

  /** key ไทยของข้อความที่แสดงอยู่ (ภาษาใดก็ได้) หรือ null ถ้าไม่ใช่ข้อความของแอป */
  function keyOf(text) {
    var k = norm(text);
    if (!k) return null;
    if (has(EN, k)) return k;
    return reverseMap()[k] || null;
  }

  function render(key) { return lang === 'en' ? pick(EN[key]) : key; }

  function translateText(node) {
    var raw = node.nodeValue;
    var key = keyOf(raw);
    if (!key) return;
    var out = render(key);
    if (norm(raw) === out) return;
    node.nodeValue = /^\s*/.exec(raw)[0] + out + /\s*$/.exec(raw)[0];
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (!v) continue;
      var key = keyOf(v);
      if (key) el.setAttribute(ATTRS[i], render(key));
    }
  }

  /** แปลข้อความคงที่ทั้งหมดใต้ root (ค่าเริ่มต้น: ทั้งหน้า) เป็นภาษาปัจจุบัน */
  function apply(root) {
    root = root || document.body;
    if (!root) return;
    (function walk(el) {
      if (el.hasAttribute && el.hasAttribute('data-i18n-skip')) return;
      if (el.nodeType === 1) translateAttrs(el);
      if (SKIP[el.nodeName]) return; // ข้างในเป็นโค้ด/ข้อความของผู้ใช้ (ป้ายกำกับของช่องแปลแล้วด้านบน)
      for (var c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) translateText(c);
        else if (c.nodeType === 1) walk(c);
      }
    })(root);
  }

  function applyDocument() {
    document.documentElement.lang = lang;
    var titleKey = keyOf(document.title);
    if (titleKey) document.title = render(titleKey);
    var meta = document.querySelector('meta[name="description"]');
    var descKey = meta && keyOf(meta.getAttribute('content') || '');
    if (descKey) meta.setAttribute('content', render(descKey));
    apply(document.body);
    renderToggle();
  }

  /** ปุ่มเปลี่ยนภาษา (#btnLang): แสดงชื่อภาษาที่จะเปลี่ยนไป เขียนด้วยภาษานั้นเอง */
  function renderToggle() {
    var btn = document.getElementById('btnLang');
    if (!btn) return;
    var to = lang === 'th' ? 'en' : 'th';
    var label = to === 'en' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย';
    var text = document.getElementById('btnLangText');
    if (text) text.textContent = to === 'en' ? 'EN' : 'ไทย';
    btn.setAttribute('lang', to);
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.hidden = false;
    if (!btn.__i18nBound) {
      btn.__i18nBound = true;
      btn.addEventListener('click', function () { set(lang === 'th' ? 'en' : 'th'); });
    }
  }

  function set(next) {
    if (LANGS.indexOf(next) < 0 || next === lang) return;
    lang = next;
    window.I18n.lang = lang;
    try { localStorage.setItem(STORE_KEY, lang); } catch (_) { /* ignore */ }
    applyDocument();
    listeners.slice().forEach(function (fn) {
      try { fn(lang); } catch (e) { console.error(e); }
    });
  }

  function add(dict) {
    if (!dict || typeof dict !== 'object') return;
    Object.keys(dict).forEach(function (k) {
      var v = dict[k];
      var ok = typeof v === 'string' || (Array.isArray(v) && v.length === 2 && v.every(function (x) { return typeof x === 'string'; }));
      if (ok && !has(EN, k)) EN[k] = v;
    });
    reverse = null;
  }

  window.I18n = {
    lang: lang,
    LANGS: LANGS.slice(),
    t: t,
    msg: msg,
    set: set,
    add: add,
    apply: apply,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    _dict: function () { return EN; } // สำหรับชุดทดสอบ
  };

  // แปลทันทีส่วนที่มีแล้ว (สคริปต์ท้าย <body> ของแพลตฟอร์มอื่น: หน้าไม่แวบเป็นภาษาไทย) และอีกครั้งเมื่อโหลดหน้าครบ
  if (document.body) applyDocument();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyDocument);
})();
