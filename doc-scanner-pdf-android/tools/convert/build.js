#!/usr/bin/env node
'use strict';
/*
 * แปลงเว็บแอป doc-scanner-pdf (โฟลเดอร์ doc-scanner-pdf-code/ ของ repo chatraweechai/doc-scanner-pdf — ก่อน 2026-10-22 คือ repo
 * chatraweechai/doc-scanner-pdf-code) เป็นไฟล์หน้าเว็บในแอป Android — คำสั่งด้านล่างรันในโฟลเดอร์ doc-scanner-pdf-android/
 *
 *   node tools/convert/build.js --source ../doc-scanner-pdf-code            สร้าง/อัปเดตไฟล์ใน doc-scanner-pdf-android/
 *   node tools/convert/build.js --source ../doc-scanner-pdf-code --check    ตรวจว่าไฟล์ใน repo ตรงกับผลการแปลง (ใช้ใน CI)
 *   node tools/convert/build.js --source ../doc-scanner-pdf-code --check --as-commit <commit ใน source.json>
 *        แปลงไฟล์ปัจจุบันของ doc-scanner-pdf-code แต่ใช้ชื่อ commit เดิม — OK = แอปไม่เปลี่ยน ไม่ต้องแปลง/commit/release ใหม่
 *        (เจ้าของ repo สั่ง: การเปลี่ยนแปลงที่ไม่ทำให้แอปต่างจากเดิมห้ามสร้าง release ซ้ำหรือเวอร์ชันใหม่ปลอม)
 *
 * ผลลัพธ์ (สร้างใหม่ทั้งหมด ห้ามแก้เอง — แก้ที่ ../doc-scanner-pdf-code หรือ tools/convert/templates แล้วแปลงใหม่):
 *   doc-scanner-pdf-android/app/src/main/assets/www/   หน้าเว็บของแอป: โค้ด CSS/JS ของ doc-scanner-pdf-code ไม่แก้แม้แต่ไบต์เดียว
 *                                                      + ไลบรารีใน vendor/ (ตรวจ SHA256SUMS) + android/platform.js
 *   doc-scanner-pdf-android/source.json                commit ต้นทาง + SHA-256 ของทุกไฟล์ต้นทาง
 * แอปเปิดหน้าเว็บจาก assets ผ่าน https://appassets.androidplatform.net/ (ไม่ใช้อินเทอร์เน็ต)
 * ผลการแปลงขึ้นกับไฟล์ต้นทางเท่านั้น (ไม่มีวันเวลา) — แปลงซ้ำจาก commit เดิมต้องได้ไฟล์เหมือนเดิมทุกไบต์
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const TEMPLATES = path.join(__dirname, 'templates');
const PROJECT = 'doc-scanner-pdf-android';
const WWW = 'app/src/main/assets/www';
const APP_DIR = 'doc-scanner-pdf';
// ที่มาของ commit ที่บันทึกไว้ในแอป (android/platform.js, source.json) ดูจากโครงสร้างของ commit นั้นเอง:
// repo รวม chatraweechai/doc-scanner-pdf (เว็บแอปอยู่ใน doc-scanner-pdf-code/) หรือ commit ก่อนรวม repo เมื่อ 2026-10-22
// (chatraweechai/doc-scanner-pdf-code, เว็บแอปอยู่บนสุด) — บันทึกตามจริงของแต่ละ commit การรวม repo จึงไม่ทำให้ไฟล์แอปเปลี่ยน
// (ไฟล์แอปเปลี่ยนทั้งที่แอปไม่เปลี่ยน = รุ่นใหม่ปลอม — เจ้าของห้ามเด็ดขาด)
const MONO_REPO = 'chatraweechai/doc-scanner-pdf';
const MONO_DIR = 'doc-scanner-pdf-code';
const LEGACY_REPO = 'chatraweechai/doc-scanner-pdf-code';
// ชนิดไฟล์ที่เสิร์ฟได้ — ต้องตรงกับ AssetRouter.kt (ทดสอบใน tools/tests/suites/convert.js)
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream', '.gz': 'application/gzip',
  '.txt': 'text/plain', '.md': 'text/markdown'
};
const NOT_LISTED = /(^|\/)(SHA256SUMS)$/; // ไฟล์ใน vendor/ ที่ไม่อยู่ใน SHA256SUMS ได้

function fail(msg) { console.error('build.js: ' + msg); process.exit(1); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function read(p) { return fs.readFileSync(p); }
function readText(p) { return fs.readFileSync(p, 'utf8'); }

function parseArgs(argv) {
  const args = { source: path.resolve(ROOT, '../doc-scanner-pdf-code'), check: false, allowDirty: false, asCommit: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = path.resolve(argv[++i]);
    else if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--allow-dirty') args.allowDirty = true;
    else if (argv[i] === '--as-commit') args.asCommit = String(argv[++i] || '');
    else fail('ไม่รู้จักตัวเลือก ' + argv[i]);
  }
  if (args.asCommit && !/^[0-9a-f]{40}$/.test(args.asCommit)) fail('--as-commit ต้องเป็นเลข commit เต็ม 40 หลัก');
  // ห้ามเขียนไฟล์ที่อ้างชื่อ commit ไม่ตรงกับไฟล์จริง — ใช้ได้เฉพาะตอนตรวจ
  if (args.asCommit && !args.check) fail('--as-commit ใช้ได้กับ --check เท่านั้น');
  return args;
}

function git(src, args) { return execFileSync('git', ['-C', src].concat(args), { encoding: 'utf8' }).trim(); }

/** repo และโฟลเดอร์ของเว็บแอปใน commit ต้นทาง (ตามโครงสร้างของ commit นั้น) */
function origin(src, commit) {
  try {
    execFileSync('git', ['-C', src, 'cat-file', '-e', `${commit}:${MONO_DIR}/${APP_DIR}/index.html`], { stdio: 'ignore' });
    return { repo: MONO_REPO, path: `${MONO_DIR}/${APP_DIR}` };
  } catch (e) { return { repo: LEGACY_REPO, path: APP_DIR }; }
}

