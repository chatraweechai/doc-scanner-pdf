'use strict';
/*
 * Google Play: the listing texts (tools/store/listing) and the uploader (tools/play/publish.js) against a local mock of
 * Google's OAuth and Android Publisher API — the service-account JWT is signed correctly, the calls come in the right
 * order with the right bodies, the key and token are never printed, over-long texts and a failed call leave nothing
 * committed. The workflow gives the key only to the upload step (.github/workflows/play.yml).
 */
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ROOT, fs, path, OUT, suite, run } = require('../lib/harness');

const t = suite('play (Google Play listing + upload)');
const check = t.check;
const LISTING = path.join(ROOT, 'tools/store/listing');
const PUBLISH = path.join(ROOT, 'tools/play/publish.js');
const THAI = /[฀-๿]/;
const len = s => [...s.trim()].length;

/** Mock of oauth2.googleapis.com/token and androidpublisher v3 — records every call */
function mockGoogle(publicKey, opts = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const call = { method: req.method, path: url.pathname, query: url.search, type: req.headers['content-type'] || '', auth: req.headers.authorization || '', size: body.length };
      calls.push(call);
      const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (url.pathname === '/token') {
        const p = new URLSearchParams(body.toString());
        const [h, c, s] = String(p.get('assertion') || '').split('.');
        let ok = false, claims = {};
        try {
          claims = JSON.parse(Buffer.from(c, 'base64url').toString());
          ok = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + c), publicKey, Buffer.from(s, 'base64url')) &&
            JSON.parse(Buffer.from(h, 'base64url').toString()).alg === 'RS256' && p.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer';
        } catch (e) { ok = false; }
        call.claims = claims;
        return ok ? json(200, { access_token: 'ya29.SECRET-TOKEN', expires_in: 3600 }) : json(400, { error: 'invalid_grant' });
      }
      if (call.auth !== 'Bearer ya29.SECRET-TOKEN') return json(401, { error: { code: 401, message: 'no auth' } });
      if (call.type === 'application/json') call.json = JSON.parse(body.toString() || '{}');
      const base = '/androidpublisher/v3/applications/io.github.chatrawichaitech.docscanner';
      if (req.method === 'POST' && url.pathname === base + '/edits') return json(200, { id: 'edit-1' });
      // bundles already on Google Play (edits.bundles.list) — opts.existing — and the upload (edits.bundles.upload)
      if (req.method === 'GET' && url.pathname.endsWith('/bundles')) return json(200, opts.existing ? { kind: 'androidpublisher#bundlesListResponse', bundles: opts.existing } : { kind: 'androidpublisher#bundlesListResponse' });
      if (url.pathname.includes('/bundles')) return json(200, { versionCode: 1000020, sha256: 'ab'.repeat(32) });
      if (opts.failOn && url.pathname.includes(opts.failOn)) return json(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'The caller does not have permission' } });
      if (url.pathname.endsWith(':validate') || url.pathname.endsWith(':commit')) return json(200, { id: 'edit-1' });
      if (req.method === 'DELETE') return json(200, {});
      if (url.pathname.includes('/listings/') && req.method === 'POST') return json(200, { image: { id: 'img' } });
      return json(200, call.json || {});
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + srv.address().port, calls, close: () => new Promise(d => srv.close(d)) })));
}

function publish(args, env) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [PUBLISH, ...args], { env: { PATH: process.env.PATH, ...env } });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('exit', code => resolve({ code, out }));
  });
}

/** Listing folder like tools/store/build.js makes (texts from tools/store/listing, tiny images) */
function fakeListing(dir, edit) {
  fs.rmSync(dir, { recursive: true, force: true });
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea7d6a4a10000000049454e44ae426082', 'hex');
  for (const lang of fs.readdirSync(LISTING)) {
    const d = path.join(dir, lang);
    fs.mkdirSync(path.join(d, 'phoneScreenshots'), { recursive: true });
    for (const f of fs.readdirSync(path.join(LISTING, lang))) fs.copyFileSync(path.join(LISTING, lang, f), path.join(d, f));
    fs.writeFileSync(path.join(d, 'icon.png'), png);
    fs.writeFileSync(path.join(d, 'featureGraphic.png'), png);
    for (const n of ['01', '02']) fs.writeFileSync(path.join(d, 'phoneScreenshots', n + '.png'), png);
    if (edit) edit(lang, d);
  }
  return dir;
}

