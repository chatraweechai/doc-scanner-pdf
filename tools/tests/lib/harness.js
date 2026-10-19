'use strict';
/*
 * Shared helpers for the doc-scanner-pdf-android tests (browser side).
 *
 * The Android app shows doc-scanner-pdf-android/app/src/main/assets/www in a WebView at
 * https://appassets.androidplatform.net/ (served by AssetRouter.kt) and gives the page a DocScannerBridge
 * (WebMessageListener) to save/share files. Here Chromium gets the same: requests to that origin are served from
 * the www folder with AssetRouter's rules (MIME map read from AssetRouter.kt), every other request is blocked
 * (the app has no INTERNET permission), and DocScannerBridge is emulated in Node with the same protocol checks as
 * BridgeProtocol.kt / TransferStore.kt. The real app is tested on Android emulators (androidTest, CI).
 *
 * CLAUDE4CODE_SRC (default ../doc-scanner-pdf-code next to this repo) = checkout of chatrawichai-envbr/doc-scanner-pdf-code at the commit in
 * doc-scanner-pdf-android/source.json: source of the conversion, the web version (parity) and the test fixtures.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PROJECT_DIR = path.join(ROOT, 'doc-scanner-pdf-android');
const WWW_DIR = path.join(PROJECT_DIR, 'app/src/main/assets/www');
const KOTLIN_DIR = path.join(PROJECT_DIR, 'app/src/main/java/io/github/chatrawichaitech/docscanner');
const CLAUDE4CODE_SRC = path.resolve(process.env.CLAUDE4CODE_SRC || path.join(ROOT, '../doc-scanner-pdf-code'));
const WEB_APP = path.join(CLAUDE4CODE_SRC, 'doc-scanner-pdf');
const FIXTURES = path.join(CLAUDE4CODE_SRC, 'tools/tests/fixtures');
const PDFJS = path.join(__dirname, '../node_modules/pdfjs-dist');
const OUT = path.join(__dirname, '../out');
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(path.join(WEB_APP, 'index.html'))) {
  console.error('ไม่พบ repo doc-scanner-pdf-code ที่ ' + CLAUDE4CODE_SRC + ' — ตั้งค่า CLAUDE4CODE_SRC ให้ชี้ไปที่ checkout ของ chatrawichai-envbr/doc-scanner-pdf-code');
  process.exit(2);
}
const SOURCE = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'source.json'), 'utf8'));

const HOST = 'appassets.androidplatform.net';
const ORIGIN = 'https://' + HOST;
const START_URL = ORIGIN + '/index.html';

/** MIME map of AssetRouter.kt (single source of truth for what the app serves) */
function kotlinMime() {
  const src = fs.readFileSync(path.join(KOTLIN_DIR, 'AssetRouter.kt'), 'utf8');
  const block = src.match(/val MIME: Map<String, String> = mapOf\(([\s\S]*?)\n\s*\)/);
  if (!block) throw new Error('MIME map not found in AssetRouter.kt');
  const map = {};
  for (const m of block[1].matchAll(/"([a-z0-9]+)" to "([^"]+)"/g)) map[m[1]] = m[2];
  return map;
}
const MIME = kotlinMime();

