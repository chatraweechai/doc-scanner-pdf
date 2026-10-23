'use strict';
/*
 * Converter + Android project consistency: the generated www/ is exactly what tools/convert/build.js produces from
 * the doc-scanner-pdf-code commit, the app code is byte-identical to doc-scanner-pdf-code, nothing loads from the internet, and the Android
 * project keeps its security settings (permissions, WebView, FileProvider, Gradle wrapper checksums).
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ROOT, PROJECT_DIR, WWW_DIR, KOTLIN_DIR, CLAUDE4CODE_SRC, WEB_APP, SOURCE, MIME, OUT, fs, path, suite } = require('../lib/harness');
const { build, WWW } = require('../../convert/build');

const t = suite('convert (doc-scanner-pdf-code → Android)');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(p);
const text = p => fs.readFileSync(p, 'utf8');
const walk = (dir, base = dir) => fs.readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f);
  return fs.statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
});

// ---- generated files ----
const head = execFileSync('git', ['-C', CLAUDE4CODE_SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
t.check('source.json records the doc-scanner-pdf-code commit being tested', SOURCE.commit === head, `${SOURCE.commit.slice(0, 12)} vs checkout ${head.slice(0, 12)}`);
const a = build(CLAUDE4CODE_SRC);
const b = build(CLAUDE4CODE_SRC);
t.check('conversion is deterministic', a.files.size === b.files.size && [...a.files].every(([p, buf]) => b.files.get(p).equals(buf)), a.files.size + ' files');
const problems = [];
for (const [p, buf] of a.files) {
  const f = path.join(PROJECT_DIR, p);
  if (!fs.existsSync(f)) problems.push('missing ' + p);
  else if (!read(f).equals(buf)) problems.push('differs ' + p);
}
for (const p of walk(WWW_DIR)) if (!a.files.has(WWW + '/' + p)) problems.push('extra ' + p);
t.check('doc-scanner-pdf-android/ matches the converter output (no hand edits)', !problems.length, problems.slice(0, 5).join(', '));

// --as-commit: "would doc-scanner-pdf-code's current files give the same app?" — only a check, never writes files
{
  const conv = extra => {
    try { return { ok: true, out: execFileSync(process.execPath, [path.join(ROOT, 'tools/convert/build.js'), '--source', CLAUDE4CODE_SRC].concat(extra), { encoding: 'utf8', stdio: 'pipe' }) }; }
    catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
  };
  const same = conv(['--check', '--as-commit', SOURCE.commit]);
  // another commit with the same files (commit-tree: works in the shallow CI checkout, changes no branch or file)
  const twin = execFileSync('git', ['-C', CLAUDE4CODE_SRC, '-c', 'user.name=test', '-c', 'user.email=test@example.com',
    'commit-tree', 'HEAD^{tree}', '-m', 'as-commit test'], { encoding: 'utf8' }).trim();
  const renamed = conv(['--check', '--as-commit', twin]);
  const unknown = conv(['--check', '--as-commit', 'f'.repeat(40)]);
  const write = conv(['--as-commit', SOURCE.commit]);
  t.check('--as-commit: same files under the recorded commit = OK; another commit name = differences; unknown commit or writing refused',
    same.ok && !renamed.ok && /ไฟล์ไม่ตรง/.test(renamed.out) && !unknown.ok && /ไม่พบ commit/.test(unknown.out) && !write.ok && /--check/.test(write.out),
    [same, renamed, unknown, write].map(r => r.ok + ':' + r.out.trim().split('\n')[0].slice(0, 80)).join(' | '));
}

// ที่มาที่บันทึกในแอปตามโครงสร้างของ commit: commit ของ repo รวม → chatraweechai/doc-scanner-pdf (doc-scanner-pdf-code/doc-scanner-pdf);
// commit ก่อนรวม repo (เว็บแอปอยู่บนสุด) → chatraweechai/doc-scanner-pdf-code (doc-scanner-pdf) — การรวม repo จึงไม่เปลี่ยนไฟล์แอป
{
  const json = r => JSON.parse(r.files.get('source.json').toString('utf8'));
  const mono = json(build(path.join(ROOT, '../doc-scanner-pdf-code')));
  const tested = json(a);
  const testedMono = path.basename(CLAUDE4CODE_SRC) === 'doc-scanner-pdf-code' &&
    fs.existsSync(path.join(CLAUDE4CODE_SRC, '..', 'doc-scanner-pdf-android'));
  t.check('source.json/platform.js record the repository of the converted commit (merged repository or, before the merge, doc-scanner-pdf-code)',
    mono.repo === 'chatraweechai/doc-scanner-pdf' && mono.path === 'doc-scanner-pdf-code/doc-scanner-pdf' &&
    tested.repo === (testedMono ? mono.repo : 'chatraweechai/doc-scanner-pdf-code') && tested.path === (testedMono ? mono.path : 'doc-scanner-pdf') &&
    SOURCE.repo === tested.repo && SOURCE.path === tested.path,
    `${mono.repo}:${mono.path} / tested ${tested.repo}:${tested.path} / source.json ${SOURCE.repo}:${SOURCE.path}`);
}

// ---- app code unchanged ----
const appFiles = walk(WEB_APP).filter(p => /^(js|css)\//.test(p) && p !== 'js/boot.js');
const changed = appFiles.filter(p => !fs.existsSync(path.join(WWW_DIR, p)) || !read(path.join(WWW_DIR, p)).equals(read(path.join(WEB_APP, p))));
t.check('app JS/CSS are byte-identical to doc-scanner-pdf-code (same code on web and Android)', appFiles.length > 8 && !changed.length, `${appFiles.length} files ${changed.join(' ')}`);
t.check('boot.js (web loader) is replaced by android/platform.js', !fs.existsSync(path.join(WWW_DIR, 'js/boot.js')) && fs.existsSync(path.join(WWW_DIR, 'android/platform.js')));

const vendor = walk(path.join(WEB_APP, 'vendor'));
const vendorBad = vendor.filter(p => !read(path.join(WWW_DIR, 'vendor', p)).equals(read(path.join(WEB_APP, 'vendor', p))));
let sumsOk = 0;
for (const lib of fs.readdirSync(path.join(WWW_DIR, 'vendor'))) {
  for (const line of text(path.join(WWW_DIR, 'vendor', lib, 'SHA256SUMS')).split('\n').filter(Boolean)) {
    const [hash, name] = line.split(/\s+\*?/);
    if (sha(read(path.join(WWW_DIR, 'vendor', lib, name.replace(/^\.\//, '')))) === hash) sumsOk++;
    else vendorBad.push('checksum ' + lib + '/' + name);
  }
}
t.check('vendored libraries identical to doc-scanner-pdf-code and match their SHA256SUMS', !vendorBad.length && sumsOk >= 10, `${vendor.length} files, ${sumsOk} checksums ${vendorBad.join(' ')}`);

// ---- index.html: offline, strict CSP, script order ----
const html = text(path.join(WWW_DIR, 'index.html'));
const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
t.check('CSP stays strict and allows no external host', /default-src 'self'/.test(csp) && /script-src 'self'/.test(csp) && /object-src 'none'/.test(csp) &&
  /base-uri 'none'/.test(csp) && !/https?:|\*/.test(csp) && !/'unsafe-inline'/.test(csp), csp);
