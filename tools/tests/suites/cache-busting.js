'use strict';
/*
 * Cache busting (doc-scanner-pdf/js/boot.js + tools/stamp-build.sh)
 *   - every app CSS/JS request carries ?v=<commit>-<YYYYMMDD-HHMMSS of opening the page>
 *   - vendor libraries carry ?v=<commit> (new file per deploy, reused from the HTTP cache between visits)
 *   - a stale cached index.html is reloaded exactly once when version.json reports a newer commit
 */
const { execFileSync } = require('child_process');
const { ROOT, APP, OUT, fs, path, startServer, launch, newContext, watch, suite, run, waitReady } = require('../lib/harness');

const A = 'aaaaaaa11111';
const B = 'bbbbbbb22222';
const t = suite('cache-busting');

/** Copy of the site stamped like a deploy (vendor/ is symlinked: large and unchanged by stamping) */
function stampedSite(build) {
  const dir = path.join(OUT, 'site-' + build);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(APP)) {
    const src = path.join(APP, name);
    if (name === 'vendor') fs.symlinkSync(src, path.join(dir, name), 'dir');
    else fs.cpSync(src, path.join(dir, name), { recursive: true });
  }
  execFileSync('bash', [path.join(ROOT, 'tools/stamp-build.sh'), dir, build], { stdio: 'pipe' });
  return dir;
}

const APP_FILES = ['/css/style.css', '/js/cv-core.js', '/js/scanner.js', '/js/cv-engine.js', '/js/crop-editor.js',
  '/js/camera.js', '/js/pdf-export.js', '/js/ocr.js', '/js/app.js'];

function vParam(req) { return new URLSearchParams(req.search).get('v'); }
function opened(v, commit) {
  const m = new RegExp('^' + commit + '-(\\d{4})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(\\d{2})$').exec(v || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}
const since = (srv, t0) => srv.requests.filter(r => r.time >= t0);
const docs = reqs => reqs.filter(r => r.path === '/index.html' || r.path === '/');

async function ocrSmall(page) {
  return page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 120;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 120);
    x.fillStyle = '#000'; x.font = '48px sans-serif'; x.fillText('HELLO 2026', 20, 80);
    const r = await Ocr.recognize(c, 'eng');
    return r.text;
  });
}

