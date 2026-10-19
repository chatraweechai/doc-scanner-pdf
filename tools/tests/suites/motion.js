'use strict';
/*
 * UI animations (css/style.css + js/motion.js):
 *   - views, dialogs, toasts, status, crop handles and the home illustration animate
 *   - page list: new pages appear, moved pages slide, deleted pages leave a fading "ghost" that is not part of the
 *     real list (aria-hidden, no buttons) — the DOM changes at once, nothing waits for an animation
 *   - fast repeated deletes/moves/clear-all leave no ghost, stray transform or error behind; layout stays in place
 *   - "reduce motion" (prefers-reduced-motion): no script animations, CSS animations end at once and do not loop
 */
const { OUT, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle } = require('../lib/harness');
const t = suite('motion');
const check = t.check;

const PHOTOS = ['photo-tilted.jpg', 'photo-shadow.jpg', 'photo-lightbg.jpg'].map(fixture);

/** records every ghost added to the page (they only live ~0.25 s) */
function recordGhosts(page) {
  return page.evaluate(() => {
    window.__ghosts = [];
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.classList.contains('motion-ghost')) {
        const cs = getComputedStyle(n);
        window.__ghosts.push({
          hidden: n.getAttribute('aria-hidden'), events: cs.pointerEvents, position: cs.position,
          buttons: n.querySelectorAll('button, [data-action], .page-item, .page-card').length, img: !!n.querySelector('img[src]')
        });
      }
    }))).observe(document.body, { childList: true });
  });
}

const ids = page => page.$$eval('.page-item', els => els.map(e => e.dataset.id).join(','));
const stats = page => page.evaluate(() => Object.assign({}, Motion._stats));
const anim = (page, sel, pseudo) => page.$eval(sel, (el, p) => getComputedStyle(el, p || null).animationName, pseudo || null);
/** running finite animations (the looping home illustration and status pulse are infinite) */
const busy = page => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' &&
  a.effect && a.effect.getTiming().iterations !== Infinity).length);

async function addPhotos(page, files, total) {
  await page.setInputFiles('#fileInput', files);
  await page.waitForFunction(n => document.querySelectorAll('.page-item').length === n, total, { timeout: 60000 });
  await waitIdle(page);
}