run(async () => {
  // ---------------------------------------------------------------- listing texts
  const langs = fs.readdirSync(LISTING).sort();
  const txt = (l, f) => fs.readFileSync(path.join(LISTING, l, f + '.txt'), 'utf8');
  check('store listing in Thai (th) and English (en-US)', JSON.stringify(langs) === '["en-US","th"]', langs.join(' '));
  const sizes = langs.map(l => `${l}: ${len(txt(l, 'title'))}/${len(txt(l, 'short_description'))}/${len(txt(l, 'full_description'))}/${len(txt(l, 'release_notes'))}`);
  check('texts within Google Play limits (title 30, short 80, full 4000, release notes 500)', langs.every(l =>
    len(txt(l, 'title')) <= 30 && len(txt(l, 'short_description')) <= 80 && len(txt(l, 'full_description')) <= 4000 &&
    len(txt(l, 'release_notes')) <= 500 && len(txt(l, 'title')) > 0), sizes.join(', '));
  check('English listing has no Thai; Thai listing is in Thai', !['title', 'short_description', 'full_description', 'release_notes'].some(f => THAI.test(txt('en-US', f))) &&
    THAI.test(txt('th', 'title')) && THAI.test(txt('th', 'full_description')));
  const all = langs.map(l => txt(l, 'full_description') + txt(l, 'short_description') + txt(l, 'title')).join('\n');
  check('no claims Google Play rejects as misleading (100 %, best, #1, free forever …) and the offline/no-upload claim matches the app (no INTERNET permission)',
    !/100\s*%|\bbest\b|#1|number one|ดีที่สุด|อันดับ\s*1|free forever/i.test(all) &&
    !fs.readFileSync(path.join(ROOT, 'doc-scanner-pdf-android/app/src/main/AndroidManifest.xml'), 'utf8').includes('android.permission.INTERNET'));

  // ---------------------------------------------------------------- uploader against a mock of Google
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const key = JSON.stringify({ type: 'service_account', client_email: 'uploader@project.iam.gserviceaccount.com', private_key: pem });
  const aab = path.join(OUT, 'fake.aab');
  fs.writeFileSync(aab, Buffer.concat([Buffer.from('504b0304', 'hex'), crypto.randomBytes(4096)]));
  const listing = fakeListing(path.join(OUT, 'store-listing'));

  {
    const g = await mockGoogle(publicKey);
    const r = await publish(['--aab', aab, '--track', 'internal', '--listing', listing], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    const seq = g.calls.map(c => c.method + ' ' + c.path.replace(/^.*\/applications\/io\.github\.chatrawichaitech\.docscanner/, '').replace(/^\/token$/, 'TOKEN'));
    const token = g.calls[0];
    check('service account JWT: RS256, signed with the key, for the androidpublisher scope, one hour', r.code === 0 && token.claims &&
      token.claims.iss === 'uploader@project.iam.gserviceaccount.com' && token.claims.scope === 'https://www.googleapis.com/auth/androidpublisher' &&
      token.claims.exp - token.claims.iat === 3600, r.out);
    const bundle = g.calls.find(c => c.method === 'POST' && c.path.endsWith('/bundles'));
    const track = g.calls.find(c => c.path.endsWith('/tracks/internal'));
    check('uploads the bundle (octet-stream, whole file) and sets a draft release on the chosen track with Thai and English notes',
      bundle && bundle.query === '?uploadType=media' && bundle.type === 'application/octet-stream' && bundle.size === fs.statSync(aab).size &&
      track && track.method === 'PUT' && track.json.track === 'internal' && track.json.releases[0].status === 'draft' &&
      JSON.stringify(track.json.releases[0].versionCodes) === '["1000020"]' &&
      JSON.stringify(track.json.releases[0].releaseNotes.map(n => n.language)) === '["en-US","th"]', JSON.stringify(track && track.json));
    const th = g.calls.find(c => c.method === 'PUT' && c.path.endsWith('/listings/th'));
    check('listing texts per language and every image replaced (old ones deleted first)',
      th && th.json.title === txt('th', 'title').trim() && th.json.fullDescription === txt('th', 'full_description').trim() &&
      ['icon', 'featureGraphic', 'phoneScreenshots'].every(type => langs.every(l => {
        const del = seq.indexOf(`DELETE /edits/edit-1/listings/${l}/${type}`);
        const ups = g.calls.filter(c => c.method === 'POST' && c.path.endsWith(`/listings/${l}/${type}`) && c.type === 'image/png').length;
        return del >= 0 && ups === (type === 'phoneScreenshots' ? 2 : 1);
      })), seq.join('\n'));
    check('validated, then committed as the last call', seq[seq.length - 2] === 'POST /edits/edit-1:validate' && seq[seq.length - 1] === 'POST /edits/edit-1:commit', seq.slice(-3).join(' | '));
    check('the private key, the access token and the service account are never printed', !r.out.includes('PRIVATE KEY') && !r.out.includes('SECRET-TOKEN') &&
      !r.out.includes(pem.split('\n')[1]) && !r.out.includes('oader@'), r.out);
    await g.close();
  }
  {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(aab)).digest('hex');
    const g = await mockGoogle(publicKey, { existing: [{ versionCode: 1000019, sha256: 'cd'.repeat(32) }, { versionCode: 1000020, sha256: sha.toUpperCase(), sha1: 'x' }] });
    const r = await publish(['--aab', aab, '--track', 'alpha', '--listing', listing, '--notes-only'], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    const track = g.calls.find(c => c.path.endsWith('/tracks/alpha'));
    check('the same .aab already on Google Play (first upload by hand in Play Console) is reused by SHA-256, not uploaded again',
      r.code === 0 && !g.calls.some(c => c.method === 'POST' && c.path.endsWith('/bundles')) &&
      track && JSON.stringify(track.json.releases[0].versionCodes) === '["1000020"]' && /already on Google Play/.test(r.out) &&
      g.calls.some(c => c.path.endsWith(':commit')), r.out);
    await g.close();
  }
  {
    const g = await mockGoogle(publicKey, { existing: [{ versionCode: 1000019, sha256: 'cd'.repeat(32) }] });
    const r = await publish(['--aab', aab, '--track', 'internal', '--listing', listing, '--notes-only'], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    check('a new .aab (not on Google Play yet) is uploaded', r.code === 0 && g.calls.filter(c => c.method === 'POST' && c.path.endsWith('/bundles')).length === 1, r.out);
    await g.close();
  }
  {
    const g = await mockGoogle(publicKey, { failOn: '/listings/th/phoneScreenshots' });
    const r = await publish(['--aab', aab, '--track', 'alpha', '--listing', listing], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    check('a refused call fails the run, the edit is deleted and nothing is committed',
      r.code !== 0 && /PERMISSION_DENIED/.test(r.out) && g.calls.some(c => c.method === 'DELETE' && c.path.endsWith('/edits/edit-1')) &&
      !g.calls.some(c => c.path.endsWith(':commit')), r.out);
    await g.close();
  }
  {
    const g = await mockGoogle(publicKey);
    const r = await publish(['--listing', listing, '--listing-only', '--validate-only', '--no-images'], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    check('--listing-only --validate-only: texts checked by Google, no bundle, no images, nothing committed',
      r.code === 0 && !g.calls.some(c => c.path.includes('/bundles') || c.path.includes('Screenshots') || c.path.endsWith(':commit')) &&
      g.calls.some(c => c.path.endsWith(':validate')), r.out);
    await g.close();
  }
  {
    const g = await mockGoogle(publicKey);
    const r = await publish(['--aab', aab, '--track', 'production', '--status', 'completed', '--listing', listing, '--notes-only'], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    const track = g.calls.find(c => c.path.endsWith('/tracks/production'));
    check('--notes-only (workflow "app only"): bundle + release notes, the store listing and images untouched',
      r.code === 0 && track && track.json.releases[0].status === 'completed' && track.json.releases[0].releaseNotes.length === 2 &&
      !g.calls.some(c => c.path.includes('/listings/')) && g.calls.some(c => c.path.endsWith(':commit')), r.out);
    await g.close();
  }
  {
    const g = await mockGoogle(publicKey);
    const long =fakeListing(path.join(OUT, 'store-listing-long'), (lang, d) => { if (lang === 'th') fs.writeFileSync(path.join(d, 'title.txt'), 'ก'.repeat(31)); });
    const r1 = await publish(['--aab', aab, '--track', 'internal', '--listing', long], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: g.url });
    const r2 = await publish(['--aab', aab, '--track', 'internal'], { PLAY_SERVICE_ACCOUNT_JSON: '{"type":"authorized_user"}', PLAY_TEST_SERVER: g.url });
    const r3 = await publish(['--aab', aab, '--track', 'internal'], { PLAY_SERVICE_ACCOUNT_JSON: key, PLAY_TEST_SERVER: 'https://attacker.example' });
    check('refused before contacting Google: a title over 30 characters, a key that is not a service account',
      r1.code !== 0 && /th\/title\.txt is 31 characters/.test(r1.out) && r2.code !== 0 && /not a service account/.test(r2.out) && g.calls.length === 0,
      r1.out + r2.out);
    check('the test server override only accepts http://127.0.0.1 (anything else goes to Google)', r3.code !== 0 && !/attacker/.test(r3.out) , r3.out);
    await g.close();
  }

  // ---------------------------------------------------------------- the workflow
  const wf = fs.readFileSync(path.join(ROOT, '../.github/workflows/play.yml'), 'utf8'); // workflow ของ repo รวม
  const keyLines = [...wf.matchAll(/^.*secrets\.PLAY_SERVICE_ACCOUNT_JSON.*$/gm)].map(m => m[0].trim());
  check('play.yml: manual only (workflow_dispatch), main only; the service account key only in the upload step; the AAB of the GitHub Release, not debug-signed',
    /^on:\s*\n\s+workflow_dispatch:/m.test(wf) && !/^\s+(push|pull_request|schedule):/m.test(wf) && wf.includes("github.ref == 'refs/heads/main'") &&
    keyLines.length === 2 && keyLines.some(l => /^PLAY_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}$/.test(l)) &&
    keyLines.some(l => /^HAS_KEY: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON != '' \}\}$/.test(l)) &&
    wf.includes('gh release download') && wf.includes('CN=Android Debug') && wf.includes('tools/play/publish.js') &&
    [...wf.matchAll(/uses: ([^\s@]+)@(\S+)/g)].every(m => /^[0-9a-f]{40}$/.test(m[2])), keyLines.join(' | '));
  const secretNames = [...new Set([...wf.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]))].sort();
  const uploadJob = wf.slice(wf.indexOf('\n  upload:'));
  const checkouts = [...wf.matchAll(/uses: actions\/checkout@[^\n]*\n\s+with:\n((?:\s{10}[^\n]*\n)+)/g)].map(m => m[1]);
  check('play.yml: no signing or site secrets (only the Google Play key), no stored git credentials',
    JSON.stringify(secretNames) === '["PLAY_SERVICE_ACCOUNT_JSON"]' && !uploadJob.includes('CLAUDE_REPO_KEY') &&
    checkouts.length >= 2 && checkouts.every(w => /persist-credentials: false/.test(w)), secretNames.join(' ') + ' / checkouts ' + checkouts.length);
  check('play.yml: the store-listing artifact holds only the two languages (not the raw captures and video frames)',
    /path: \|\n\s+doc-scanner-pdf-android\/tools\/store\/out\/th\n\s+doc-scanner-pdf-android\/tools\/store\/out\/en-US\n/.test(wf) && !/path: (doc-scanner-pdf-android\/)?tools\/store\/out\s*\n/.test(wf));
  t.finish();
});