run(async () => {
  const siteA = stampedSite(A);
  const siteB = stampedSite(B);
  const browser = await launch({ camera: false });

  // ---------------------------------------------------------------------------------------
  // 1) First visit to a deployed build + a later visit in the same browser
  // ---------------------------------------------------------------------------------------
  {
    const srv = await startServer({ root: siteA, cacheControl: 'max-age=600' });
    const ctx = await newContext(browser, {}, { liveFonts: true });
    const page = await ctx.newPage();
    const log = watch(page, 'visit');
    const t0 = Date.now();
    await page.goto(srv.url);
    await waitReady(page);
    const text = await ocrSmall(page);
    await page.evaluate(() => PdfExport.preload()); // jsPDF is loaded on demand
    await page.waitForFunction(() => !!window.jspdf, null, { timeout: 30000 });
    const reqs = since(srv, t0);
    const build = await page.evaluate(() => window.APP_BUILD);

    const boot = reqs.filter(r => r.path === '/js/boot.js');
    t.check('index.html loads js/boot.js?v=<commit>', boot.length === 1 && vParam(boot[0]) === A, JSON.stringify(boot.map(r => r.search)));

    const bad = [];
    const vs = new Set();
    for (const f of APP_FILES.concat('/js/cv-worker.js')) {
      const rs = reqs.filter(r => r.path === f);
      if (!rs.length) { bad.push(f + ' not requested'); continue; }
      for (const r of rs) {
        const d = opened(vParam(r), A);
        if (!d || Math.abs(d.getTime() - t0) > 5 * 60000) bad.push(f + r.search);
        vs.add(vParam(r));
      }
    }
    t.check('app CSS/JS (incl. worker) use ?v=<commit>-<open date+time>', !bad.length && vs.size === 1, bad.join(', ') || [...vs][0]);
    t.check('every /css and /js request is versioned', reqs.filter(r => /^\/(css|js)\//.test(r.path) && !vParam(r)).length === 0);

    const lib = ['/vendor/jspdf/jspdf.umd.min.js', '/vendor/opencv/simd/opencv.js', '/vendor/opencv/simd/opencv_js.wasm',
      '/vendor/tesseract/tesseract.min.js', '/vendor/tesseract/worker.min.js'];
    const libBad = lib.filter(f => { const rs = reqs.filter(r => r.path === f); return !rs.length || rs.some(r => vParam(r) !== A); });
    t.check('vendor libraries (jsPDF, OpenCV js+wasm, Tesseract) use ?v=<commit>', !libBad.length && /HELLO/i.test(text), libBad.join(', ') || 'ocr: ' + text.trim());

    const vj = reqs.filter(r => r.path === '/version.json');
    t.check('version.json checked once, bypassing caches', vj.length === 1 && /^\?t=\d+$/.test(vj[0].search), JSON.stringify(vj.map(r => r.search)));
    t.check('no reload when page is current', docs(reqs).length === 1 && build.commit === A && build.page === A);
    t.check('page is revealed once CSS has loaded', await page.evaluate(() => document.documentElement.style.visibility === '' && getComputedStyle(document.body).display !== 'none'));
    const label = await page.textContent('#appVersion');
    t.check('home screen shows the running version', label.includes(A.slice(0, 7)) && /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(label), label);

    // Open the site again later: app files must be fetched again (new timestamp), big libraries come from cache
    await page.waitForTimeout(1100);
    const t1 = Date.now();
    await page.goto(srv.url);
    await waitReady(page);
    await page.evaluate(() => PdfExport.preload());
    await page.waitForFunction(() => !!window.jspdf, null, { timeout: 30000 });
    const again = since(srv, t1);
    const build2 = await page.evaluate(() => window.APP_BUILD);
    const refetched = APP_FILES.filter(f => again.some(r => r.path === f && opened(vParam(r), A)));
    t.check('re-opening fetches all app CSS/JS again with a new ?v= time', refetched.length === APP_FILES.length && build2.v !== build.v,
      `${build.v} -> ${build2.v}; refetched ${refetched.length}/${APP_FILES.length}`);
    const libAgain = again.filter(r => r.path.startsWith('/vendor/opencv/') || r.path.startsWith('/vendor/jspdf/'));
    t.check('re-opening reuses cached OpenCV/jsPDF (same deploy)', libAgain.length === 0, libAgain.map(r => r.path).join(', '));

    const csp = await page.evaluate(() => window.__csp);
    t.check('no CSP violations / console errors', !csp.length && !log.length, JSON.stringify(csp) + log.join('\n'));
    await ctx.close();
    await srv.close();
  }

  // ---------------------------------------------------------------------------------------
  // 2) New deploy while the browser/CDN still has the old index.html → reload once
  // ---------------------------------------------------------------------------------------
  const oldHtml = fs.readFileSync(path.join(siteA, 'index.html'));
  const oldBoot = fs.readFileSync(path.join(siteA, 'js/boot.js'));
  {
    const srv = await startServer({
      root: siteB,
      hook(p, url) {
        // stale copies for requests that are not cache-busted (like a browser/proxy cache would serve)
        if ((p === '/index.html' || p === '/') && !url.searchParams.has('v')) return { body: oldHtml, type: 'text/html; charset=utf-8' };
        if (p === '/js/boot.js' && url.searchParams.get('v') === A) return { body: oldBoot };
        return null;
      }
    });
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const log = watch(page, 'stale');
    const t0 = Date.now();
    await page.goto(srv.origin + '/index.html?src=qr#top');
    await waitReady(page);
    await page.waitForTimeout(1500);
    const reqs = since(srv, t0);
    const d = docs(reqs);
    const build = await page.evaluate(() => window.APP_BUILD);
    const loc = await page.evaluate(() => ({ search: location.search, hash: location.hash }));
    t.check('stale page reloads exactly once, to the new build', d.length === 2 && !vParam(d[0]) && opened(vParam(d[1]), B) && build.commit === B && build.page === B,
      d.map(r => r.path + r.search).join(' , ') + ' → ' + build.commit);
    t.check('old page does not start old app scripts before reloading', reqs.filter(r => r.path === '/js/app.js').every(r => vParam(r).startsWith(B + '-')));
    t.check('?v= removed from the address bar, other params/hash kept', loc.search === '?src=qr' && loc.hash === '#top', JSON.stringify(loc));
    const errs = log.filter(l => !/ERR_ABORTED/.test(l));
    t.check('no errors during the reload', !errs.length, errs.join('\n'));
    await ctx.close();
    await srv.close();
  }

  // ---------------------------------------------------------------------------------------
  // 3) Server keeps returning the old page (e.g. CDN not purged yet) → no reload loop
  // ---------------------------------------------------------------------------------------
  {
    const srv = await startServer({
      root: siteB,
      hook(p) {
        if (p === '/index.html' || p === '/') return { body: oldHtml, type: 'text/html; charset=utf-8' };
        if (p === '/js/boot.js') return { body: oldBoot };
        return null;
      }
    });
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(srv.url);
    await waitReady(page);
    await page.waitForTimeout(4000);
    const d = docs(since(srv, t0));
    t.check('reload guard: at most one reload, then the app still starts', d.length === 2 && (await page.evaluate(() => window.APP_BUILD.commit)) === A, d.length + ' page loads');
    await ctx.close();
    await srv.close();
  }

  // ---------------------------------------------------------------------------------------
  // 4) version.json missing / slow / invalid → start normally without reloading
  // ---------------------------------------------------------------------------------------
  for (const [label, resp, maxMs] of [
    ['missing (404)', { status: 404, body: 'not found' }, 15000],
    ['slow (8 s, aborted after 3 s)', { delay: 8000, body: JSON.stringify({ commit: B }) }, 7500],
    ['invalid commit value', { body: JSON.stringify({ commit: '<img src=x onerror=alert(1)>' }) }, 15000],
    ['not JSON', { body: '<!doctype html><title>x</title>' }, 15000]
  ]) {
    const srv = await startServer({ root: siteA, hook: p => (p === '/version.json' ? resp : null) });
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const log = watch(page, 'vj');
    const alerts = [];
    page.on('dialog', dlg => { alerts.push(dlg.message()); dlg.dismiss(); });
    const t0 = Date.now();
    await page.goto(srv.url);
    await page.waitForFunction(() => window.CvEngine && document.getElementById('cvStatus'), null, { timeout: 30000 });
    const ms = Date.now() - t0;
    await waitReady(page);
    const d = docs(since(srv, t0));
    const errs = log.filter(l => !/404|Failed to load resource/.test(l));
    t.check(`version.json ${label} → app starts without reload`, d.length === 1 && ms < maxMs && !alerts.length && !errs.length, `${ms}ms ${errs.join(' ')}`);
    await ctx.close();
    await srv.close();
  }

  // ---------------------------------------------------------------------------------------
  // 4b) boot.js itself fails to load → content is still visible (not a blank page)
  // ---------------------------------------------------------------------------------------
  {
    const srv = await startServer({ root: siteA, hook: p => (p === '/js/boot.js' ? { status: 404, body: 'nf' } : null) });
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto(srv.url);
    await page.waitForTimeout(500);
    t.check('boot.js unavailable → page is not left blank', await page.isVisible('#appTitle'));
    await ctx.close();
    await srv.close();
  }

  // ---------------------------------------------------------------------------------------
  // 5) Local copies: unstamped source (dev) and a stamped copy opened from disk (file://)
  // ---------------------------------------------------------------------------------------
  {
    const srv = await startServer();
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(srv.url);
    await waitReady(page);
    const reqs = since(srv, t0);
    const app = reqs.filter(r => r.path === '/js/app.js');
    const cv = reqs.filter(r => r.path === '/vendor/opencv/simd/opencv.js');
    t.check('unstamped source runs as "dev" (?v=dev-<time>, no version.json check)',
      app.length === 1 && opened(vParam(app[0]), 'dev') && cv.length && vParam(cv[0]) === 'dev' && !reqs.some(r => r.path === '/version.json') &&
      (await page.textContent('#appVersion')).includes('dev'), app.map(r => r.search).join());
    await ctx.close();
    await srv.close();

    const ctx2 = await newContext(browser);
    const p2 = await ctx2.newPage();
    const log = watch(p2, 'file');
    await p2.goto('file://' + path.join(siteA, 'index.html'));
    await waitReady(p2);
    const info = await p2.evaluate(() => ({ build: window.APP_BUILD.commit, engine: CvEngine.info().mode, csp: window.__csp }));
    t.check('stamped copy opened from disk (file://) works', info.build === A && info.engine === 'inline' && !info.csp.length && !log.length, JSON.stringify(info) + log.join('\n'));
    await ctx2.close();
  }

  await browser.close();
  fs.rmSync(siteA, { recursive: true, force: true });
  fs.rmSync(siteB, { recursive: true, force: true });

  // 6) publishing (tools/publish-site.sh → doc-scanner-pdf/doc-scanner-pdf.github.io, folder doc-scanner-pdf/)
  {
    const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { env: { ...process.env, TZ: 'UTC0' }, maxBuffer: 1 << 26 });
    const publish = (out, ...opts) => execFileSync('bash', [path.join(ROOT, 'tools/publish-site.sh'), ...opts, out], { stdio: 'pipe' });
    const files = dir => fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile()).map(f => f.split(path.sep).join('/')).sort();
    const head = git('rev-parse', 'HEAD').toString().trim();
    const build = head.slice(0, 12);
    const builtAt = git('log', '-1', '--format=%cd', '--date=format-local:%Y-%m-%dT%H:%M:%SZ', head).toString().trim();
    const pubA = path.join(OUT, 'publish-a');
    const pubB = path.join(OUT, 'publish-b');
    publish(pubA);
    publish(pubB, '--commit', head);

    // committed files only (not local edits), stamped with the commit and its time
    const tracked = git('ls-tree', '-r', '--name-only', head, '--', 'doc-scanner-pdf').toString().trim().split('\n')
      .map(f => f.slice('doc-scanner-pdf/'.length));
    const got = files(pubA);
    const expected = tracked.concat('version.json').sort();
    const stamped = ['index.html', 'js/boot.js', 'version.json'];
    const changed = got.filter(f => !stamped.includes(f) && !fs.readFileSync(path.join(pubA, f)).equals(git('show', `${head}:doc-scanner-pdf/${f}`)));
    const vj = JSON.parse(fs.readFileSync(path.join(pubA, 'version.json'), 'utf8'));
    t.check('publish-site: the committed app, stamped with the commit and its time',
      JSON.stringify(got) === JSON.stringify(expected) && !changed.length && vj.commit === build && vj.builtAt === builtAt &&
      fs.readFileSync(path.join(pubA, 'index.html'), 'utf8').includes(`js/boot.js?v=${build}"`) &&
      fs.readFileSync(path.join(pubA, 'js/boot.js'), 'utf8').includes(`var BUILD = '${build}';`),
      `${got.length} files, version ${JSON.stringify(vj)} ${changed.join(' ')}`);
    const diff = files(pubA).filter(f => !fs.readFileSync(path.join(pubA, f)).equals(fs.readFileSync(path.join(pubB, f))));
    t.check('publish-site: publishing the same commit again gives identical files', JSON.stringify(files(pubA)) === JSON.stringify(files(pubB)) && !diff.length, diff.join(' '));

    // the output folder is replaced as a whole: never this repository's files or a git repository
    const refused = [path.join(ROOT, 'doc-scanner-pdf'), path.join(ROOT, 'tools'), ROOT, '/'].filter(dir => {
      try { publish(dir); return false; } catch (e) { return e.status !== 0; }
    });
    const repo = path.join(OUT, 'publish-repo');
    fs.rmSync(repo, { recursive: true, force: true });
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    let repoKept = false;
    try { publish(repo); } catch (e) { repoKept = fs.existsSync(path.join(repo, '.git')); }
    t.check('publish-site: refuses to replace this repository\'s folders or a git repository', refused.length === 4 && repoKept && !git('status', '--porcelain', '--', 'doc-scanner-pdf', 'tools').toString().includes('D '),
      `${refused.length}/4 refused, repo kept ${repoKept}`);
    for (const d of [pubA, pubB, repo]) fs.rmSync(d, { recursive: true, force: true });
  }
  t.finish();
});
