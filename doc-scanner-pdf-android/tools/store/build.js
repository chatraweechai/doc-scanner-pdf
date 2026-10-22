'use strict';
/*
 * Google Play store images for the Android app, made from the real app: the converted page in
 * doc-scanner-pdf-android/app/src/main/assets/www, run like the app's WebView (tools/tests/lib/harness.js — same origin,
 * bridge, no internet) with Noto Sans Thai, the font Android uses. Every screen is a real screen of this version.
 *
 *   node tools/store/build.js [--only th|en-US] [--skip-capture]
 *
 * Output (tools/store/out/, not committed — CI keeps it as an artifact), per Play listing language (th, en-US):
 *   <lang>/icon.png                         512 × 512, from the launcher icon (res/drawable/ic_launcher_foreground.xml)
 *   <lang>/featureGraphic.png               1024 × 500
 *   <lang>/phoneScreenshots/NN.png          1080 × 1920 (9:16), 8 screens with a caption
 *   <lang>/sevenInchScreenshots/NN.png      1215 × 2160 (9:16), 4 screens
 *   <lang>/tenInchScreenshots/NN.png        2560 × 1440 (16:9), 4 screens
 *   <lang>/{title,short_description,full_description,release_notes}.txt   copied from tools/store/listing/<lang>
 *   raw/<lang>/<device>/<scene>.png          the app screens before framing (used by the promo video too)
 * The promo video is made by tools/store/video.js from the same app.
 */
const fs = require('fs');
const path = require('path');
const { H, OUT, STORE, storeContext: appContext, cameraFile, esc, dataUrl, BASE_CSS, iconSvg, render, pngSize } = require('./common');
const { chromium } = require(path.join(__dirname, '../tests/node_modules/playwright'));

const LANGS = { th: 'th-TH', 'en-US': 'en-US' }; // Play listing language → device language
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, scale: 3, dir: 'phoneScreenshots', size: [1080, 1920] },
  tablet7: { viewport: { width: 600, height: 960 }, scale: 2, dir: 'sevenInchScreenshots', size: [1215, 2160] },
  tablet10: { viewport: { width: 1280, height: 800 }, scale: 2, dir: 'tenInchScreenshots', size: [2560, 1440] }
};

// captions: [headline, line under it] — short, true to what the screen shows
const SCENES = [
  { id: 'home', devices: ['phone', 'tablet7', 'tablet10'],
    th: ['สแกนเอกสารเป็น PDF', 'ครอป ลบเงา ปรับให้คมชัดอัตโนมัติ'],
    en: ['Scan documents to PDF', 'Cropped, shadow-free and sharp — automatically'] },
  { id: 'camera', devices: ['phone'],
    th: ['กล้องหาขอบกระดาษให้', 'ถ่ายหลายหน้าต่อเนื่องได้เลย'],
    en: ['The camera finds the paper', 'Take many pages in a row'] },
  { id: 'editor', devices: ['phone', 'tablet7', 'tablet10'],
    th: ['ตัวอักษรคม ไม่มีเงา', 'สีสด ขาวดำ โทนเทา ปรับแสงได้'],
    en: ['Sharp text, no shadows', 'Color, black & white, grayscale, brightness'] },
  { id: 'crop', devices: ['phone'],
    th: ['ครอปอัตโนมัติหรือครอปเอง', 'ภาพที่ถ่ายเอียงกลับมาตรง'],
    en: ['Auto crop or crop freely', 'Tilted photos come out straight'] },
  { id: 'export', devices: ['phone'],
    th: ['PDF ค้นหาข้อความได้', 'A4 · Letter · Legal · A5 · ตามขนาดภาพ'],
    en: ['Searchable PDF files', 'A4 · Letter · Legal · A5 · image size'] },
  { id: 'ocr', devices: ['phone', 'tablet7', 'tablet10'],
    th: ['อ่านข้อความไทย + อังกฤษ', 'แก้ไข คัดลอก บันทึก หรือแชร์'],
    en: ['Thai + English text recognition', 'Edit, copy, save or share the text'] },
  { id: 'pdf', devices: ['phone', 'tablet7', 'tablet10'],
    th: ['แปลง PDF เป็น Word หรือ JPG', 'ภาษาไทยตรงตามต้นฉบับในไฟล์'],
    en: ['PDF to Word or JPG', 'Thai text exactly as in the file'] },
  { id: 'offline', devices: ['phone'],
    th: ['ทำงานในเครื่อง ไม่อัปโหลด', 'ไม่ต้องใช้อินเทอร์เน็ต ไม่มีโฆษณา'],
    en: ['Private: works offline', 'Nothing is uploaded · no ads'] }
];