/** Types the app saves/shares: FileNames.EXTENSIONS in FileNames.kt (single source of truth) */
function kotlinSaveTypes() {
  const src = fs.readFileSync(path.join(KOTLIN_DIR, 'FileNames.kt'), 'utf8');
  const consts = Object.fromEntries([...src.matchAll(/const val (\w+) = "([^"]+)"/g)].map(m => [m[1], m[2]]));
  const block = src.match(/val EXTENSIONS: Map<String, String> = mapOf\(([\s\S]*?)\n\s*\)/);
  if (!block) throw new Error('EXTENSIONS not found in FileNames.kt');
  return [...block[1].matchAll(/(?:"([^"]+)"|(\w+)) to "([a-z0-9]+)"/g)].map(m => m[1] || consts[m[2]]);
}
const SAVE_TYPES = kotlinSaveTypes();

/** Same rules as AssetRouter.route() */
function routeAsset(url, method) {
  let u;
  try { u = new URL(url); } catch (e) { return { status: 403 }; }
  if (u.protocol !== 'https:' || u.hostname !== HOST || u.port) return { status: 403 };
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 };
  let p;
  try { p = decodeURIComponent(u.pathname); } catch (e) { return { status: 404 }; }
  if (p === '' || p === '/') p = '/index.html';
  if (!p.startsWith('/') || p.length > 512) return { status: 404 };
  p = p.slice(1);
  if (/[\u0000-\u001f\u007f\\]/.test(p) || p.split('/').some(s => s === '' || s === '.' || s === '..')) return { status: 404 };
  const ext = (p.split('/').pop().match(/\.([^.]+)$/) || [])[1];
  const mime = ext && MIME[ext.toLowerCase()];
  if (!mime) return { status: 404 };
  const f = path.join(WWW_DIR, p);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return { status: 404 };
  // like the APK: the Android build stores assets/x.gz unpacked as assets/x, and AssetRouter serves that file
  if (p.endsWith('.gz')) return { status: 200, contentType: 'application/octet-stream', body: zlib.gunzipSync(fs.readFileSync(f)), path: p };
  const enc = /^text\/|^application\/json$/.test(mime) ? '; charset=utf-8' : '';
  return { status: 200, contentType: mime + enc, body: fs.readFileSync(f), path: p };
}

/**
 * DocScannerBridge on the Node side: same checks as BridgeProtocol.kt/TransferStore.kt,
 * records what the app would save/share. saveMode: 'saved' | 'cancelled' | 'error'
 */
class BridgeEmulator {
  constructor() {
    this.saved = []; this.shared = []; this.texts = []; this.langs = []; this.errors = []; this.messages = 0;
    this.saveMode = 'saved';
    this.transfers = new Map();
    this.queue = Promise.resolve();
  }
  post(page, raw) {
    this.queue = this.queue.then(() => this.handle(page, raw)).catch(e => this.errors.push(String(e)));
    return this.queue;
  }
  async reply(page, obj) {
    await page.evaluate(j => window.__bridgeDeliver(j), JSON.stringify(obj));
  }
  async handle(page, raw) {
    this.messages++;
    let m;
    try { m = JSON.parse(raw); } catch (e) { this.errors.push('bad json'); return; }
    const id = m && m.id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) { this.errors.push('bad id'); return; }
    const fail = async why => { this.errors.push(why); this.transfers.delete(id); await this.reply(page, { id, ok: false, error: why }); };
    if (m.v !== 1) return fail('v');
    if (m.op === 'begin') {
      if (!['save', 'share'].includes(m.kind) || !SAVE_TYPES.includes(m.mime)) return fail('kind/mime');
      if (!Number.isInteger(m.size) || m.size < 0 || !Number.isInteger(m.chunks) || m.chunks < 1 || m.chunks > Math.max(1, m.size)) return fail('size/chunks');
      if (typeof m.name !== 'string' || this.transfers.has(id) || this.transfers.size >= 3) return fail('name/dup/limit');
      this.transfers.set(id, { ...m, next: 0, parts: [], bytes: 0 });
    } else if (m.op === 'chunk') {
      const t = this.transfers.get(id);
      if (!t || m.index !== t.next || m.index >= t.chunks || typeof m.data !== 'string') return fail('chunk order');
      const b = Buffer.from(m.data, 'base64');
      if (b.toString('base64') !== m.data || t.bytes + b.length > t.size) return fail('chunk data');
      t.parts.push(b); t.bytes += b.length; t.next++;
    } else if (m.op === 'end') {
      const t = this.transfers.get(id);
      if (!t || t.next !== t.chunks || t.bytes !== t.size) return fail('incomplete');
      this.transfers.delete(id);
      const file = { name: t.name, mime: t.mime, buf: Buffer.concat(t.parts), chunks: t.chunks };
      if (t.kind === 'share') { this.shared.push(file); return this.reply(page, { id, ok: true, result: 'shared' }); }
      if (this.saveMode === 'error') return this.reply(page, { id, ok: false, error: 'เขียนไฟล์ลงที่เก็บที่เลือกไม่ได้' });
      if (this.saveMode === 'cancelled') return this.reply(page, { id, ok: true, result: 'cancelled' });
      this.saved.push(file);
      return this.reply(page, { id, ok: true, result: 'saved' });
    } else if (m.op === 'lang') {
      if (!['th', 'en'].includes(m.lang)) return fail('lang');
      this.langs.push(m.lang);
      return this.reply(page, { id, ok: true, result: 'lang' });
    } else if (m.op === 'shareText') {
      if (typeof m.text !== 'string' || !m.text) return fail('text');
      this.texts.push({ text: m.text, title: m.title });
      return this.reply(page, { id, ok: true, result: 'shared' });
    } else {
      return fail('op');
    }
  }
}

function launch(opts = {}) {
  const args = opts.camera === false ? [] : ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  return chromium.launch({ args });
}

