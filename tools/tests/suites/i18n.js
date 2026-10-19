'use strict';
/*
 * Languages (js/i18n.js): Thai and English.
 *   - dictionary: every Thai text in the app code and index.html has an English translation, every entry is still
 *     used, placeholders match, English texts contain no Thai
 *   - English browser → the whole UI in English (home, editor, crop, camera, PDF export, OCR, PDF convert, errors)
 *   - Thai browser → Thai; other languages → English; the language button switches and remembers the choice
 */
const vm = require('vm');
const { APP, OUT, fs, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle, OCR_NOISE } = require('../lib/harness');
const t = suite('i18n');
const check = t.check;

const THAI = /[฀-๿]/;
const JS_DIR = path.join(APP, 'js');

// ---------------------------------------------------------------- source scanning

const ESC = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** String literals of a JS file: [{ text, line, start, end }] — skips comments and regex literals */
function literals(src) {
  const out = [];
  let i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1, text = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') {
          const e = src[j + 1];
          if (e === 'u') { text += String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)); j += 6; continue; }
          text += ESC[e] !== undefined ? ESC[e] : e;
          j += 2;
          continue;
        }
        text += src[j++];
      }
      out.push({ text, start: i, end: j + 1, line: src.slice(0, i).split('\n').length });
      i = j + 1;
      prev = c;
      continue;
    }
    if (c === '/' && (/[=(,:!&|?{};[+\-*%<>~^]/.test(prev) || prev === '' || /\breturn\s*$/.test(src.slice(Math.max(0, i - 8), i)))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      i = j + 1;
      prev = '/';
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  // 'a' + 'b' (a long text split over lines) is one text
  const merged = [];
  for (const lit of out) {
    const last = merged[merged.length - 1];
    if (last && /^\s*\+\s*$/.test(src.slice(last.end, lit.start))) { last.text += lit.text; last.end = lit.end; continue; }
    merged.push({ ...lit });
  }
  return merged;
}

/** Thai texts the code shows (or throws): everything except data (thai-text.js), the dictionary itself and console output */
function codeTexts() {
  const texts = [];
  for (const f of fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()) {
    if (f === 'i18n.js' || f === 'thai-text.js') continue;
    const src = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    const lines = src.split('\n');
    for (const lit of literals(src)) {
      if (!THAI.test(lit.text)) continue;
      if (/console\.\w+\(/.test(lines[lit.line - 1])) continue;
      if (f === 'ocr.js' && lit.text === '$1ำ') continue;                           // regex replacement (Thai sara am)
      if (f === 'docx.js' && lit.text.includes('<Application>')) continue;          // file metadata, not shown
      texts.push({ file: f, line: lit.line, text: lit.text });
    }
  }
  return texts;
}

/** js/i18n.js evaluated outside the browser */
function loadI18n(languages, saved) {
  const store = saved ? { lang: saved } : {};
  const sandbox = {
    window: {},
    document: { readyState: 'complete', body: null, addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } },
    navigator: { languages, language: languages[0] },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(JS_DIR, 'i18n.js'), 'utf8'), sandbox);
  return sandbox.window.I18n;
}

const placeholders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

// ---------------------------------------------------------------- browser helpers

/** Thai left in the page: text nodes (visible or not) and labels — the language button is Thai on purpose */
function thaiLeft(page, rootSel = 'body') {
  return page.evaluate(({ sel, re }) => {
    const TH = new RegExp(re);
    const root = document.querySelector(sel);
    const bad = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || el.closest('#btnLang, script, style, noscript')) continue;
      if (TH.test(node.nodeValue)) bad.push(node.nodeValue.trim().slice(0, 80));
    }
    for (const el of root.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
      if (el.closest('#btnLang')) continue;
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
        const v = el.getAttribute(a);
        if (v && TH.test(v)) bad.push(a + '=' + v.slice(0, 80));
      }
    }
    return bad;
  }, { sel: rootSel, re: THAI.source });
}

const text = (page, sel) => page.$eval(sel, el => el.textContent.replace(/\s+/g, ' ').trim());