/** JSON ที่ปลอดภัยสำหรับฝังในสคริปต์ */
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function replaceOnce(text, pattern, replacement, what) {
  const m = text.match(pattern);
  if (!m) fail(`ไม่พบ${what}ใน index.html — โครงสร้างของ repo doc-scanner-pdf-code เปลี่ยน ต้องปรับ tools/convert/build.js`);
  return text.replace(pattern, replacement);
}

function walk(dir, base) {
  return fs.readdirSync(dir).sort().flatMap(f => {
    const p = path.join(dir, f);
    return fs.statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

function build(src, asCommit) {
  const app = path.join(src, APP_DIR);
  if (!fs.existsSync(path.join(app, 'index.html'))) fail('ไม่พบ ' + APP_DIR + '/index.html ใน ' + src);
  const commit = asCommit || git(src, ['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/.test(commit)) fail('อ่านเลข commit ของ repo ต้นทางไม่ได้');
  const short = commit.slice(0, 12);

  const files = new Map();      // path ใน PROJECT → Buffer
  const sources = {};           // ไฟล์ต้นทาง → sha256
  const www = (p, data) => files.set(WWW + '/' + p, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));
  const src_ = rel => { const b = read(path.join(app, rel)); sources[rel] = sha256(b); return b; };

  // ---------- โค้ดของแอป (คัดลอกไม่แก้ไข) ----------
  const boot = src_('js/boot.js').toString('utf8');
  const scriptsBlock = boot.match(/var SCRIPTS = \[([\s\S]*?)\];/);
  const stylesBlock = boot.match(/var STYLES = \[([\s\S]*?)\];/);
  if (!scriptsBlock || !stylesBlock) fail('อ่านรายการ SCRIPTS/STYLES จาก js/boot.js ไม่ได้');
  const scripts = [...scriptsBlock[1].matchAll(/\[\s*'([^']+)'\s*(,\s*true\s*)?\]/g)].map(m => {
    if (m[2]) fail(`SCRIPTS ใน boot.js มีไลบรารี ${m[1]} — ไลบรารีต้องโหลดผ่าน AppPlatform.loadScript`);
    if (!/^js\/[\w.-]+\.js$/.test(m[1])) fail('ชื่อสคริปต์ไม่ถูกต้อง: ' + m[1]);
    return m[1];
  });
  const styles = [...stylesBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  if (!scripts.length || !styles.length) fail('รายการ SCRIPTS/STYLES ว่าง');
  for (const s of styles) if (!/^css\/[\w.-]+\.css$/.test(s)) fail('ชื่อไฟล์ CSS ไม่ถูกต้อง: ' + s);

  const allJs = fs.readdirSync(path.join(app, 'js')).filter(f => f.endsWith('.js') && f !== 'boot.js').map(f => 'js/' + f).sort();
  for (const s of scripts) if (!allJs.includes(s)) fail('ไม่พบ ' + s);
  for (const rel of allJs) www(rel, src_(rel));           // รวม js/cv-worker.js (ใช้เป็น Worker)
  for (const rel of styles) www(rel, src_(rel));

  // ---------- index.html ----------
  let html = src_('index.html').toString('utf8');
  // แอปไม่มีสิทธิ์ใช้อินเทอร์เน็ต: ใช้ฟอนต์ภาษาไทยของเครื่อง (Android ใช้ Noto Sans Thai อยู่แล้ว) แทน Google Fonts
  html = replaceOnce(html, /[ \t]*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n[ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n[ \t]*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">\n/,
    '', 'Google Fonts');
  html = replaceOnce(html, /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/, (all, a, csp, b) => {
    const out = csp.replace(/ https:\/\/fonts\.googleapis\.com/g, '').replace(/ https:\/\/fonts\.gstatic\.com/g, '');
    if (/https?:/.test(out)) fail('CSP ยังมีโดเมนภายนอก: ' + out);
    if (!/script-src 'self'[^;]*;/.test(out) || !/object-src 'none'/.test(out)) fail('CSP ไม่เข้มงวดตามที่คาด: ' + out);
    return a + out + b;
  }, 'CSP meta');
  html = replaceOnce(html, /<meta name="app-build" content="__APP_BUILD__">/, `<meta name="app-build" content="${short}">`, 'meta app-build');
  html = replaceOnce(html, /[ \t]*<!-- โหลด CSS\/JS ทั้งหมดผ่าน boot\.js[\s\S]*?-->\n[ \t]*<script src="js\/boot\.js\?v=__APP_BUILD__"><\/script>\n/,
    '  <!-- Android: ไฟล์ทั้งหมดอยู่ในแอป (ไม่ต้องใช้ ?v= กันแคช) -->\n' +
    styles.map(s => `  <link rel="stylesheet" href="${s}">\n`).join('') +
    '  <!-- AppPlatform (แทน js/boot.js) อยู่ใน <head>: ซ่อนหน้าไว้จนแปลภาษาเสร็จ (ไม่เห็นภาษาไทยแวบก่อนเป็นอังกฤษ) -->\n' +
    '  <script src="android/platform.js"></script>\n', 'boot.js');
  html = replaceOnce(html, /\n<\/body>/,
    '\n  <!-- Android: โค้ดของแอปตามลำดับเดียวกับ SCRIPTS ใน boot.js -->\n' +
    scripts.map(s => `  <script src="${s}"></script>\n`).join('') + '</body>', '</body>');
  if (/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<a [^>]*href="https:[^"]*"/g, ''))) fail('index.html ยังอ้างถึงไฟล์ภายนอก');
  www('index.html', html);

  // ---------- ไลบรารี (vendor) ----------
  const vendorDir = path.join(app, 'vendor');
  for (const lib of fs.readdirSync(vendorDir).sort()) {
    const libDir = path.join(vendorDir, lib);
    if (!fs.statSync(libDir).isDirectory()) fail('ไฟล์ที่ไม่อยู่ในโฟลเดอร์ไลบรารี: vendor/' + lib);
    const sumsFile = path.join(libDir, 'SHA256SUMS');
    if (!fs.existsSync(sumsFile)) fail(`vendor/${lib} ไม่มี SHA256SUMS`);
    const listed = {};
    for (const line of readText(sumsFile).split('\n').filter(Boolean)) {
      const m = line.match(/^([0-9a-f]{64})\s+\*?(?:\.\/)?(.+)$/);
      if (!m) fail(`รูปแบบ SHA256SUMS ไม่ถูกต้อง: vendor/${lib}: ${line}`);
      listed[m[2]] = m[1];
    }
    for (const inLib of walk(libDir, libDir)) {
      const rel = `vendor/${lib}/${inLib}`;
      const buf = src_(rel);
      if (!MIME[path.extname(rel)] && !NOT_LISTED.test(rel) && !/(^|\/)(LICENSE|COPYING|NOTICE)[^/]*$/.test(rel)) fail('ไม่รู้จักชนิดไฟล์ ' + rel);
      if (listed[inLib]) {
        if (listed[inLib] !== sources[rel]) fail(`${rel} SHA-256 ไม่ตรงกับ SHA256SUMS`);
      } else if (/\.(js|wasm|gz|ttf)$/.test(rel)) {
        fail(`${rel} ไม่อยู่ใน SHA256SUMS`);
      }
      www(rel, buf);
    }
  }

  // ---------- AppPlatform ของ Android ----------
  const tpl = readText(path.join(TEMPLATES, 'platform.js'));
  if (!tpl.includes('/*@SOURCE@*/null')) fail('templates/platform.js ไม่มีตำแหน่งใส่ค่า');
  const { repo, path: appPath } = origin(src, commit);
  const source = { repo, commit, path: appPath };
  www('android/platform.js', tpl.replace('/*@SOURCE@*/null', jsonForScript(source)));

  const sortedSources = {};
  Object.keys(sources).sort().forEach(k => { sortedSources[k] = sources[k]; });
  files.set('source.json', Buffer.from(JSON.stringify({ repo, commit, path: appPath,
    generator: 'tools/convert/build.js', files: sortedSources }, null, 2) + '\n'));

  for (const p of files.keys()) {
    if (!p.startsWith(WWW + '/')) continue;
    const ext = path.extname(p);
    if (!MIME[ext] && !/(^|\/)(SHA256SUMS|LICENSE[^/]*|COPYING[^/]*|NOTICE[^/]*)$/.test(p)) fail('ไม่รู้จักชนิดไฟล์ ' + p);
  }
  return { files, commit, repo };
}

/** ไฟล์ที่ build.js เป็นเจ้าของ (ใช้ตรวจไฟล์เกิน/ขาด) */
function ownedFiles(projectDir) {
  const out = [];
  const wwwDir = path.join(projectDir, WWW);
  if (fs.existsSync(wwwDir)) out.push(...walk(wwwDir, projectDir));
  if (fs.existsSync(path.join(projectDir, 'source.json'))) out.push('source.json');
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.allowDirty) {
    const dirty = git(args.source, ['status', '--porcelain', '--', APP_DIR]);
    if (dirty) fail(`repo ต้นทางมีไฟล์ใน ${APP_DIR}/ ที่ยังไม่ commit — commit ก่อนแปลง (หรือใช้ --allow-dirty เพื่อทดสอบ)\n${dirty}`);
  }
  const head = git(args.source, ['rev-parse', 'HEAD']);
  if (args.asCommit) {
    try {
      execFileSync('git', ['-C', args.source, 'cat-file', '-e', args.asCommit + '^{commit}'], { stdio: 'ignore' });
    } catch (e) { fail('ไม่พบ commit ' + args.asCommit + ' ใน ' + args.source); }
  }
  const { files, commit, repo } = build(args.source, args.asCommit);
  const projectDir = path.join(ROOT, PROJECT);
  const from = args.asCommit && args.asCommit !== head
    ? `${origin(args.source, head).repo}@${head.slice(0, 12)} (ในชื่อ ${repo}@${commit.slice(0, 12)})` : `${repo}@${commit.slice(0, 12)}`;

  if (args.check) {
    const problems = [];
    for (const [p, b] of files) {
      const f = path.join(projectDir, p);
      if (!fs.existsSync(f)) problems.push('ขาดไฟล์ ' + p);
      else if (!read(f).equals(b)) problems.push('ไฟล์ไม่ตรง ' + p);
    }
    for (const p of ownedFiles(projectDir)) if (!files.has(p)) problems.push('ไฟล์เกิน ' + p);
    if (problems.length) {
      console.error(`${PROJECT}/ ไม่ตรงกับผลการแปลงจาก ${from}:\n  ` + problems.join('\n  '));
      if (args.asCommit) console.error('→ แอปเปลี่ยนจริง: แปลงใหม่ (node tools/convert/build.js --source ' + path.relative(ROOT, args.source) + '), ทดสอบ, เพิ่มรุ่นใหม่ใน CHANGELOG.md แล้ว push');
      process.exit(1);
    }
    console.log(`OK: ${PROJECT}/ ตรงกับ ${from} (${files.size} ไฟล์)` +
      (args.asCommit && args.asCommit !== head ? ' — แอปไม่เปลี่ยน ไม่ต้องแปลง/commit/release ใหม่' : ''));
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'android-build-'));
  for (const [p, b] of files) {
    const f = path.join(tmp, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, b);
  }
  fs.rmSync(path.join(projectDir, WWW), { recursive: true, force: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.cpSync(tmp, projectDir, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  let bytes = 0;
  for (const b of files.values()) bytes += b.length;
  console.log(`แปลง ${repo}@${commit.slice(0, 12)} → ${PROJECT}/${WWW}/ (${files.size} ไฟล์, ${(bytes / 1048576).toFixed(1)} MB)`);
}

if (require.main === module) main();
module.exports = { build, PROJECT, WWW, MIME };
