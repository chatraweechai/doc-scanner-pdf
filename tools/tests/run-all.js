'use strict';
/*
 * Runs every browser test suite (each in its own process) and exits non-zero if any fails.
 *   node run-all.js              → all suites
 *   node run-all.js ocr e2e      → only the named suites
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'suites');
const all = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
const wanted = process.argv.slice(2);
const unknown = wanted.filter(n => !all.includes(n));
if (unknown.length) {
  console.error('Unknown suite(s): ' + unknown.join(', ') + '\nAvailable: ' + all.join(', '));
  process.exit(2);
}

const summary = [];
for (const name of wanted.length ? wanted : all) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, name + '.js')], { stdio: 'inherit', timeout: 15 * 60000 });
  const ok = r.status === 0;
  summary.push({ name, ok, secs: ((Date.now() - t0) / 1000).toFixed(0), why: r.error ? r.error.message : r.signal || '' });
}

console.log('\n=== Summary ===');
for (const s of summary) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name.padEnd(16)} ${s.secs}s ${s.why}`);
const failed = summary.filter(s => !s.ok).length;
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
