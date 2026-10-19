'use strict';
/*
 * PDF → JPG / Word (js/pdf-tools.js, js/pdf-convert.js, PDF.js in vendor/pdfjs):
 *   - Thai text in Word is exactly the text of the PDF (Chrome-made PDFs: embedded web font and a system Thai font
 *     whose tone marks are stored as PUA code points; a legacy TIS-620 font without ToUnicode; a rotated page)
 *   - lines, paragraphs, columns (tabs), headings, page breaks; scanned pages read by OCR and reported
 *   - JPG presets small/standard/high (96/150/300 dpi), single page .jpg, several pages .zip, page ranges
 *   - passwords, broken/non-PDF files, file names, drag and drop, cancel, races, load failure, file://
 */
const zlib = require('zlib');
const { APP, OUT, fs, path, startServer, launch, newContext, watch, suite, run, fixture, OCR_NOISE, ocrAccuracy } = require('../lib/harness');
const t = suite('pdf-convert');
const check = t.check;

// ---------------------------------------------------------------- helpers

/** Minimal PDF writer: objs[i] is the body of object i+1 (latin1 string); object 1 is the catalog */
function buildPdf(objs) {
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const stream = s => `<< /Length ${Buffer.byteLength(s, 'latin1')} >>\nstream\n${s}\nendstream`;
function simplePdf({ content, rotate = 0, media = '0 0 595 842', encoding = '/WinAnsiEncoding', resources = '', filter = '' }) {
  const data = filter === 'hex' ? Buffer.from(content, 'latin1').toString('hex') + '>' : content;
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${media}] /Rotate ${rotate} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> ${resources} >> >>`,
    filter === 'hex' ? stream(data).replace('<< /Length', '<< /Filter /ASCIIHexDecode /Length') : stream(data),
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${encoding} >>`
  ]);
}
/** Thai → TIS-620 bytes as a PDF literal string (legacy Thai fonts without ToUnicode) */
const tis620 = s => '(' + [...s].map(c => {
  const k = c.codePointAt(0);
  const b = k >= 0x0E01 && k <= 0x0E5B ? k - 0x0E00 + 0xA0 : k;
  return b > 0x7E || b < 0x20 || c === '(' || c === ')' || c === '\\' ? '\\' + b.toString(8).padStart(3, '0') : c;
}).join('') + ')';

function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end of central directory');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42), flags = buf.readUInt16LE(p + 8);
    const name = buf.slice(p + 46, p + 46 + nlen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (data.length !== size || zlib.crc32(data) !== crc) throw new Error('bad data/CRC in ' + name);
    files[name] = data;
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xFF) return null;
    const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (m >= 0xC0 && m <= 0xC2) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
    p += 2 + len;
  }
  return null;
}

const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** word/document.xml → pages → paragraphs { text, size } (text: lines joined with \n, tabs as \t) */
function docxPages(xml) {
  const pages = [[]];
  for (const m of xml.matchAll(/<w:p>(.*?)<\/w:p>|<w:p\/>/g)) {
    const p = m[1] || '';
    if (p.includes('<w:br w:type="page"/>')) { pages.push([]); continue; }
    const size = (p.match(/<w:sz w:val="(\d+)"\/>/) || [])[1];
    const text = unxml(p.replace(/<w:br\/>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, ''));
    if (text || m[1] !== undefined) pages[pages.length - 1].push({ text, size: size ? Number(size) / 2 : 0 });
  }
  return pages;
}

