'use strict';
/*
 * Shared by tools/store/build.js (store images) and tools/store/video.js (promo video): the app in a context like the
 * Android WebView with Noto Sans Thai, the launcher icon as SVG, the brand background, rendering HTML to PNG.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('../tests/lib/harness');

const STORE = __dirname;
const OUT = path.join(STORE, 'out');
const FONTS = path.join(STORE, 'fonts');
const RES = path.join(H.ROOT, 'doc-scanner-pdf-android/app/src/main/res');
const APP_ORIGIN = 'https://appassets.androidplatform.net';

// ---------------------------------------------------------------- fonts (checked)

function checkedFonts() {
  const sums = fs.readFileSync(path.join(FONTS, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/));
  const out = {};
  for (const [sum, name] of sums) {
    const buf = fs.readFileSync(path.join(FONTS, name));
    if (crypto.createHash('sha256').update(buf).digest('hex') !== sum) throw new Error('checksum mismatch: fonts/' + name);
    out[name] = buf;
  }
  return out;
}
const FONT_FILES = checkedFonts();
const RANGES = { // from the Google Fonts CSS (see fonts/README.md)
  'NotoSansThai-thai.woff2': 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC',
  'NotoSansThai-latin-ext.woff2': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  'NotoSansThai-latin.woff2': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
};
/** @font-face rules; urlOf(name) gives the URL of a font file */
const fontFaces = urlOf => Object.keys(RANGES).map(name =>
  `@font-face{font-family:"Noto Sans Thai";font-style:normal;font-weight:100 900;font-display:block;` +
  `src:url(${urlOf(name)}) format("woff2");unicode-range:${RANGES[name]};}`).join('\n');
const dataFontFaces = fontFaces(name => 'data:font/woff2;base64,' + FONT_FILES[name].toString('base64'));

// ---------------------------------------------------------------- app context like the Android WebView

/**
 * Context for the app with Noto Sans Thai: the app's css/style.css gets the @font-face rules (same origin, allowed by
 * the app's CSP), the fonts are served from /__store/fonts/.
 */
// like the app's WebView: MainActivity appends " DocScannerPDF/<version>" to the user agent (the page shows "v1.0.N")
const APP_VERSION = require('../release/version').parse(fs.readFileSync(path.join(H.ROOT, 'CHANGELOG.md'), 'utf8')).version;
const APP_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 DocScannerPDF/' + APP_VERSION;

async function storeContext(browser, opts) {
  const ctx = await H.newAppContext(browser, Object.assign({ hasTouch: true, permissions: ['camera'], userAgent: APP_UA }, opts));
  await ctx.route(APP_ORIGIN + '/__store/fonts/*', route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    if (!FONT_FILES[name]) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'font/woff2', body: FONT_FILES[name] });
  });
  await ctx.route(APP_ORIGIN + '/css/style.css', async route => {
    const css = fs.readFileSync(path.join(H.WWW_DIR, 'css/style.css'), 'utf8');
    return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: fontFaces(n => '/__store/fonts/' + n) + '\n' + css });
  });
  return ctx;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataUrl = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

const BASE_CSS = `
${dataFontFaces}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden}
body{font-family:"Noto Sans Thai",sans-serif;color:#fff;-webkit-font-smoothing:antialiased;
  background:radial-gradient(120% 80% at 15% 0%,#4f86ff 0%,rgba(79,134,255,0) 55%),
             radial-gradient(90% 70% at 100% 100%,#0b2a8f 0%,rgba(11,42,143,0) 60%),
             linear-gradient(160deg,#2b6bff 0%,#1f5eff 40%,#1646c9 100%)}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.10) 1.2px,transparent 1.3px);background-size:28px 28px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 55%)}
.device{position:absolute;background:#0d1117;box-shadow:0 40px 80px rgba(3,10,40,.45),0 8px 24px rgba(3,10,40,.35),inset 0 0 0 2px #2a3140}
.device img{position:absolute;display:block}
h1{font-weight:700;letter-spacing:-.01em;line-height:1.15}
p{font-weight:500;opacity:.9;line-height:1.3}
`;

/** The launcher icon as SVG (paths of res/drawable/ic_launcher_foreground.xml on the icon background colour) */
function iconSvg(size) {
  const xml = fs.readFileSync(path.join(RES, 'drawable/ic_launcher_foreground.xml'), 'utf8');
  const bg = /name="icon_background">#(?:FF)?([0-9A-Fa-f]{6})</.exec(fs.readFileSync(path.join(RES, 'values/colors.xml'), 'utf8'))[1];
  const color = c => c && /^#([0-9A-F]{2})([0-9A-F]{6})$/i.test(c)
    ? (c.slice(1, 3).toUpperCase() === '00' ? 'none' : '#' + c.slice(3)) : (c || 'none');
  const paths = [...xml.matchAll(/<path([\s\S]*?)\/>/g)].map(m => {
    const a = k => (new RegExp('android:' + k + '="([^"]*)"').exec(m[1]) || [])[1];
    return `<path d="${a('pathData')}" fill="${color(a('fillColor'))}" stroke="${color(a('strokeColor'))}"` +
      ` stroke-width="${a('strokeWidth') || 0}" stroke-linecap="${a('strokeLineCap') || 'butt'}"/>`;
  });
  // adaptive icon: 108 × 108 with the artwork in the middle; the store icon shows the central 72 × 72 (like a launcher)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="18 18 72 72">` +
    `<rect x="0" y="0" width="108" height="108" fill="#${bg}"/>${paths.join('')}</svg>`;
}

async function render(browser, html, w, h, file, text = true) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async text => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    if (text && ![...document.fonts].some(f => f.family === 'Noto Sans Thai' && f.status === 'loaded')) throw new Error('Noto Sans Thai not loaded');
  }, text);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'png' });
  await page.close();
}

/** PNG size from its header */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}


/** A photo of a document as a Motion-JPEG "camera" (Chromium's fake video capture file) */
async function cameraFile(browser) {
  const file = path.join(OUT, 'camera.mjpeg');
  const page = await browser.newPage();
  const b64 = fs.readFileSync(H.fixture('photo-shadow.jpg')).toString('base64');
  const jpeg = await page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();
    // a 4:3 camera like most phone cameras (the app letterboxes it on a tall screen, as camera apps do)
    const c = document.createElement('canvas');
    c.width = 960; c.height = 1280;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, b64);
  await page.close();
  const one = Buffer.from(jpeg);
  fs.writeFileSync(file, Buffer.concat(Array(30).fill(one)));
  return file;
}

module.exports = { H, OUT, STORE, APP_ORIGIN, FONT_FILES, dataFontFaces, storeContext, cameraFile, esc, dataUrl, BASE_CSS, iconSvg, render, pngSize };
