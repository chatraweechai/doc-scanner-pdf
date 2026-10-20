#!/usr/bin/env node
'use strict';
/*
 * Builds the public download page of the Android app for the site repository chatrawichai-envbr/chatrawichai-envbr.github.io
 * (GitHub Pages user site; every link is relative, so the pages also work from a sub-folder):
 *   https://chatrawichai-envbr.github.io/doc-scanner-pdf-android/   (index.html + the signed APK + version.json)
 * The release job of .github/workflows/android.yml runs it with the signed release APK after every test passed.
 *
 *   node tools/site/build-page.js --apk <file.apk> --out <site>/doc-scanner-pdf-android --version 1.0.N
 *        --cert <signing certificate SHA-256, 64 hex> --source <doc-scanner-pdf-code commit> --app <doc-scanner-pdf-android commit>
 *        [--notes <changelog of this version, markdown list>] [--published <ISO time>]
 *
 * The folder is replaced by exactly four files: index.html, privacy.html (privacy policy in Thai and English — the
 * Google Play listing links it), version.json and doc-scanner-pdf-<version>.apk.
 * No scripts on the page, strict CSP, styles from the site's site.css (../site.css).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FOLDER = 'doc-scanner-pdf-android';
const MAX_APK = 95 * 1024 * 1024; // GitHub refuses files over 100 MB

function fail(msg) { throw new Error('build-page: ' + msg); }

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!/^--(apk|out|version|cert|source|app|notes|published)$/.test(k) || argv[i + 1] === undefined) fail('bad argument ' + k);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fingerprint = hex => hex.toUpperCase().match(/../g).join(':');
const mb = n => (n / 1048576).toFixed(1);

/** รายการการเปลี่ยนแปลงของรุ่นนี้ (จาก CHANGELOG.md) → ข้อความล้วนทีละข้อ (ไม่แปลง markdown เป็น HTML) */
function notesList(md) {
  const items = [];
  let open = false; // บรรทัดต่อของข้อเดิม (ย่อหน้าต่อกันโดยไม่มีบรรทัดว่างคั่น)
  for (const line of String(md || '').split('\n')) {
    const m = /^\s*[-*]\s+(.*)$/.exec(line);
    if (m) { items.push(m[1]); open = true; }
    else if (!line.trim()) open = false;
    else if (open) items[items.length - 1] += ' ' + line.trim();
  }
  return items.map(t => t.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30);
}

function page(v) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <title>สแกนเอกสาร PDF — แอป Android</title>
  <link rel="stylesheet" href="../site.css">
</head>
<body>
  <main>
    <p><a href="../">สแกนเอกสารเป็น PDF</a></p>
    <h1>สแกนเอกสาร PDF — แอป Android</h1>
    <p>ถ่ายภาพหรือเลือกรูปเอกสาร ครอปตามขอบกระดาษ ลบเงา ปรับให้คมชัด แปลงข้อความ (OCR ไทย + อังกฤษ) และสร้าง PDF ที่ค้นหาข้อความได้
      — ทำงานในเครื่องทั้งหมด ไม่ต้องใช้อินเทอร์เน็ต สำหรับมือถือและแท็บเล็ต Android 8.0 ขึ้นไป</p>
    <ul class="apps">
      <li>
        <a class="app" href="${esc(v.file)}" download>
          <strong>ดาวน์โหลด APK รุ่น ${esc(v.version)}</strong>
          <span>${esc(v.file)} · ${esc(mb(v.size))} MB</span>
        </a>
      </li>
    </ul>

    <h2>ติดตั้ง</h2>
    <ol>
      <li>กดดาวน์โหลดบนมือถือหรือแท็บเล็ต แล้วเปิดไฟล์ที่ดาวน์โหลด</li>
      <li>ครั้งแรก Android จะให้อนุญาต "ติดตั้งแอปที่ไม่รู้จัก" ให้เบราว์เซอร์ที่ใช้ดาวน์โหลด</li>
      <li>เปิดแอป <strong>สแกนเอกสาร PDF</strong> — ครั้งแรกที่ใช้กล้องในแอป Android จะถามสิทธิ์กล้อง</li>
    </ol>
    <p><strong>อัปเดต:</strong> ดาวน์โหลดรุ่นใหม่จากหน้านี้แล้วติดตั้งทับได้เลย (ทุกรุ่นเซ็นด้วยกุญแจเดียวกัน)</p>