/**
 * Browser context that behaves like the app's WebView: www served at https://appassets.androidplatform.net,
 * everything else blocked (recorded in ctx.blocked), DocScannerBridge in the app's main frame.
 * The device language is Thai unless opts.locale says otherwise (the page picks its language from it — js/i18n.js).
 */
async function newAppContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, locale: 'th-TH', ...opts });
  ctx.blocked = [];
  ctx.served = [];
  await ctx.route('**/*', route => {
    const req = route.request();
    const r = routeAsset(req.url(), req.method());
    if (r.status === 403) { ctx.blocked.push(req.url()); return route.abort('blockedbyclient'); }
    if (r.status !== 200) return route.fulfill({ status: r.status, contentType: 'text/plain', body: '' });
    ctx.served.push(r.path);
    return route.fulfill({ status: 200, contentType: r.contentType, body: r.body,
      headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Cross-Origin-Resource-Policy': 'same-origin' } });
  });
  const bridge = new BridgeEmulator();
  ctx.bridge = bridge;
  await ctx.exposeBinding('__bridgePost', (source, raw) => bridge.post(source.page, raw));
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    // WebMessageListener: only the app's origin, main frame (allowedOriginRules + isMainFrame in MainActivity)
    if (location.origin !== 'https://appassets.androidplatform.net' || window !== window.top) return;
    const listeners = [];
    let handler = null;
    const bridge = {
      postMessage(s) {
        if (typeof s !== 'string') throw new TypeError('DocScannerBridge.postMessage: string only');
        window.__bridgePost(s);
      },
      addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
      removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      get onmessage() { return handler; },
      set onmessage(fn) { handler = fn; }
    };
    Object.defineProperty(window, 'DocScannerBridge', { value: bridge });
    Object.defineProperty(window, '__bridgeDeliver', {
      value: data => {
        const ev = new MessageEvent('message', { data });
        if (typeof handler === 'function') handler(ev);
        listeners.forEach(fn => fn(ev));
      }
    });
  });
  return ctx;
}

/** Static server: / → doc-scanner-pdf-code's doc-scanner-pdf (web version), /__fixtures/, /__pdfjs/ */
function startStatic() {
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.jpg': 'image/jpeg',
    '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.gz': 'application/gzip'
  };
  const inside = (base, f) => { const r = path.relative(base, f); return r && !r.startsWith('..') && !path.isAbsolute(r); };
  const srv = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    let base = WEB_APP;
    if (p.startsWith('/__fixtures/')) { base = FIXTURES; p = p.slice('/__fixtures'.length); }
    else if (p.startsWith('/__pdfjs/')) { base = PDFJS; p = p.slice('/__pdfjs'.length); }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(base, p);
    if (!inside(base, f)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => {
    const origin = 'http://127.0.0.1:' + srv.address().port;
    r({ origin, url: origin + '/index.html', close: () => new Promise(d => { srv.closeAllConnections(); srv.close(() => d()); }) });
  }));
}

const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

/** Context for the web version (Google Fonts stubbed; Thai unless opts.locale says otherwise) */
async function newWebContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'th-TH', ...opts });
  await ctx.route(FONT_HOSTS, route => /googleapis/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: 'text/css', headers: { 'Access-Control-Allow-Origin': '*' }, body: '/* fonts stub */' })
    : route.fulfill({ status: 404, body: '' }));
  return ctx;
}