t.check('no reference to files on the internet (Google Fonts removed, no CDN)', !/fonts\.googleapis|fonts\.gstatic|cdn\./.test(html) &&
  ![...html.matchAll(/(?:src|href)="([^"]+)"/g)].some(m => /^(https?:)?\/\//.test(m[1]) && !m[1].startsWith('#')));
t.check('no inline scripts (CSP)', ![...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length);
const bootScripts = [...text(path.join(WEB_APP, 'js/boot.js')).match(/var SCRIPTS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const pageScripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
t.check('scripts load in boot.js order after the Android AppPlatform', JSON.stringify(pageScripts) === JSON.stringify(['android/platform.js'].concat(bootScripts)), pageScripts.join(' '));
t.check('page build stamp = converted commit', html.includes(`<meta name="app-build" content="${SOURCE.commit.slice(0, 12)}">`));

// ---- what the app serves ----
const buildMime = require('../../convert/build').MIME;
const kt = Object.fromEntries(Object.entries(MIME).map(([k, v]) => ['.' + k, v]));
t.check('converter and AssetRouter.kt agree on file types', JSON.stringify(Object.keys(kt).sort().map(k => [k, kt[k]])) === JSON.stringify(Object.keys(buildMime).sort().map(k => [k, buildMime[k]])),
  JSON.stringify(MIME));
const notServed = walk(WWW_DIR).filter(p => !MIME[(p.match(/\.([^./]+)$/) || [])[1]]);
t.check('every file the page needs has a served type (only licenses/checksums are not served)', notServed.every(p => /(^|\/)(LICENSE|SHA256SUMS)[^/]*$/.test(p)), notServed.join(' '));

// ---- Android AppPlatform ----
const platform = text(path.join(WWW_DIR, 'android/platform.js'));
t.check('android/platform.js: commit embedded, all hooks present, no eval/innerHTML',
  platform.includes(SOURCE.commit) && ['saveFile', 'shareFile', 'shareText', 'cameraHelp', 'onBack', 'resolve', 'loadScript'].every(k => platform.includes(k + ':')) &&
  !/\beval\(|new Function|innerHTML|document\.write/.test(platform));

// ---- Android project security ----
const manifest = text(path.join(PROJECT_DIR, 'app/src/main/AndroidManifest.xml'));
const perms = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(m => m[1]);
t.check('permissions: CAMERA only (no INTERNET, no storage)', JSON.stringify(perms) === '["android.permission.CAMERA"]', perms.join(' '));
t.check('Android System WebView sends no usage statistics from the app (privacy policy / Play "Data safety": no data collected)',
  /<meta-data android:name="android\.webkit\.WebView\.MetricsOptOut" android:value="true" \/>/.test(manifest));
t.check('no backup of user data, no cleartext traffic', /android:allowBackup="false"/.test(manifest) && /android:usesCleartextTraffic="false"/.test(manifest) &&
  /android:fullBackupContent="false"/.test(manifest));
const exported = [...manifest.matchAll(/<(activity|provider|service|receiver)\b[^>]*android:exported="true"/g)].map(m => m[0]);
t.check('only the launcher activity is exported; FileProvider is private', exported.length === 1 && /MainActivity/.test(exported[0]) &&
  /androidx\.core\.content\.FileProvider"[\s\S]*?android:exported="false"/.test(manifest));
t.check('rotation/resizing/folding keep the activity (no lost pages)', ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'uiMode', 'density']
  .every(c => new RegExp('configChanges="[^"]*\\b' + c + '\\b').test(manifest)) && /android:resizeableActivity="true"/.test(manifest));
const paths = text(path.join(PROJECT_DIR, 'app/src/main/res/xml/file_paths.xml'));
t.check('FileProvider shares only the cache camera/ and share/ folders', [...paths.matchAll(/<([a-z-]+-path) name="[^"]+" path="([^"]*)"/g)].map(m => m[1] + ':' + m[2]).sort().join(',') ===
  'cache-path:camera/,cache-path:share/');
const main = text(path.join(KOTLIN_DIR, 'MainActivity.kt'));
t.check('WebView: no JavaScript interface, file/content access off, bridge limited to the app origin, debugging only in debug builds',
  !/addJavascriptInterface/.test(main) && /allowFileAccess = false/.test(main) && /allowContentAccess = false/.test(main) &&
  /addWebMessageListener\(view, BRIDGE_NAME, setOf\(AssetRouter\.ORIGIN\)\)/.test(main) && /setWebContentsDebuggingEnabled\(debuggable\)/.test(main) &&
  /MIXED_CONTENT_NEVER_ALLOW/.test(main));

// ---- Gradle wrapper = official Gradle release (https://gradle.org/release-checksums/) ----
const OFFICIAL = { '9.8.0': { bin: 'bafd5ce9cfaea0fbccfdc8439a1ac42fbd4cd9c89dc9a988228d8a2639a58e6c', jar: '238e777fcddd7e34f9708186085def2abd6e08e658505b38718d79d74c21abd5' } };
const props = text(path.join(PROJECT_DIR, 'gradle/wrapper/gradle-wrapper.properties'));
const version = (props.match(/gradle-([\d.]+)-bin\.zip/) || [])[1];
const known = OFFICIAL[version];
t.check('Gradle wrapper jar and distribution checksum are the official ones for ' + version,
  known && sha(read(path.join(PROJECT_DIR, 'gradle/wrapper/gradle-wrapper.jar'))) === known.jar &&
  props.includes('distributionSha256Sum=' + known.bin) && /distributionUrl=https\\:\/\/services\.gradle\.org\//.test(props),
  known ? '' : 'add the checksums of Gradle ' + version + ' from gradle.org/release-checksums to this test');
const gitignore = fs.existsSync(path.join(ROOT, '.gitignore')) ? text(path.join(ROOT, '.gitignore')) : '';
// กุญแจเซ็นแอปถาวรให้เฉพาะ build ของ main ที่ออก Release — branch อื่น, PR และรอบตรวจรายวันไม่ได้รับ
const WORKFLOWS = path.join(ROOT, '../.github/workflows'); // workflow ของ repo รวม chatraweechai/doc-scanner-pdf
const workflow = fs.readFileSync(path.join(WORKFLOWS, 'android.yml'), 'utf8');
const secretLines = workflow.split('\n').filter(l => /secrets\.ANDROID_/.test(l)).map(l => l.trim());
const gatedSecret = /^[A-Z0-9_]+: \$\{\{ env\.RELEASE_BUILD == 'true' && secrets\.ANDROID_[A-Z0-9_]+ \|\| '' \}\}$/;
const presenceOnly = /^HAS_KEY: \$\{\{ secrets\.ANDROID_KEYSTORE_BASE64 != '' \}\}$/;
t.check('signing secrets reach only release builds of main (not branches, pull requests or scheduled runs)',
  workflow.includes("RELEASE_BUILD: ${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') }}") &&
  secretLines.filter(l => gatedSecret.test(l)).length === 4 && secretLines.every(l => gatedSecret.test(l) || presenceOnly.test(l)),
  secretLines.filter(l => !gatedSecret.test(l) && !presenceOnly.test(l)).join(' | '));
// เว็บแอปต้นทางอยู่ใน repo เดียวกัน (doc-scanner-pdf-code/ หรือประวัติก่อนรวม repo เมื่อ 2026-10-22): workflow ใช้ commit ใน source.json
// ผ่าน tools/ci/source-checkout.sh (ประวัติทั้งหมด) — ไม่ checkout repo โค้ดอื่น (repo เดียวที่ checkout เพิ่มได้คือเว็บไซต์)
// ไม่มี deploy key ของ repo โค้ดเดิม และไม่อ้างถึงชื่อ repo เดิมของ chatrawichai-tech ที่ใช้ไม่ได้แล้ว
{
  for (const name of ['android.yml', 'play.yml']) {
    const wf = fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
    const repos = [...wf.matchAll(/^\s+repository: (\S+)\s*$/gm)].map(m => m[1]);
    const uses = wf.split('tools/ci/source-checkout.sh "$RUNNER_TEMP/code-src"').length - 1;
    const body = wf.slice(wf.indexOf('\nname:'));
    t.check(`${name}: the web app comes from this repository at the commit in source.json (tools/ci/source-checkout.sh); no other code repository or its key; no removed repository names`,
      uses === (name === 'android.yml' ? 2 : 1) && /^\s+working-directory: doc-scanner-pdf-android\s*$/m.test(wf) &&
      repos.every(r => r === 'doc-scanner-pdf/doc-scanner-pdf.github.io') && !wf.includes('CLAUDE_REPO_KEY') &&
      !/chatrawichai-tech|claude4code|claude4app|claude4gas/.test(body),
      `${uses} source checkouts, repositories ${repos.join(' ') || '-'}`);
  }
}
// Release สาธารณะเซ็นด้วยกุญแจถาวรเสมอ: ไม่มี secret กุญแจ → ไม่ออก Release (ล้มพร้อมบอกวิธี) และตรวจว่า APK ไม่ได้เซ็นด้วยกุญแจ debug ก่อนสร้าง
{
  const job = workflow.slice(workflow.indexOf('\n  release:'), workflow.indexOf('\n  site:'));
  const gate = job.indexOf('if [ "$HAS_KEY" != "true" ]'), create = job.indexOf('gh release create');
  t.check('release: never published without the permanent signing key, and never a debug-signed APK',
    gate > 0 && create > gate && /if \[ "\$HAS_KEY" != "true" \]; then[\s\S]*?exit 1\n\s+fi/.test(job.slice(gate, create)) &&
    job.indexOf("grep -q 'CN=Android Debug'") > gate && job.indexOf("grep -q 'CN=Android Debug'") < create && !job.includes('กุญแจชั่วคราวของเครื่อง build'));
}
// หน้าดาวน์โหลดสาธารณะ (tools/site/build-page.js → doc-scanner-pdf/doc-scanner-pdf.github.io, https://doc-scanner-pdf.github.io/android/)
{
  const { build: buildPage } = require('../../site/build-page');
  const site = path.join(OUT, 'site', 'android');
  fs.rmSync(path.dirname(site), { recursive: true, force: true });
  const fakeApk = n => { const f = path.join(OUT, `fake-${n}.apk`); const b = Buffer.alloc(4096 + n, n); b.writeUInt32LE(0x04034b50, 0); fs.writeFileSync(f, b); return f; };
  const base = { out: site, cert: 'ab'.repeat(32), source: 'c'.repeat(40), app: 'd'.repeat(40), published: '2026-09-28T04:25:48Z' };
  const notesFile = path.join(OUT, 'notes.md');
  fs.writeFileSync(notesFile, '- **แก้** กล้อง `camera` <script>alert(1)</script>\n  บรรทัดต่อ\n- ข้อที่สอง\n\nไม่ใช่รายการ\n');
  buildPage(Object.assign({ apk: fakeApk(1), version: '1.0.7' }, base));
  const v = buildPage(Object.assign({ apk: fakeApk(2), version: '1.0.8', notes: notesFile }, base));
  const files = fs.readdirSync(site).sort();
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const vj = JSON.parse(fs.readFileSync(path.join(site, 'version.json'), 'utf8'));
  const apkHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(site, 'doc-scanner-pdf-1.0.8.apk'))).digest('hex');
  const privacy = fs.readFileSync(path.join(site, 'privacy.html'), 'utf8');
  t.check('privacy policy page (Thai + English, linked from the download page): no data collected, no internet, camera on device only; no scripts, strict CSP',
    html.includes('href="privacy.html"') && privacy.includes('ไม่เก็บและไม่ส่งข้อมูลใด ๆ') && privacy.includes('No data is collected or shared.') &&
    privacy.includes('io.github.chatrawichaitech.docscanner') && /no internet permission/.test(privacy) && !/<script/i.test(privacy) &&
    privacy.includes(`content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'"`));
  // เว็บแอปอยู่บนสุดของเว็บไซต์ (https://doc-scanner-pdf.github.io/): หน้าดาวน์โหลดลิงก์ไปที่ ../index.html และใช้ site.css ของโฟลเดอร์เอง
  const css = fs.readFileSync(path.join(site, 'site.css'), 'utf8');
  t.check('download page and privacy policy use relative links only (they work at the site root and in a sub-folder): site.css, ../index.html (the web app at the top of the site), ./index.html',
    [html, privacy].every(p => !/(href|src)="\//.test(p) && p.includes('href="site.css"') && !p.includes('../site.css') && !p.includes('../doc-scanner-pdf/')) &&
    html.split('href="../index.html"').length === 3 && privacy.includes('href="./index.html"') && !/chatrawichai-tech/.test(html + privacy) &&
    css.includes('code.hash') && !/@import|url\(|<|expression\(/i.test(css), `${css.length} B site.css`);
  t.check('privacy policy: contact only through the developer email of the Google Play page (no other contact links)',
    privacy.includes('ทางอีเมลของผู้พัฒนาที่แสดงในหน้าแอปบน Google Play</li>') && privacy.includes("the developer email shown on the app's Google Play page.</li>") &&
    !/github\.com/.test(privacy));
  t.check('download page: only the latest APK, its page, the privacy policy, site.css and version.json; hashes match; no scripts, strict CSP',
    JSON.stringify(files) === JSON.stringify(['doc-scanner-pdf-1.0.8.apk', 'index.html', 'privacy.html', 'site.css', 'version.json']) && vj.sha256 === apkHash && v.sha256 === apkHash &&
    vj.version === '1.0.8' && vj.versionCode === 1000008 && html.includes('href="doc-scanner-pdf-1.0.8.apk" download') && html.includes(apkHash) &&
    html.includes('AB:AB:AB') && !/<script/i.test(html) && html.includes(`content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'"`),
    files.join(' '));
  t.check('download page: "มีอะไรใหม่" lists this version\'s changelog as plain escaped text',
    JSON.stringify(vj.notes) === JSON.stringify(['แก้ กล้อง camera <script>alert(1)</script> บรรทัดต่อ', 'ข้อที่สอง']) &&
    html.includes('<h2>มีอะไรใหม่ในรุ่น 1.0.8</h2>') && html.includes('<li>แก้ กล้อง camera &lt;script&gt;alert(1)&lt;/script&gt; บรรทัดต่อ</li>') && !/<script/i.test(html),
    JSON.stringify(vj.notes));
  const refused = [
    { apk: fakeApk(3), version: '1.0.9"><script>' }, { apk: fakeApk(3), version: '1.0.9', cert: 'xyz' },
    { apk: fakeApk(3), version: '1.0.9', source: 'main' }, { apk: path.join(ROOT, 'README.md'), version: '1.0.9' },
    { apk: fakeApk(3), version: '1.0.9', out: path.join(OUT, 'site', 'elsewhere') }, { apk: fakeApk(3), version: '1.0' },
    { apk: fakeApk(3), version: '1.0.1000' },
  ].filter(o => { try { buildPage(Object.assign({}, base, o)); return false; } catch (e) { return /build-page:/.test(e.message); } });
  t.check('download page: bad version, certificate, commit, non-APK file or folder name are refused', refused.length === 7, `${refused.length}/7`);
  fs.rmSync(path.dirname(site), { recursive: true, force: true });
}
// กุญแจเขียน repo เว็บไซต์ (SITE_DEPLOY_KEY) ใช้เฉพาะงาน site ของ main หลัง release และตรวจว่า APK เซ็นด้วยกุญแจถาวร
{
  const siteJob = workflow.slice(workflow.indexOf('\n  site:'));
  const before = workflow.slice(0, workflow.indexOf('\n  site:'));
  const uses = [...workflow.matchAll(/^.*secrets\.SITE_DEPLOY_KEY.*$/gm)].map(m => m[0].trim());
  t.check('site deploy key: only in the site job (after the release, main only), as checkout key or yes/no; the Release\'s own APK; debug-signed APKs and older versions refused',
    !before.includes('SITE_DEPLOY_KEY') && /\n    needs: \[release\]\n/.test(siteJob) &&
    siteJob.includes("if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && needs.release.outputs.publish == 'true'") &&
    siteJob.includes('gh release download "v${APP_VERSION}"') && siteJob.includes('expected exactly one signing certificate') &&
    uses.length === 2 && uses.every(l => /^ssh-key: \$\{\{ secrets\.SITE_DEPLOY_KEY \}\}/.test(l) || /^HAS_KEY: \$\{\{ secrets\.SITE_DEPLOY_KEY != '' \}\}$/.test(l)) &&
    siteJob.includes('CN=Android Debug') && siteJob.includes('tools/site/build-page.js') &&
    siteJob.includes('[ "$cur" -gt "$code" ]'), uses.join(' | '));
}
// เลขรุ่นจาก CHANGELOG.md และออก Release เฉพาะรุ่นใหม่ของแอปที่เปลี่ยนจริง (ห้ามรุ่นใหม่ปลอม/ออกซ้ำ)
{
  const version = require('../../release/version');
  const top = version.parse(text(path.join(ROOT, 'CHANGELOG.md')));
  const gradle = text(path.join(PROJECT_DIR, 'app/build.gradle.kts'));
  t.check('version: top heading of CHANGELOG.md (with notes) drives Gradle versionName/versionCode; no run-number versions',
    /^\d+\.\d+\.\d+$/.test(top.version) && top.notes.length > 20 && gradle.includes('../CHANGELOG.md') && gradle.includes('versionName = appVersionName') &&
    gradle.includes('major * 1_000_000 + minor * 1_000 + patch') && !/VERSION_CODE|run_number|GITHUB_RUN_NUMBER/.test(gradle + workflow),
    `v${top.version} (${top.code})`);
  // a scratch git repository: the app, the changelog and release tags
  const repo = fs.mkdtempSync(path.join(OUT, 'release-'));
  const g = (...args) => execFileSync('git', ['-C', repo].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const put = (f, body) => { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), body); };
  const changelog = (...vs) => '# log\n\n' + vs.map(x => `## v${x} — 2026-09-28\n\n- change in ${x}\n`).join('\n');
  const commit = msg => { g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', msg); };
  const decide = () => { try { return version.decide(repo); } catch (e) { return { action: 'error', reason: e.message }; } };
  g('init', '-q');
  put('doc-scanner-pdf-android/app/src/main/assets/www/index.html', 'v1');
  put('CHANGELOG.md', changelog('1.0.16'));
  commit('app 1.0.16');
  const first = decide();                                           // no tags yet → first release
  g('tag', 'v1.0.16');
  put('README.md', 'docs'); put('.github/workflows/android.yml', 'ci'); commit('docs and CI only');
  const docsOnly = decide();                                         // released, app unchanged → skip
  put('doc-scanner-pdf-android/app/src/main/assets/www/index.html', 'v2'); commit('app change without a version');
  const noVersion = decide();                                        // app changed, still 1.0.16 → error
  put('CHANGELOG.md', changelog('1.0.17', '1.0.16')); commit('1.0.17');
  const newVersion = decide();                                       // new version + app change → release
  g('tag', 'v1.0.17');
  put('CHANGELOG.md', changelog('1.0.18', '1.0.17', '1.0.16')); commit('fake 1.0.18');
  const fake = decide();                                             // new version, app unchanged → error
  put('CHANGELOG.md', changelog('1.0.15', '1.0.17', '1.0.16')); commit('older number');
  const older = decide();                                            // not newer than v1.0.17 → error
  put('CHANGELOG.md', '# log\n\n## v1.0.18 — 2026-09-28\n\n## v1.0.17\n- x\n'); commit('empty entry');
  const empty = decide();                                            // version without notes → error
  // merged into a bigger repository (2026-10-22): everything moves into doc-scanner-pdf-android/; tags from before still count
  put('CHANGELOG.md', changelog('1.0.17', '1.0.16')); commit('back to 1.0.17');
  fs.mkdirSync(path.join(repo, 'doc-scanner-pdf-android.tmp'));
  for (const f of g('ls-tree', '--name-only', 'HEAD').trim().split('\n')) g('mv', f, 'doc-scanner-pdf-android.tmp/');
  g('mv', 'doc-scanner-pdf-android.tmp', 'doc-scanner-pdf-android');
  put('doc-scanner-pdf-code/doc-scanner-pdf/index.html', 'web'); commit('move into the merged repository');
  const sub = path.join(repo, 'doc-scanner-pdf-android');
  const decideIn = () => { try { return version.decide(sub); } catch (e) { return { action: 'error', reason: e.message }; } };
  const moved = decideIn();                                          // same app, only moved → skip
  put('doc-scanner-pdf-android/doc-scanner-pdf-android/app/src/main/assets/www/index.html', 'v3'); commit('app change after the move');
  const movedChange = decideIn();                                    // app changed since v1.0.17 → error
  fs.rmSync(repo, { recursive: true, force: true });
  t.check('release decision after the move into chatraweechai/doc-scanner-pdf: moving the folder is no app change; a real change still needs a new version',
    moved.action === 'skip' && moved.tag === 'v1.0.17' && movedChange.action === 'error' && /เพิ่มรุ่นใหม่/.test(movedChange.reason),
    [moved, movedChange].map(r => r.action + ':' + r.reason).join(' | '));
  t.check('release decision: first/new version of a changed app → release; docs/CI-only → skip; app change without version, fake or older version, empty notes → error',
    first.action === 'release' && docsOnly.action === 'skip' && noVersion.action === 'error' && /เพิ่มรุ่นใหม่/.test(noVersion.reason) &&
    newVersion.action === 'release' && newVersion.tag === 'v1.0.17' && newVersion.latest === 'v1.0.16' && /change in 1\.0\.17/.test(newVersion.notes) &&
    fake.action === 'error' && /ปลอม/.test(fake.reason) && older.action === 'error' && /ไม่ใหม่กว่า/.test(older.reason) && empty.action === 'error',
    [first, docsOnly, noVersion, newVersion, fake, older, empty].map(r => r.action).join(' '));
  // รุ่นก่อนรวม repo: Release อยู่ใน repo เดิม, commit ที่บันทึกไว้อยู่ในประวัติของ repo นี้และใช้แทน tag (ไม่ออก v1.0.21 ซ้ำ)
  const former = Object.keys(version.FORMER.releases).map(tag => { try { return version.release(ROOT, tag); } catch (e) { return { tag, error: e.message }; } });
  t.check('releases from before the merge: recorded commits are in this history and count as release tags; their files come from the former repository',
    former.length >= 1 && former.every(r => /^[0-9a-f]{40}$/.test(r.commit || '') && r.repo === 'chatraweechai/doc-scanner-pdf-android') &&
    version.FORMER.releases['v1.0.21'] === '792cba0a070c51569340109fdb4bbd5e6caf81dc' &&
    (workflow.match(/node tools\/release\/version\.js --release/g) || []).length === 1 &&
    text(path.join(WORKFLOWS, 'play.yml')).includes('node tools/release/version.js --release'),
    JSON.stringify(former));
  const release = workflow.slice(workflow.indexOf('\n  release:'), workflow.indexOf('\n  site:'));
  t.check('workflow: build fails early on a bad version; release/site only for a new version (tools/release/version.js --decide)',
    (workflow.match(/node tools\/release\/version\.js --decide/g) || []).length === 2 && release.includes('if [ "$action" != "release" ]') &&
    release.includes('released=true') && release.includes('fetch-depth: 0'), '');
}
t.check('.gitignore keeps keystores, local.properties and build output out of git', ['*.jks', '*.keystore', 'local.properties', 'build/'].every(p => gitignore.includes(p)));

t.finish();