const TAGLINE = {
  th: ['สแกนเอกสาร PDF', 'สแกน ครอป ลบเงา อ่านข้อความไทย-อังกฤษ', 'ทำงานในเครื่อง ไม่อัปโหลด'],
  en: ['Doc Scanner PDF', 'Scan, crop, clean up and read Thai & English text', 'Works offline · nothing is uploaded']
};

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const skipCapture = args.includes('--skip-capture');
const langs = Object.keys(LANGS).filter(l => !only || l === only);
if (only && !langs.length) { console.error('--only: th or en-US'); process.exit(2); }

const settle = async page => { await page.mouse.move(1, 1); await settleDom(page); }; // no hover highlight
const settleDom = page => page.evaluate(async () => {
  await document.fonts.ready;
  document.getElementById('toasts').textContent = '';
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // no focus ring
  await new Promise(r => setTimeout(r, 400));
});

async function addPhotos(page, names) {
  await page.setInputFiles('#fileInput', names.map(H.fixture));
  await page.waitForFunction(n => document.querySelectorAll('.page-item').length === n, names.length, { timeout: 90000 });
  await H.waitIdle(page);
}

async function toHome(page) {
  for (let i = 0; i < 4 && !(await page.isVisible('#viewHome')); i++) {
    await page.evaluate(() => AppPlatform.onBack());
    await page.waitForTimeout(300);
  }
}

/** Captures the scenes of one device in one language → out/raw/<lang>/<device>/<scene>.png */
async function captureDevice(browser, lang, device, thaiPdfFile) {
  const dir = path.join(OUT, 'raw', lang, device);
  fs.mkdirSync(dir, { recursive: true });
  const d = DEVICES[device];
  const ctx = await appContext(browser, { viewport: d.viewport, deviceScaleFactor: d.scale, locale: LANGS[lang],
    isMobile: device !== 'tablet10', reducedMotion: 'reduce' });
  const { page, log } = await H.openApp(ctx, lang + '-' + device);
  page.on('dialog', d => d.accept());
  await H.waitReady(page);
  const want = SCENES.filter(s => s.devices.includes(device)).map(s => s.id);
  const shot = async id => { if (want.includes(id)) { await settle(page); await page.screenshot({ path: path.join(dir, id + '.png') }); } };

  // the empty home screen: works offline, nothing uploaded
  await shot('offline');

  // camera with a document in front of it
  if (want.includes('camera')) {
    await page.click('#btnCamera');
    await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 30000 });
    await page.waitForFunction(() => /พบเอกสาร|Document found/.test(document.getElementById('camMsg').textContent), null, { timeout: 30000 });
    await page.click('#camShutter');
    await page.waitForFunction(() => document.getElementById('camCount').textContent === '1', null, { timeout: 30000 });
    await page.waitForFunction(() => /พบเอกสาร|Document found/.test(document.getElementById('camMsg').textContent), null, { timeout: 30000 });
    await shot('camera');
    await page.click('#camDone');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });
    await H.waitIdle(page);
    await page.click('.page-item:last-child [data-action="delete"]');
  }

  await addPhotos(page, ['photo-shadow.jpg', 'photo-tilted.jpg', 'photo-lightbg.jpg']);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('home');

  // editor: the photo with a hand shadow, cleaned up in the default "vivid color" style (colours of the logo kept)
  await page.click('.page-item:nth-child(1) .page-card');
  await page.waitForSelector('#viewEditor:not([hidden])');
  await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 60000 });
  await shot('editor');

  if (want.includes('crop')) {
    await page.click('#edNext'); // the tilted photo
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 60000 });
    await page.click('#edCrop');
    await page.waitForSelector('#viewCrop:not([hidden])');
    await page.waitForFunction(() => { const p = document.querySelector('.crop-svg .quad'); return p && p.getAttribute('points'); });
    await shot('crop');
    await page.click('#cropCancel');
    await page.waitForSelector('#viewEditor:not([hidden])');
  }

  // OCR of the first page
  if (want.includes('ocr')) {
    await page.evaluate(() => { document.getElementById('edPrev').click(); });
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 60000 });
    await page.click('#edOcr');
    await H.waitOcrDone(page);
    await page.evaluate(() => { const t = document.getElementById('ocrText'); t.scrollTop = 0; t.blur(); });
    await shot('ocr');
    await page.click('#ocrClose');
  }
  await toHome(page);

  if (want.includes('export')) {
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    await page.check('#exOcr');
    await shot('export');
    await page.click('#exCancel');
  }

  // PDF → Word with the Thai PDF
  if (want.includes('pdf')) {
    await page.setInputFiles('#pdfInput', thaiPdfFile);
    await page.waitForSelector('#pdfDialog[open]');
    await page.waitForFunction(() => !document.getElementById('pdfConvert').disabled, null, { timeout: 120000 });
    await page.click('#pdfFormats [data-format="docx"]');
    await page.click('#pdfConvert');
    await page.waitForFunction(() => !document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden, null, { timeout: 180000 });
    await page.evaluate(() => { const d = document.getElementById('pdfDialog'); d.scrollTop = d.scrollHeight; }); // the result in view
    await shot('pdf');
    await page.click('#pdfCancel');
  }

  const errors = log.filter(l => !H.OCR_NOISE.test(l));
  await ctx.close();
  if (errors.length) throw new Error(`${lang}/${device}: console errors\n` + errors.join('\n'));
  for (const id of want) if (!fs.existsSync(path.join(dir, id + '.png'))) throw new Error(`${lang}/${device}: no ${id}.png`);
  console.log(`captured ${lang}/${device}: ${want.join(', ')}`);
}