${v.notes.length ? `
    <h2>มีอะไรใหม่ในรุ่น ${esc(v.version)}</h2>
    <ul>
${v.notes.map(n => `      <li>${esc(n)}</li>`).join('\n')}
    </ul>
` : ''}
    <h2>ความปลอดภัย</h2>
    <ul>
      <li>สิทธิ์ที่ขอมีสิทธิ์เดียวคือกล้อง — ไม่มีสิทธิ์อินเทอร์เน็ต ภาพเอกสารไม่ถูกส่งไปที่ใด</li>
      <li>SHA-256 ของไฟล์ APK: <code class="hash">${esc(v.sha256)}</code></li>
      <li>ลายนิ้วมือใบรับรองที่เซ็นแอป (SHA-256): <code class="hash">${esc(fingerprint(v.signingCertSha256))}</code></li>
      <li>ทุกรุ่นผ่านการทดสอบบนมือถือ มือถือจอเล็ก และแท็บเล็ต (emulator) ก่อนเผยแพร่</li>
    </ul>

    <p>ใช้บนคอมพิวเตอร์หรือไม่ต้องการติดตั้ง: <a href="../doc-scanner-pdf/">เวอร์ชันเว็บ</a></p>
    <p><a href="privacy.html">นโยบายความเป็นส่วนตัว · Privacy policy</a></p>
  </main>
</body>
</html>
`;
}

/** นโยบายความเป็นส่วนตัว (ไทย + อังกฤษ) — ตรงกับสิ่งที่แอปทำจริง: ไม่มีสิทธิ์อินเทอร์เน็ต ไม่เก็บ/ไม่ส่งข้อมูล */
const PRIVACY_DATE = '2026-10-01';
function privacyPage() {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <title>นโยบายความเป็นส่วนตัว · Privacy policy — สแกนเอกสาร PDF (Doc Scanner PDF)</title>
  <link rel="stylesheet" href="../site.css">
</head>
<body>
  <main>
    <p><a href="./">สแกนเอกสาร PDF — แอป Android</a></p>
    <h1>นโยบายความเป็นส่วนตัว</h1>
    <p>แอป <strong>สแกนเอกสาร PDF</strong> (Doc Scanner PDF, <code>io.github.chatrawichaitech.docscanner</code>) โดย chatrawichai-envbr
      — มีผลตั้งแต่ ${PRIVACY_DATE}</p>
    <ul>
      <li><strong>ไม่เก็บและไม่ส่งข้อมูลใด ๆ</strong> — แอปไม่มีสิทธิ์ใช้อินเทอร์เน็ต ไม่มีบัญชีผู้ใช้ ไม่มีโฆษณา ไม่มีระบบวิเคราะห์การใช้งาน
        และปิดการส่งสถิติของ Android System WebView ในแอป</li>
      <li><strong>กล้อง</strong> — ใช้เฉพาะเมื่อคุณถ่ายภาพเอกสารในแอป ภาพประมวลผลในเครื่องเท่านั้น</li>
      <li><strong>รูปภาพและไฟล์</strong> — แอปเปิดเฉพาะไฟล์ที่คุณเลือกผ่านหน้าต่างเลือกไฟล์ของ Android และบันทึกไฟล์ (PDF, Word, JPG, .txt)
        ไปยังที่ที่คุณเลือกเท่านั้น ไฟล์ชั่วคราว (เช่น รูปจากกล้องของเครื่อง ไฟล์ที่แชร์) อยู่ในพื้นที่ของแอปและถูกลบอัตโนมัติ</li>
      <li><strong>การแชร์</strong> — ไฟล์หรือข้อความถูกส่งไปยังแอปอื่นเฉพาะเมื่อคุณกด "แชร์" และเลือกแอปปลายทางเอง</li>
      <li><strong>การตั้งค่า</strong> — เช่น ภาษาของหน้าจอและตัวเลือก PDF เก็บในเครื่องของคุณเท่านั้น ไม่สำรองขึ้นคลาวด์
        และหายไปเมื่อลบข้อมูลแอปหรือถอนการติดตั้ง</li>
      <li><strong>เด็ก</strong> — แอปไม่ได้เก็บข้อมูลของผู้ใช้คนใด รวมถึงเด็ก</li>
      <li><strong>การเปลี่ยนแปลง</strong> — หากนโยบายนี้เปลี่ยน จะแก้ไขที่หน้านี้พร้อมวันที่มีผล</li>
      <li><strong>ติดต่อ</strong> — ทางอีเมลของผู้พัฒนาที่แสดงในหน้าแอปบน Google Play หรือ <a href="https://github.com/chatraweechai">github.com/chatraweechai</a></li>
    </ul>

    <h2 lang="en">Privacy policy</h2>
    <div lang="en">
    <p>The app <strong>Doc Scanner PDF</strong> (สแกนเอกสาร PDF, <code>io.github.chatrawichaitech.docscanner</code>) by chatrawichai-envbr
      — effective ${PRIVACY_DATE}</p>
    <ul>
      <li><strong>No data is collected or shared.</strong> The app has no internet permission, no user accounts, no ads and no analytics,
        and it turns off Android System WebView's usage statistics.</li>
      <li><strong>Camera</strong> — used only when you take a photo of a document in the app. Images are processed on your device only.</li>
      <li><strong>Photos and files</strong> — the app opens only the files you pick in Android's file picker and saves files (PDF, Word, JPG,
        .txt) only where you choose. Temporary files (such as photos from your device camera or files you share) stay in the app's own
        storage and are deleted automatically.</li>
      <li><strong>Sharing</strong> — a file or text goes to another app only when you tap "Share" and choose that app.</li>
      <li><strong>Settings</strong> such as the language and PDF options are stored on your device only, are not backed up to the cloud,
        and are removed when you clear the app's data or uninstall it.</li>
      <li><strong>Children</strong> — the app does not collect data from anyone, including children.</li>
      <li><strong>Changes</strong> — if this policy changes, this page is updated with its effective date.</li>
      <li><strong>Contact</strong> — the developer email shown on the app's Google Play page, or
        <a href="https://github.com/chatraweechai">github.com/chatraweechai</a>.</li>
    </ul>
    </div>
  </main>
</body>
</html>
`;
}