run(async () => {
  const srv = await startServer();
  const browser = await launch({ camera: false });

  // ================================================================ normal motion
  {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const log = watch(page, 'motion');
    page.on('dialog', d => d.accept());
    await page.goto(srv.url);
    await waitReady(page);
    check('animations are on (Web Animations API, no reduce-motion setting)', await page.evaluate(() => Motion.enabled()));
    check('home: the document illustration floats and a scan line moves over it',
      (await anim(page, '.empty-art .icon')) === 'art-float' && (await anim(page, '.empty-art', '::after')) === 'scan-beam');
    check('home view fades in, its content rises in; status dot pops once when ready',
      (await anim(page, '#viewHome')) === 'fade-in' && (await anim(page, '.home-main')) === 'rise-in' && (await stats(page)).played === 1);
    await recordGhosts(page);

    await addPhotos(page, PHOTOS, 3);
    let s = await stats(page);
    check('new pages appear with an animation (including the first page)', s.entered >= 3, JSON.stringify(s));
    check('bottom bar slides up; page list and bar stay in place after the animations',
      (await anim(page, '#homeBar')) === 'bar-up' && await page.evaluate(() => {
        const bar = document.getElementById('homeBar').getBoundingClientRect();
        return Math.abs(bar.bottom - innerHeight) < 1 && document.documentElement.scrollWidth <= innerWidth;
      }));

    // delete page 2: the list changes at once, a ghost fades where the page was
    const before = await ids(page);
    const moved0 = (await stats(page)).moved;
    await page.click('.page-item:nth-child(2) [data-action="delete"]');
    const now = { ids: await ids(page), cards: await page.$$eval('.page-card', e => e.length) };
    const b = before.split(',');
    check('delete: the real list changes immediately (no waiting for the animation)', now.ids === [b[0], b[2]].join(',') && now.cards === 2, JSON.stringify(now));
    const ghosts = await page.evaluate(() => window.__ghosts);
    check('delete: a ghost fades out where the page was — hidden from screen readers, not clickable, no buttons',
      ghosts.length === 1 && ghosts[0].hidden === 'true' && ghosts[0].events === 'none' && ghosts[0].position === 'fixed' &&
      ghosts[0].buttons === 0 && ghosts[0].img, JSON.stringify(ghosts));
    check('delete: the next page slides into the free place', (await stats(page)).moved > moved0);
    await page.waitForTimeout(800);
    check('delete: the ghost is gone afterwards', (await page.$$('.motion-ghost')).length === 0);

    // move page 1 to the right: both pages slide, order changes at once
    const m1 = (await stats(page)).moved;
    const order = (await ids(page)).split(',');
    await page.click('.page-item:nth-child(1) [data-action="right"]');
    check('move: order changes at once and both pages slide to their new places',
      (await ids(page)) === [order[1], order[0]].join(',') && (await stats(page)).moved >= m1 + 2);

    // dialogs and toasts
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    check('dialog opens with a rise-and-fade and its backdrop fades in',
      (await anim(page, '#exportDialog')) === 'dialog-in' && (await anim(page, '#exportDialog', '::backdrop')) === 'fade-in');
    await page.click('#exCancel');
    await page.setInputFiles('#fileInput', fixture('not-image.txt'));
    await page.waitForSelector('.toast.error');
    check('toast pops in', (await anim(page, '.toast.error')) === 'toast-in');
    await page.waitForFunction(() => document.querySelector('.toast.error.toast-out'), null, { timeout: 8000, polling: 50 })
      .catch(async e => { console.log('toasts:', await page.evaluate(() => document.getElementById('toasts').innerHTML)); throw e; });
    check('toast fades out before it is removed', (await anim(page, '.toast.toast-out')) === 'toast-out');
    await page.waitForFunction(() => !document.querySelector('.toast.error'), null, { timeout: 3000 });

    // editor and crop
    const played0 = (await stats(page)).played;
    await page.click('.page-item:nth-child(1) .page-card');
    await page.waitForSelector('#viewEditor:not([hidden])');
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 30000 });
    check('editor: view fades in, content rises in, the preview of a newly opened page fades in',
      (await anim(page, '#viewEditor')) === 'fade-in' && (await anim(page, '.editor-layout')) === 'rise-in' &&
      (await stats(page)).played > played0);
    const played1 = (await stats(page)).played;
    await page.fill('#edBrightness', '30');
    await page.waitForTimeout(400);
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 30000 });
    const played2 = (await stats(page)).played;
    await page.click('#edNext');
    await page.waitForSelector('#edBusy[hidden]', { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(100);
    check('editor: adjusting a slider does not flash the preview; moving to the next page does',
      played2 === played1 && (await stats(page)).played > played2, [played1, played2, (await stats(page)).played].join(' → '));
    await page.click('#edCrop');
    await page.waitForSelector('#viewCrop:not([hidden])');
    await page.waitForFunction(() => { const p = document.querySelector('.crop-svg .quad'); return p && p.getAttribute('points'); });
    check('crop: corner handles pop in, edge handles fade in (their rotation is untouched)',
      (await anim(page, '.crop-svg circle.handle')) === 'pop-in' && (await anim(page, '.crop-svg rect.handle')) === 'fade-in');
    await page.click('#cropCancel');
    await page.click('#edBack');
    await page.waitForSelector('#viewHome:not([hidden])');
    await page.waitForTimeout(600);
    const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' &&
      a.effect && a.effect.getTiming().iterations !== Infinity).map(a => (a.animationName || a.transitionProperty || 'script') + '@' +
      (a.effect.target && (a.effect.target.id || a.effect.target.className))));
    check('back on home: no page slides or appears again (same places)', !running.length, running.join(', '));

    // language switch
    const played3 = (await stats(page)).played;
    await page.click('#btnLang');
    check('switching language gives a short fade', (await stats(page)).played > played3);
    await page.click('#btnLang');

    // stress: add pages, then delete and move quickly
    await addPhotos(page, PHOTOS.concat(PHOTOS), 8);
    await page.evaluate(() => { window.__ghosts = []; });
    // clicks 60 ms apart — while the previous slide/ghost is still animating
    await page.evaluate(async () => {
      const pause = () => new Promise(r => setTimeout(r, 60));
      for (let i = 0; i < 5; i++) { document.querySelector('.page-item:nth-child(1) [data-action="delete"]').click(); await pause(); }
      for (let i = 0; i < 4; i++) { document.querySelector('.page-item:nth-child(1) [data-action="right"]').click(); await pause(); }
    });
    const quick = { n: (await page.$$('.page-item')).length, unique: new Set((await ids(page)).split(',')).size };
    await page.waitForTimeout(1000);
    check('fast deletes and moves: list correct at once, ghosts and slides all finished afterwards',
      quick.n === 3 && quick.unique === 3 && (await page.$$('.motion-ghost')).length === 0 && await busy(page) === 0 &&
      await page.evaluate(() => [...document.querySelectorAll('.page-item')].every(e => getComputedStyle(e).transform === 'none')),
      JSON.stringify(quick));
    await addPhotos(page, PHOTOS.concat(PHOTOS, PHOTOS, PHOTOS, PHOTOS), 18);
    await page.evaluate(() => { window.__ghosts = []; });
    await page.click('#btnClearAll');
    const cleared = { n: (await page.$$('.page-item')).length, ghosts: (await page.evaluate(() => window.__ghosts)).length };
    await page.waitForTimeout(1000);
    check('delete all: list empty at once, at most 12 ghosts (only visible pages), all gone afterwards',
      cleared.n === 0 && cleared.ghosts >= 1 && cleared.ghosts <= 12 && (await page.$$('.motion-ghost')).length === 0 &&
      !(await page.isHidden('#emptyState')), JSON.stringify(cleared));
    await page.screenshot({ path: path.join(OUT, 'motion-home.png') });
    const csp = await page.evaluate(() => window.__csp);
    check('no console errors, no CSP violations', !log.length && !csp.length, log.concat(csp).join('\n'));
    await ctx.close();
  }

  // ================================================================ reduce motion
  {
    const ctx = await newContext(browser, { reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const log = watch(page, 'reduce');
    page.on('dialog', d => d.accept());
    await page.goto(srv.url);
    await waitReady(page);
    check('reduce motion: script animations off', await page.evaluate(() => !Motion.enabled()));
    check('reduce motion: CSS animations end at once and never loop; no scan line',
      await page.evaluate(() => {
        const icon = getComputedStyle(document.querySelector('.empty-art .icon'));
        const beam = getComputedStyle(document.querySelector('.empty-art'), '::after');
        return parseFloat(icon.animationDuration) <= 0.0001 && icon.animationIterationCount === '1' && beam.display === 'none';
      }));
    await recordGhosts(page);
    await addPhotos(page, PHOTOS.slice(0, 2), 2);
    await page.click('.page-item:nth-child(1) [data-action="delete"]');
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    const dlg = await page.$eval('#exportDialog', el => parseFloat(getComputedStyle(el).animationDuration));
    await page.click('#exCancel');
    const s = await stats(page);
    check('reduce motion: pages are added and deleted without ghosts or slides; dialog shows at once',
      (await page.$$('.page-item')).length === 1 && !(await page.evaluate(() => window.__ghosts.length)) &&
      s.played === 0 && s.ghosts === 0 && dlg <= 0.0001, JSON.stringify(s) + ' dialog ' + dlg);
    check('reduce motion: no console errors', !log.length, log.join('\n'));
    await ctx.close();
  }

  await browser.close();
  await srv.close();
  t.finish();
});
