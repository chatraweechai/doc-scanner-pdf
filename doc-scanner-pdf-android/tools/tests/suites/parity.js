'use strict';
/*
 * Parity: the web version (doc-scanner-pdf-code, static files) and the Android app's page must behave identically — same page
 * structure and text, same detected corners, same processed pixels in every mode, same OCR text, and PDFs that
 * render identically (web: browser download; Android: saved through the bridge), same PDF → Word text and PDF → JPG bytes.
 */
const { fs, path, OUT, launch, newAppContext, newWebContext, openApp, startStatic, watch, suite, run, fixture, waitReady,
  waitIdle, openInspector, inspectPdf, OCR_NOISE, thaiPdf, readZip, docxParagraphs } = require('../lib/harness');
const crypto = require('crypto');

/** PDF → Word (text only) and PDF → JPG (Standard) with PdfTools in a page; returns both files as base64 */
async function convertPdf(page, b64) {
  return page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const doc = await PdfTools.open(new File([bytes], 'thai.pdf', { type: 'application/pdf' }));
    const toB64 = async blob => {
      const u = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      return btoa(s);
    };
    try {
      const w = await PdfTools.toDocx(doc, { mode: 'text' });
      const j = await PdfTools.toJpeg(doc, { preset: 'standard' });
      return { docx: await toB64(w.blob), jpg: await toB64(j.blob), names: w.name + ' ' + j.name };
    } finally {
      doc.destroy();
    }
  }, b64);
}

const t = suite('parity (web ↔ Android)');
const IMAGES = ['photo-shadow', 'photo-tilted', 'photo-lightbg', 'scan-flat'];
const MODES = [
  { filter: 'enhance', removeShadow: true },
  { filter: 'bw', removeShadow: true, bwStrength: 10 },
  { filter: 'gray', removeShadow: true, brightness: 20, contrast: 15 },
  { filter: 'original', removeShadow: false, rotation: 90 },
  { filter: 'ocr' }
];

async function processAll(page, images) {
  return page.evaluate(async ({ images, modes }) => {
    const hex = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');
    const out = {};
    for (const [name, b64] of Object.entries(images)) {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const quad = (await CvEngine.detect(c, 'high')) || Scanner.fullQuad(c.width, c.height);
      const hashes = [];
      for (const m of modes) {
        const r = await CvEngine.warpProcess(c, quad, 1600, m, 'high');
        const d = r.getContext('2d').getImageData(0, 0, r.width, r.height).data;
        hashes.push(r.width + 'x' + r.height + ':' + (await hex(d.buffer)).slice(0, 16));
      }
      out[name] = { quad: quad.map(p => [+p.x.toFixed(3), +p.y.toFixed(3)]), hashes };
    }
    return out;
  }, { images, modes: MODES });
}

async function ocrText(page, b64) {
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
    const q = await CvEngine.detect(c, 'high');
    const o = await CvEngine.warpProcess(c, q, 2400, { filter: 'ocr' }, 'high');
    const blob = await new Promise(r => o.toBlob(r, 'image/png'));
    const res = await Ocr.recognize(blob, 'tha+eng', null, { width: o.width, height: o.height });
    return { text: res.text, lines: res.layout.lines.length };
  }, b64);
}

