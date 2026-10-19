'use strict';
/*
 * Photo formats: WebP (the browser decodes it) and HEIC/HEIF (iPhone / many Android cameras — Chromium cannot decode
 * it, so the app uses libheif in a Web Worker, js/heic.js). Import, edge detection, broken files, file://, PDF export.
 */
const { APP, OUT, fs, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle, exportPdf } = require('../lib/harness');
const t = suite('formats');
const check = t.check;
const meta = JSON.parse(fs.readFileSync(fixture('meta.json')));

// fixtures/photo-tilted.{heic,webp}: photo-tilted.jpg scaled to 1600×1200 (pillow-heif / Pillow)
const SMALL = { W: 1600, H: 1200, quad: meta['photo-tilted'].quad.map(([x, y]) => [x * 1600 / 3000, y * 1200 / 2250]) };

async function cropError(page, index) {
  await page.click(`.page-item:nth-child(${index}) .page-card`);
  await page.waitForSelector('#viewEditor:not([hidden])');
  await page.click('#edCrop');
  await page.waitForSelector('#viewCrop:not([hidden])');
  await page.waitForFunction(() => { const p = document.querySelector('.crop-svg .quad'); return p && p.getAttribute('points'); });
  await page.waitForTimeout(200);
  const q = await page.evaluate(() => {
    const cvs = document.querySelector('.crop-stage canvas.crop-img');
    return { points: document.querySelector('.crop-svg .quad').getAttribute('points'), cssW: parseFloat(cvs.style.width), w: cvs.width, h: cvs.height };
  });
  await page.click('#cropCancel');
  await page.click('#edBack').catch(() => {});
  await page.waitForSelector('#viewHome:not([hidden])').catch(() => {});
  const scale = q.cssW / SMALL.W;
  const pts = q.points.trim().split(' ').map(s => s.split(',').map(Number)).map(([x, y]) => [x / scale, y / scale]);
  const diag = Math.hypot(SMALL.W, SMALL.H);
  return { err: Math.max(...pts.map((p, k) => Math.hypot(p[0] - SMALL.quad[k][0], p[1] - SMALL.quad[k][1]) / diag * 100)), ratio: q.w / q.h };
}

run(async () => {
  const srv = await startServer();
  const browser = await launch({ camera: false });

  // a HEIC cut in half (a broken download) and a file that only claims to be HEIC
  const heic = fs.readFileSync(fixture('photo-tilted.heic'));
  const broken = path.join(OUT, 'broken.heic');
  fs.writeFileSync(broken, heic.subarray(0, Math.floor(heic.length / 2)));
  const fake = path.join(OUT, 'fake.heic');
  fs.writeFileSync(fake, Buffer.from('this is not an image at all'));

  {
    const ctx = await newContext(browser);
    const requests = [];
    ctx.on('request', r => requests.push(new URL(r.url()).pathname));
    const page = await ctx.newPage(); const log = watch(page, 'formats');
    await page.goto(srv.url);
    await waitReady(page);
    check('file picker offers HEIC/HEIF/WebP explicitly (some systems do not count them as image/*)',
      (await page.getAttribute('#fileInput', 'accept')) === 'image/*,.heic,.heif,.webp');

    // WebP: decoded by the browser, libheif is not loaded
    await page.setInputFiles('#fileInput', fixture('photo-tilted.webp'));
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 1, null, { timeout: 30000 });
    await waitIdle(page);
    const webp = await cropError(page, 1);
    check('WebP photo becomes a page; document edges found (within 1.5% of the diagonal); no HEIC decoder loaded',
      webp.err < 1.5 && !requests.some(p => /libheif|heic-worker/.test(p)), `${webp.err.toFixed(2)}%`);

    // HEIC: libheif in a Web Worker
    const t0 = Date.now();
    await page.setInputFiles('#fileInput', fixture('photo-tilted.heic'));
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 2, null, { timeout: 60000 });
    const heicMs = Date.now() - t0;
    await waitIdle(page);
    const h = await cropError(page, 2);
    check('HEIC photo becomes a page in the right orientation; document edges found (within 1.5% of the diagonal)',
      h.err < 1.5 && Math.abs(h.ratio - 4 / 3) < 0.01, `${h.err.toFixed(2)}%, ${heicMs} ms`);
    const info = await page.evaluate(() => HeicDecoder.info());
    check('HEIC decoded in a Web Worker with the bundled libheif (loaded once, only when needed)',
      info.mode === 'worker' && info.decoded === 1 &&
      requests.filter(p => /vendor\/libheif\/libheif-bundle\.js$/.test(p)).length === 1 && requests.some(p => /js\/heic-worker\.js$/.test(p)),
      JSON.stringify(info) + ' ' + requests.filter(p => /heic|libheif/.test(p)).join(' '));

    // broken and fake HEIC: a message, no page, nothing stuck
    await page.setInputFiles('#fileInput', [broken, fake]);
    await page.waitForFunction(() => [...document.querySelectorAll('.toast')].filter(e => /broken\.heic|fake\.heic/.test(e.textContent)).length === 2, null, { timeout: 60000 });
    const toasts = await page.$$eval('.toast', els => els.map(e => e.textContent));
    check('broken or fake HEIC files are reported and skipped; the app keeps working',
      (await page.$$('.page-item')).length === 2 && toasts.some(s => /broken\.heic/.test(s)) && toasts.some(s => /fake\.heic/.test(s)), toasts.join(' | '));

    // several HEIC/WebP at once
    const second = path.join(OUT, 'second.heic');
    fs.copyFileSync(fixture('photo-tilted.heic'), second);
    await page.setInputFiles('#fileInput', [fixture('photo-tilted.heic'), second, fixture('photo-tilted.webp')]);
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 5, null, { timeout: 90000 });
    await waitIdle(page);

    // PDF with HEIC pages
    const pdf = await exportPdf(page, 'formats.pdf');
    const pages = (pdf.buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check('several HEIC/WebP at once are all added and export to PDF', pages === 5 && pdf.buf.slice(0, 5).toString() === '%PDF-', `pages=${pages}`);
    check('no console errors (decoding and export)', !log.length, log.join('\n'));
    await ctx.close();
  }

  // file:// (double-click open): no Worker from file:// → decoded in the page
  {
    const ctx = await newContext(browser); const page = await ctx.newPage(); const log = watch(page, 'formats-file');
    await page.goto('file://' + path.join(APP, 'index.html'));
    await waitReady(page);
    await page.setInputFiles('#fileInput', fixture('photo-tilted.heic'));
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 1, null, { timeout: 60000 });
    await waitIdle(page);
    const info = await page.evaluate(() => HeicDecoder.info());
    check('file://: HEIC photo opens (decoded in the page)', (await page.$$('.page-item')).length === 1 && info.mode === 'inline' && !log.length,
      JSON.stringify(info) + log.join('\n'));
    await ctx.close();
  }

  await browser.close(); await srv.close();
  t.finish();
});
