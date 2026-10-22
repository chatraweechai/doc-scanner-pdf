'use strict';
/*
 * Promo video for Google Play (a YouTube link in the listing) — 1920 × 1080, 30 fps, H.264 MP4, one per language.
 * The real app is recorded while it is used (Chromium screencast of the page run like the Android WebView, see
 * common.js), taps are shown as ripples, captions and a title/end card are added around the phone.
 *
 *   node tools/store/video.js [--only th|en-US]         needs ffmpeg with libx264 (FFMPEG=/path/to/ffmpeg, default "ffmpeg")
 *
 * Output: tools/store/out/<lang>/promo.mp4 and promo-thumbnail.jpg (1280 × 720, for YouTube)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { H, OUT, storeContext, cameraFile, esc, BASE_CSS, iconSvg } = require('./common');
const { chromium } = require(path.join(__dirname, '../tests/node_modules/playwright'));

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;
const W = 1920, HH = 1080;
const PHONE = { width: 390, height: 844, scale: 2 };
const LANGS = { th: 'th-TH', 'en-US': 'en-US' };

const TEXT = {
  th: {
    intro: ['สแกนเอกสาร PDF', 'สแกนเอกสารเป็น PDF ในเครื่องของคุณ'],
    outro: ['สแกนเอกสาร PDF', 'ใช้ฟรี · ไม่มีโฆษณา · ทำงานในเครื่อง', 'ภาษาไทย และ English'],
    camera: ['ถ่ายด้วยกล้องในแอป', 'กรอบสีเขียวบอกว่าเจอเอกสารแล้ว'],
    import: ['หรือเลือกรูปจากเครื่อง', 'ครอป ลบเงา ปรับให้คมชัดอัตโนมัติ'],
    editor: ['เลือกรูปแบบภาพ', 'สีสด · ขาวดำตัวอักษรคม · โทนเทา'],
    crop: ['ครอปเองได้อิสระ', 'ลากมุม หรือให้แอปหาขอบกระดาษ'],
    export: ['สร้างไฟล์ PDF', 'บันทึกหรือแชร์ได้ทันที'],
    ocr: ['อ่านข้อความจากภาพ (OCR)', 'ภาษาไทย + อังกฤษ แก้ไขและคัดลอกได้'],
    pdf: ['แปลง PDF เป็น Word', 'ภาษาไทยตรงตามต้นฉบับในไฟล์'],
    lang: ['ไทย / English', 'เปลี่ยนภาษาได้ด้วยปุ่มเดียว']
  },
  en: {
    intro: ['Doc Scanner PDF', 'Scan documents to PDF on your phone'],
    outro: ['Doc Scanner PDF', 'Free · No ads · Works offline', 'English and Thai'],
    camera: ['Scan with the camera', 'The green frame means the page is found'],
    import: ['Or choose photos', 'Cropped, shadow-free and sharp — automatically'],
    editor: ['Pick a style', 'Vivid color · Sharp black & white · Grayscale'],
    crop: ['Crop freely', 'Drag a corner, or let the app find the paper'],
    export: ['Create the PDF', 'Save it or share it right away'],
    ocr: ['Text recognition (OCR)', 'Thai + English — edit and copy the text'],
    pdf: ['PDF to Word', 'Thai text exactly as in the file'],
    lang: ['English / ไทย', 'Switch the language with one tap']
  }
};

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const langs = Object.keys(LANGS).filter(l => !only || l === only);
if (only && !langs.length) { console.error('--only: th or en-US'); process.exit(2); }

// ---------------------------------------------------------------- recording

async function record(browser, lang, thaiPdfFile) {
  const dir = path.join(OUT, 'video', lang, 'screen');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await storeContext(browser, { viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: PHONE.scale,
    locale: LANGS[lang], isMobile: true });
  const { page, log } = await H.openApp(ctx, 'video-' + lang);
  page.on('dialog', d => d.accept());
  await H.waitReady(page);
  await page.evaluate(() => document.fonts.ready);

  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ t: metadata.timestamp * 1000, file });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: PHONE.width * PHONE.scale, maxHeight: PHONE.height * PHONE.scale });

  const scenes = [];
  const taps = [];
  const pause = ms => page.waitForTimeout(ms);
  async function tap(sel, opts = {}) {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    taps.push({ t: Date.now(), x: box.x + box.width / 2, y: box.y + box.height / 2 });
    if (opts.chooser) {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), el.click()]);
      await chooser.setFiles(opts.chooser);
    } else {
      await el.click();
    }
  }
  async function scene(id, max, fn) {
    await page.evaluate(() => { document.getElementById('toasts').textContent = ''; });
    const s = { id, start: Date.now(), max };
    await fn();
    s.end = Date.now();
    scenes.push(s);
  }

  await pause(800);
  await scene('camera', 7, async () => {
    await pause(500);
    await tap('#btnCamera');
    await page.waitForFunction(() => /พบเอกสาร|Document found/.test(document.getElementById('camMsg').textContent), null, { timeout: 30000 });
    await pause(1300);
    await tap('#camShutter');
    await page.waitForFunction(() => document.getElementById('camCount').textContent === '1', null, { timeout: 30000 });
    await pause(1000);
    await tap('#camDone');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });
    await H.waitIdle(page);
    await pause(900);
  });
  await scene('import', 7, async () => {
    await pause(400);
    await tap('#btnPick', { chooser: ['photo-tilted.jpg', 'photo-lightbg.jpg'].map(H.fixture) });
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 3, null, { timeout: 60000 });
    await H.waitIdle(page);
    await page.evaluate(() => window.scrollTo({ top: document.getElementById('pagesSection').offsetTop - 70, behavior: 'smooth' }));
    await pause(1800);
  });
  await scene('editor', 8, async () => {
    await tap('.page-item:nth-child(2) .page-card');
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 60000 });
    await pause(900);
    for (const f of ['bw', 'gray', 'enhance']) {
      await tap(`#edFilters [data-filter="${f}"]`);
      await pause(250);
      await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 60000 });
      await pause(900);
    }
  });
  await scene('crop', 7, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await tap('#edCrop');
    await page.waitForFunction(() => { const p = document.querySelector('.crop-svg .quad'); return p && p.getAttribute('points'); });
    await pause(900);
    // drag the top-left corner in and back out, like a finger
    const hit = await page.locator('.crop-svg .hit[data-idx="0"]').boundingBox();
    const x0 = hit.x + hit.width / 2, y0 = hit.y + hit.height / 2;
    taps.push({ t: Date.now(), x: x0, y: y0 });
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + i * 3, y0 + i * 4); await pause(30); }
    await pause(400);
    for (let i = 11; i >= 0; i--) { await page.mouse.move(x0 + i * 3, y0 + i * 4); await pause(30); }
    await page.mouse.up();
    await pause(600);
    await tap('#cropOk');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 60000 });
    await pause(800);
  });
  await scene('ocr', 8, async () => {
    await tap('#edOcr');
    await H.waitOcrDone(page);
    await page.evaluate(() => { document.getElementById('ocrText').blur(); });
    await pause(1600);
    await tap('#ocrClose');
    await pause(300);
  });
  await scene('export', 7, async () => {
    await tap('#edBack');
    await page.waitForSelector('#viewHome:not([hidden])');
    await pause(500);
    await tap('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    await pause(1000);
    await tap('#exDownload');
    await page.waitForSelector('#exResult:not([hidden])', { timeout: 120000 });
    await pause(1600);
    await tap('#exCancel');
    await pause(300);
  });
  await scene('pdf', 8, async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await pause(400);
    await tap('#btnPdfTools', { chooser: thaiPdfFile });
    await page.waitForSelector('#pdfDialog[open]');
    await page.waitForFunction(() => !document.getElementById('pdfConvert').disabled, null, { timeout: 120000 });
    await pause(600);
    await tap('#pdfFormats [data-format="docx"]');
    await pause(600);
    await tap('#pdfConvert');
    await page.waitForFunction(() => !document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden, null, { timeout: 180000 });
    await page.evaluate(() => { const d = document.getElementById('pdfDialog'); d.scrollTo({ top: d.scrollHeight, behavior: 'smooth' }); });
    await pause(2000);
    await tap('#pdfCancel');
    await pause(300);
  });
  await scene('lang', 4, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(300);
    await tap('#btnLang');
    await pause(1300);
    await tap('#btnLang');
    await pause(1000);
  });

  await cdp.send('Page.stopScreencast');
  const errors = log.filter(l => !H.OCR_NOISE.test(l));
  await ctx.close();
  if (errors.length) throw new Error(lang + ': console errors while recording\n' + errors.join('\n'));
  if (frames.length < 50) throw new Error(lang + ': too few screen frames (' + frames.length + ')');
  return { frames, scenes, taps };
}

// ---------------------------------------------------------------- composing

function studioHtml(lang) {
  const icon = 'data:image/svg+xml;base64,' + Buffer.from(iconSvg(512)).toString('base64');
  const sh = 900, sw = Math.round(sh * PHONE.width / PHONE.height), bez = 16;
  return `<!doctype html><html lang="${lang === 'th' ? 'th' : 'en'}"><head><meta charset="utf-8"><style>${BASE_CSS}
    .cap{position:absolute;left:150px;top:0;bottom:0;width:860px;display:flex;flex-direction:column;justify-content:center;gap:26px}
    .cap h1{font-size:92px} .cap p{font-size:44px}
    .device{left:${1920 - 250 - sw - bez * 2}px;top:${(1080 - sh - bez * 2) / 2}px;width:${sw + bez * 2}px;height:${sh + bez * 2}px;border-radius:64px;overflow:hidden}
    .device img{left:${bez}px;top:${bez}px;width:${sw}px;height:${sh}px;border-radius:48px}
    .ripple{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(255,255,255,.55);
      border:3px solid rgba(31,94,255,.8);pointer-events:none;opacity:0}
    .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center}
    .card img{width:220px;height:220px;border-radius:52px;box-shadow:0 24px 60px rgba(3,10,40,.45)}
    .card h1{font-size:112px;margin-top:18px} .card p{font-size:50px} .card .small{font-size:40px;opacity:.8}
    </style></head><body><div class="dots"></div>
    <div id="scene"><div class="cap"><h1 id="h"></h1><p id="s"></p></div>
      <div class="device" id="dev"><img id="screen"><div class="ripple" id="rip"></div></div></div>
    <div class="card" id="card" hidden><img src="${icon}"><h1 id="ch"></h1><p id="cs"></p><p class="small" id="cx"></p></div>
    <script>
      const SCALE = ${sh / PHONE.height}, BEZ = ${bez};
      const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
      window.draw = async st => {
        const card = document.getElementById('card'), sc = document.getElementById('scene');
        card.hidden = st.kind === 'scene'; sc.hidden = st.kind !== 'scene';
        if (st.kind !== 'scene') {
          const k = ease(st.u / 0.6), out = st.kind === 'outro' ? 1 : 1 - ease((st.u - (st.dur - 0.4)) / 0.4);
          card.style.opacity = Math.min(k, out);
          card.style.transform = 'scale(' + (0.92 + 0.08 * k) + ')';
          document.getElementById('ch').textContent = st.text[0];
          document.getElementById('cs').textContent = st.text[1];
          document.getElementById('cx').textContent = st.text[2] || '';
          return;
        }
        const cap = document.querySelector('.cap');
        const kin = ease(st.u / 0.5), kout = 1 - ease((st.u - (st.dur - 0.35)) / 0.35);
        cap.style.opacity = Math.min(kin, kout);
        cap.style.transform = 'translateY(' + (1 - kin) * 30 + 'px)';
        document.getElementById('h').textContent = st.text[0];
        document.getElementById('s').textContent = st.text[1];
        const dev = document.getElementById('dev');
        const din = st.first ? ease(st.u / 0.6) : 1;
        dev.style.transform = 'translateY(' + (1 - din) * 80 + 'px)';
        dev.style.opacity = din;
        const img = document.getElementById('screen');
        if (st.src && img.dataset.src !== st.src) { img.dataset.src = st.src; img.src = st.src; await img.decode().catch(() => {}); }
        const r = document.getElementById('rip');
        if (st.ripple) {
          r.style.left = (BEZ + st.ripple.x * SCALE) + 'px'; r.style.top = (BEZ + st.ripple.y * SCALE) + 'px';
          r.style.opacity = String(0.9 * (1 - st.ripple.p));
          r.style.transform = 'scale(' + (0.6 + st.ripple.p * 0.9) + ')';
        } else r.style.opacity = '0';
      };
    </script></body></html>`;
}

async function compose(browser, lang, rec) {
  const key = lang === 'th' ? 'th' : 'en';
  const T = TEXT[key];
  const dir = path.join(OUT, 'video', lang, 'frames');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // timeline: title card, the recorded scenes (long ones sped up to their maximum), end card
  const parts = [{ kind: 'intro', dur: 2.6, text: T.intro }];
  rec.scenes.forEach((s, i) => {
    const real = (s.end - s.start) / 1000;
    const dur = Math.min(real, s.max);
    parts.push({ kind: 'scene', dur, speed: real / dur, start: s.start, text: T[s.id], first: i === 0 });
  });
  parts.push({ kind: 'outro', dur: 3.2, text: T.outro });

  const page = await browser.newPage({ viewport: { width: W, height: HH }, deviceScaleFactor: 1 });
  await page.setContent(studioHtml(lang), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const frameAt = t => {
    let best = rec.frames[0];
    for (const f of rec.frames) { if (f.t <= t) best = f; else break; }
    return best;
  };
  const srcCache = new Map();
  const srcOf = f => {
    if (!srcCache.has(f.file)) srcCache.set(f.file, 'data:image/jpeg;base64,' + fs.readFileSync(f.file).toString('base64'));
    return srcCache.get(f.file);
  };
  let n = 0;
  for (const part of parts) {
    const count = Math.round(part.dur * FPS);
    for (let k = 0; k < count; k++) {
      const u = k / FPS;
      const st = { kind: part.kind, u, dur: part.dur, text: part.text, first: part.first };
      if (part.kind === 'scene') {
        const real = part.start + u * part.speed * 1000;
        st.src = srcOf(frameAt(real));
        const tp = rec.taps.filter(x => x.t <= real && real - x.t < 450).pop();
        if (tp) st.ripple = { x: tp.x, y: tp.y, p: (real - tp.t) / 450 };
      }
      await page.evaluate(s => window.draw(s), st);
      const file = path.join(dir, String(n++).padStart(5, '0') + '.jpg');
      await page.screenshot({ path: file, type: 'jpeg', quality: 94 });
      if (part.kind === 'intro' && k === Math.round(1.4 * FPS)) {
        await page.screenshot({ path: path.join(OUT, lang, 'promo-thumbnail.png'), type: 'png' });
      }
    }
  }
  await page.close();
  return n;
}

function encode(lang, frames) {
  const file = path.join(OUT, lang, 'promo.mp4');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'video', lang, 'frames', '%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed' + (r.error ? ': ' + r.error.message : ''));
  // thumbnail for YouTube: 1280 × 720 JPEG from the title card
  const thumb = path.join(OUT, lang, 'promo-thumbnail.png');
  const t = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', thumb, '-vf', 'scale=1280:720', '-q:v', '2', path.join(OUT, lang, 'promo-thumbnail.jpg')], { stdio: 'inherit' });
  if (t.status !== 0) throw new Error('ffmpeg (thumbnail) failed');
  fs.rmSync(thumb);
  fs.rmSync(path.join(OUT, 'video', lang), { recursive: true, force: true }); // ~230 MB of frames per language
  console.log(`${lang}: promo.mp4 — ${(frames / FPS).toFixed(1)} s, ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
}

(async () => {
  const ff = spawnSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (ff.status !== 0 || !/libx264/.test(ff.stdout)) { console.error(`ffmpeg with libx264 not found (FFMPEG=${FFMPEG})`); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const stat = await H.startStatic();
  const plain = await H.launch({ camera: false });
  const thaiPdfFile = path.join(OUT, 'thai-document.pdf');
  fs.writeFileSync(thaiPdfFile, (await H.thaiPdf(plain, stat)).buf);
  const camFile = await cameraFile(plain);
  await stat.close();
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-video-capture=' + camFile] });
  for (const lang of langs) {
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    const rec = await record(browser, lang, thaiPdfFile);
    const frames = await compose(plain, lang, rec);
    encode(lang, frames);
  }
  await browser.close();
  await plain.close();
})().catch(e => { console.error(e); process.exit(1); });