function watch(page, label) {
  const log = [];
  page.on('console', m => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (FONT_HOSTS.test((m.location() && m.location().url) || '')) return;
    log.push(`[${label}] console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', e => log.push(`[${label}] pageerror: ${e.message}`));
  return log;
}

const OCR_NOISE = /Parameter not found|Estimating resolution|Detected \d+ diacritics/;

function suite(name) {
  const results = [];
  console.log(`\n# ${name}`);
  return {
    check(label, ok, info) {
      results.push({ label, ok: !!ok });
      console.log((ok ? 'PASS ' : 'FAIL ') + label + (info ? ' — ' + info : ''));
      return !!ok;
    },
    finish() {
      const failed = results.filter(r => !r.ok).length;
      console.log(`\n${results.length - failed}/${results.length} passed (${name})`);
      process.exitCode = failed ? 1 : 0;
      return failed;
    }
  };
}

function run(fn) { fn().catch(e => { console.error('FATAL', e); process.exit(2); }); }

/** Opens the app like MainActivity (START_URL) */
async function openApp(ctx, label = 'app') {
  const page = await ctx.newPage();
  const log = watch(page, label);
  await page.goto(START_URL);
  await page.waitForSelector('#cvStatus', { state: 'attached' });
  return { page, log };
}

const fixture = name => path.join(FIXTURES, name);
const waitReady = (app, timeout = 90000) => app.waitForSelector('#cvStatus[data-state="ready"]', { timeout });
const waitIdle = (app, timeout = 90000) => app.waitForFunction(() => [...document.querySelectorAll('.page-state')].every(e => e.hidden), null, { timeout });
const waitOcrDone = (app, timeout = 180000) => app.waitForFunction(() => document.getElementById('ocrProgressWrap').hidden && document.getElementById('ocrDialog').open, null, { timeout });

/** pdf.js inspector page (doc-scanner-pdf-code's tools/tests/fixtures/pdf-check.html) */
async function openInspector(ctx, stat) {
  const q = await ctx.newPage();
  await q.goto(stat.origin + '/__fixtures/pdf-check.html');
  await q.waitForFunction(() => window.pdfReady, null, { timeout: 30000 });
  return q;
}
const inspectPdf = (q, buf, opts) => q.evaluate(([b64, o]) => window.inspectPdf(b64, o), [buf.toString('base64'), opts || {}]);

const OCR_TRUTH = fs.readFileSync(fixture('ocr-truth.txt'), 'utf8').trim();
function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function ocrAccuracy(text, truth = OCR_TRUTH) {
  const norm = s => String(s).replace(/\s+/g, '');
  return (1 - levenshtein(norm(text), norm(truth)) / norm(truth).length) * 100;
}

/**
 * A Thai PDF made by Chrome with the Sarabun web font — Chrome writes lowered tone marks as glyphs without Unicode
 * and puts the real text in /ActualText, the hard case for PDF → Word. Same text as the device test's thai.pdf
 * (app/src/androidTest/assets). Returns { buf, lines }.
 */
const THAI_LINES = [
  'การประชุมคณะกรรมการ ครั้งที่ ๑/๒๕๖๙',
  'น้ำ ที่ กำลัง ผู้ใหญ่ ปฏิบัติ ฤๅษี ฦๅ ญาติ ฐาน กฎหมาย',
  'คำสั่ง ปั้น กั๊ก ซ้ำ ต่ำ ล้ำ ปู่ ฤทธิ์ พระราชบัญญัติ English 2026'
];
async function thaiPdf(browser, stat) {
  const p = await browser.newPage();
  try {
    await p.goto(stat.origin + '/__fixtures/pdf-check.html'); // same origin as the font, no CSP of the app
    await p.setContent(`<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
      @font-face { font-family: Web; src: url(${stat.origin}/vendor/fonts/Sarabun-Regular.ttf); }
      body { font-family: Web; font-size: 16pt; margin: 2cm; } p { margin: 0 0 14pt; white-space: nowrap; }
    </style></head><body>${THAI_LINES.map(l => `<p>${l}</p>`).join('')}</body></html>`, { waitUntil: 'networkidle' });
    const ok = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(f => f.family === 'Web' && f.status === 'loaded'); });
    if (!ok) throw new Error('Sarabun web font did not load');
    return { buf: await p.pdf({ format: 'A4' }), lines: THAI_LINES };
  } finally {
    await p.close();
  }
}

/** ZIP (.zip/.docx) → { name: Buffer } with CRC check */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end of central directory');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (data.length !== size || zlib.crc32(data) !== crc) throw new Error('bad data/CRC in ' + name);
    files[name] = data;
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

/** Paragraph texts of a .docx (lines joined with \n) */
function docxParagraphs(buf) {
  const xml = readZip(buf)['word/document.xml'].toString('utf8');
  return [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map(m => m[1]).filter(p => !p.includes('w:type="page"'))
    .map(p => p.replace(/<w:br\/>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  for (let p = 2; p + 9 < buf.length;) {
    const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (m >= 0xC0 && m <= 0xC2) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
    p += 2 + len;
  }
  return null;
}

module.exports = {
  ROOT, PROJECT_DIR, WWW_DIR, KOTLIN_DIR, CLAUDE4CODE_SRC, WEB_APP, FIXTURES, OUT, SOURCE, HOST, ORIGIN, START_URL, MIME, SAVE_TYPES, fs, path,
  routeAsset, BridgeEmulator, launch, newAppContext, newWebContext, startStatic, watch, suite, run, openApp, fixture,
  waitReady, waitIdle, waitOcrDone, openInspector, inspectPdf, OCR_TRUTH, OCR_NOISE, ocrAccuracy,
  thaiPdf, readZip, docxParagraphs, jpegSize, THAI_LINES
};
