'use strict';
/* OCR (Tesseract.js, Thai + English): accuracy, copy/save, cache, language switch, cancel, errors */
const { APP, OUT, fs, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle, OCR_NOISE, ocrAccuracy } = require('../lib/harness');
const t = suite('ocr');
const check = t.check;
const acc = ocrAccuracy;
const waitOcrDone = p => p.waitForFunction(() => document.getElementById('ocrProgressWrap').hidden && document.getElementById('ocrDialog').open, null, { timeout: 180000 });
run(async () => {
  const srv = await startServer();
  const b = await launch({ camera: false });
  const ctx = await newContext(b, { deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const log = watch(p, 'ocr');
  p.on('dialog', d => d.accept());
  await p.goto(srv.url);
  await waitReady(p);
  await p.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg'].map(fixture));
  await p.waitForFunction(() => document.querySelectorAll('.page-item').length === 2);
  await waitIdle(p);

  // single page from editor
  await p.click('.page-item:nth-child(1) .page-card');
  await p.waitForSelector('#viewEditor:not([hidden])');
  await p.screenshot({ path: path.join(OUT, 'ocr-01-editor.png') });
  let t0 = Date.now();
  await p.click('#edOcr');
  await p.waitForSelector('#ocrDialog[open]');
  const ocrFocus = await p.evaluate(() => { const a = document.activeElement; return a && (a.id || a.tagName); });
  check('OCR dialog opens focused on its title, not the text box (no on-screen keyboard)', ocrFocus === 'ocrTitle', 'focus=' + ocrFocus);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'ocr-02-progress.png') });
  await waitOcrDone(p);
  const first = Date.now() - t0;
  const text1 = await p.inputValue('#ocrText');
  const note1 = await p.textContent('#ocrNote');
  check('OCR page 1 via editor: accuracy ≥ 95%', acc(text1) >= 95, `acc ${acc(text1).toFixed(1)}% in ${first}ms — ${note1}`);
  check('Thai sara am normalized (จำกัด, no ํา)', text1.includes('จำกัด') && !/ํา/.test(text1));
  await p.screenshot({ path: path.join(OUT, 'ocr-03-result.png') });
  // copy
  await p.click('#ocrCopy');
  await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check('copy puts text on clipboard', clip === text1 && (await p.textContent('#ocrNote')).includes('คัดลอก'));
  // edit then save .txt
  await p.fill('#ocrText', text1 + '\nแก้ไขเพิ่ม');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ocrSave')]);
  const f = path.join(OUT, 'ocr.txt'); await dl.saveAs(f); const buf = fs.readFileSync(f);
  check('save .txt: UTF-8 BOM, edited text, .txt name', buf[0] === 0xEF && buf[1] === 0xBB && buf.toString('utf8').includes('แก้ไขเพิ่ม') && dl.suggestedFilename().endsWith('.txt'), dl.suggestedFilename());
  await p.click('#ocrClose');
  // cached reopen
  t0 = Date.now(); await p.click('#edOcr'); await waitOcrDone(p);
  check('re-open uses cached result (fast)', Date.now() - t0 < 1500 && (await p.inputValue('#ocrText')) === text1, (Date.now() - t0) + 'ms');
  // language switch
  await p.selectOption('#ocrLang', 'eng');
  await p.waitForTimeout(300); await waitOcrDone(p);
  const engText = await p.inputValue('#ocrText');
  check('switching language re-runs OCR (eng)', engText.includes('INVOICE') && engText !== text1);
  await p.selectOption('#ocrLang', 'tha+eng');
  await p.waitForTimeout(300); await waitOcrDone(p);
  await p.click('#ocrClose');
  await p.click('#edBack'); await p.waitForSelector('#viewHome:not([hidden])');

  // all pages + cancel mid-run
  await p.click('#btnOcrAll');
  await p.waitForSelector('#ocrDialog[open]');
  await p.waitForFunction(() => /หน้า 2/.test(document.getElementById('ocrProgressText').textContent), null, { timeout: 60000 });
  await p.click('#ocrClose');
  await p.waitForTimeout(500);
  check('cancel mid-run closes dialog without errors', !(await p.evaluate(() => document.getElementById('ocrDialog').open)) && log.filter(l => !OCR_NOISE.test(l)).length === 0);
  t0 = Date.now();
  await p.click('#btnOcrAll');
  await waitOcrDone(p);
  const all = await p.inputValue('#ocrText');
  const seg = all.split(/— หน้า \d+ —/).map(s => s.trim()).filter(Boolean);
  check('OCR all pages: both pages with headers, accuracy ≥ 90% each', all.includes('— หน้า 1 —') && all.includes('— หน้า 2 —') && seg.length === 2 && seg.every(s => acc(s) >= 90), seg.map(s => acc(s).toFixed(1) + '%').join(', ') + ` in ${Date.now() - t0}ms`);
  await p.screenshot({ path: path.join(OUT, 'ocr-04-all.png') });
  // Escape closes
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  check('Escape closes OCR dialog', !(await p.evaluate(() => document.getElementById('ocrDialog').open)));
  const csp = await p.evaluate(() => window.__csp);
  const errs = log.filter(l => !OCR_NOISE.test(l));
  check('no CSP violations / errors', csp.length === 0 && errs.length === 0, JSON.stringify(csp) + errs.join('\n'));
  await ctx.close();

  // Corrupt language data: Tesseract fails to initialize (it never settles its promise) -> error shown, no hang
  {
    const c1 = await newContext(b);
    await c1.route(srv.origin + '/vendor/tesseract/lang/**', r => r.fulfill({ status: 200, contentType: 'application/gzip', body: Buffer.from('this is not traineddata') }));
    const q = await c1.newPage();
    await q.goto(srv.url); await waitReady(q);
    await q.setInputFiles('#fileInput', fixture('photo-tilted.jpg')); await q.waitForSelector('.page-item');
    const t0 = Date.now();
    await q.click('#btnOcrAll');
    await q.waitForFunction(() => document.getElementById('ocrProgressWrap').hidden && document.getElementById('ocrDialog').open, null, { timeout: 60000 });
    const n = await q.textContent('#ocrNote');
    const again = await q.evaluate(() => !document.getElementById('ocrCopy').disabled && !Ocr.isBusy());
    check('corrupt language data -> error message instead of hanging, dialog usable', n.includes('ไม่สำเร็จ') && again && Date.now() - t0 < 30000, `${n} (${Date.now() - t0}ms)`);
    await c1.close();
  }

  // Tesseract files unavailable -> clear error in dialog
  {
    const c2 = await newContext(b);
    await c2.route(srv.origin + '/vendor/tesseract/**', r => r.fulfill({ status: 404, body: 'nf' }));
    const q = await c2.newPage();
    await q.goto(srv.url); await waitReady(q);
    await q.setInputFiles('#fileInput', fixture('photo-tilted.jpg')); await q.waitForSelector('.page-item');
    await q.click('#btnOcrAll'); await waitOcrDone(q);
    const n = await q.textContent('#ocrNote');
    check('missing OCR files -> clear error message', n.includes('ไม่สำเร็จ'), n);
    await c2.close();
  }
  // file:// -> not supported message
  {
    const c3 = await newContext(b); const q = await c3.newPage();
    await q.goto('file://' + path.join(APP, 'index.html')); await waitReady(q);
    await q.setInputFiles('#fileInput', fixture('photo-tilted.jpg')); await q.waitForSelector('.page-item');
    await q.click('#btnOcrAll'); await q.waitForSelector('.toast.error');
    const t = await q.$$eval('.toast', e => e.map(x => x.textContent).join(' | '));
    check('file:// -> OCR shows "needs website" message', t.includes('https'), t);
    await c3.close();
  }
  await b.close(); await srv.close();
  t.finish();
});
