#!/usr/bin/env node
'use strict';
/*
 * Upload the app and its store listing to Google Play with the Android Publisher API (v3) — used by
 * .github/workflows/play.yml. Needs a Google Cloud service account that the owner added in Play Console
 * (Users and permissions) with access to this app; its JSON key comes only from the environment
 * (PLAY_SERVICE_ACCOUNT_JSON) and is never printed.
 *
 *   node tools/play/publish.js --aab <file.aab> --track internal|alpha|beta|production [--status draft|completed]
 *        [--listing tools/store/out [--notes-only]] [--no-images] [--validate-only]
 *   node tools/play/publish.js --listing tools/store/out --listing-only [--no-images] [--validate-only]
 *
 * One "edit": upload the bundle, set the release on the track (with release notes from the listing folder),
 * set the title/short/full description (+ video URL if tools/store/listing/<lang>/video_url.txt exists) and replace
 * the images of every language in the listing folder (tools/store/build.js output), then validate and commit.
 * --notes-only takes only the release notes from the listing folder and leaves the store listing as it is.
 * A new app that has never been reviewed only takes status "draft" — the release is then sent for review in Play Console.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PACKAGE = 'io.github.chatrawichaitech.docscanner';
// tools/tests/suites/play.js points these at a local mock of Google (only http://127.0.0.1 is accepted)
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.PLAY_TEST_SERVER || '') ? process.env.PLAY_TEST_SERVER : null;
const GOOGLE = LOCAL || 'https://androidpublisher.googleapis.com';
const TOKEN_URL = (LOCAL || 'https://oauth2.googleapis.com') + '/token';
const API = GOOGLE + '/androidpublisher/v3/applications/' + PACKAGE;
const UPLOAD = GOOGLE + '/upload/androidpublisher/v3/applications/' + PACKAGE;
const TRACKS = ['internal', 'alpha', 'beta', 'production'];
const IMAGE_TYPES = { icon: 'icon.png', featureGraphic: 'featureGraphic.png', phoneScreenshots: 'phoneScreenshots',
  sevenInchScreenshots: 'sevenInchScreenshots', tenInchScreenshots: 'tenInchScreenshots' };
const LIMITS = { title: 30, short_description: 80, full_description: 4000, release_notes: 500 };

function fail(msg) { console.error('::error::' + msg); process.exit(1); }

function parseArgs(argv) {
  const o = { status: 'draft', images: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-images') o.images = false;
    else if (a === '--validate-only') o.validateOnly = true;
    else if (a === '--listing-only') o.listingOnly = true;
    else if (a === '--notes-only') o.notesOnly = true;
    else if (['--aab', '--track', '--status', '--listing'].includes(a) && argv[i + 1]) o[a.slice(2)] = argv[++i];
    else fail('bad argument ' + a);
  }
  if (!o.listingOnly) {
    if (!o.aab || !fs.existsSync(o.aab)) fail('--aab <file.aab> is required');
    if (!TRACKS.includes(o.track)) fail('--track must be one of ' + TRACKS.join(', '));
  }
  if (!['draft', 'completed'].includes(o.status)) fail('--status must be draft or completed');
  if (o.listingOnly && !o.listing) fail('--listing-only needs --listing');
  if (o.notesOnly && (o.listingOnly || !o.listing)) fail('--notes-only needs --listing and an --aab');
  return o;
}

// ---------------------------------------------------------------- OAuth with the service account (JWT, RS256)

async function accessToken() {
  let key;
  try { key = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON || ''); } catch (e) { key = null; }
  if (!key || key.type !== 'service_account' || !key.client_email || !key.private_key) {
    fail('PLAY_SERVICE_ACCOUNT_JSON is missing or not a service account key (see PLAY_STORE.md)');
  }
  const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url');
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) fail('Google did not accept the service account (' + r.status + ' ' + (j.error || '') + ')');
  console.log('signed in with the service account key');
  return j.access_token;
}

let TOKEN = null;
async function api(method, url, body, type) {
  const headers = { Authorization: 'Bearer ' + TOKEN };
  let payload = body;
  if (body !== undefined && !Buffer.isBuffer(body)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  else if (Buffer.isBuffer(body)) headers['Content-Type'] = type || 'application/octet-stream';
  const r = await fetch(url, { method, headers, body: payload });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { raw: text.slice(0, 300) }; }
  if (!r.ok) {
    const msg = j && j.error ? `${j.error.code} ${j.error.status || ''}: ${j.error.message}` : `${r.status} ${text.slice(0, 300)}`;
    throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '')} → ${msg}`);
  }
  return j;
}

// ---------------------------------------------------------------- listing folder (tools/store/build.js output)

function readListing(dir) {
  const out = [];
  for (const lang of fs.readdirSync(dir).filter(d => /^[a-z]{2}(-[A-Z]{2})?$/.test(d)).sort()) {
    const base = path.join(dir, lang);
    const txt = f => fs.existsSync(path.join(base, f + '.txt')) ? fs.readFileSync(path.join(base, f + '.txt'), 'utf8').trim() : '';
    const l = { lang, title: txt('title'), short: txt('short_description'), full: txt('full_description'), notes: txt('release_notes'), video: txt('video_url'), base };
    for (const [k, max] of Object.entries(LIMITS)) {
      const v = { title: l.title, short_description: l.short, full_description: l.full, release_notes: l.notes }[k];
      if ([...v].length > max) fail(`${lang}/${k}.txt is ${[...v].length} characters (Google Play allows ${max})`);
    }
    if (!l.title || !l.short || !l.full) fail(`${lang}: title, short_description and full_description are required`);
    if (l.video && !/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}/.test(l.video)) fail(`${lang}/video_url.txt must be a YouTube link`);
    out.push(l);
  }
  if (!out.length) fail('no listing languages in ' + dir);
  return out;
}

function imagesOf(l, type) {
  const p = path.join(l.base, IMAGE_TYPES[type]);
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p).filter(f => /\.png$/.test(f)).sort().map(f => path.join(p, f));
}

// ---------------------------------------------------------------- main

(async () => {
  const o = parseArgs(process.argv.slice(2));
  const listing = o.listing ? readListing(o.listing) : [];
  TOKEN = await accessToken();
  const edit = await api('POST', `${API}/edits`, {});
  const E = `${API}/edits/${edit.id}`, EU = `${UPLOAD}/edits/${edit.id}`;
  try {
    if (!o.listingOnly) {
      const aab = fs.readFileSync(o.aab);
      const sha256 = crypto.createHash('sha256').update(aab).digest('hex');
      // Google keeps every uploaded bundle and refuses the same version code twice (e.g. the first one, which is always
      // uploaded in Play Console by hand): the same file already on Google Play is reused, not uploaded again
      const known = ((await api('GET', `${E}/bundles`)).bundles || []).find(x => String(x.sha256 || '').toLowerCase() === sha256);
      let b = known;
      if (known) console.log(`${path.basename(o.aab)} is already on Google Play — reusing versionCode ${known.versionCode}`);
      else {
        console.log(`uploading ${path.basename(o.aab)} (${(aab.length / 1048576).toFixed(1)} MB) …`);
        b = await api('POST', `${EU}/bundles?uploadType=media`, aab, 'application/octet-stream');
      }
      console.log(`bundle versionCode ${b.versionCode} (sha256 ${b.sha256 ? b.sha256.slice(0, 12) : '?'})`);
      const release = { versionCodes: [String(b.versionCode)], status: o.status };
      const notes = listing.filter(l => l.notes).map(l => ({ language: l.lang, text: l.notes }));
      if (notes.length) release.releaseNotes = notes;
      await api('PUT', `${E}/tracks/${o.track}`, { track: o.track, releases: [release] });
      console.log(`track ${o.track}: versionCode ${b.versionCode}, status ${o.status}`);
    }
    for (const l of o.notesOnly ? [] : listing) {
      const body = { language: l.lang, title: l.title, shortDescription: l.short, fullDescription: l.full };
      if (l.video) body.video = l.video;
      await api('PUT', `${E}/listings/${l.lang}`, body);
      console.log(`listing ${l.lang}: "${l.title}"`);
      if (!o.images) continue;
      for (const type of Object.keys(IMAGE_TYPES)) {
        const files = imagesOf(l, type);
        if (!files.length) continue;
        await api('DELETE', `${E}/listings/${l.lang}/${type}`);
        for (const f of files) await api('POST', `${EU}/listings/${l.lang}/${type}?uploadType=media`, fs.readFileSync(f), 'image/png');
        console.log(`  ${type}: ${files.length}`);
      }
    }
    await api('POST', `${E}:validate`);
    if (o.validateOnly) {
      await api('DELETE', E);
      console.log('valid — nothing committed (--validate-only)');
      return;
    }
    await api('POST', `${E}:commit`);
    console.log('committed to Google Play' + (o.status === 'draft' ? ' — the draft release is sent for review in Play Console' : ''));
  } catch (e) {
    await api('DELETE', E).catch(() => {});
    fail(e.message);
  }
})().catch(e => fail(e.message));
