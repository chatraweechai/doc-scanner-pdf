'use strict';
/* End-to-end flow on a phone-sized screen: import, auto-detect, filters, crop, reorder, camera, export */
const { OUT, fs, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle, waitEditorIdle, exportPdf } = require('../lib/harness');
const meta = JSON.parse(fs.readFileSync(fixture('meta.json')));
const t = suite('e2e');
const check = t.check;

async function readQuad(page) {
  // แปลงพิกัด polygon ในหน้าครอป (พิกัดจอ) เป็นพิกัดภาพต้นฉบับ
  return page.evaluate(() => {
    const poly = document.querySelector('.crop-svg .quad');
    const cvs = document.querySelector('.crop-stage canvas.crop-img');
    return { points: poly.getAttribute('points'), cssW: parseFloat(cvs.style.width), cssH: parseFloat(cvs.style.height) };
  });
}

run(async () => {
  const srv = await startServer();
  const browser = await launch();
  const ctx = await newContext(browser, { deviceScaleFactor: 2, permissions: ['camera'] });
  const page = await ctx.newPage();
  const log = watch(page, 'mobile');
  page.on('dialog', d => d.accept());

  const t0 = Date.now();
  await page.goto(srv.url);
  await page.screenshot({ path: path.join(OUT, '01-home-loading.png') });
  await waitReady(page);
  check('OpenCV loads and becomes ready', true, (Date.now() - t0) + 'ms');
  check('jsPDF is not loaded at startup (loaded on demand)', await page.evaluate(() => !window.jspdf && !!window.AppPlatform && AppPlatform.id === 'web'));

  // ---- add files (2 valid + invalid + corrupt) ----
  await page.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg', 'not-image.txt', 'corrupt.jpg', 'photo-lightbg.jpg'].map(fixture));
  await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 3, null, { timeout: 30000 });
  const toastTexts = await page.$$eval('.toast', els => els.map(e => e.textContent));
  check('invalid + corrupt files rejected with message', toastTexts.some(t => t.includes('not-image.txt')) && toastTexts.some(t => t.includes('corrupt.jpg')), JSON.stringify(toastTexts));
  await waitIdle(page);
  await page.screenshot({ path: path.join(OUT, '02-home-pages.png'), fullPage: true });

  // ---- detection accuracy on each page ----
  const names = ['photo-shadow', 'photo-tilted', 'photo-lightbg'];
  for (let i = 0; i < 3; i++) {
    await page.click(`.page-item:nth-child(${i + 1}) .page-card`);
    await page.waitForSelector('#viewEditor:not([hidden])');
    await waitEditorIdle(page);
    if (i === 0) await page.screenshot({ path: path.join(OUT, '03-editor-enhance.png') });
    await page.click('#edCrop');
    await page.waitForSelector('#viewCrop:not([hidden])');
    await page.waitForFunction(() => { const p = document.querySelector('.crop-svg .quad'); return p && p.getAttribute('points'); });
    await page.waitForTimeout(200);
    const q = await readQuad(page);
    const m = meta[names[i]];
    const scale = q.cssW / m.W;
    const pts = q.points.trim().split(' ').map(s => s.split(',').map(Number)).map(([x, y]) => [x / scale, y / scale]);
    const diag = Math.hypot(m.W, m.H);
    const errs = pts.map((p, k) => Math.hypot(p[0] - m.quad[k][0], p[1] - m.quad[k][1]) / diag * 100);
    const maxErr = Math.max(...errs);
    check(`auto-detect corners ${names[i]} (max err ${maxErr.toFixed(2)}% of diagonal)`, maxErr < 1.5, pts.map(p => p.map(Math.round).join(',')).join(' '));
    if (i === 0) await page.screenshot({ path: path.join(OUT, '04-crop.png') });
    await page.click('#cropCancel');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.click('#edBack');
    await page.waitForSelector('#viewHome:not([hidden])');
  }

  // ---- filters on page 1 ----
  await page.click('.page-item:nth-child(1) .page-card');
  await page.waitForSelector('#viewEditor:not([hidden])');
  for (const f of ['original', 'enhance', 'bw', 'gray']) {
    await page.click(`.chip[data-filter="${f}"]`);
    await page.waitForTimeout(300);
    await waitEditorIdle(page);
    await page.locator('#edPreview').screenshot({ path: path.join(OUT, `05-filter-${f}.png`) });
    if (f === 'bw') check('bw hides contrast & shows strength, shadow switch locked', await page.evaluate(() => document.getElementById('edContrastRow').hidden && !document.getElementById('edStrengthRow').hidden && document.getElementById('edShadow').disabled));
  }
  // toggle shadow off on original
  await page.click('.chip[data-filter="original"]');
  await page.click('label[for="edShadow"]');
  await page.waitForTimeout(300); await waitEditorIdle(page);
  await page.locator('#edPreview').screenshot({ path: path.join(OUT, '05-filter-original-noshadowfix.png') });
  // brightness slider
  await page.fill('#edBrightness', '60');
  await page.dispatchEvent('#edBrightness', 'input');
  await page.waitForTimeout(400); await waitEditorIdle(page);
  const bright = await page.evaluate(() => { const v = document.getElementById('edPreview'); const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return s / (d.length / 4); });
  await page.fill('#edBrightness', '-60');
  await page.dispatchEvent('#edBrightness', 'input');
  await page.waitForTimeout(400); await waitEditorIdle(page);
  const dark = await page.evaluate(() => { const v = document.getElementById('edPreview'); const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return s / (d.length / 4); });
  check('brightness slider changes output', bright > dark + 40, `bright=${bright.toFixed(1)} dark=${dark.toFixed(1)}`);
  // rotate
  const before = await page.evaluate(() => [document.getElementById('edPreview').width, document.getElementById('edPreview').height]);
  await page.click('#edRotR');
  await page.waitForTimeout(400); await waitEditorIdle(page);
  const after = await page.evaluate(() => [document.getElementById('edPreview').width, document.getElementById('edPreview').height]);
  check('rotate swaps dimensions', before[0] === after[1] && before[1] === after[0], JSON.stringify({ before, after }));
  // reset then set enhance and apply all
  await page.click('#edReset');
  await page.click('.chip[data-filter="bw"]');
  await page.click('#edApplyAll');
  await page.waitForTimeout(300);

  // ---- manual crop drag ----
  await page.click('#edCrop');
  await page.waitForSelector('#viewCrop:not([hidden])');
  await page.waitForTimeout(300);
  const q0 = await readQuad(page);
  const hit = page.locator('.crop-svg .hit[data-idx="0"]');
  const hb = await hit.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2 + 30, { steps: 5 });
  const loupeVisible = await page.evaluate(() => !document.querySelector('.loupe').hidden);
  await page.screenshot({ path: path.join(OUT, '06-crop-drag.png') });
  await page.mouse.up();
  const q1 = await readQuad(page);
  check('dragging corner moves crop polygon', q0.points !== q1.points);
  check('loupe shown while dragging', loupeVisible);
  // make invalid quad: drag TL beyond BR
  const br = await page.locator('.crop-svg .hit[data-idx="2"]').boundingBox();
  const tl = await page.locator('.crop-svg .hit[data-idx="0"]').boundingBox();
  await page.mouse.move(tl.x + tl.width / 2, tl.y + tl.height / 2); await page.mouse.down();
  await page.mouse.move(br.x + br.width / 2 + 10, br.y + br.height / 2 + 10, { steps: 8 }); await page.mouse.up();
  check('self-intersecting quad disables confirm', await page.isDisabled('#cropOk'));
  await page.click('#cropFull');
  check('"full image" makes quad valid again', !(await page.isDisabled('#cropOk')));
  await page.click('#cropAuto');
  await page.waitForTimeout(800);
  await page.click('#cropOk');
  await page.waitForSelector('#viewEditor:not([hidden])');
  await page.waitForTimeout(300); await waitEditorIdle(page);
  await page.click('#edBack');
  await page.waitForSelector('#viewHome:not([hidden])');

  // ---- reorder & delete ----
  const order0 = await page.$$eval('.page-item', els => els.map(e => e.dataset.id));
  await page.click('.page-item:nth-child(1) [data-action="right"]');
  const order1 = await page.$$eval('.page-item', els => els.map(e => e.dataset.id));
  check('move page right reorders', order1[0] === order0[1] && order1[1] === order0[0], order0 + ' -> ' + order1);
  await page.click('.page-item:nth-child(1) [data-action="left"]').catch(() => {});

  // ---- camera ----
  await page.click('#btnCamera');
  await page.waitForSelector('#viewCamera:not([hidden])');
  await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, '07-camera.png') });
  await page.click('#camShutter');
  await page.waitForFunction(() => document.getElementById('camCount').textContent === '1', null, { timeout: 15000 });
  await page.click('#camShutter');
  await page.waitForFunction(() => document.getElementById('camCount').textContent === '2', null, { timeout: 15000 });
  await page.click('#camDone');
  await page.waitForSelector('#viewCamera', { state: 'hidden' });
  const camTracks = await page.evaluate(() => document.getElementById('camVideo').srcObject);
  check('camera captured 2 pages and stopped stream', (await page.$$('.page-item')).length === 5 && camTracks === null);
  // delete last two camera pages
  for (let k = 0; k < 2; k++) await page.click('.page-item:last-child [data-action="delete"]');
  check('delete page', (await page.$$('.page-item')).length === 3);

  // ---- export ----
  const pdfOut = await exportPdf(page, 'e2e.pdf', async () => {
    // เปิดหน้าต่างแล้วโฟกัสอยู่ที่หัวข้อ ไม่ใช่ช่องชื่อไฟล์ (มือถือ/แท็บเล็ตไม่เด้งแป้นพิมพ์บนจอขึ้นมาบังตัวเลือก)
    const focus = await page.evaluate(() => { const a = document.activeElement; return a && (a.id || a.tagName); });
    check('export dialog opens without focusing a text field (no on-screen keyboard)', focus === 'exportTitle', 'focus=' + focus);
    check('no autofocus attribute (blocked in cross-origin frames such as Apps Script)', await page.evaluate(() => !document.querySelector('[autofocus]')));
    await page.fill('#exFilename', '<script>alert(1)</script>/../..\u202Eevil');
    await page.screenshot({ path: path.join(OUT, '08-export-dialog.png') });
  });
  const pdf = pdfOut.buf;
  const fname = pdfOut.name;
  const nPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF downloaded with %PDF header', pdf.slice(0, 5).toString() === '%PDF-', (pdf.length / 1024).toFixed(0) + ' KB');
  check('PDF has 3 pages', nPages === 3, 'pages=' + nPages);
  check('jsPDF loaded on demand for the export', await page.evaluate(() => !!(window.jspdf && window.jspdf.jsPDF)));
  check('filename sanitized', !/[<>\/\\\u202E]/.test(fname) && fname.endsWith('.pdf'), JSON.stringify(fname));
  await page.waitForSelector('#exResult:not([hidden])');
  await page.screenshot({ path: path.join(OUT, '09-export-done.png') });
  await page.click('#exCancel');

  // ---- desktop layout ----
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.screenshot({ path: path.join(OUT, '10-desktop-home.png') });
  await page.click('.page-item:nth-child(2) .page-card');
  await page.waitForSelector('#viewEditor:not([hidden])');
  await page.waitForTimeout(300); await waitEditorIdle(page);
  await page.screenshot({ path: path.join(OUT, '11-desktop-editor.png') });

  // ---- android back button (history) ----
  await page.goBack();
  await page.waitForSelector('#viewHome:not([hidden])');
  check('browser back returns to home', true);

  const csp = await page.evaluate(() => window.__csp);
  check('no CSP violations', csp.length === 0, JSON.stringify(csp));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('no horizontal overflow (desktop)', !overflow);
  check('no console errors/page errors', log.length === 0, log.join('\n'));

  await browser.close();
  await srv.close();
  t.finish();
});