run(async () => {
  const srv = await startServer();
  const b = await launch({ camera: false });
  const ctx = await newContext(b);

  // ---------------------------------------------------------------- test PDFs made by Chrome
  const HEAD = 'การประชุมคณะกรรมการ ครั้งที่ ๑/๒๕๖๙';
  const LINES = [
    'น้ำ ที่ กำลัง ผู้ใหญ่ ปฏิบัติ ฤๅษี ฦๅ ญาติ ฐาน กฎหมาย',
    'บัญชี ศูนย์ ก็ จ๊ะ ป๋า ธุรกิจ ๆ ฯลฯ สำนักงาน ทำงาน',
    'คำสั่ง ปั้น กั๊ก ซ้ำ ต่ำ ล้ำ ปู่ ญู ฐุ ฎุ ฏู ฤทธิ์ พระราชบัญญัติ'
  ];
  const MIXED = 'English: Hello World 2026, e-mail: test@example.com (ราคา 1,250.50 บาท)';
  const COLS = ['ลำดับ', 'รายการ', 'จำนวนเงิน'];
  const LONG = ('ระบบสารสนเทศเพื่อการบริหารจัดการทรัพยากรบุคคลของหน่วยงานภาครัฐ ช่วยให้การปฏิบัติงานมีประสิทธิภาพมากขึ้น ' +
    'ลดขั้นตอนที่ซ้ำซ้อน และทำให้ผู้บริหารสามารถติดตามผลการดำเนินงานได้อย่างใกล้ชิด ').repeat(3).trim();
  const LAST = 'หน้าสุดท้าย น้ำใจ';

  const maker = await ctx.newPage();
  await maker.goto(srv.origin + '/__fixtures/pdf-check.html'); // same origin as the font, no CSP of the app
  async function chromePdf(name, fontCss, withScan) {
    await maker.setContent(`<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
      @font-face { font-family: Web; src: url(${srv.origin}/vendor/fonts/Sarabun-Regular.ttf); }
      body { font-family: ${fontCss}; font-size: 16pt; margin: 0; }
      .pg { padding: 2cm; page-break-after: always; } p { margin: 0 0 14pt; white-space: nowrap; } .wrap { white-space: normal; }
      h1 { font-size: 26pt; font-weight: normal; margin: 0 0 18pt; } .row span { display: inline-block; width: 5cm; }
      img { width: 15cm; display: block; } /* whole scan on one page */
    </style></head><body>
      <div class="pg"><h1>${HEAD}</h1><p>${LINES.join('<br>')}</p><p>${MIXED}</p>
        <div class="row">${COLS.map(c => `<span>${c}</span>`).join('')}</div></div>
      ${withScan ? `<div class="pg"><img src="${srv.origin}/__fixtures/scan-flat.jpg"></div>` : ''}
      <div class="pg"><p class="wrap">${LONG}</p><p>${LAST}</p></div>
    </body></html>`, { waitUntil: 'networkidle' });
    const fontOk = await maker.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(f => f.family === 'Web' && f.status === 'loaded'); });
    const file = path.join(OUT, name);
    fs.writeFileSync(file, await maker.pdf({ format: 'A4' }));
    return { file, fontOk };
  }
  const webPdf = await chromePdf('pdfc-web-font.pdf', 'Web', true);
  const sysPdf = await chromePdf('pdfc-system-font.pdf', "'Loma', 'Garuda', 'Norasi', sans-serif", false);
  await maker.close();

  const page = await ctx.newPage(); const log = watch(page, 'pdf-convert');
  await page.goto(srv.url);
  await page.waitForFunction(() => window.PdfConvert && window.PdfTools && document.getElementById('btnPdfTools'));

  const waitOpened = () => page.waitForFunction(() => {
    const busy = !document.getElementById('pdfProgressWrap').hidden;
    return !busy && (!document.getElementById('pdfConvert').disabled || !document.getElementById('pdfResult').hidden);
  }, null, { timeout: 60000 });
  const waitDone = (timeout = 240000) => page.waitForFunction(() => document.getElementById('pdfProgressWrap').hidden &&
    !document.getElementById('pdfResult').hidden, null, { timeout });
  const result = () => page.textContent('#pdfResult');
  async function openPdf(file) {
    await page.setInputFiles('#pdfInput', file);
    await page.waitForSelector('#pdfDialog[open]');
    await waitOpened();
  }
  async function convert(outName, timeout = 240000) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), page.click('#pdfConvert')]);
    await waitDone(timeout);
    const file = path.join(OUT, outName || dl.suggestedFilename());
    await dl.saveAs(file);
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(file), result: await result() };
  }
  async function setFormat(f) { await page.click(`#pdfFormats .chip[data-format="${f}"]`); }
  async function docxOf(res) {
    const files = readZip(res.buf);
    const xml = files['word/document.xml'].toString('utf8');
    const wellFormed = await page.evaluate(xs => xs.every(x => !new DOMParser().parseFromString(x, 'application/xml').querySelector('parsererror')),
      Object.keys(files).filter(n => /\.(xml|rels)$/.test(n)).map(n => files[n].toString('utf8')));
    return { files, xml, pages: docxPages(xml), wellFormed, styles: files['word/styles.xml'].toString('utf8') };
  }

  // ---------------------------------------------------------------- UI
  check('home has "แปลงไฟล์ PDF" button; picker accepts PDF only', await page.isVisible('#btnPdfTools') &&
    (await page.getAttribute('#pdfInput', 'accept')) === 'application/pdf,.pdf');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('#btnPdfTools')]);
  check('button opens the file picker for one PDF', !chooser.isMultiple());
  await chooser.setFiles(webPdf.file);
  await page.waitForSelector('#pdfDialog[open]');
  await waitOpened();
  const info = await page.textContent('#pdfFileInfo');
  check('dialog shows the file name and page count', /pdfc-web-font\.pdf — 3 หน้า/.test(info), info);
  check('test PDF uses the embedded web font (Sarabun)', webPdf.fontOk);
  await page.screenshot({ path: path.join(OUT, 'pdfc-01-dialog.png') });

  // ---------------------------------------------------------------- Word: exact Thai
  await setFormat('docx');
  check('Word options: text source, font and OCR language; JPG size hidden',
    await page.isVisible('#pdfModeField') && await page.isVisible('#pdfFontField') && await page.isVisible('#pdfLangField') &&
    await page.isHidden('#pdfQualityField') && (await page.textContent('#pdfConvertText')) === 'แปลงเป็น Word');
  let t0 = Date.now();
  const w1 = await convert('pdfc-web-font.docx');
  const d1 = await docxOf(w1);
  check('Word file: name .docx, valid ZIP, every XML part well-formed, Thai language and TH Sarabun New 16 pt',
    w1.name === 'pdfc-web-font.docx' && d1.wellFormed && /<w:lang w:val="th-TH"/.test(d1.styles) &&
    /w:cs="TH Sarabun New"/.test(d1.styles) && /<w:szCs w:val="32"\/>/.test(d1.styles), w1.name + ' ' + (Date.now() - t0) + ' ms');
  const p1 = d1.pages[0];
  check('page 1: heading, lines, mixed Thai/English and columns are exactly the PDF text',
    p1.length === 4 && p1[0].text === HEAD && p1[1].text === LINES.join('\n') && p1[2].text === MIXED && p1[3].text === COLS.join('\t'),
    JSON.stringify(p1.map(p => p.text)));
  check('heading is larger than body text in Word', p1[0].size > 16 && !p1[1].size, 'heading ' + p1[0].size + ' pt');
  const p3 = d1.pages[2];
  const flat = s => s.replace(/\s+/g, '');
  check('wrapped paragraph: every line is exact original text, no characters lost/added/reordered',
    p3.length === 2 && p3[0].text.split('\n').length >= 3 && p3[0].text.split('\n').every(l => LONG.includes(l)) &&
    flat(p3[0].text) === flat(LONG) && p3[1].text === LAST, p3.map(p => JSON.stringify(p.text.slice(0, 60))).join(' | '));
  const ocrText = d1.pages[1].map(p => p.text).join('\n');
  const acc = ocrAccuracy(ocrText);
  check('scanned page read by OCR (≥ 90% accuracy) and kept as its own page', d1.pages.length === 3 && acc >= 90, acc.toFixed(1) + '%');
  check('result reports exact text pages and asks to proof-read the OCR page',
    /หน้า 1, 3: ข้อความตรงตามต้นฉบับ/.test(w1.result) && /หน้า 2 เป็นภาพสแกน อ่านด้วย OCR — กรุณาตรวจทาน/.test(w1.result) &&
    await page.evaluate(() => document.getElementById('pdfResult').classList.contains('error')), w1.result);
  await page.screenshot({ path: path.join(OUT, 'pdfc-02-word.png') });

  // system Thai font: Chrome writes lowered/shifted tone marks as PUA code points (U+F70A…) — must come out standard
  await openPdf(sysPdf.file);
  const w2 = await convert('pdfc-system-font.docx');
  const d2 = await docxOf(w2);
  const all2 = d2.pages.flat().map(p => p.text).join('\n');
  check('system Thai font (PUA tone marks, Type3): Word text exactly the original, no PUA left',
    d2.pages[0][0].text === HEAD && d2.pages[0][1].text === LINES.join('\n') && d2.pages[0][2].text === MIXED &&
    flat(d2.pages[1][0].text) === flat(LONG) && d2.pages[1][1].text === LAST && !/[-]/.test(all2),
    JSON.stringify(d2.pages.flat().map(p => p.text.slice(0, 40))));
  check('all pages exact → success message without warning', /ข้อความตรงตามต้นฉบับในไฟล์ PDF ทุกหน้า/.test(w2.result) &&
    !(await page.evaluate(() => document.getElementById('pdfResult').classList.contains('error'))), w2.result);

  // text only: the scanned page is reported empty
  await openPdf(webPdf.file);
  await page.selectOption('#pdfMode', 'text');
  check('"text only" hides the OCR language', await page.isHidden('#pdfLangField'));
  await page.selectOption('#pdfFont', 'tahoma');
  const w3 = await convert('pdfc-text-only.docx');
  const d3 = await docxOf(w3);
  check('"text only": scanned page left empty and reported; Tahoma 11 pt',
    d3.pages.length === 3 && !d3.pages[1].some(p => p.text) && /หน้า 2 ไม่มีข้อความ \(เป็นภาพ — เลือกอ่านด้วย OCR\)/.test(w3.result) &&
    /w:cs="Tahoma"/.test(d3.styles) && /<w:sz w:val="22"\/>/.test(d3.styles), w3.result);
  await page.selectOption('#pdfMode', 'auto');
  await page.selectOption('#pdfFont', 'sarabun');

  // legacy Thai font without ToUnicode (TIS-620 bytes read as Latin-1), rotated page, standard fonts
  const LEGACY = ['ผู้ใหญ่บ้าน บัญชี ญาติ', 'การประชุม วันที่ 12 น้ำประปา'];
  const legacyPdf = path.join(OUT, 'pdfc-legacy.pdf');
  fs.writeFileSync(legacyPdf, simplePdf({ content: `BT /F1 20 Tf 72 760 Td ${tis620(LEGACY[0])} Tj 0 -30 Td ${tis620(LEGACY[1])} Tj 0 -30 Td (Cafe \\351t\\351 \\260C \\2615) Tj ET` }));
  await openPdf(legacyPdf);
  const w4 = await convert('pdfc-legacy.docx');
  const d4 = await docxOf(w4);
  check('legacy TIS-620 Thai font: text recovered as correct Thai; Latin-1 text untouched',
    d4.pages[0].length === 1 && d4.pages[0][0].text === LEGACY.join('\n') + '\nCafe été °C ±5', JSON.stringify(d4.pages[0]));
  // /ActualText: inline and named (/Properties) span dictionaries replace the drawn glyphs; nested spans use the outer one
  const SPANS = 'BT /F1 20 Tf 72 760 Td (Before ) Tj /Span <</ActualText <FEFF0E170E350E480E1B0E230E30> >> BDC (xx) Tj EMC ( after) Tj ' +
    '0 -30 Td /Span /MC0 BDC (yy) Tj /Span <</ActualText (inner)>> BDC (zz) Tj EMC EMC ( end) Tj ' +
    '0 -30 Td /P <</MCID 0>> BDC (Tagged paragraph) Tj EMC ET';
  const spanRes = '/Properties << /MC0 << /ActualText (Named\\051) >> >>';
  const atPdf = path.join(OUT, 'pdfc-actualtext.pdf');
  fs.writeFileSync(atPdf, simplePdf({ content: SPANS, resources: spanRes }));
  await openPdf(atPdf);
  const w6 = await convert('pdfc-actualtext.docx');
  const d6 = await docxOf(w6);
  check('/ActualText replaces the drawn glyphs (inline, named, nested → outer); other marked content untouched',
    d6.pages[0].length === 1 && d6.pages[0][0].text === 'Before ที่ประ after\nNamed) end\nTagged paragraph' &&
    /ตรงตามต้นฉบับ/.test(w6.result), JSON.stringify(d6.pages[0]) + ' ' + w6.result);
  // the same page with a content stream this reader cannot decode: text as drawn, page flagged for proof-reading
  const atHex = path.join(OUT, 'pdfc-actualtext-hex.pdf');
  fs.writeFileSync(atHex, simplePdf({ content: SPANS, resources: spanRes, filter: 'hex' }));
  await openPdf(atHex);
  const w7 = await convert('pdfc-actualtext-hex.docx');
  const d7 = await docxOf(w7);
  check('/ActualText cannot be read → drawn text kept and the page is flagged "ข้อความอาจไม่ครบ"',
    /^Before xx after/.test(d7.pages[0][0].text) && /หน้า 1 ฟอนต์ในไฟล์ไม่บอกรหัสตัวอักษรบางตัว ข้อความอาจไม่ครบ/.test(w7.result), w7.result);
  const thai = await page.evaluate(() => [
    ThaiText.normalize('น\uF70Bำ ก\u0E48\u0E31ง ท\u0E35\u0E48 ก\u0E4D\u0E32 น\u0E49\u0E4D\u0E32 ผ\u0E39\uF70B \uF700าน ก\u200Bา'),
    ThaiText.fixLegacy('Ãº¡Ç¹ ¢Í¤ÇÒÁ'), ThaiText.fixLegacy('Crème brûlée à la carte')
  ]);
  check('Thai normalization: PUA marks, tone/vowel order, sara am, ฐ without tail, invisible characters',
    thai[0] === 'น้ำ กั่ง ที่ กำ น้ำ ผู้ ฐาน กา' && thai[1] === 'รบกวน ขอความ' && thai[2] === 'Crème brûlée à la carte', JSON.stringify(thai));
  // paragraphs: lines 1.2 and 1.7 em apart stay one paragraph; lines 2.1 em apart (one-line paragraphs) are separate, even when
  // every gap is equal
  const paraPdf = path.join(OUT, 'pdfc-paragraphs.pdf');
  fs.writeFileSync(paraPdf, simplePdf({ content: 'BT /F1 16 Tf 72 760 Td (Line one) Tj 0 -19 Td (Line two) Tj 0 -27 Td (Line three) Tj ET ' +
    'BT /F1 16 Tf 72 500 Td (Alone A) Tj 0 -34 Td (Alone B) Tj 0 -34 Td (Alone C) Tj ET' }));
  await openPdf(paraPdf);
  const wp = await docxOf(await convert('pdfc-paragraphs.docx'));
  check('paragraphs: close lines stay together, widely spaced lines become separate paragraphs',
    JSON.stringify(wp.pages[0].map(p => p.text)) === JSON.stringify(['Line one\nLine two\nLine three', 'Alone A', 'Alone B', 'Alone C']),
    JSON.stringify(wp.pages[0].map(p => p.text)));
  const rotPdf = path.join(OUT, 'pdfc-rotated.pdf');
  fs.writeFileSync(rotPdf, simplePdf({ rotate: 90, content: 'BT /F1 24 Tf 72 700 Td (Hello rotated page) Tj 0 -32 Td (Second line) Tj 0 -32 Td (Third) Tj 300 0 Td (Column) Tj ET' }));
  await openPdf(rotPdf);
  const w5 = await convert('pdfc-rotated.docx');
  const d5 = await docxOf(w5);
  check('rotated page (/Rotate 90): lines and columns in reading order',
    d5.pages[0].length === 1 && d5.pages[0][0].text === 'Hello rotated page\nSecond line\nThird\tColumn', JSON.stringify(d5.pages[0]));

  // ---------------------------------------------------------------- JPG
  await openPdf(webPdf.file);
  await setFormat('jpg');
  check('JPG options: Small/Standard/High; Word options hidden', await page.isVisible('#pdfQualityField') && await page.isHidden('#pdfModeField') &&
    (await page.$$eval('#pdfQuality option', os => os.map(o => o.value).join())) === 'small,standard,high');
  const A4 = [595.92, 842.88];
  const sizes = {};
  for (const [preset, dpi] of [['small', 96], ['standard', 150], ['high', 300]]) {
    await page.selectOption('#pdfQuality', preset);
    const r = await convert('pdfc-' + preset + '.zip');
    const files = readZip(r.buf);
    const names = Object.keys(files);
    const dims = names.map(n => jpegSize(files[n]));
    const want = [Math.floor(A4[0] * dpi / 72), Math.floor(A4[1] * dpi / 72)];
    sizes[preset] = files[names[0]].length;
    check(`${preset}: 3 pages → ${r.name} with 3 JPEGs at ${dpi} dpi (${want.join('×')})`,
      r.name === 'pdfc-web-font-jpg.zip' && names.join() === 'pdfc-web-font-1.jpg,pdfc-web-font-2.jpg,pdfc-web-font-3.jpg' &&
      dims.every(d => d && Math.abs(d.w - want[0]) <= 1 && Math.abs(d.h - want[1]) <= 1) && r.result.includes(`(${dpi} dpi)`),
      names.join() + ' ' + JSON.stringify(dims) + ' — ' + r.result);
  }
  check('file size grows with quality: small < standard < high', sizes.small < sizes.standard && sizes.standard < sizes.high, JSON.stringify(sizes));
  await page.selectOption('#pdfQuality', 'standard');
  await page.fill('#pdfPages', '2');
  const one = await convert('pdfc-page2.jpg');
  check('one page selected → a single .jpg (no ZIP)', one.name === 'pdfc-web-font-2.jpg' && jpegSize(one.buf) && jpegSize(one.buf).w === 1241, one.name);
  await page.fill('#pdfPages', '3, 1');
  const two = await convert('pdfc-pages.zip');
  check('page list "3, 1" → exactly those pages', Object.keys(readZip(two.buf)).join() === 'pdfc-web-font-3.jpg,pdfc-web-font-1.jpg');
  for (const bad of ['4', '0-2', '2-1', 'abc', '1;2']) {
    await page.fill('#pdfPages', bad);
    await page.click('#pdfConvert');
    await page.waitForSelector('#pdfResult:not([hidden])');
    const msg = await result();
    check(`invalid page list "${bad}" → message, nothing converted`, /หน้า|รูปแบบ|ช่วง/.test(msg) &&
      await page.evaluate(() => document.getElementById('pdfResult').classList.contains('error')), msg);
  }
  await page.fill('#pdfPages', '');
  // a huge page (A0) at 300 dpi stays within the canvas limit of phones (16 MP)
  const a0 = path.join(OUT, 'pdfc-a0.pdf');
  fs.writeFileSync(a0, simplePdf({ media: '0 0 2384 3370', content: 'BT /F1 120 Tf 200 3000 Td (A0 poster) Tj ET' }));
  await openPdf(a0);
  await page.selectOption('#pdfQuality', 'high');
  const big = await convert('pdfc-a0.jpg');
  const bd = jpegSize(big.buf);
  check('A0 page at High: resolution capped (≤ 16 MP), result shows the real dpi', bd && bd.w * bd.h <= 16e6 && /\((\d+) dpi\)/.test(big.result) &&
    Number(big.result.match(/\((\d+) dpi\)/)[1]) < 300, JSON.stringify(bd) + ' ' + big.result);
  await page.selectOption('#pdfQuality', 'standard');

  // ---------------------------------------------------------------- passwords
  const pwB64 = await page.evaluate(async () => {
    await AppPlatform.loadScript('vendor/jspdf/jspdf.umd.min.js', true);
    const d = new window.jspdf.jsPDF({ encryption: { userPassword: 'secret', ownerPassword: 'owner', userPermissions: ['print'] } });
    d.text('Secret page', 20, 20);
    const u8 = new Uint8Array(d.output('arraybuffer'));
    let s = ''; u8.forEach(c => { s += String.fromCharCode(c); });
    return btoa(s);
  });
  const pwPdf = path.join(OUT, 'pdfc-password.pdf');
  fs.writeFileSync(pwPdf, Buffer.from(pwB64, 'base64'));
  await page.setInputFiles('#pdfInput', pwPdf);
  await page.waitForSelector('#pdfPasswordRow:not([hidden])');
  const pwFocus = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.fill('#pdfPassword', 'wrong');
  await page.press('#pdfPassword', 'Enter');
  await page.waitForFunction(() => /ไม่ถูกต้อง/.test(document.getElementById('pdfPasswordLabel').textContent) &&
    !document.getElementById('pdfPasswordRow').hidden);
  check('password PDF asks for the password (field focused); wrong password asks again', pwFocus === 'pdfPassword');
  await page.fill('#pdfPassword', 'secret');
  await page.click('#pdfPasswordOk');
  await waitOpened();
  check('correct password opens the file', /pdfc-password\.pdf — 1 หน้า/.test(await page.textContent('#pdfFileInfo')) &&
    await page.isHidden('#pdfPasswordRow'), await page.textContent('#pdfFileInfo'));
  await setFormat('docx');
  const pw = await convert('pdfc-password.docx');
  check('password PDF converts to Word', docxPages((await docxOf(pw)).xml)[0][0].text === 'Secret page');
  await page.evaluate(() => { document.getElementById('pdfInput').value = ''; }); // same file again (the app's picker does this too)
  await page.setInputFiles('#pdfInput', pwPdf);
  await page.waitForSelector('#pdfPasswordRow:not([hidden])');
  await page.click('#pdfCancel');
  await page.waitForSelector('#pdfDialog:not([open])', { state: 'attached' });
  check('closing while asking for a password closes cleanly', await page.isHidden('#pdfPasswordRow') || !(await page.isVisible('#pdfDialog')));

  // ---------------------------------------------------------------- bad files and names
  const bad = [
    ['pdfc-not-pdf.pdf', fs.readFileSync(fixture('not-image.txt')), /ไม่ใช่ไฟล์ PDF/],
    ['pdfc-empty.pdf', Buffer.alloc(0), /ว่างเปล่า/],
    ['pdfc-broken.pdf', Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> garbage garbage\n'), /เปิดไฟล์ PDF ไม่ได้/]
  ];
  for (const [name, data, re] of bad) {
    const f = path.join(OUT, name); fs.writeFileSync(f, data);
    await openPdf(f);
    const msg = await result();
    check(`${name}: clear message, convert disabled`, re.test(msg) && await page.isDisabled('#pdfConvert'), msg);
  }
  const evil = path.join(OUT, '<img src=x onerror="window.__xss=1">.pdf');
  fs.copyFileSync(rotPdf, evil);
  await openPdf(evil);
  await setFormat('jpg');
  const ev = await convert('pdfc-evil.jpg');
  check('HTML in a file name is shown as text, never run; output name sanitized',
    !(await page.evaluate(() => window.__xss)) && (await page.$$('#pdfDialog img')).length === 0 &&
    (await page.textContent('#pdfFileInfo')).startsWith('<img src=x') && !/[<>"]/.test(ev.name) && ev.name.endsWith('.jpg'), ev.name);

  // ---------------------------------------------------------------- platform save hook, share, cancel, races
  await page.evaluate(() => { window.__save = []; AppPlatform.saveFile = (blob, name) => { window.__save.push([name, blob.type, blob.size]); return Promise.resolve(false); }; });
  await openPdf(rotPdf);
  await page.click('#pdfConvert');
  await waitDone();
  const saved = await page.evaluate(() => window.__save);
  check('platform saveFile hook receives the JPG (image/jpeg); cancelled save is reported',
    saved.length === 1 && saved[0][1] === 'image/jpeg' && /ยังไม่ได้บันทึกไฟล์/.test(await result()), JSON.stringify(saved) + ' ' + await result());
  await page.evaluate(() => { delete AppPlatform.saveFile; });

  await openPdf(webPdf.file);
  await setFormat('docx');
  await page.selectOption('#pdfMode', 'ocr');
  await page.click('#pdfConvert');
  await page.waitForFunction(() => /OCR|ตัวอ่าน|ภาษา/.test(document.getElementById('pdfProgressText').textContent), null, { timeout: 60000 });
  check('while converting: "ปิด" becomes "หยุด", options locked', (await page.textContent('#pdfCancel')) === 'หยุด' &&
    await page.isDisabled('#pdfPick') && await page.isDisabled('#pdfPages'));
  t0 = Date.now();
  await page.click('#pdfCancel');
  await waitDone(30000);
  check('stop during OCR ends quickly with a message; dialog stays open', /หยุดการแปลงแล้ว/.test(await result()) && Date.now() - t0 < 15000 &&
    await page.isVisible('#pdfDialog'), (Date.now() - t0) + ' ms');
  await page.selectOption('#pdfMode', 'auto');
  await page.fill('#pdfPages', '1');
  const after = await convert('pdfc-after-cancel.docx');
  check('converting again after stopping works', (await docxOf(after)).pages[0][0].text === HEAD);
  await page.fill('#pdfPages', '');

  // new file while one is opening; close while opening
  await page.setInputFiles('#pdfInput', webPdf.file);
  await page.setInputFiles('#pdfInput', rotPdf);
  await waitOpened();
  check('choosing another file while opening shows the latest file only', /pdfc-rotated\.pdf — 1 หน้า/.test(await page.textContent('#pdfFileInfo')));
  await page.setInputFiles('#pdfInput', webPdf.file);
  await page.click('#pdfCancel');
  await page.waitForTimeout(1500);
  check('closing while a file opens: dialog stays closed', !(await page.evaluate(() => document.getElementById('pdfDialog').open)));

  // drag and drop a PDF onto the home screen
  const dropB64 = fs.readFileSync(rotPdf).toString('base64');
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.pdf', { type: 'application/pdf' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, dropB64);
  await page.waitForSelector('#pdfDialog[open]');
  await waitOpened();
  check('dropping a PDF on the home screen opens it in the converter (not as a photo)',
    /dropped\.pdf — 1 หน้า/.test(await page.textContent('#pdfFileInfo')) && (await page.$$('.page-item')).length === 0);
  await page.click('#pdfCancel');

  check('PDF.js runs in a Web Worker through js/pdf-worker.js', (await page.evaluate(() => PdfTools.info().mode)) === 'worker' &&
    srv.requests.some(r => r.path === '/js/pdf-worker.js') && srv.requests.some(r => r.path === '/vendor/pdfjs/pdf.worker.min.mjs'));
  check('no console errors or CSP violations', !log.filter(l => !OCR_NOISE.test(l)).length && !(await page.evaluate(() => window.__csp.length)),
    log.join('\n') + JSON.stringify(await page.evaluate(() => window.__csp)));
  await ctx.close();

  // ---------------------------------------------------------------- older engines (Chrome/WebView before 132, Safari before 18)
  // PDF.js (legacy build) uses Promise.withResolvers (Chrome 119), for await over ReadableStream (124), Response/Blob.bytes()
  // (132) and ArrayBuffer.transferToFixedLength (114) — seen on the Android small-phone emulator (WebView 113).
  // Remove them from the page and from the worker (before js/pdf-worker.js runs); results must stay identical.
  const OLD_ENGINE = 'delete Promise.withResolvers; delete ReadableStream.prototype[Symbol.asyncIterator]; delete ReadableStream.prototype.values;' +
    ' delete Response.prototype.bytes; delete Blob.prototype.bytes; delete ArrayBuffer.prototype.transferToFixedLength;';
  {
    const c4 = await newContext(b);
    await c4.addInitScript(OLD_ENGINE);
    let shimHits = 0;
    await c4.route(/\/js\/pdf-worker\.js/, async route => {
      shimHits++;
      const r = await route.fetch();
      route.fulfill({ response: r, body: OLD_ENGINE + '\n' + await r.text() });
    });
    const p4 = await c4.newPage(); const log4 = watch(p4, 'pdf-old-engine');
    await p4.goto(srv.url);
    await p4.waitForFunction(() => window.PdfConvert);
    await p4.setInputFiles('#pdfInput', webPdf.file);
    await p4.waitForFunction(() => !document.getElementById('pdfConvert').disabled || !document.getElementById('pdfResult').hidden, null, { timeout: 60000 });
    await p4.click('#pdfFormats .chip[data-format="docx"]');
    await p4.selectOption('#pdfMode', 'text');
    const [dl4] = await Promise.all([p4.waitForEvent('download', { timeout: 120000 }), p4.click('#pdfConvert')]);
    const f4 = path.join(OUT, 'pdfc-old-engine.docx'); await dl4.saveAs(f4);
    const d4w = docxPages(readZip(fs.readFileSync(f4))['word/document.xml'].toString('utf8'));
    await p4.click('#pdfFormats .chip[data-format="jpg"]');
    await p4.selectOption('#pdfQuality', 'standard');
    await p4.fill('#pdfPages', '2');
    const [dl5] = await Promise.all([p4.waitForEvent('download', { timeout: 120000 }), p4.click('#pdfConvert')]);
    const f5 = path.join(OUT, 'pdfc-old-engine.jpg'); await dl5.saveAs(f5);
    check('old engine: page rendered to JPG byte for byte like a current browser', fs.readFileSync(f5).equals(one.buf),
      `${fs.statSync(f5).size} vs ${one.buf.length} bytes`);
    check('browser without newer JavaScript (old WebView): polyfilled in page and worker, Thai text still exact',
      shimHits > 0 && d4w[0][0].text === HEAD && d4w[0][1].text === LINES.join('\n') && (await p4.evaluate(() => PdfTools.info().mode)) === 'worker' &&
      !log4.filter(l => !OCR_NOISE.test(l)).length, JSON.stringify(d4w[0].map(p => p.text.slice(0, 30))) + log4.join('\n'));
    await c4.close();
  }

  // ---------------------------------------------------------------- PDF.js cannot be downloaded (offline), then retry
  {
    const c2 = await newContext(b);
    let block = true;
    await c2.route(/vendor\/pdfjs\/pdf\.min\.mjs/, route => block ? route.abort() : route.continue());
    const p2 = await c2.newPage();
    await p2.goto(srv.url);
    await p2.waitForFunction(() => window.PdfConvert);
    await p2.setInputFiles('#pdfInput', rotPdf);
    await p2.waitForSelector('#pdfResult:not([hidden])', { timeout: 30000 });
    const msg = await p2.textContent('#pdfResult');
    block = false;
    await p2.evaluate(() => { document.getElementById('pdfInput').value = ''; });
    await p2.setInputFiles('#pdfInput', rotPdf);
    await p2.waitForFunction(() => /1 หน้า/.test(document.getElementById('pdfFileInfo').textContent), null, { timeout: 30000 });
    check('PDF.js download fails → clear message; choosing the file again retries and works', /โหลดตัวอ่านไฟล์ PDF ไม่สำเร็จ/.test(msg), msg);
    await c2.close();
  }

  // ---------------------------------------------------------------- file:// (double-click open): not available, says why
  {
    const c3 = await newContext(b); const p3 = await c3.newPage(); const log3 = watch(p3, 'pdf-file');
    await p3.goto('file://' + path.join(APP, 'index.html'));
    await p3.waitForFunction(() => window.PdfConvert);
    let picked = false;
    p3.on('filechooser', () => { picked = true; });
    await p3.click('#btnPdfTools');
    await p3.waitForSelector('.toast');
    const toast = await p3.textContent('.toast');
    check('file://: button explains the converter needs the web site (https), no picker', /https/.test(toast) && !picked && !log3.length, toast);
    await c3.close();
  }

  await b.close(); await srv.close();
  t.finish();
});
