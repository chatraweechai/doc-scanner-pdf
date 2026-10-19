'use strict';
/* Edge cases: file://, missing libraries, retry, huge images, XSS in file names, races, memory, no-SIMD, camera denied */
const { APP, OUT, fs, path, startServer, launch, newContext, watch, suite, run, fixture, waitReady, waitIdle, waitEditorIdle, OCR_NOISE } = require('../lib/harness');
const t = suite('edge');
const check = t.check;

run(async () => {
  const srv = await startServer();
  const browser = await launch();
  const URL = srv.url;

  // 1) file:// works (double-click open)
  {
    const ctx = await newContext(browser); const page = await ctx.newPage(); const log = watch(page, 'file');
    page.on('dialog', d => d.accept());
    await page.goto('file://' + path.join(APP, 'index.html'));
    await waitReady(page);
    await page.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item'); await waitIdle(page);
    await page.click('#btnExport'); await page.waitForSelector('#exportDialog[open]');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exDownload')]);
    const p = path.join(OUT, 'file-proto.pdf'); await dl.saveAs(p);
    const finfo = await page.evaluate(() => CvEngine.info());
    check('file:// — loads (inline basic build), processes, exports PDF', finfo.mode === 'inline' && finfo.build === 'basic' && fs.readFileSync(p).slice(0, 5).toString() === '%PDF-', JSON.stringify(finfo));
    const csp = await page.evaluate(() => window.__csp);
    check('file:// — no CSP violations / errors', csp.length === 0 && log.length === 0, JSON.stringify(csp) + log.join('\n'));
    await ctx.close();
  }

  // 2) OpenCV files unavailable (e.g. flaky network) -> error state + retry; app still usable
  {
    let fail = true;
    const ctx = await newContext(browser);
    await ctx.route(srv.origin + '/vendor/opencv/**', route => fail ? route.fulfill({ status: 404, body: 'nf' }) : route.continue());
    const page = await ctx.newPage(); const log = watch(page, 'cvfail');
    await page.goto(URL);
    await page.waitForSelector('#cvStatus[data-state="error"]', { timeout: 30000 });
    check('OpenCV failure shows error + retry button', await page.isVisible('#cvRetry'), await page.textContent('#cvStatusText'));
    await page.setInputFiles('#fileInput', fixture('photo-shadow.jpg'));
    await page.waitForSelector('.page-item img[src]');
    check('page can still be added while OpenCV unavailable', (await page.$$('.page-item')).length === 1);
    await page.click('#btnExport'); await page.waitForSelector('#exportDialog[open]');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exDownload')]);
    const p = path.join(OUT, 'nocv.pdf'); await dl.saveAs(p);
    const txt = await page.textContent('#exResult');
    check('export still works without OpenCV (uncropped) and explains why', fs.readFileSync(p).slice(0, 5).toString() === '%PDF-' && txt.includes('ไม่ได้ครอป'), txt);
    await page.click('#exCancel');
    fail = false;
    await page.click('#cvRetry');
    await waitReady(page);
    await waitIdle(page);
    check('retry loads OpenCV and processes waiting pages', true);
    const errs = log.filter(l => !/ERR_FAILED|net::|Failed to load resource|404|importScripts|failed to load|โหลด OpenCV|ใช้ไม่ได้|เปลี่ยนเป็นประมวลผล/.test(l));
    check('no unexpected errors in failure scenario', errs.length === 0, errs.join('\n'));
    await ctx.close();
  }

  // 3) jsPDF file unavailable -> clear error on export (app still usable), works again once reachable
  {
    const ctx = await newContext(browser); const page = await ctx.newPage();
    let jspdfDown = true;
    await ctx.route(srv.origin + '/vendor/jspdf/**', route => jspdfDown ? route.fulfill({ status: 404, body: 'nf' }) : route.continue());
    await page.goto(URL);
    await waitReady(page);
    await page.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item'); await waitIdle(page);
    await page.click('#btnExport'); await page.waitForSelector('#exportDialog[open]');
    await page.click('#exDownload');
    await page.waitForSelector('#exResult:not([hidden])');
    const t = await page.textContent('#exResult');
    check('export shows clear error when jsPDF missing', t.includes('jsPDF'), t);
    jspdfDown = false;
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exDownload')]);
    const retried = path.join(OUT, 'jspdf-retry.pdf'); await dl.saveAs(retried);
    check('export retries loading jsPDF once it is reachable again', fs.readFileSync(retried).slice(0, 5).toString() === '%PDF-');
    await ctx.close();
  }

  // 4) Decompression bomb, XSS filename, delete-during-processing race, memory
  {
    const ctx = await newContext(browser); const page = await ctx.newPage(); const log = watch(page, 'edge');
    const alerts = []; page.on('dialog', d => { if (d.type() === 'alert') alerts.push(d.message()); d.accept(); });
    await page.goto(URL);
    await waitReady(page);
    await page.setInputFiles('#fileInput', fixture('bomb.png'));
    await page.waitForSelector('.toast.error', { timeout: 30000 });
    const tt = await page.$$eval('.toast', e => e.map(x => x.textContent));
    check('decompression bomb rejected (pixel limit)', tt.some(t => t.includes('ความละเอียดสูงเกินไป')) && (await page.$$('.page-item')).length === 0, JSON.stringify(tt));

    await page.setInputFiles('#fileInput', { name: '<img src=x onerror=alert(1)>.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(fixture('corrupt.jpg')) });
    await page.waitForTimeout(800);
    const injected = await page.evaluate(() => document.querySelectorAll('#toasts img, .page-grid img[src="x"]').length);
    check('HTML in file name is rendered as text (no XSS)', injected === 0 && alerts.length === 0);

    // race: add 3 pages then delete them immediately while processing is queued
    await page.setInputFiles('#fileInput', ['photo-shadow.jpg', 'photo-tilted.jpg', 'photo-lightbg.jpg'].map(fixture));
    await page.waitForSelector('.page-item');
    await page.click('#btnClearAll');
    await page.waitForTimeout(2500);
    check('delete-during-processing leaves no errors', log.length === 0 && (await page.$$('.page-item')).length === 0, log.join('\n'));

    // open editor then delete page from editor while preview renders
    await page.setInputFiles('#fileInput', [fixture('photo-shadow.jpg'), fixture('photo-tilted.jpg')]);
    await page.waitForFunction(() => document.querySelectorAll('.page-item').length === 2);
    await page.click('.page-item:nth-child(1) .page-card');
    await page.click('.chip[data-filter="bw"]');
    await page.click('#edDelete');
    await page.waitForTimeout(1000);
    check('delete from editor moves to next page', (await page.textContent('#editorTitle')).includes('1 / 1'));
    // rapid slider changes
    for (let v = -100; v <= 100; v += 10) { await page.fill('#edBrightness', String(v)); await page.dispatchEvent('#edBrightness', 'input'); }
    await page.waitForTimeout(500); await waitEditorIdle(page);
    check('rapid slider changes settle without errors', log.length === 0 && (await page.textContent('#edBrightnessVal')) === '100', log.join('\n'));

    // memory: 40 full-res warp+process+detect cycles must not grow the worker's WASM heap unboundedly
    const mem = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 2250; const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 3000, 2250);
      const q = Scanner.fullQuad(3000, 2250);
      const run = async () => { const o = await CvEngine.warpProcess(c, q, 2480, { filter: 'enhance', removeShadow: true }, 'high'); o.width = 0; await CvEngine.detect(c, 'high'); };
      for (let i = 0; i < 3; i++) await run();
      const before = (await CvEngine.memory()).heap;
      for (let i = 0; i < 40; i++) await run();
      return { before: before / 1048576, after: (await CvEngine.memory()).heap / 1048576, info: CvEngine.info() };
    });
    check('no WASM memory leak over 40 full-res cycles (worker)', mem.after <= mem.before + 16, `heap ${mem.before.toFixed(0)}MB -> ${mem.after.toFixed(0)}MB ${JSON.stringify(mem.info)}`);
    await ctx.close();
  }

  // 6) Browser without WebAssembly SIMD -> basic build in workers, full flow works
  {
    const ctx = await newContext(browser);
    await ctx.addInitScript(() => { const orig = WebAssembly.validate; WebAssembly.validate = function (b) { return b && b.length === 31 ? false : orig.apply(this, arguments); }; });
    const page = await ctx.newPage(); const log = watch(page, 'nosimd');
    await page.goto(URL);
    await waitReady(page);
    const info = await page.evaluate(() => CvEngine.info());
    await page.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item'); await waitIdle(page);
    await page.click('#btnExport'); await page.waitForSelector('#exportDialog[open]');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exDownload')]);
    const p = path.join(OUT, 'nosimd.pdf'); await dl.saveAs(p);
    check('no-SIMD browser uses basic build in Web Worker and exports', info.mode === 'worker' && info.build === 'basic' && fs.readFileSync(p).slice(0, 5).toString() === '%PDF-' && log.length === 0, JSON.stringify(info) + log.join('\n'));
    await ctx.close();
  }

  // 7) Default browser gets the SIMD build in workers
  {
    const ctx = await newContext(browser); const page = await ctx.newPage(); const log = watch(page, 'simd');
    await page.goto(URL);
    await waitReady(page);
    const info = await page.evaluate(() => CvEngine.info());
    check('SIMD-capable browser uses SIMD build in Web Worker', info.mode === 'worker' && info.build === 'simd' && log.length === 0, JSON.stringify(info) + log.join('\n'));
    await ctx.close();
  }

  // 5b) Embedded in a frame that blocks the camera (like Google Apps Script) -> "ถ่ายภาพ" opens the device camera directly
  {
    const ctx = await newContext(browser, { permissions: ['camera'] });
    const page = await ctx.newPage(); const log = watch(page, 'frame');
    await page.goto(srv.origin + '/__fixtures/frame-no-camera.html');
    const frame = await (await page.waitForSelector('#app')).contentFrame();
    await waitReady(frame);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), frame.click('#btnCamera')]);
    const capture = await chooser.element().getAttribute('capture');
    await page.waitForTimeout(500);
    const state = await frame.evaluate(() => ({ camera: !document.getElementById('viewCamera').hidden, errors: [...document.querySelectorAll('.toast.error')].length, nativeButton: !document.getElementById('btnNativeCamera').hidden }));
    // Chromium logs "Potential permissions policy violation" for every feature the frame declares 'none' (not app errors)
    const errs = log.filter(l => !/Potential permissions policy violation/.test(l));
    check('camera blocked by the embedding frame -> "ถ่ายภาพ" opens the device camera directly (no error)',
      capture === 'environment' && !state.camera && !state.errors && !state.nativeButton && !errs.length, JSON.stringify(state) + errs.join(' '));
    await ctx.close();
  }

  // 5c) Phone browser without the permissions-policy API where the platform says the in-app camera cannot work
  //     (Google Apps Script on a phone) -> "ถ่ายภาพ" opens the device camera, duplicate button hidden, no error
  {
    const ctx = await newContext(browser, { permissions: ['camera'] });
    await ctx.addInitScript(() => {
      for (const k of ['featurePolicy', 'permissionsPolicy']) Object.defineProperty(Document.prototype, k, { configurable: true, get: () => undefined });
      let platform;
      Object.defineProperty(window, 'AppPlatform', { configurable: true, get: () => platform, set: v => { v.inAppCamera = false; platform = v; } });
    });
    const page = await ctx.newPage(); const log = watch(page, 'noapi');
    await page.goto(URL);
    await waitReady(page);
    const hidden = await page.isHidden('#btnNativeCamera');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.click('#btnCamera')]);
    const capture = await chooser.element().getAttribute('capture');
    await chooser.setFiles(fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item', { timeout: 30000 });
    const errors = await page.$$eval('.toast.error', e => e.length);
    check('platform without in-app camera (e.g. Apps Script on a phone) -> "ถ่ายภาพ" opens the device camera, photo added, no error',
      hidden && capture === 'environment' && !errors && await page.isHidden('#viewCamera') && !log.length, log.join(' '));
    await ctx.close();
  }

  // 5) Camera request denied (LINE's in-app browser, or "Block" on the prompt; the Permissions API gave no hint)
  //    -> the camera view explains it and offers "ใช้กล้องของเครื่อง" (a fresh tap, so phones allow opening it); no error
  {
    const LINE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Line/15.14.0/IAB';
    const ctx = await newContext(browser, { permissions: ['camera'], userAgent: LINE_UA });
    await ctx.addInitScript(() => {
      navigator.permissions.query = () => Promise.resolve({ state: 'prompt', addEventListener() {} });
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    const page = await ctx.newPage(); const log = watch(page, 'denied');
    await page.goto(URL);
    await waitReady(page);
    await page.click('#btnCamera');
    await page.waitForSelector('#camBlocked:not([hidden])', { timeout: 15000 });
    const panel = await page.evaluate(() => ({
      title: document.getElementById('camBlockedTitle').textContent, help: document.getElementById('camBlockedHelp').textContent,
      retry: !document.getElementById('camRetry').hidden, focus: document.activeElement && document.activeElement.id,
      shutter: getComputedStyle(document.getElementById('camShutter')).visibility, errors: document.querySelectorAll('.toast.error').length
    }));
    check('camera denied -> the camera view explains it (LINE hint, retry button), no error toast',
      /ไม่ได้รับอนุญาต/.test(panel.title) && /LINE/.test(panel.help) && /Chrome/.test(panel.help) && panel.retry &&
      panel.focus === 'camUseNative' && panel.shutter === 'hidden' && !panel.errors, JSON.stringify(panel));
    await page.screenshot({ path: path.join(OUT, 'camera-denied.png') });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.click('#camUseNative')]);
    const capture = await chooser.element().getAttribute('capture');
    await chooser.setFiles(fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item', { timeout: 30000 });
    const after = await page.evaluate(() => ({ camera: !document.getElementById('viewCamera').hidden, history: history.state && history.state.v,
      nativeButton: !document.getElementById('btnNativeCamera').hidden, remembered: !!localStorage.getItem('inAppCameraBlocked') }));
    check('"ใช้กล้องของเครื่อง" opens the device camera; photo added, camera view closed, duplicate button hidden',
      capture === 'environment' && !after.camera && after.history !== 'camera' && !after.nativeButton && after.remembered, JSON.stringify(after));
    await waitIdle(page);
    const direct = async () => {
      const [c] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.click('#btnCamera')]);
      await page.waitForTimeout(300);
      return (await c.element().getAttribute('capture')) === 'environment' && await page.isHidden('#viewCamera') && await page.isHidden('#btnNativeCamera');
    };
    const again = await direct();
    await page.reload();
    await waitReady(page);
    const nextVisit = await direct();
    check('after a denial "ถ่ายภาพ" opens the device camera directly — also when the page is opened again',
      again && nextVisit && !(await page.$$eval('.toast.error', e => e.length)) && !log.length, JSON.stringify({ again, nextVisit }) + log.join(' '));
    await ctx.close();
  }

  // 5d) The browser already says camera permission is denied (Permissions API) -> device camera right away
  {
    const b2 = await launch({ camera: false });
    const ctx = await newContext(b2, { permissions: [] }); const page = await ctx.newPage(); const log = watch(page, 'perm-denied');
    await page.goto(URL);
    await waitReady(page);
    const state = await page.evaluate(() => navigator.permissions.query({ name: 'camera' }).then(s => s.state));
    await page.waitForFunction(() => document.getElementById('btnNativeCamera').hidden, null, { timeout: 5000 }).catch(() => {});
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.click('#btnCamera')]);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ camera: !document.getElementById('viewCamera').hidden, nativeButton: !document.getElementById('btnNativeCamera').hidden,
      errors: document.querySelectorAll('.toast.error').length }));
    check('permission already denied -> "ถ่ายภาพ" opens the device camera directly, duplicate button hidden',
      state === 'denied' && (await chooser.element().getAttribute('capture')) === 'environment' && !r.camera && !r.nativeButton && !r.errors && !log.length,
      state + ' ' + JSON.stringify(r) + log.join(' '));
    await b2.close();
  }

  // 5e) "ลองอีกครั้ง" after allowing the camera opens the in-app camera; permission granted overrides a remembered denial
  {
    const ctx = await newContext(browser, { permissions: ['camera'] });
    await ctx.addInitScript(() => {
      localStorage.setItem('inAppCameraBlocked', String(Date.now() - 3600e3)); // denied an hour ago
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      let calls = 0;
      navigator.mediaDevices.getUserMedia = c => ++calls === 1 ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) : real(c);
    });
    const page = await ctx.newPage(); const log = watch(page, 'retry');
    await page.goto(URL);
    await waitReady(page);
    await page.waitForFunction(() => !document.getElementById('btnNativeCamera').hidden, null, { timeout: 5000 }).catch(() => {});
    const shown = await page.isVisible('#btnNativeCamera');
    await page.click('#btnCamera');
    await page.waitForSelector('#camBlocked:not([hidden])', { timeout: 15000 });
    const help = await page.textContent('#camBlockedHelp');
    await page.click('#camRetry');
    await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 15000 });
    const r = await page.evaluate(() => ({ panel: !document.getElementById('camBlocked').hidden, video: document.getElementById('camVideo').videoWidth,
      focus: document.activeElement && document.activeElement.id, remembered: localStorage.getItem('inAppCameraBlocked') }));
    check('permission granted -> in-app camera even after an old denial; "ลองอีกครั้ง" opens it (panel gone, video on)',
      shown && /อนุญาต/.test(help) && !r.panel && r.video > 0 && r.focus === 'camShutter' && r.remembered === null && !log.length,
      JSON.stringify({ shown, help, ...r }) + log.join(' '));
    await page.click('#camClose');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });
    await ctx.close();
  }

  // 5f) takePhoto slower than the 4 s limit (slow phones): the frame is used instead, the next shot does not start a
  //     second takePhoto, and closing the camera stops it only after the pending photo is done — stopping earlier
  //     crashes Android's WebView (IllegalStateException: CameraDevice was already closed)
  {
    const ctx = await newContext(browser, { permissions: ['camera'] });
    await ctx.addInitScript(() => {
      window.__cam = { calls: 0, done: 0, stops: [] };
      const take = ImageCapture.prototype.takePhoto;
      ImageCapture.prototype.takePhoto = function () {
        window.__cam.calls++;
        const p = take.apply(this, arguments);
        return new Promise((resolve, reject) => setTimeout(() => p.then(b => { window.__cam.done++; resolve(b); }, reject), 6000));
      };
      const stop = MediaStreamTrack.prototype.stop;
      MediaStreamTrack.prototype.stop = function () {
        window.__cam.stops.push({ kind: this.kind, pending: window.__cam.calls - window.__cam.done });
        return stop.apply(this, arguments);
      };
    });
    const page = await ctx.newPage(); const log = watch(page, 'slow-photo');
    await page.goto(URL);
    await waitReady(page);
    await page.click('#btnCamera');
    await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 15000 });
    await page.click('#camShutter');
    await page.waitForFunction(() => document.getElementById('camCount').textContent === '1', null, { timeout: 15000 });
    await page.click('#camShutter');
    await page.waitForFunction(() => document.getElementById('camCount').textContent === '2', null, { timeout: 15000 });
    const mid = await page.evaluate(() => JSON.parse(JSON.stringify(window.__cam)));
    await page.click('#camDone');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });
    const closed = await page.evaluate(() => JSON.parse(JSON.stringify(window.__cam)));
    await page.waitForFunction(() => window.__cam.stops.length > 0, null, { timeout: 15000 });
    const end = await page.evaluate(() => JSON.parse(JSON.stringify(window.__cam)));
    // reopening right away waits for the old camera and opens normally
    await page.click('#btnCamera');
    await page.waitForFunction(() => !document.getElementById('camShutter').disabled, null, { timeout: 20000 });
    await page.click('#camDone');
    await page.waitForSelector('#viewCamera', { state: 'hidden' });
    check('slow takePhoto: frame used after 4 s, no second takePhoto while one is pending, camera stopped only after the photo is done',
      mid.calls === 1 && closed.stops.length === 0 && end.stops.length >= 1 && end.stops.every(s => s.pending === 0) &&
      (await page.$$('.page-item')).length === 2 && !log.length, JSON.stringify({ mid, closed, end }) + log.join(' '));
    await ctx.close();
  }

  // 6) Platform hooks (the Android app saves/shares through the OS instead of web downloads / Web Share)
  {
    const ctx = await newContext(browser, { permissions: ['camera'] });
    await ctx.addInitScript(() => {
      window.__calls = [];
      window.__saveResult = true;
      const rec = (op, blob, name) => blob.arrayBuffer().then(b => {
        window.__calls.push({ op, name, type: blob.type, size: blob.size, head: Array.from(new Uint8Array(b.slice(0, 5))) });
      });
      let platform;
      Object.defineProperty(window, 'AppPlatform', {
        configurable: true, get: () => platform, set: v => {
          v.saveFile = (blob, name) => rec('save', blob, name).then(() => window.__saveResult);
          v.shareFile = (blob, name) => rec('share', blob, name);
          v.shareText = (text, title) => { window.__calls.push({ op: 'shareText', title, text }); return Promise.resolve(); };
          v.cameraHelp = reason => 'ช่วยเหลือของแพลตฟอร์ม: ' + reason;
          v.versionLabel = ' v1.0.99 ';
          platform = v;
        }
      });
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    const page = await ctx.newPage(); const log = watch(page, 'hooks');
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.goto(URL);
    await waitReady(page);
    const ver = await page.textContent('#appVersion');
    check('version line shows the platform\'s release version (AppPlatform.versionLabel), no commit or opening time',
      ver === 'เวอร์ชัน v1.0.99' && !/เปิดเมื่อ/.test(ver), JSON.stringify(ver));
    await page.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item');
    await waitIdle(page);
    await page.click('#btnExport');
    await page.waitForSelector('#exportDialog[open]');
    await page.click('#exDownload');
    await page.waitForSelector('#exResult:not([hidden])', { timeout: 60000 });
    const res1 = await page.textContent('#exResult');
    const calls1 = await page.evaluate(() => window.__calls.splice(0));
    const pdfHead = [0x25, 0x50, 0x44, 0x46, 0x2d];
    check('export saves through AppPlatform.saveFile (PDF blob + file name), no web download',
      calls1.length === 1 && calls1[0].op === 'save' && calls1[0].type === 'application/pdf' && /\.pdf$/.test(calls1[0].name) &&
      JSON.stringify(calls1[0].head) === JSON.stringify(pdfHead) && downloads === 0 && res1.includes('สำเร็จ') && !res1.includes('ยังไม่ได้บันทึก'),
      JSON.stringify(calls1) + ' ' + res1);
    await page.click('#exShare');
    await page.waitForFunction(() => window.__calls.length === 1);
    const share = (await page.evaluate(() => window.__calls.splice(0)))[0];
    check('"แชร์" shares the PDF through AppPlatform.shareFile', share.op === 'share' && share.type === 'application/pdf' && JSON.stringify(share.head) === JSON.stringify(pdfHead), JSON.stringify(share));
    await page.evaluate(() => { window.__saveResult = false; });
    await page.click('#exDownload');
    await page.waitForFunction(() => /ยังไม่ได้บันทึก/.test(document.getElementById('exResult').textContent), null, { timeout: 60000 });
    check('save cancelled in the system dialog -> the result says the file was not saved (warning)',
      await page.$eval('#exResult', e => e.classList.contains('warn') || e.classList.contains('error')), await page.textContent('#exResult'));
    await page.evaluate(() => { window.__saveResult = true; window.__calls.splice(0); });
    await page.click('#exCancel');

    // OCR: save .txt and share text through the platform
    await page.click('#btnOcrAll');
    await page.waitForFunction(() => document.getElementById('ocrProgressWrap').hidden && document.getElementById('ocrDialog').open, null, { timeout: 180000 });
    const shareVisible = await page.isVisible('#ocrShare');
    await page.click('#ocrSave');
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.click('#ocrShare');
    await page.waitForFunction(() => window.__calls.length === 2);
    const [txt, st] = await page.evaluate(() => window.__calls.splice(0));
    const text = await page.inputValue('#ocrText');
    check('OCR: save .txt via saveFile (UTF-8 BOM) and share text via shareText',
      shareVisible && txt.op === 'save' && /\.txt$/.test(txt.name) && /^text\/plain/.test(txt.type) && txt.head[0] === 0xEF && txt.head[1] === 0xBB &&
      st.op === 'shareText' && st.text === text && text.length > 50 && (await page.textContent('#ocrNote')).includes('บันทึก'),
      JSON.stringify([txt, { ...st, text: st.text.length }]));
    await page.click('#ocrClose');

    // camera help text from the platform
    await page.click('#btnCamera');
    await page.waitForSelector('#camBlocked:not([hidden])', { timeout: 15000 });
    check('camera panel uses the platform\'s help text (AppPlatform.cameraHelp)', (await page.textContent('#camBlockedHelp')) === 'ช่วยเหลือของแพลตฟอร์ม: denied');
    await page.click('#camClose');
    check('no errors with platform hooks', !log.filter(l => !OCR_NOISE.test(l)).length && downloads === 0, log.join('\n'));
    await ctx.close();
  }

  // 7) Phone in landscape (short screen): editor controls beside the preview, crop tools beside the image
  {
    const ctx = await newContext(browser, { viewport: { width: 780, height: 360 } });
    const page = await ctx.newPage(); const log = watch(page, 'landscape');
    await page.goto(URL);
    await waitReady(page);
    await page.setInputFiles('#fileInput', fixture('photo-tilted.jpg'));
    await page.waitForSelector('.page-item');
    await waitIdle(page);
    await page.click('.page-item .page-card');
    await page.waitForSelector('#viewEditor:not([hidden])');
    const rect = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const pv = await rect('#edPreview'), panel = await rect('.panel');
    await page.click('#edCrop');
    await page.waitForSelector('#viewCrop:not([hidden])');
    await page.waitForTimeout(300);
    const stage = await rect('#cropStage'), auto = await rect('#cropAuto');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone landscape: editor panel beside the preview, crop tools beside a full-height image, no sideways scroll',
      panel.x >= pv.x + pv.w - 1 && auto.x >= stage.x + stage.w - 1 && stage.h >= 360 * 0.6 && overflow <= 1 && !log.length,
      JSON.stringify({ pv, panel, stage, auto, overflow }) + log.join(' '));
    await ctx.close();
  }

  await browser.close(); await srv.close();
  t.finish();
});