run(async () => {
  const stat = await startStatic();
  const browser = await launch({ camera: false });

  const webCtx = await newWebContext(browser);
  const web = await webCtx.newPage();
  const webLog = watch(web, 'web');
  await web.goto(stat.url);
  await waitReady(web);

  const appCtx = await newAppContext(browser, { isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  const { page: app, log: appLog } = await openApp(appCtx, 'android');
  await waitReady(app);

  const engines = await Promise.all([web, app].map(p => p.evaluate(() => [CvEngine.info().mode, CvEngine.info().build].join('/'))));
  t.check('both run the same engine (worker + SIMD)', engines[0] === engines[1] && engines[0] === 'worker/simd', engines.join(' vs '));

  const structure = p => p.evaluate(() => [...document.querySelectorAll('body [id]')].map(e => e.tagName + '#' + e.id + (e.hidden ? ':h' : '')).join(','));
  const [sWeb, sApp] = await Promise.all([structure(web), structure(app)]);
  t.check('same UI: every element (id, tag, visibility) matches', sWeb === sApp, `${sWeb.split(',').length} elements`);
  const text = p => p.evaluate(() => document.body.innerText.replace(/เวอร์ชัน.*\n?/, '').replace(/\s+/g, ' ').trim());
  t.check('same visible text (apart from the version line)', (await text(web)) === (await text(app)));

  const images = Object.fromEntries(IMAGES.map(n => [n, fs.readFileSync(fixture(n + '.jpg')).toString('base64')]));
  const [pWeb, pApp] = [await processAll(web, images), await processAll(app, images)];
  for (const n of IMAGES) {
    t.check(`${n}: identical corners and pixels in all ${MODES.length} modes`, JSON.stringify(pWeb[n]) === JSON.stringify(pApp[n]),
      pApp[n].hashes.map(h => h.split(':')[0]).join(' '));
  }

  const [oWeb, oApp] = [await ocrText(web, images['photo-shadow']), await ocrText(app, images['photo-shadow'])];
  t.check('identical OCR text and text layout', oWeb.text === oApp.text && oWeb.lines === oApp.lines && oWeb.text.length > 200, `${oApp.text.length} chars, ${oApp.lines} lines`);

  // ---- PDF → Word / JPG ----
  const thai = await thaiPdf(browser, stat);
  const [cWeb, cApp] = [await convertPdf(web, thai.buf.toString('base64')), await convertPdf(app, thai.buf.toString('base64'))];
  const part = (c, name) => readZip(Buffer.from(c.docx, 'base64'))[name].toString('utf8');
  const sha = b64 => crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');
  const words = [cWeb, cApp].map(c => docxParagraphs(Buffer.from(c.docx, 'base64')));
  t.check('PDF → Word: identical document and styles, Thai text exactly the original on both',
    part(cWeb, 'word/document.xml') === part(cApp, 'word/document.xml') && part(cWeb, 'word/styles.xml') === part(cApp, 'word/styles.xml') &&
    words[0].join('\n') === thai.lines.join('\n') && cWeb.names === cApp.names, JSON.stringify(words[1]));
  t.check('PDF → JPG: identical image bytes', sha(cWeb.jpg) === sha(cApp.jpg), `${Buffer.from(cApp.jpg, 'base64').length} bytes`);

  // ---- PDF ----
  for (const p of [web, app]) {
    await p.setInputFiles('#fileInput', ['photo-tilted.jpg', 'photo-lightbg.jpg'].map(fixture));
    await p.waitForFunction(() => document.querySelectorAll('.page-item').length === 2, null, { timeout: 60000 });
    await waitIdle(p);
    await p.click('#btnExport');
    await p.waitForSelector('#exportDialog[open]');
    await p.selectOption('#exQuality', 'medium');
    await p.selectOption('#exMargin', '5');
  }
  const [dl] = await Promise.all([web.waitForEvent('download', { timeout: 300000 }), web.click('#exDownload')]);
  const webPdf = fs.readFileSync(await dl.path());
  await app.click('#exDownload');
  await app.waitForSelector('#exResult:not([hidden])', { timeout: 300000 });
  const appPdf = appCtx.bridge.saved[0] && appCtx.bridge.saved[0].buf;
  fs.writeFileSync(path.join(OUT, 'parity-web.pdf'), webPdf);
  if (appPdf) fs.writeFileSync(path.join(OUT, 'parity-android.pdf'), appPdf);
  const q = await openInspector(webCtx, stat);
  const [A, B] = [await inspectPdf(q, webPdf), await inspectPdf(q, appPdf || Buffer.from(''))];
  const diffs = [];
  for (let i = 0; i < Math.max(A.numPages || 0, B.numPages || 0); i++) {
    if (!A.pages[i] || !B.pages[i]) { diffs.push({ page: i, missing: true }); continue; }
    diffs.push(await q.evaluate(([a, b]) => window.diffImages(a, b), [A.pages[i].pixels.data, B.pages[i].pixels.data]));
  }
  t.check('PDFs render identically page by page', A.numPages === 2 && B.numPages === 2 && diffs.every(d => d.sameSize && d.maxDiff === 0),
    JSON.stringify(diffs) + ` sizes ${webPdf.length} / ${appPdf ? appPdf.length : 0} bytes`);

  const noise = webLog.concat(appLog).filter(l => !OCR_NOISE.test(l));
  t.check('no console errors on either platform; nothing blocked on Android', !noise.length && !appCtx.blocked.length, noise.concat(appCtx.blocked).join('\n'));

  await browser.close();
  await stat.close();
  t.finish();
});
