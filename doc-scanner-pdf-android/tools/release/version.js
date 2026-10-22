#!/usr/bin/env node
'use strict';
/*
 * เลขรุ่นของแอปและการตัดสินว่าจะออก Release หรือไม่ — จาก CHANGELOG.md (หัวข้อบนสุด "## v1.0.17 — 2026-09-28")
 *
 *   node tools/release/version.js                    {"version","code","date","notes"} ของรุ่นบนสุด
 *   node tools/release/version.js --decide           ออก Release ไหม (เทียบกับ tag v* ใน git):
 *        release  รุ่นใหม่ (ใหม่กว่า tag ล่าสุด) และแอปเปลี่ยนจาก tag ล่าสุด
 *        skip     รุ่นนี้ออกไปแล้ว และแอปไม่เปลี่ยนตั้งแต่นั้น (แก้แค่ CI/ชุดทดสอบ/เอกสาร — ไม่มีรุ่นใหม่ปลอม)
 *        ผิดพลาด  แอปเปลี่ยนแต่ไม่มีรุ่นใหม่ใน CHANGELOG.md / มีรุ่นใหม่แต่แอปไม่เปลี่ยน / เลขรุ่นไม่ใหม่กว่า
 *   node tools/release/version.js --notes <file>     บันทึกของรุ่นบนสุด (markdown) สำหรับ Release และหน้าดาวน์โหลด
 *   --repo <dir>  repo ที่ตรวจ (ค่าเริ่มต้น: repo นี้)
 *
 * เจ้าของ repo สั่ง (2026-09-28): ห้ามสร้าง release ซ้ำของเดิม หรือเวอร์ชันใหม่ปลอม (เวอร์ชันเก่า แค่เปลี่ยนเลขใหม่) เด็ดขาด
 * "แอปเปลี่ยน" = ไฟล์ที่ประกอบเป็น APK เปลี่ยน (APP_PATHS) — versionName มาจาก CHANGELOG.md จึงไม่นับรวม
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const APP_PATHS = [
  'doc-scanner-pdf-android/app/src/main',
  'doc-scanner-pdf-android/app/build.gradle.kts',
  'doc-scanner-pdf-android/app/proguard-rules.pro',
  'doc-scanner-pdf-android/build.gradle.kts',
  'doc-scanner-pdf-android/settings.gradle.kts',
  'doc-scanner-pdf-android/gradle.properties',
  'doc-scanner-pdf-android/gradle'
];
const HEADING = /^## v(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?=\s)(.*)$/m;

function fail(msg) { const e = new Error(msg); e.release = true; throw e; }

function parse(text) {
  const m = HEADING.exec(text);
  if (!m) fail('CHANGELOG.md ไม่มีหัวข้อเลขรุ่น (## v1.0.N — วันที่)');
  const [major, minor, patch] = m.slice(1, 4).map(Number);
  const version = `${major}.${minor}.${patch}`;
  const date = (/(\d{4}-\d{2}-\d{2})/.exec(m[4]) || [])[1] || '';
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  const notes = (next ? rest.slice(0, next.index) : rest).trim();
  if (!notes) fail(`CHANGELOG.md: รุ่น v${version} ยังไม่มีรายการการเปลี่ยนแปลง`);
  return { version, code: major * 1000000 + minor * 1000 + patch, date, notes };
}

const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const nums = v => v.split('.').map(Number);

function decide(repo) {
  const git = args => execFileSync('git', ['-C', repo].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const info = parse(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8'));
  const tag = 'v' + info.version;
  const tags = git(['tag', '-l', 'v*']).split('\n').filter(t => /^v\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t));
  const latest = tags.slice().sort((a, b) => cmp(nums(a.slice(1)), nums(b.slice(1)))).pop() || '';
  // ไฟล์แอปที่ ref เทียบด้วย id ของ tree/blob: ในโฟลเดอร์นี้ของ repo รวม chatraweechai/doc-scanner-pdf หรือ tag ก่อนรวม repo
  // (2026-10-22, chatraweechai/doc-scanner-pdf-android ที่โฟลเดอร์นี้อยู่บนสุด) — ย้ายโฟลเดอร์อย่างเดียวไม่นับว่าแอปเปลี่ยน
  const prefix = git(['rev-parse', '--show-prefix']);
  const object = (ref, p) => {
    for (const pre of new Set([prefix, ''])) {
      try { return git(['rev-parse', '--verify', '--quiet', `${ref}:${pre}${p}`]); } catch (e) { /* ไม่มีในโครงสร้างนี้ */ }
    }
    return '';
  };
  const changedSince = ref => {
    try { git(['rev-parse', '--verify', '--quiet', ref + '^{commit}']); } catch (e) { fail(`เทียบกับ ${ref} ไม่ได้: ไม่พบ commit`); }
    return APP_PATHS.some(p => object(ref, p) !== object('HEAD', p));
  };
  if (tags.includes(tag)) {
    if (changedSince(tag)) fail(`แอปเปลี่ยนตั้งแต่ ${tag} แต่ CHANGELOG.md ยังเป็น v${info.version} — เพิ่มรุ่นใหม่ (## v…) พร้อมรายการการเปลี่ยนแปลง`);
    return Object.assign({ action: 'skip', tag, latest, reason: `${tag} ออกไปแล้ว และแอปไม่เปลี่ยนตั้งแต่นั้น — ไม่ออกรุ่นใหม่` }, info);
  }
  if (latest && cmp(nums(info.version), nums(latest.slice(1))) <= 0) fail(`v${info.version} ไม่ใหม่กว่ารุ่นล่าสุด ${latest}`);
  if (latest && !changedSince(latest)) fail(`CHANGELOG.md มีรุ่นใหม่ v${info.version} แต่แอปไม่เปลี่ยนจาก ${latest} — ห้ามออกเวอร์ชันใหม่ปลอม`);
  return Object.assign({ action: 'release', tag, latest, reason: latest ? `แอปเปลี่ยนจาก ${latest}` : 'รุ่นแรก' }, info);
}

function main(argv) {
  let repo = ROOT, mode = 'info', notesFile = '';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--repo') repo = path.resolve(argv[++i] || '');
    else if (argv[i] === '--decide') mode = 'decide';
    else if (argv[i] === '--notes') { mode = 'notes'; notesFile = argv[++i] || ''; }
    else fail('ไม่รู้จักตัวเลือก ' + argv[i]);
  }
  if (mode === 'decide') return decide(repo);
  const info = parse(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8'));
  if (mode === 'notes') {
    if (!notesFile) fail('--notes ต้องระบุไฟล์');
    fs.writeFileSync(notesFile, info.notes + '\n');
  }
  return info;
}

module.exports = { parse, decide, APP_PATHS };

if (require.main === module) {
  try {
    console.log(JSON.stringify(main(process.argv)));
  } catch (e) {
    console.error('version: ' + e.message);
    process.exit(1);
  }
}