// ---------------------------------------------------------------- framing

// headline on one line when it fits at a readable size (no single word left alone on a second line)
const FIT = `<script>(()=>{const h=document.querySelector('.cap h1');if(!h)return;const box=h.parentElement.clientWidth;
  h.style.whiteSpace='nowrap';let px=parseFloat(getComputedStyle(h).fontSize);const min=px*0.78;
  while(h.scrollWidth>box&&px>min){px-=2;h.style.fontSize=px+'px';}
  if(h.scrollWidth>box){h.style.whiteSpace='';h.style.fontSize='';}})();</script>`;

/** Framed screenshot: caption + the app screen in a device */
function frameHtml(device, img, caption, lang) {
  const [W, Hh] = DEVICES[device].size;
  const { width: vw, height: vh } = DEVICES[device].viewport;
  const th = lang === 'th';
  if (device === 'tablet10') {
    // landscape: caption on the left, tablet on the right
    const sh = 940, sw = Math.round(sh * vw / vh), bez = 24;
    const left = W - sw - bez * 2 - 110, top = Math.round((Hh - sh - bez * 2) / 2);
    return `<!doctype html><html lang="${th ? 'th' : 'en'}"><head><meta charset="utf-8"><style>${BASE_CSS}
      .cap{position:absolute;left:120px;top:0;bottom:0;width:${left - 200}px;display:flex;flex-direction:column;justify-content:center;gap:28px}
      h1{font-size:${th ? 84 : 80}px} p{font-size:44px}
      .device{left:${left}px;top:${top}px;width:${sw + bez * 2}px;height:${sh + bez * 2}px;border-radius:52px}
      .device img{left:${bez}px;top:${bez}px;width:${sw}px;height:${sh}px;border-radius:26px}
      </style></head><body><div class="dots"></div>
      <div class="cap"><h1>${esc(caption[0])}</h1><p>${esc(caption[1])}</p></div>
      <div class="device"><img src="${img}"></div></body></html>`;
  }
  // portrait: caption on top, device below (bottom edge runs off the image a little, like many store images)
  const phone = device === 'phone';
  const capH = phone ? 420 : 470;
  const sw = phone ? 760 : 960, sh = Math.round(sw * vh / vw), bez = phone ? 20 : 26;
  const left = Math.round((W - sw - bez * 2) / 2);
  return `<!doctype html><html lang="${th ? 'th' : 'en'}"><head><meta charset="utf-8"><style>${BASE_CSS}
    .cap{position:absolute;left:70px;right:70px;top:0;height:${capH}px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:18px}
    h1{font-size:${phone ? (th ? 78 : 74) : (th ? 92 : 88)}px} p{font-size:${phone ? 40 : 48}px}
    .device{left:${left}px;top:${capH}px;width:${sw + bez * 2}px;height:${sh + bez * 2}px;border-radius:${phone ? 76 : 60}px}
    .device img{left:${bez}px;top:${bez}px;width:${sw}px;height:${sh}px;border-radius:${phone ? 58 : 36}px}
    </style></head><body><div class="dots"></div>
    <div class="cap"><h1>${esc(caption[0])}</h1><p>${esc(caption[1])}</p></div>
    <div class="device"><img src="${img}"></div>${FIT}</body></html>`;
}