function build(opts) {
  const o = Object.assign({}, opts);
  const vm = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(o.version || '');
  if (!vm || o.version === '0.0.0') fail('version must be <major>.<minor>.<patch> (CHANGELOG.md)');
  if (!/^[0-9a-f]{64}$/.test(o.cert || '')) fail('cert must be the SHA-256 of the signing certificate (64 hex)');
  for (const k of ['source', 'app']) if (!/^[0-9a-f]{40}$/.test(o[k] || '')) fail(k + ' must be a full git commit');
  const published = o.published || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(published)) fail('published must be YYYY-MM-DDTHH:MM:SSZ');

  const apk = fs.readFileSync(o.apk || fail('--apk is required'));
  if (apk.length < 1024 || apk.length > MAX_APK) fail('APK size ' + apk.length + ' is out of range');
  if (apk.readUInt32LE(0) !== 0x04034b50) fail('not an APK (zip) file');

  const out = path.resolve(o.out || fail('--out is required'));
  if (path.basename(out) !== FOLDER) fail('the output folder must be named ' + FOLDER);
  if (fs.existsSync(path.join(out, '.git'))) fail('refusing to write into a git repository root');
  if (fs.existsSync(out)) {
    if (fs.lstatSync(out).isSymbolicLink() || !fs.statSync(out).isDirectory()) fail(out + ' is not a folder');
    fs.rmSync(out, { recursive: true });
  }
  fs.mkdirSync(out, { recursive: true });

  const notes = o.notes ? notesList(fs.readFileSync(o.notes, 'utf8')) : [];
  const v = {
    version: o.version,
    versionCode: Number(vm[1]) * 1000000 + Number(vm[2]) * 1000 + Number(vm[3]),
    file: `doc-scanner-pdf-${o.version}.apk`,
    size: apk.length,
    sha256: crypto.createHash('sha256').update(apk).digest('hex'),
    signingCertSha256: o.cert,
    minAndroid: '8.0',
    sourceCommit: o.source,
    appCommit: o.app,
    publishedAt: published,
    notes,
  };
  fs.writeFileSync(path.join(out, v.file), apk);
  fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(v, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'index.html'), page(v));
  fs.writeFileSync(path.join(out, 'privacy.html'), privacyPage());
  return v;
}

module.exports = { build, FOLDER };

if (require.main === module) {
  try {
    const v = build(args(process.argv.slice(2)));
    console.log(`${FOLDER}: ${v.file} (${mb(v.size)} MB, sha256 ${v.sha256})`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
