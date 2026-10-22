'use strict';
/* Document edge detection accuracy on synthetic photos with known corners (fixtures/meta.json) */
const { fs, startServer, launch, newContext, suite, run, fixture, waitReady } = require('../lib/harness');
const meta = JSON.parse(fs.readFileSync(fixture('meta.json')));
const t = suite('detect');

run(async () => {
  const srv = await startServer();
  const b = await launch({ camera: false });
  const ctx = await newContext(b);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(srv.url);
  await waitReady(p);
  for (const name of Object.keys(meta)) {
    const b64 = fs.readFileSync(fixture(name + '.jpg')).toString('base64');
    const r = await p.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const t0 = performance.now(); const q = await CvEngine.detect(c, 'high');
      return { q, ms: performance.now() - t0 };
    }, b64);
    const m = meta[name];
    const diag = Math.hypot(m.W, m.H);
    let err = r.q ? Math.max(...r.q.map((pt, k) => Math.hypot(pt.x - m.quad[k][0], pt.y - m.quad[k][1]) / diag * 100)) : Infinity;
    if (m.expectNull) err = r.q ? Infinity : 0;
    t.check(`${name}: ${m.expectNull ? 'no false crop' : 'corners within 1.5% of diagonal'}`, err <= 1.5,
      `q=${r.q ? r.q.map(pt => Math.round(pt.x) + ',' + Math.round(pt.y)).join(' ') : null} err=${err.toFixed(2)}% ${r.ms.toFixed(0)}ms`);
  }
  t.check('no page errors', !errors.length, errors.join('\n'));
  await b.close(); await srv.close();
  t.finish();
});
