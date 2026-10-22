'use strict';
/*
 * Shared helpers for the browser tests (Playwright + Chromium).
 * Every suite is a plain Node script: `node suites/<name>.js` (or `npm test` for all).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(ROOT, 'doc-scanner-pdf');
const FIXTURES = path.join(__dirname, '../fixtures');
const OUT = path.join(__dirname, '../out');
const PDFJS = path.join(__dirname, '../node_modules/pdfjs-dist');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.gz': 'application/gzip', '.md': 'text/plain; charset=utf-8'
};

function inside(base, file) {
  const rel = path.relative(base, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Static file server similar to GitHub Pages.
 *   /            → opts.root (default: doc-scanner-pdf/)
 *   /__fixtures/ → tools/tests/fixtures
 *   /__pdfjs/    → node_modules/pdfjs-dist (used to verify generated PDFs inside the browser)
 * opts.cacheControl: value for the Cache-Control header (GitHub Pages sends "max-age=600")
 * opts.hook(pathname, url): may return { status, body, type, delay } to override a response
 * Every request is recorded in server.requests as { path, search, time }.
 */
function startServer(opts = {}) {
  const requests = [];
  let root = opts.root || APP;
  const srv = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
    requests.push({ path: pathname, search: url.search, time: Date.now() });

    const override = opts.hook && opts.hook(pathname, url);
    if (override) {
      if (override.delay) await new Promise(r => setTimeout(r, override.delay));
      if (res.destroyed) return;
      res.writeHead(override.status || 200, { 'Content-Type': override.type || TYPES[path.extname(pathname)] || 'application/octet-stream', 'Cache-Control': opts.cacheControl || 'no-cache' });
      return res.end(override.body);
    }

    let base = root;
    let rel = pathname;
    if (rel.startsWith('/__fixtures/')) { base = FIXTURES; rel = rel.slice('/__fixtures'.length); }
    else if (rel.startsWith('/__pdfjs/')) { base = PDFJS; rel = rel.slice('/__pdfjs'.length); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(base, rel);
    if (!inside(base, file)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
      if (opts.cacheControl) headers['Cache-Control'] = opts.cacheControl;
      res.writeHead(200, headers);
      res.end(data);
    });
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => {
    const origin = 'http://127.0.0.1:' + srv.address().port;
    resolve({
      origin,
      url: origin + '/index.html',
      requests,
      setRoot(r) { root = r; },
      close: () => new Promise(r => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); })
    });
  }));
}

function launch(opts = {}) {
  const args = opts.camera === false ? [] : ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  return chromium.launch({ args });
}

const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

/**
 * New browser context that records CSP violations in window.__csp.
 * The page's only external request is the optional Google Fonts stylesheet; it is stubbed so tests
 * don't depend on the internet. { liveFonts: true } skips the stub — needed when a test relies on the
 * HTTP cache, because Playwright disables the cache while any route is active.
 * The browser language is Thai unless opts.locale says otherwise: the app picks its UI language from it
 * (js/i18n.js) and most suites check the Thai texts. suites/i18n.js covers English.
 */
async function newContext(browser, opts = {}, { liveFonts = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'th-TH', ...opts });
  if (!liveFonts) {
    await ctx.route(FONT_HOSTS, route => /googleapis/.test(route.request().url())
      ? route.fulfill({ status: 200, contentType: 'text/css', headers: { 'Access-Control-Allow-Origin': '*' }, body: '/* fonts stub */' })
      : route.fulfill({ status: 404, body: '' }));
  }
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  });
  return ctx;
}

/** Collects console errors/warnings and uncaught page errors */
function watch(page, label) {
  const log = [];
  page.on('console', m => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (FONT_HOSTS.test((m.location() && m.location().url) || '')) return; // optional web font (no internet in some test environments)
    log.push(`[${label}] console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', e => log.push(`[${label}] pageerror: ${e.message}`));
  return log;
}

/** Tesseract prints these harmless messages as warnings */
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

/** Runs a suite body and turns unexpected exceptions into a failing exit code */
function run(fn) {
  fn().catch(e => { console.error('FATAL', e); process.exit(2); });
}

const fixture = name => path.join(FIXTURES, name);
const waitReady = (page, timeout = 60000) => page.waitForSelector('#cvStatus[data-state="ready"]', { timeout });
const waitIdle = (page, timeout = 60000) => page.waitForFunction(() => [...document.querySelectorAll('.page-state')].every(e => e.hidden), null, { timeout });
const waitEditorIdle = page => page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 30000 });

/** Opens the export dialog, applies optional settings and returns { file, name, buf } of the downloaded PDF */
async function exportPdf(page, outName, prepare) {
  await page.click('#btnExport');
  await page.waitForSelector('#exportDialog[open]');
  if (prepare) await prepare();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('#exDownload')]);
  const file = path.join(OUT, outName);
  await dl.saveAs(file);
  return { file, name: dl.suggestedFilename(), buf: fs.readFileSync(file) };
}

/** Ground-truth text printed on the synthetic document photos */
const OCR_TRUTH = fs.readFileSync(path.join(FIXTURES, 'ocr-truth.txt'), 'utf8').trim();

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Character accuracy (%) of OCR output against OCR_TRUTH, ignoring whitespace */
function ocrAccuracy(text, truth = OCR_TRUTH) {
  const norm = s => String(s).replace(/\s+/g, '');
  return (1 - levenshtein(norm(text), norm(truth)) / norm(truth).length) * 100;
}

module.exports = {
  ROOT, APP, FIXTURES, OUT, fs, path,
  startServer, launch, newContext, watch, suite, run, fixture,
  waitReady, waitIdle, waitEditorIdle, exportPdf, OCR_TRUTH, OCR_NOISE, ocrAccuracy
};
