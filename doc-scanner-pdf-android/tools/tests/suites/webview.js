'use strict';
/*
 * The app's page as the Android WebView runs it (https://appassets.androidplatform.net, no internet,
 * DocScannerBridge): load, OpenCV, import, PDF saved/shared through the bridge (incl. cancel/error),
 * OCR from the bundled files + save/share text, Android back handling, in-app camera, camera-denied help,
 * HEIC photos, PDF → Word / JPG / ZIP saved and shared through the bridge, and nothing requested outside the app.
 */
const { SOURCE, WWW_DIR, fs, path, OUT, launch, newAppContext, openApp, suite, run, fixture, waitReady, waitIdle,
  waitOcrDone, OCR_NOISE, ocrAccuracy, startStatic, thaiPdf, readZip, docxParagraphs, jpegSize } = require('../lib/harness');

const t = suite('webview (Android page + bridge)');
// MainActivity ต่อท้าย user agent ด้วยเลขรุ่นของแอป (CHANGELOG.md) — หน้าเว็บแสดง "เวอร์ชัน v1.0.N (Android)"
const APP_VERSION = require('../../release/version').parse(fs.readFileSync(path.join(__dirname, '../../../CHANGELOG.md'), 'utf8')).version;
const APP_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.0.0 Mobile Safari/537.36 DocScannerPDF/' + APP_VERSION;
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