/** One-page PDF with an English line (Helvetica) */
function helloPdf() {
  const content = 'BT /F1 24 Tf 72 720 Td (Hello PDF) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

run(async () => {
  // ================================================================ dictionary
  const I18n = loadI18n(['en-US']);
  const EN = I18n._dict();
  const keys = Object.keys(EN);
  const code = codeTexts();
  const missing = code.filter(c => !(c.text in EN));
  check('every Thai text in the app code has an English translation', !missing.length,
    missing.map(m => `${m.file}:${m.line} ${m.text}`).join('\n'));

  const srv = await startServer();
  const browser = await launch();

  // Thai texts of index.html as the browser parses it (text nodes, labels, title, description)
  let html = [];
  {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto(srv.origin + '/__fixtures/not-image.txt');
    html = await page.evaluate(async ({ url, re }) => {
      const TH = new RegExp(re);
      const doc = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
      const out = [];
      const norm = s => s.replace(/\s+/g, ' ').trim();
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement.closest('noscript, script, style, [data-i18n-skip]')) continue;
        if (TH.test(node.nodeValue)) out.push(norm(node.nodeValue));
      }
      for (const el of doc.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
        for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
          const v = el.getAttribute(a);
          if (v && TH.test(v)) out.push(norm(v));
        }
      }
      out.push(norm(doc.title), norm(doc.querySelector('meta[name="description"]').content));
      return out;
    }, { url: srv.origin + '/index.html', re: THAI.source });
    await ctx.close();
  }
  const htmlMissing = html.filter(s => !(s in EN));
  check('every Thai text in index.html (text, labels, title, description) has an English translation', html.length > 100 && !htmlMissing.length,
    html.length + ' texts; missing: ' + htmlMissing.join(' | '));

  const used = new Set(code.map(c => c.text).concat(html));
  const unused = keys.filter(k => !used.has(k));
  check('every dictionary entry is used by the code or index.html (no stale translations)', !unused.length, unused.join(' | '));

  const badValues = keys.filter(k => {
    const v = EN[k];
    const forms = Array.isArray(v) ? v : [v];
    if (Array.isArray(v) && v.length !== 2) return true;
    if (forms.some(f => typeof f !== 'string' || !f.trim() || THAI.test(f))) return true;
    const want = placeholders(k).split(',').filter(Boolean);
    const plural = forms[forms.length - 1];
    if (placeholders(plural) !== placeholders(k)) return true;                      // same variables as the Thai text
    return forms.some(f => placeholders(f).split(',').filter(Boolean).some(p => !want.includes(p)));
  });
  check('translations are English only and use exactly the variables of the Thai text', !badValues.length, badValues.join(' | '));

  check('t(): fills variables, picks singular/plural, falls back to the Thai text',
    I18n.t('เพิ่ม {n} หน้าแล้ว', { n: 1 }) === 'Added 1 page' && I18n.t('เพิ่ม {n} หน้าแล้ว', { n: 3 }) === 'Added 3 pages' &&
    I18n.t('ข้าม "{name}" — ไม่ใช่ไฟล์รูปภาพ', { name: '$1 {n}.txt' }) === 'Skipped "$1 {n}.txt" — not an image file' &&
    I18n.t('ไม่มีคำแปล {x}', { x: 5 }) === 'ไม่มีคำแปล 5' && I18n.t('หน้า') === 'pages' && I18n.t('หน้า', { n: 1 }) === 'page');
  check('msg(): translates known error texts (e.g. from a Web Worker), keeps others',
    I18n.msg(new Error('คำสั่งไม่ถูกต้อง')) === 'Invalid command' && I18n.msg('boom') === 'boom' && I18n.msg(null) === '');
  check('language choice: saved choice first, then the browser languages (any Thai → Thai), unknown → Thai',
    loadI18n(['th-TH']).lang === 'th' && loadI18n(['en-GB', 'th']).lang === 'th' && loadI18n(['fr-FR']).lang === 'en' &&
    loadI18n(['thx']).lang === 'en' && loadI18n([]).lang === 'th' && loadI18n(['th-TH'], 'en').lang === 'en' &&
    loadI18n(['en-US'], 'th').lang === 'th' && loadI18n(['en-US'], 'xx').lang === 'en');
  const thI18n = loadI18n(['th-TH']);
  check('Thai: t() returns the Thai text with variables filled', thI18n.t('เพิ่ม {n} หน้าแล้ว', { n: 2 }) === 'เพิ่ม 2 หน้าแล้ว' &&
    thI18n.msg(new Error('คำสั่งไม่ถูกต้อง')) === 'คำสั่งไม่ถูกต้อง');
  const before = Object.keys(EN).length;
  I18n.add({ 'ข้อความของแพลตฟอร์ม': 'Platform text', 'พร้อมใช้งาน': 'OVERRIDE', 'แย่': 5 });
  check('add(): platforms can add translations but not replace or add invalid ones',
    I18n.t('ข้อความของแพลตฟอร์ม') === 'Platform text' && I18n.t('พร้อมใช้งาน') === 'Ready' && Object.keys(EN).length === before + 1);

  // ================================================================ English browser
  {
    const ctx = await newContext(browser, { locale: 'en-US', permissions: ['camera'] });
    const page = await ctx.newPage();
    const log = watch(page, 'en');
    page.on('dialog', d => d.accept());
    await page.goto(srv.url);
    await waitReady(page);
    await page.waitForSelector('#btnLang:not([hidden])');
    check('English browser: page language, title and description in English',
      await page.evaluate(() => document.documentElement.lang === 'en' && document.title === 'Scan Documents to PDF' &&
        /^Turn document photos/.test(document.querySelector('meta[name="description"]').content)));
    check('home screen: no Thai anywhere (text, labels, hidden views and dialogs)', !(await thaiLeft(page)).length, (await thaiLeft(page)).join(' | '));
    check('home texts: buttons, status and version in English',
      (await text(page, '#btnPick')) === 'Choose images' && (await text(page, '#btnCamera')) === 'Take photo' &&
      (await text(page, '#cvStatusText')) === 'Ready' && /^Version /.test(await text(page, '#appVersion')) &&
      /^OpenCV\.js .* · loaded in [\d.]+ s$/.test(await page.getAttribute('#cvStatus', 'title')));
    check('language button offers Thai, written in Thai',
      (await text(page, '#btnLang')) === 'ไทย' && (await page.getAttribute('#btnLang', 'lang')) === 'th' &&
      (await page.getAttribute('#btnLang', 'aria-label')) === 'เปลี่ยนเป็นภาษาไทย');
    await page.screenshot({ path: path.join(OUT, 'i18n-en-home.png') });

    // errors and pages
    await page.setInputFiles('#fileInput', [fixture('not-image.txt')]);
    await page.waitForSelector('.toast.error');
    check('error toast in English', (await text(page, '.toast.error')) === 'Skipped "not-image.txt" — not an image file');
    await page.setInputFiles('#fileInput', [fixture('photo-tilted.jpg')]);
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 1, null, { timeout: 30000 });
    await waitIdle(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.toast.ok')].some(e => e.textContent === 'Added 1 page'));
    check('pages: toast, labels and counts in English (singular)',
      (await page.getAttribute('.page-card', 'aria-label')) === 'Edit page 1' &&
      (await page.getAttribute('.page-item [data-action="delete"]', 'aria-label')) === 'Delete page 1' &&
      (await text(page, '#btnExportCount')) === '(1 page)' && (await text(page, '#pagesTitle')) === 'Pages 1');

    // editor
    await page.click('.page-card');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.click('#edFilters [data-filter="bw"]');
    check('editor: title, controls and notes in English',
      (await text(page, '#editorTitle')) === 'Page 1 / 1' && (await text(page, '#edShadowNote')) === 'B&W mode always removes shadows' &&
      (await text(page, '#edFilters [data-filter="enhance"]')) === 'Vivid color' && !(await thaiLeft(page, '#viewEditor')).length,
      (await thaiLeft(page, '#viewEditor')).join(' | '));
    await page.click('#edFilters [data-filter="enhance"]');

    // crop
    await page.click('#edCrop');
    await page.waitForSelector('#viewCrop:not([hidden])');
    await page.waitForFunction(() => { const p = document.querySelector('.crop-svg .quad'); return p && p.getAttribute('points'); });
    const cropInfo = await page.evaluate(() => [document.getElementById('cropHint').textContent,
      document.querySelector('.crop-svg').getAttribute('aria-label'), document.querySelector('.crop-svg .hit').getAttribute('aria-label')].join(' | '));
    check('crop: hint and screen-reader labels of the frame and handles in English',
      (await text(page, '#cropHint')) === 'Drag the corners or edges to crop freely' &&
      (await page.getAttribute('.crop-svg', 'aria-label')) === 'Crop frame' &&
      (await page.$$eval('.crop-svg .hit', hs => hs.map(h => h.getAttribute('aria-label')))).includes('Top-left corner (drag, or move with the arrow keys)') &&
      !(await thaiLeft(page, '#viewCrop')).length, cropInfo + ' ' + (await thaiLeft(page, '#viewCrop')).join(' | '));
    await page.screenshot({ path: path.join(OUT, 'i18n-en-crop.png') });
    await page.click('#cropCancel');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.click('#edBack');
    await page.waitForSelector('#viewHome:not([hidden])');

    // camera
    await page.click('#btnCamera');
    await page.waitForSelector('#viewCamera:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 15000 });
    check('camera: prompt and page count in English', /^(Fit the document in the frame, then take the photo|Document found — take the photo)$/.test(await text(page, '#camMsg')) &&
      (await text(page, '.cam-count')) === '0 pages');
    await page.click('#camShutter');
    await page.waitForFunction(() => document.getElementById('camCount').textContent === '1', null, { timeout: 15000 });
    // the live edge detection may already have replaced the "taken" message
    const camMsg = await text(page, '#camMsg');
    check('camera: after one photo — singular', (await text(page, '.cam-count')) === '1 page' &&
      /^(1 page taken — keep going or press "Done"|Fit the document in the frame, then take the photo|Document found — take the photo)$/.test(camMsg), camMsg);
    await page.click('#camDone');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });
    await page.waitForFunction(() => [...document.querySelectorAll('.toast.ok')].some(e => e.textContent === 'Added 1 page from the camera'));
    await waitIdle(page);
    check('camera page named in English, count plural', (await text(page, '#btnExportCount')) === '(2 pages)');

    // PDF export
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    check('export dialog in English', (await text(page, '#exportTitle')) === 'Create PDF file' &&
      (await page.$eval('#exPageSize', s => s.options[s.selectedIndex].text)) === 'A4 (210×297 mm)' &&
      !(await thaiLeft(page, '#exportDialog')).length, (await thaiLeft(page, '#exportDialog')).join(' | '));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#exDownload')]);
    await page.waitForSelector('#exResult:not([hidden])');
    const result = await text(page, '#exResult');
    check('export result in English', /^Created ".+\.pdf" — 2 pages, [\d.]+ (KB|MB)$/.test(result) && /\.pdf$/.test(dl.suggestedFilename()), result);
    await page.click('#exCancel');

    // OCR dialog (only the texts — the OCR suite reads the text)
    await page.click('#btnOcrAll');
    await page.waitForSelector('#ocrDialog[open]');
    check('OCR dialog in English', (await text(page, '#ocrScope')) === 'All pages (2 pages)' &&
      (await page.$eval('#ocrLang', s => s.options[s.selectedIndex].text)) === 'Thai + English' &&
      !(await thaiLeft(page, '#ocrDialog')).length, (await thaiLeft(page, '#ocrDialog')).join(' | '));
    await page.click('#ocrClose');

    // PDF → JPG
    const pdfFile = path.join(OUT, 'i18n-hello.pdf');
    fs.writeFileSync(pdfFile, helloPdf());
    await page.setInputFiles('#pdfInput', pdfFile);
    await page.waitForSelector('#pdfDialog[open]');
    await page.waitForFunction(() => !document.getElementById('pdfConvert').disabled, null, { timeout: 60000 });
    check('PDF dialog: file info and note in English', /^i18n-hello\.pdf — 1 page, [\d.]+ (B|KB)$/.test(await text(page, '#pdfFileInfo')) &&
      /^Each page becomes a JPG image/.test(await text(page, '#pdfNote')) && (await text(page, '#pdfConvertText')) === 'Convert to JPG' &&
      !(await thaiLeft(page, '#pdfDialog')).length, (await text(page, '#pdfFileInfo')) + ' ' + (await thaiLeft(page, '#pdfDialog')).join(' | '));
    await page.fill('#pdfPages', '3');
    await page.click('#pdfConvert');
    check('PDF dialog: page-range error in English (singular page count)', (await text(page, '#pdfResult')) === 'This file has 1 page — there is no page "3"');
    await page.fill('#pdfPages', '');
    await page.click('#pdfFormats [data-format="docx"]');
    check('PDF dialog: Word options in English', (await text(page, '#pdfConvertText')) === 'Convert to Word' &&
      /^The text \(Thai included\)/.test(await text(page, '#pdfNote')) && !(await thaiLeft(page, '#pdfDialog')).length);
    await page.click('#pdfFormats [data-format="jpg"]');
    const [jpg] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#pdfConvert')]);
    await page.waitForSelector('#pdfResult:not([hidden])');
    const pdfResult = await text(page, '#pdfResult');
    check('PDF → JPG result in English', /^Created "i18n-hello\.jpg" — 1 image \(150 dpi\), [\d.]+ KB$/.test(pdfResult) && jpg.suggestedFilename() === 'i18n-hello.jpg', pdfResult);
    await page.click('#pdfCancel');
    await page.waitForFunction(() => !document.getElementById('pdfDialog').open);

    // switch to Thai and back
    await page.click('#btnLang');
    check('switch to Thai: page, status, pages, counts and version re-rendered in Thai',
      await page.evaluate(() => document.documentElement.lang === 'th' && localStorage.getItem('lang') === 'th') &&
      (await text(page, '#btnPick')) === 'เลือกรูปภาพ' && (await text(page, '#cvStatusText')) === 'พร้อมใช้งาน' &&
      (await page.getAttribute('.page-card', 'aria-label')) === 'แก้ไขหน้า 1' && (await text(page, '#btnExportCount')) === '(2 หน้า)' &&
      /^เวอร์ชัน /.test(await text(page, '#appVersion')) && (await text(page, '#btnLang')) === 'EN' &&
      (await page.evaluate(() => document.title)) === 'สแกนเอกสารเป็น PDF');
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    check('Thai after switching: texts that the code had set in English are Thai again (close button, dialog)',
      (await text(page, '#exCancel')) === 'ปิด' && (await text(page, '#exportTitle')) === 'สร้างไฟล์ PDF');
    await page.click('#exCancel');
    await page.screenshot({ path: path.join(OUT, 'i18n-th-home.png') });
    await page.click('#btnLang');
    check('switch back to English: nothing Thai left', !(await thaiLeft(page)).length &&
      (await text(page, '#btnExportCount')) === '(2 pages)', (await thaiLeft(page)).join(' | '));
    await page.click('#btnLang'); // Thai again → remembered after reload
    await page.reload();
    await waitReady(page);
    check('the chosen language is remembered (Thai on an English browser after reload)',
      await page.evaluate(() => document.documentElement.lang === 'th' && I18n.lang === 'th') && (await text(page, '#btnPick')) === 'เลือกรูปภาพ');
    const csp = await page.evaluate(() => window.__csp);
    const errors = log.filter(l => !OCR_NOISE.test(l)); // the OCR dialog starts Tesseract, which warns about its parameters
    check('English run: no console errors, no CSP violations', !errors.length && !csp.length, errors.concat(csp).join('\n'));
    await ctx.close();
  }

  // ================================================================ other browser languages
  for (const [locale, want] of [['th-TH', 'th'], ['fr-FR', 'en']]) {
    const ctx = await newContext(browser, { locale });
    const page = await ctx.newPage();
    const log = watch(page, locale);
    await page.goto(srv.url);
    await waitReady(page);
    await page.waitForSelector('#btnLang:not([hidden])');
    const lang = await page.evaluate(() => document.documentElement.lang);
    const left = await thaiLeft(page);
    check(`${locale} browser → ${want === 'th' ? 'Thai' : 'English'} UI`, lang === want &&
      (want === 'th' ? (await text(page, '#btnPick')) === 'เลือกรูปภาพ' && (await text(page, '#btnLang')) === 'EN' : !left.length) && !log.length,
      lang + ' ' + left.join(' | ') + log.join('\n'));
    await ctx.close();
  }

  // ================================================================ file:// (double-click open) in English
  {
    const ctx = await newContext(browser, { locale: 'en-US' });
    const page = await ctx.newPage();
    const log = watch(page, 'file');
    await page.goto('file://' + path.join(APP, 'index.html'));
    await waitReady(page);
    check('file:// in English: UI translated, no errors', !(await thaiLeft(page)).length && !log.length, log.join('\n'));
    await ctx.close();
  }

  await browser.close();
  await srv.close();
  t.finish();
});