function featureHtml(lang, phoneImg) {
  const [name, line, note] = TAGLINE[lang === 'th' ? 'th' : 'en'];
  const icon = 'data:image/svg+xml;base64,' + Buffer.from(iconSvg(512)).toString('base64');
  return `<!doctype html><html lang="${lang === 'th' ? 'th' : 'en'}"><head><meta charset="utf-8"><style>${BASE_CSS}
    .cap{position:absolute;left:64px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:14px}
    .icon{width:112px;height:112px;border-radius:28px;box-shadow:0 10px 30px rgba(3,10,40,.35)}
    h1{font-size:60px;margin-top:10px} p{font-size:27px} .note{font-size:21px;opacity:.75;font-weight:500}
    .device{left:700px;top:46px;width:300px;height:620px;border-radius:40px;transform:rotate(-8deg)}
    .device img{left:12px;top:12px;width:276px;height:596px;border-radius:30px}
    </style></head><body><div class="dots"></div>
    <div class="cap"><img class="icon" src="${icon}"><h1>${esc(name)}</h1><p>${esc(line)}</p><div class="note">${esc(note)}</div></div>
    <div class="device"><img src="${phoneImg}"></div></body></html>`;
}

run();

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const stat = await H.startStatic();
  const plain = await H.launch({ camera: false });
  const thai = await H.thaiPdf(plain, stat);
  const thaiPdfFile = path.join(OUT, 'thai-document.pdf');
  fs.writeFileSync(thaiPdfFile, thai.buf);
  const camFile = await cameraFile(plain);
  await stat.close();

  if (!skipCapture) {
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--use-file-for-fake-video-capture=' + camFile] });
    for (const lang of langs) for (const device of Object.keys(DEVICES)) await captureDevice(browser, lang, device, thaiPdfFile);
    await browser.close();
  }

  const problems = [];
  for (const lang of langs) {
    const dir = path.join(OUT, lang);
    fs.rmSync(dir, { recursive: true, force: true });
    const key = lang === 'th' ? 'th' : 'en';
    for (const device of Object.keys(DEVICES)) {
      const scenes = SCENES.filter(s => s.devices.includes(device));
      for (let i = 0; i < scenes.length; i++) {
        const raw = path.join(OUT, 'raw', lang, device, scenes[i].id + '.png');
        const file = path.join(dir, DEVICES[device].dir, String(i + 1).padStart(2, '0') + '.png');
        await render(plain, frameHtml(device, dataUrl(raw), scenes[i][key], key), ...DEVICES[device].size, file);
        const [w, h] = pngSize(file);
        if (w !== DEVICES[device].size[0] || h !== DEVICES[device].size[1]) problems.push(`${file}: ${w}×${h}`);
      }
    }
    await render(plain, featureHtml(lang, dataUrl(path.join(OUT, 'raw', lang, 'phone', 'home.png'))), 1024, 500, path.join(dir, 'featureGraphic.png'));
    await render(plain, `<!doctype html><style>*{margin:0}svg{display:block}</style>${iconSvg(512)}`, 512, 512, path.join(dir, 'icon.png'), false);
    for (const f of ['title', 'short_description', 'full_description', 'release_notes']) {
      fs.copyFileSync(path.join(STORE, 'listing', lang, f + '.txt'), path.join(dir, f + '.txt'));
    }
    console.log('framed ' + lang);
  }
  await plain.close();
  if (problems.length) { console.error('wrong sizes:\n' + problems.join('\n')); process.exit(1); }
  console.log('store images in ' + path.relative(process.cwd(), OUT));
}