run(async () => {
  const browser = await launch();
  const ctx = await newAppContext(browser, { permissions: ['camera', 'clipboard-read', 'clipboard-write'], userAgent: APP_UA });
  const bridge = ctx.bridge;
  const { page, log } = await openApp(ctx);
  await waitReady(page);

  const info = await page.evaluate(() => ({
    origin: location.origin, secure: isSecureContext, id: AppPlatform.id, label: document.getElementById('appVersion').textContent,
    cv: CvEngine.info(), bridge: typeof window.DocScannerBridge, hooks: ['saveFile', 'shareFile', 'shareText', 'cameraHelp', 'onBack'].every(k => typeof AppPlatform[k] === 'function'),
    font: getComputedStyle(document.body).fontFamily
  }));
  t.check('runs at https://appassets.androidplatform.net (secure context) as the Android platform with the bridge',
    info.origin === 'https://appassets.androidplatform.net' && info.secure && info.id === 'android' && info.bridge === 'object' && info.hooks, JSON.stringify(info));
  t.check('version line shows the app\'s release version (from the WebView user agent) and "Android", no commit or opening time',
    info.label === `เวอร์ชัน v${APP_VERSION} (Android)` && !info.label.includes(SOURCE.commit.slice(0, 7)) && !/เปิดเมื่อ/.test(info.label), info.label);
  t.check('OpenCV runs in a Web Worker with the SIMD build from the app files', info.cv.mode === 'worker' && info.cv.build === 'simd', JSON.stringify(info.cv));
  t.check('Thai device: Thai UI, and the page tells Android its language (bridge op "lang")',
    (await page.evaluate(() => I18n.lang)) === 'th' && JSON.stringify(bridge.langs) === '["th"]', JSON.stringify(bridge.langs));

  // ---- import + PDF saved through the bridge ----
  await page.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg'].map(fixture));
  await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 2, null, { timeout: 60000 });
  await waitIdle(page);
  await page.click('#btnExport');
  await page.waitForSelector('#exportDialog[open]');
  await page.click('#exDownload');
  await page.waitForSelector('#exResult:not([hidden])', { timeout: 120000 });
  const res1 = await page.textContent('#exResult');
  const pdf = bridge.saved[0];
  t.check('"ดาวน์โหลด PDF" sends the PDF to Android in chunks and saves it (2 pages)',
    bridge.saved.length === 1 && pdf.mime === 'application/pdf' && /^scan-\d{8}-\d{4}\.pdf$/.test(pdf.name) && pdf.buf.slice(0, 5).toString() === '%PDF-' &&
    pdfPages(pdf.buf) === 2 && pdf.chunks > 1 && res1.includes('สำเร็จ') && !res1.includes('ยังไม่ได้'),
    `${pdf && pdf.name} ${pdf && (pdf.buf.length / 1024).toFixed(0)} KB in ${pdf && pdf.chunks} chunks — ${res1}`);
  if (pdf) fs.writeFileSync(path.join(OUT, 'android-export.pdf'), pdf.buf);

  bridge.saveMode = 'cancelled';
  await page.click('#exDownload');
  await page.waitForFunction(() => /ยังไม่ได้บันทึก/.test(document.getElementById('exResult').textContent), null, { timeout: 120000 });
  bridge.saveMode = 'error';
  await page.click('#exDownload');
  await page.waitForFunction(() => /บันทึกไฟล์ไม่สำเร็จ/.test(document.getElementById('exResult').textContent), null, { timeout: 120000 });
  const errResult = await page.textContent('#exResult');
  bridge.saveMode = 'saved';
  t.check('cancelled "save as" and a failed save are reported (not "saved")',
    errResult.includes('บันทึกไฟล์ไม่สำเร็จ: เขียนไฟล์ลงที่เก็บที่เลือกไม่ได้') && bridge.saved.length === 1, errResult);

  const shareShown = await page.isVisible('#exShare');
  await page.click('#exShare');
  await page.waitForFunction(() => true);
  await new Promise(r => setTimeout(r, 1500));
  const sh = bridge.shared[0];
  t.check('"แชร์" hands the PDF to Android\'s share sheet', shareShown && bridge.shared.length === 1 && sh.mime === 'application/pdf' && pdfPages(sh.buf) === 2,
    sh ? `${sh.name} ${(sh.buf.length / 1024).toFixed(0)} KB` : 'nothing shared');
  await page.click('#exCancel');

  // ---- OCR from the bundled Tesseract files; save/share text through the bridge ----
  await page.click('.page-item:nth-child(1) .page-card');
  await page.waitForSelector('#viewEditor:not([hidden])');
  const t0 = Date.now();
  await page.click('#edOcr');
  await waitOcrDone(page);
  const text = await page.inputValue('#ocrText');
  t.check('OCR (Thai + English) works offline from the app files', ocrAccuracy(text) >= 90, `${ocrAccuracy(text).toFixed(1)}% in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.click('#ocrSave');
  await page.waitForFunction(() => /บันทึก/.test(document.getElementById('ocrNote').textContent), null, { timeout: 30000 });
  const txt = bridge.saved[1];
  await page.click('#ocrShare');
  await page.waitForFunction(() => /./.test(document.getElementById('ocrNote').textContent), null, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));
  t.check('OCR text: save .txt (UTF-8 BOM) and share as text through Android',
    txt && txt.mime === 'text/plain' && /\.txt$/.test(txt.name) && txt.buf[0] === 0xEF && txt.buf.toString('utf8').includes(text.slice(0, 50)) &&
    bridge.texts.length === 1 && bridge.texts[0].text === text, txt ? txt.name : 'no .txt saved');
  await page.click('#ocrCopy');
  await page.waitForTimeout(300);
  t.check('copy OCR text works', (await page.textContent('#ocrNote')).includes('คัดลอก'), await page.textContent('#ocrNote'));

  // ---- Android back button (MainActivity calls AppPlatform.onBack) ----
  const back = () => page.evaluate(() => AppPlatform.onBack());
  const b1 = await back();
  const dialogClosed = await page.evaluate(() => !document.getElementById('ocrDialog').open);
  const b2 = await back();
  await page.waitForSelector('#viewEditor', { state: 'hidden' });
  const b3 = await back();
  t.check('back: closes the open dialog, then leaves the editor, then lets Android leave the app',
    b1 === true && dialogClosed && b2 === true && b3 === false && (await page.isVisible('#pagesSection')));

  // ---- in-app camera (getUserMedia works in the WebView once Android grants the permission) ----
  await page.click('#btnCamera');
  await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 20000 });
  await page.click('#camShutter');
  await page.waitForFunction(() => document.getElementById('camCount').textContent === '1', null, { timeout: 20000 });
  const b4 = await back(); // back from the camera view
  await page.waitForSelector('#viewCamera', { state: 'hidden' });
  const count = await page.$$eval('.page-item', e => e.length);
  t.check('in-app camera: takes a page; back closes the camera', count === 3 && b4 === true, `${count} pages`);
  await waitIdle(page);

  // ---- HEIC photo (iPhone / many Android cameras): the WebView cannot decode it → libheif in a Web Worker ----
  await page.setInputFiles('#fileInput', fixture('photo-tilted.heic'));
  await page.waitForFunction(n => document.querySelectorAll('.page-item').length === n + 1, count, { timeout: 60000 });
  await waitIdle(page);
  const heic = await page.evaluate(() => HeicDecoder.info());
  t.check('HEIC photo opens: decoded by libheif from the app files in a Web Worker',
    heic.mode === 'worker' && heic.decoded === 1 && ctx.served.includes('vendor/libheif/libheif-bundle.js') && ctx.served.includes('js/heic-worker.js'),
    JSON.stringify(heic));

  // ---- PDF → Word / JPG: PDF.js (legacy build) from the app files, results saved/shared through the bridge ----
  const stat = await startStatic();
  const thai = await thaiPdf(browser, stat);
  await stat.close();
  const thaiFile = path.join(OUT, 'android-thai.pdf');
  fs.writeFileSync(thaiFile, thai.buf);
  const pdfDone = () => page.waitForFunction(() => document.getElementById('pdfProgressWrap').hidden &&
    (!document.getElementById('pdfConvert').disabled || !document.getElementById('pdfResult').hidden), null, { timeout: 120000 });
  await page.setInputFiles('#pdfInput', thaiFile);
  await page.waitForSelector('#pdfDialog[open]');
  await pdfDone();
  await page.click('#pdfFormats .chip[data-format="docx"]');
  let before = bridge.saved.length;
  await page.click('#pdfConvert');
  await page.waitForFunction(() => !document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden, null, { timeout: 120000 });
  const word = bridge.saved[before];
  const paras = word ? docxParagraphs(word.buf) : [];
  t.check('PDF → Word: saved through Android as .docx; Thai text exactly the original (ActualText); PDF.js from the app files',
    word && word.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && word.name === 'android-thai.docx' &&
    paras.join('\n') === thai.lines.join('\n') && ctx.served.includes('vendor/pdfjs/pdf.min.mjs') && ctx.served.includes('vendor/pdfjs/pdf.worker.min.mjs') &&
    ctx.served.includes('js/pdf-worker.js') && (await page.evaluate(() => PdfTools.info().mode)) === 'worker' &&
    /ตรงตามต้นฉบับ/.test(await page.textContent('#pdfResult')), JSON.stringify(paras) + ' ' + await page.textContent('#pdfResult'));
  await page.click('#pdfFormats .chip[data-format="jpg"]');
  await page.selectOption('#pdfQuality', 'small');
  before = bridge.saved.length;
  await page.click('#pdfConvert');
  await page.waitForFunction(() => !document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden, null, { timeout: 120000 });
  const jpg = bridge.saved[before];
  const dim = jpg && jpegSize(jpg.buf);
  const shareJpg = await page.isVisible('#pdfShare');
  const sharedBefore = bridge.shared.length;
  if (shareJpg) { await page.click('#pdfShare'); await new Promise(r => setTimeout(r, 1500)); }
  t.check('PDF → JPG (Small, 96 dpi): saved as image/jpeg; "แชร์" hands the JPG to Android',
    jpg && jpg.mime === 'image/jpeg' && jpg.name === 'android-thai.jpg' && dim && dim.w === 794 && shareJpg &&
    bridge.shared.length === sharedBefore + 1 && bridge.shared[sharedBefore].mime === 'image/jpeg', JSON.stringify(dim));
  // several pages → .zip (the 2-page PDF exported above)
  await page.setInputFiles('#pdfInput', path.join(OUT, 'android-export.pdf'));
  await pdfDone();
  before = bridge.saved.length;
  await page.click('#pdfConvert');
  await page.waitForFunction(() => !document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden, null, { timeout: 120000 });
  const zip = bridge.saved[before];
  const entries = zip ? Object.keys(readZip(zip.buf)) : [];
  t.check('PDF with 2 pages → JPG: saved as application/zip with 2 JPEGs',
    zip && zip.mime === 'application/zip' && zip.name === 'android-export-jpg.zip' && entries.join() === 'android-export-1.jpg,android-export-2.jpg',
    zip ? zip.name + ' ' + entries.join() : 'nothing saved');
  await page.click('#pdfCancel');

  // ---- nothing outside the app, no errors ----
  const csp = await page.evaluate(() => window.__csp);
  t.check('no request leaves the app (no internet), no CSP violations', !ctx.blocked.length && !csp.length, ctx.blocked.concat(csp).join(' '));
  const served = new Set(ctx.served);
  t.check('every served file comes from assets/www', [...served].every(p => fs.existsSync(path.join(WWW_DIR, p))), [...served].length + ' files');
  // the simulated failed save above is logged by the app on purpose
  const noise = log.filter(l => !OCR_NOISE.test(l) && !/เขียนไฟล์ลงที่เก็บที่เลือกไม่ได้/.test(l));
  t.check('no console errors; bridge messages all valid', !noise.length && !bridge.errors.length, noise.concat(bridge.errors).join('\n'));
  await ctx.close();

  // ---- English device: English UI from the first paint, Android messages in English, language button → Android ----
  {
    const ce = await newAppContext(browser, { permissions: [], locale: 'en-US', userAgent: APP_UA });
    await ce.addInitScript(() => {
      navigator.permissions.query = () => Promise.resolve({ state: 'prompt', addEventListener() {} });
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      // what the page shows when it becomes visible (android/platform.js hides it until the texts are translated)
      window.__reveal = null;
      window.__hidden = false;
      new MutationObserver(() => {
        const root = document.documentElement;
        if (!root || window.__reveal !== null) return;
        if (root.style.visibility === 'hidden') window.__hidden = true;
        else if (window.__hidden && document.getElementById('btnPick')) window.__reveal = document.getElementById('btnPick').textContent.trim();
      }).observe(document, { attributes: true, attributeFilter: ['style'], subtree: true });
    });
    const eb = ce.bridge;
    const { page: pe, log: le } = await openApp(ce, 'english');
    await waitReady(pe);
    const en = await pe.evaluate(() => ({
      lang: document.documentElement.lang, reveal: window.__reveal, label: document.getElementById('appVersion').textContent,
      button: document.getElementById('btnLang').textContent.trim(),
      android: I18n.msg(new Error('ข้อมูลไฟล์เสีย')), bridgeless: I18n.msg(new Error('ทำรายการไม่สำเร็จ'))
    }));
    t.check('English device: English UI, shown only once translated (no Thai flash); version "Version v1.0.N (Android)"',
      en.lang === 'en' && en.reveal === 'Choose images' && en.label === `Version v${APP_VERSION} (Android)` && en.button === 'ไทย', JSON.stringify(en));
    t.check('English device: messages from Android (BridgeProtocol/TransferStore) and platform.js are translated',
      en.android === 'The file data is damaged' && en.bridgeless === 'The action failed', JSON.stringify(en));
    await pe.click('#btnCamera');
    await pe.waitForSelector('#camBlocked:not([hidden])', { timeout: 15000 });
    const enHelp = await pe.textContent('#camBlockedHelp');
    t.check('English device: camera help explains the Android settings in English',
      /^To allow the camera: open your device "Settings" → Apps → Doc Scanner PDF/.test(enHelp), enHelp);
    await pe.click('#camClose');
    await pe.waitForSelector('#viewCamera', { state: 'hidden' });
    await pe.click('#btnLang');
    await pe.waitForFunction(() => document.documentElement.lang === 'th');
    await new Promise(r => setTimeout(r, 300));
    t.check('language button: the page switches to Thai and tells Android (op "lang")',
      JSON.stringify(eb.langs) === '["en","th"]' && !eb.errors.length, JSON.stringify(eb.langs) + eb.errors.join(' '));
    t.check('English device: no console errors', !le.length, le.join('\n'));
    await ce.close();
  }

  // ---- camera permission denied in Android settings → Android-specific help ----
  {
    const c2 = await newAppContext(browser, { permissions: [] });
    await c2.addInitScript(() => {
      // Android WebView: no persistent permission state for the page; Android refused the camera
      navigator.permissions.query = () => Promise.resolve({ state: 'prompt', addEventListener() {} });
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    const { page: p2, log: l2 } = await openApp(c2, 'denied');
    await waitReady(p2);
    await p2.click('#btnCamera');
    await p2.waitForSelector('#camBlocked:not([hidden])', { timeout: 15000 });
    const help = await p2.textContent('#camBlockedHelp');
    const plain = await p2.textContent('#appVersion');
    t.check('without the app\'s version in the user agent the version line falls back to the commit',
      plain.includes(SOURCE.commit.slice(0, 7)) && plain.includes('(Android)'), plain);
    t.check('camera denied: the panel explains how to allow the camera in Android settings',
      /การตั้งค่า/.test(help) && /แอป/.test(help) && !/ช่องที่อยู่เว็บ/.test(help), help);
    await p2.screenshot({ path: path.join(OUT, 'android-camera-denied.png') });
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser', { timeout: 10000 }), p2.click('#camUseNative')]);
    t.check('"ใช้กล้องของเครื่อง" opens the device camera (capture chooser)', (await chooser.element().getAttribute('capture')) === 'environment');
    t.check('no errors when the camera is denied', !l2.length, l2.join('\n'));
    await c2.close();
  }

  await browser.close();
  t.finish();
});
