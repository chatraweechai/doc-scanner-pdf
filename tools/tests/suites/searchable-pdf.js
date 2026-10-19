'use strict';
/*
 * Searchable PDF: OCR text embedded as an invisible layer (text render mode 3) over the page image.
 * PDFs are inspected with pdf.js (fixtures/pdf-check.html): extracted text, positions, render modes, pixels.
 */
const { APP, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle,
  exportPdf, OCR_NOISE, ocrAccuracy } = require('../lib/harness');

const t = suite('searchable-pdf');

async function openInspector(ctx, srv) {
  const q = await ctx.newPage();
  await q.goto(srv.origin + '/__fixtures/pdf-check.html');
  await q.waitForFunction(() => window.pdfReady, null, { timeout: 30000 });
  return q;
}
const inspect = (q, buf, opts) => q.evaluate(([b64, o]) => window.inspectPdf(b64, o), [buf.toString('base64'), opts || {}]);
const pageText = p => p.items.map(it => it.str).join(' ');
const find = (p, s) => p.items.find(it => it.str.includes(s));

run(async () => {
  const srv = await startServer();
  const browser = await launch({ camera: false });
  const ctx = await newContext(browser, { deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const log = watch(page, 'app');
  page.on('dialog', d => d.accept());
  await page.goto(srv.url);
  await waitReady(page);
  await page.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg'].map(fixture));
  await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 2);
  await waitIdle(page);

  // ---- export dialog UI ----
  await page.click('#btnExport');
  await page.waitForSelector('#exportDialog[open]');
  t.check('OCR option is off by default, language hidden', !(await page.isChecked('#exOcr')) && await page.isHidden('#exOcrLangField'));
  await page.check('#exOcr');
  t.check('turning OCR on shows the language choice', await page.isVisible('#exOcrLangField') && (await page.inputValue('#exOcrLang')) === 'tha+eng');
  await page.uncheck('#exOcr');
  await page.click('#exCancel');

  // ---- plain vs searchable export ----
  const plain = await exportPdf(page, 'plain.pdf');
  await page.click('#exCancel');
  const t0 = Date.now();
  const ocr = await exportPdf(page, 'searchable.pdf', async () => {
    await page.check('#exOcr');
    await page.screenshot({ path: path.join(__dirname, '../out/spdf-01-dialog.png') });
  });
  const ocrMs = Date.now() - t0;
  const result = await page.textContent('#exResult');
  t.check('searchable export succeeds and says so', result.includes('ค้นหาข้อความได้') && !(await page.$('#exResult.error')), `${result} (${ocrMs}ms)`);
  t.check('text layer adds little to file size (font subset + text)', ocr.buf.length - plain.buf.length < 150 * 1024,
    `${(plain.buf.length / 1024).toFixed(0)} KB -> ${(ocr.buf.length / 1024).toFixed(0)} KB`);

  const q = await openInspector(ctx, srv);
  const qlog = watch(q, 'pdfjs');
  const P = await inspect(q, plain.buf);
  const S = await inspect(q, ocr.buf);
  t.check('both PDFs have 2 pages', P.numPages === 2 && S.numPages === 2);
  t.check('plain PDF has no text', P.pages.every(p => p.items.every(it => !it.str.trim())));

  const acc = S.pages.map(p => ocrAccuracy(pageText(p)));
  t.check('extracted text matches the document (≥ 90% per page)', acc.every(a => a >= 90), acc.map(a => a.toFixed(1) + '%').join(', '));
  // (page 2 is a steeply tilted photo: OCR misreads its bold "INVOICE", so that term is only required on page 1)
  const terms = ['ใบแจ้งหนี้', 'บริษัท ตัวอย่าง จำกัด', '13,375.00', 'PO-7781', 'The quick brown fox'];
  const missing = S.pages.map((p, i) => terms.concat(i ? [] : ['INVOICE']).filter(s => !pageText(p).includes(s)));
  t.check('search terms found on every page (Thai, English, numbers; ำ normalized)', missing.every(m => !m.length), JSON.stringify(missing));

  const modes = S.pages.flatMap(p => p.modes);
  t.check('all text is invisible (render mode 3) and there is text on each page',
    modes.length > 0 && modes.every(m => m === 3) && S.pages.every(p => p.textOps > 5), `modes=${[...new Set(modes)]} textOps=${S.pages.map(p => p.textOps)}`);

  // positions: the synthetic document has the header baseline at 10.8% and "The quick…" at 28.5% of the page,
  // starting at 23.4% / 8.1% of the width (paper 1240×1754 px, fills the A4 page)
  const p1 = S.pages[0];
  const head = find(p1, 'INVOICE');
  const fox = find(p1, 'quick brown');
  const near = (v, e, tol) => v != null && Math.abs(v - e) <= tol;
  t.check('text sits over the matching words in the image', head && fox && near(head.y, 0.108, 0.015) && near(head.x, 0.234, 0.02) &&
    near(fox.y, 0.285, 0.015) && near(fox.x, 0.081, 0.02) && fox.w > 0.6 && fox.x + fox.w < 0.9,
    JSON.stringify({ head, fox }, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  const row = find(p1, '1234.50');
  t.check('table columns keep their own positions', row && row.x > 0.6 && row.x < 0.75, row && JSON.stringify(row, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  const p2 = S.pages[1];
  const head2 = find(p2, 'ใบแจ้งหนี้');
  t.check('rotated/tilted source page: text also aligned (page 2)', head2 && near(head2.y, 0.108, 0.02), head2 && JSON.stringify({ x: head2.x.toFixed(3), y: head2.y.toFixed(3) }));

  let same = true;
  const diffs = [];
  for (let i = 0; i < 2; i++) {
    const d = await q.evaluate(([a, b]) => window.diffImages(a, b), [P.pages[i].pixels.data, S.pages[i].pixels.data]);
    diffs.push(d);
    same = same && d.sameSize && d.maxDiff <= 2;
  }
  t.check('pages look exactly the same as without OCR (pixel compare)', same, JSON.stringify(diffs));

  // ---- OCR results are shared with the "convert to text" dialog ----
  const t1 = Date.now();
  await page.click('#exCancel');
  await page.click('#btnOcrAll');
  await page.waitForFunction(() => document.getElementById('ocrProgressWrap').hidden && document.getElementById('ocrDialog').open, null, { timeout: 60000 });
  const reuseMs = Date.now() - t1;
  t.check('"convert to text" reuses the OCR done for the PDF (instant)', reuseMs < 2000 && ocrAccuracy((await page.inputValue('#ocrText')).split(/— หน้า \d+ —/)[1] || '') >= 90, reuseMs + 'ms');
  await page.click('#ocrClose');

  // ---- cancel a long OCR export ----
  {
    let downloads = 0;
    const onDl = () => downloads++;
    page.on('download', onDl);
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    await page.selectOption('#exOcrLang', 'eng'); // not cached yet → runs OCR again
    await page.click('#exDownload');
    await page.waitForFunction(() => /อ่านข้อความ|โหลด|เตรียม/.test(document.getElementById('exProgressText').textContent) && document.getElementById('exCancel').textContent === 'หยุด', null, { timeout: 30000 });
    await page.click('#exCancel');
    await page.waitForSelector('#exResult:not([hidden])', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({
      result: document.getElementById('exResult').textContent,
      label: document.getElementById('exCancel').textContent,
      enabled: !document.getElementById('exDownload').disabled && !document.getElementById('exCancel').disabled,
      open: document.getElementById('exportDialog').open,
      busy: Ocr.isBusy()
    }));
    t.check('"หยุด" cancels the export: no file, controls restored, OCR stopped', st.result.includes('หยุด') && downloads === 0 && st.label === 'ปิด' && st.enabled && st.open && !st.busy, JSON.stringify(st));
    page.off('download', onDl);
    await page.selectOption('#exOcrLang', 'tha+eng');
    await page.click('#exCancel');
    t.check('dialog closes normally afterwards', !(await page.evaluate(() => document.getElementById('exportDialog').open)));
  }

  // ---- text layer robustness: special characters, junk lines, bad values (unit level, in the page) ----
  {
    const res = await page.evaluate(async () => {
      const W = 1240, H = 1754;
      const word = (text, x0, x1) => ({ text, bbox: { x0, y0: 300, x1, y1: 340 } });
      const blocks = [{ paragraphs: [{ lines: [
        { text: 'Price (USD) \\ 100% <b>&  ทํา\n', confidence: 90, bbox: { x0: 100, y0: 290, x1: 1100, y1: 345 }, baseline: { x0: 100, y0: 335, x1: 1100, y1: 335 }, rowAttributes: { rowHeight: 40 },
          words: [word('Price', 100, 200), word('(USD)', 215, 330), word('\\', 345, 360), word('100%', 375, 470), word('<b>&', 485, 560), word('ทํา', 1000, 1100)] },
        { text: 'noise', confidence: 12, bbox: { x0: 100, y0: 400, x1: 300, y1: 440 }, words: [] },
        { text: '|||| —', confidence: 90, bbox: { x0: 100, y0: 500, x1: 300, y1: 540 }, words: [] },
        { text: 'bad box', confidence: 90, bbox: { x0: NaN, y0: 1, x1: 2, y1: 3 }, words: [] },
        { text: 'ctrl\u0007char', confidence: 90, bbox: { x0: 100, y0: 600, x1: 400, y1: 640 }, rowAttributes: {}, words: [] }
      ] }] }];
      const layout = Ocr.buildLayout(blocks, W, H);
      layout.lines.push({ base: 0.5, size: 1e9, segs: [{ t: 'huge', x0: 0.1, x1: 0.2 }] }, { base: NaN, size: 0.02, segs: [{ t: 'nan', x0: 0.1, x1: 0.2 }] },
        { base: 0.6, size: 0.02, segs: [{ t: 'out of page', x0: -1, x1: 2 }, { t: 42, x0: 0.1, x1: 0.2 }] });
      const white = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); return c; };
      const out = await PdfExport.build([{}], { pageSize: 'a4', margin: 0, quality: 'medium', textLayer: () => Promise.resolve(layout) }, () => Promise.resolve(white()));
      const buf = new Uint8Array(await out.blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { layout, b64: btoa(s), textPages: out.textPages, error: out.textError && String(out.textError) };
    });
    const segs = res.layout.lines.slice(0, 2).map(l => l.segs.map(s => s.t));
    t.check('layout: splits columns, fixes ำ, drops low-confidence and symbol-only lines, strips control chars',
      JSON.stringify(segs) === JSON.stringify([['Price (USD) \\ 100% <b>&', 'ทำ'], ['ctrl char']]), JSON.stringify(segs));
    const R = await inspect(q, Buffer.from(res.b64, 'base64'), { render: false });
    const strs = R.pages[0].items.map(it => it.str).filter(s => s.trim());
    t.check('special characters survive in the PDF text; invalid entries skipped without errors',
      strs.includes('Price (USD) \\ 100% <b>&') && strs.includes('ทำ') && strs.includes('ctrl char') && !strs.some(s => /huge|nan|out of page|^42$/.test(s)) && res.textPages === 1 && !res.error,
      JSON.stringify(strs));
  }

  const csp = await page.evaluate(() => window.__csp);
  const errs = log.concat(qlog).filter(l => !OCR_NOISE.test(l));
  t.check('no CSP violations / console errors', !csp.length && !errs.length, JSON.stringify(csp) + errs.join('\n'));

  // ---- setting is remembered ----
  await page.reload();
  await waitReady(page);
  t.check('OCR option remembered after reload', await page.isChecked('#exOcr'));
  await ctx.close();

  // ---- OCR / font files unavailable → PDF still created, with a clear warning ----
  for (const [label, pattern, expect] of [['OCR engine', '/vendor/tesseract/**', 'อ่านข้อความไม่สำเร็จ'], ['font', '/vendor/fonts/**', 'โหลดฟอนต์']]) {
    const c2 = await newContext(browser);
    await c2.route(srv.origin + pattern, r => r.fulfill({ status: 404, body: 'nf' }));
    const p2 = await c2.newPage();
    await p2.goto(srv.url);
    await waitReady(p2);
    await p2.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await p2.waitForSelector('.page-item');
    await waitIdle(p2);
    const out = await exportPdf(p2, 'fallback.pdf', () => p2.check('#exOcr'));
    const msg = await p2.textContent('#exResult');
    t.check(`${label} missing → PDF still created with a warning`, out.buf.slice(0, 5).toString() === '%PDF-' && msg.includes(expect) && !!(await p2.$('#exResult.error')), msg);
    await c2.close();
  }

  // ---- opened from disk: OCR needs the website ----
  {
    const c3 = await newContext(browser);
    const p3 = await c3.newPage();
    await p3.goto('file://' + path.join(APP, 'index.html'));
    await waitReady(p3);
    await p3.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await p3.waitForSelector('.page-item');
    await p3.click('#btnExport');
    await p3.waitForSelector('#exportDialog[open]');
    t.check('file:// → OCR option disabled with explanation', await p3.isDisabled('#exOcr') && (await p3.textContent('#exOcrNote')).includes('https'));
    await c3.close();
  }

  await browser.close();
  await srv.close();
  t.finish();
});
