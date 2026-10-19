'use strict';
/*
 * Screen sizes the app must support — small phones to 10" tablets, portrait/landscape and split screen.
 * For each size: home (3 pages), editor, crop, export dialog and in-app camera must fit the width (no sideways
 * scrolling), keep the main controls on screen and large enough to tap, and use the space of large screens.
 * Screenshots: tools/tests/out/screens/<size>-<view>.png
 */
const { fs, path, OUT, launch, newAppContext, openApp, suite, run, fixture, waitReady, waitIdle } = require('../lib/harness');

const t = suite('screens (phones → tablets)');
const SIZES = [
  { name: 'phone-small', width: 320, height: 568 },
  { name: 'phone', width: 360, height: 780 },
  { name: 'phone-large', width: 412, height: 915 },
  { name: 'phone-landscape', width: 780, height: 360 },
  { name: 'phone-small-landscape', width: 640, height: 360 },
  { name: 'split-half', width: 400, height: 900, tablet: false },
  { name: 'tablet-7-portrait', width: 600, height: 960, tablet: true },
  { name: 'foldable-open', width: 673, height: 841, tablet: true },
  { name: 'tablet-10-portrait', width: 800, height: 1280, tablet: true },
  { name: 'tablet-10-landscape', width: 1280, height: 800, tablet: true },
  { name: 'tablet-12-landscape', width: 1366, height: 1024, tablet: true }
];
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

/** Layout facts of the current view, measured in the page */
function measure(page, selectors) {
  return page.evaluate(sels => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const out = { vw, vh, overflowX: document.documentElement.scrollWidth - vw, items: {} };
    for (const s of sels) {
      const e = document.querySelector(s);
      if (!e) { out.items[s] = null; continue; }
      const r = e.getBoundingClientRect();
      out.items[s] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' };
    }
    return out;
  }, selectors);
}
const inX = (m, it) => it && it.x >= -1 && it.x + it.w <= m.vw + 1;
const onScreen = (m, it) => it && it.visible && inX(m, it) && it.y >= -1 && it.y + it.h <= m.vh + 1;
const tappable = it => it && it.h >= 36 && it.w >= 36;

run(async () => {
  const browser = await launch();
  for (const size of SIZES) {
    const ctx = await newAppContext(browser, { viewport: { width: size.width, height: size.height }, permissions: ['camera'] });
    const { page, log } = await openApp(ctx, size.name);
    await waitReady(page);
    const problems = [];
    const shot = view => page.screenshot({ path: path.join(SHOTS, `${size.name}-${view}.png`) });

    // ---- home with pages ----
    await page.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg', 'photo-lightbg.jpg'].map(fixture));
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 3, null, { timeout: 60000 });
    await waitIdle(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    let m = await measure(page, ['#btnCamera', '#btnPick', '#btnExport', '#btnOcrAll', '.page-item', '.page-grid']);
    if (m.overflowX > 1) problems.push(`home: sideways scroll ${m.overflowX}px`);
    for (const s of ['#btnCamera', '#btnPick']) if (!inX(m, m.items[s]) || !tappable(m.items[s])) problems.push(`home: ${s} ${JSON.stringify(m.items[s])}`);
    for (const s of ['#btnExport', '#btnOcrAll']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`home: ${s} not on screen ${JSON.stringify(m.items[s])}`);
    const cols = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.page-item')].map(e => Math.round(e.getBoundingClientRect().top));
      return items.filter(y => y === items[0]).length;
    });
    if (size.tablet && cols < 3) problems.push(`home: tablet shows only ${cols} page(s) per row`);
    await shot('home');

    // ---- editor ----
    await page.click('.page-item:nth-child(1) .page-card');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('edBusy') || document.getElementById('edBusy').hidden, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    m = await measure(page, ['#edPreview', '#edBack', '#edCrop', '#edOcr', '#edFilters', '#edBrightness', '#edNext', '.panel']);
    if (m.overflowX > 1) problems.push(`editor: sideways scroll ${m.overflowX}px`);
    for (const s of ['#edBack', '#edNext']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`editor: ${s} ${JSON.stringify(m.items[s])}`);
    const pv = m.items['#edPreview'];
    if (!pv || !pv.visible || !inX(m, pv) || pv.h < Math.min(200, m.vh * 0.35)) problems.push(`editor: preview too small/off screen ${JSON.stringify(pv)}`);
    for (const s of ['#edCrop', '#edOcr', '#edFilters', '#edBrightness']) if (!inX(m, m.items[s])) problems.push(`editor: ${s} cut off ${JSON.stringify(m.items[s])}`);
    const shortLandscape = m.vw > m.vh && m.vw >= 560 && m.vh <= 560;
    if (m.vw >= 900 || shortLandscape) {
      const panel = m.items['.panel'];
      if (!(panel && pv && panel.x >= pv.x + pv.w - 1)) problems.push('editor: wide screen should show preview and controls side by side');
    }
    await shot('editor');

    // ---- crop ----
    await page.click('#edCrop');
    await page.waitForSelector('#viewCrop:not([hidden])');
    await page.waitForTimeout(400);
    m = await measure(page, ['#cropStage', '#cropOk', '#cropCancel', '#cropAuto', '#cropFull']);
    if (m.overflowX > 1) problems.push(`crop: sideways scroll ${m.overflowX}px`);
    for (const s of ['#cropOk', '#cropCancel', '#cropAuto', '#cropFull']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`crop: ${s} ${JSON.stringify(m.items[s])}`);
    const st = m.items['#cropStage'];
    if (!st || !onScreen(m, st) || st.h < m.vh * 0.3) problems.push(`crop: stage ${JSON.stringify(st)}`);
    if (shortLandscape) {
      const auto = m.items['#cropAuto'];
      if (!(auto && st && auto.x >= st.x + st.w - 1)) problems.push('crop: landscape phone should show the tools beside the image');
      if (st && st.h < m.vh * 0.6) problems.push(`crop: landscape phone image area too low (${st.h}px of ${m.vh}px)`);
    }
    await shot('crop');
    await page.click('#cropCancel');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.click('#edBack');
    await page.waitForSelector('#viewEditor', { state: 'hidden' });

    // ---- export dialog ----
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    await page.waitForTimeout(300);
    m = await measure(page, ['#exportDialog', '#exFilename', '#exDownload', '#exCancel']);
    const dlg = m.items['#exportDialog'];
    if (!dlg || !inX(m, dlg) || dlg.h > m.vh + 1) problems.push(`export: dialog does not fit ${JSON.stringify(dlg)} in ${m.vw}x${m.vh}`);
    await page.$eval('#exDownload', e => e.scrollIntoView({ block: 'nearest' }));
    m = await measure(page, ['#exDownload', '#exCancel', '#exFilename']);
    for (const s of ['#exDownload', '#exCancel']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`export: ${s} not reachable ${JSON.stringify(m.items[s])}`);
    if (!inX(m, m.items['#exFilename'])) problems.push('export: file name field cut off');
    await shot('export');
    await page.click('#exCancel');

    // ---- PDF convert dialog (Word options: the longest form) ----
    await page.setInputFiles('#pdfInput', path.join(__dirname, '../../../doc-scanner-pdf-android/app/src/androidTest/assets/thai.pdf'));
    await page.waitForSelector('#pdfDialog[open]');
    await page.waitForFunction(() => !document.getElementById('pdfConvert').disabled, null, { timeout: 60000 });
    await page.click('#pdfFormats .chip[data-format="docx"]');
    await page.waitForTimeout(300);
    m = await measure(page, ['#pdfDialog', '#btnPdfTools']);
    const pdlg = m.items['#pdfDialog'];
    if (!pdlg || !inX(m, pdlg) || pdlg.h > m.vh + 1) problems.push(`pdf: dialog does not fit ${JSON.stringify(pdlg)} in ${m.vw}x${m.vh}`);
    await page.$eval('#pdfConvert', e => e.scrollIntoView({ block: 'nearest' }));
    m = await measure(page, ['#pdfConvert', '#pdfCancel', '#pdfPages', '#pdfMode']);
    for (const s of ['#pdfConvert', '#pdfCancel']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`pdf: ${s} not reachable ${JSON.stringify(m.items[s])}`);
    for (const s of ['#pdfPages', '#pdfMode']) if (!inX(m, m.items[s])) problems.push(`pdf: ${s} cut off`);
    await shot('pdf-convert');
    await page.click('#pdfCancel');

    // ---- in-app camera ----
    await page.click('#btnCamera');
    await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 20000 });
    m = await measure(page, ['#camShutter', '#camDone', '#camClose', '#camVideo']);
    for (const s of ['#camShutter', '#camDone', '#camClose']) if (!onScreen(m, m.items[s]) || !tappable(m.items[s])) problems.push(`camera: ${s} ${JSON.stringify(m.items[s])}`);
    if (m.overflowX > 1) problems.push(`camera: sideways scroll ${m.overflowX}px`);
    await shot('camera');
    await page.click('#camClose');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });

    t.check(`${size.name} ${size.width}×${size.height}: home, editor, crop, export, PDF convert and camera fit and are usable` + (size.tablet ? ` (${cols} pages per row)` : ''),
      !problems.length && !log.length, problems.concat(log).join(' | '));
    await ctx.close();
  }
  await browser.close();
  t.finish();
});
