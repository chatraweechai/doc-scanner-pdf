/*
 * HeicDecoder — ถอดรหัสรูป HEIC/HEIF (รูปจาก iPhone และมือถือ Android หลายรุ่น) ที่เบราว์เซอร์ถอดรหัสเองไม่ได้
 * (Chrome, Edge, Firefox และ WebView ของ Android — Safari ถอดรหัสเองได้ จึงไม่ต้องใช้)
 *
 *   HeicDecoder.isHeif(blob) → Promise<boolean>      ตรวจจากส่วนหัวไฟล์ (กล่อง ftyp) ไม่เชื่อชื่อ/ชนิดไฟล์
 *   HeicDecoder.decode(blob, maxPixels) → Promise<ImageData>
 *        error.code: 'too-large' (เกิน maxPixels) | 'not-heif'
 *   HeicDecoder.info() → { mode: 'worker' | 'inline' | null, decoded }   ใช้ตรวจสอบ/ทดสอบ
 *
 * ใช้ libheif (vendor/libheif, โหลดเมื่อต้องใช้เท่านั้น ~2 MB) ใน Web Worker (js/heic-worker.js) — หน้าจอไม่ค้าง
 * เปิดผ่าน file:// หรือเบราว์เซอร์ที่ใช้ Worker ไม่ได้ → ถอดรหัสในหน้าเว็บแทน
 * URL ของไฟล์ได้จาก window.AppPlatform เหมือนไลบรารีอื่น (ใช้โค้ดเดียวกันบน Apps Script และแอป Android)
 */
(function () {
  'use strict';

  var LIB = 'vendor/libheif/libheif-bundle.js';
  var WORKER_URL = 'js/heic-worker.js';
  var IDLE_MS = 30000;          // ปิด worker (คืนหน่วยความจำ ~50 MB) เมื่อไม่ได้ใช้
  var TIMEOUT_MS = 120000;
  // แบรนด์ของไฟล์ HEIF ที่มีภาพ HEVC (HEIC) — AVIF เบราว์เซอร์ถอดรหัสเองได้อยู่แล้ว
  var BRANDS = { heic: 1, heix: 1, hevc: 1, hevx: 1, heim: 1, heis: 1, hevm: 1, hevs: 1, mif1: 1, msf1: 1 };

  var worker = null, idleTimer = null, nextId = 1;
  var jobs = {};
  var inlineLib = null;
  var stats = { mode: null, decoded: 0 };

  function done(mode) {
    return function (img) { stats.mode = mode; stats.decoded++; return img; };
  }

  function platform() {
    if (!window.AppPlatform) throw new Error(I18n.t('ไม่พบ AppPlatform (js/boot.js)'));
    return window.AppPlatform;
  }

  function codeError(message, code) {
    var e = new Error(message);
    if (code) e.code = code;
    return e;
  }

  /** ส่วนหัวไฟล์: [size][ftyp][major brand][minor][compatible brands...] */
  function isHeif(blob) {
    if (!blob || typeof blob.slice !== 'function' || blob.size < 12) return Promise.resolve(false);
    return blob.slice(0, 64).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      var str = function (i) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); };
      if (str(4) !== 'ftyp') return false;
      var size = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
      var end = Math.min(b.length, size >= 16 ? size : 16);
      if (BRANDS[str(8)]) return true;
      for (var i = 16; i + 4 <= end; i += 4) if (BRANDS[str(i)]) return true;
      return false;
    }, function () { return false; });
  }

  // ---------------------------------------------------------------- Worker

  function failAll(err) {
    Object.keys(jobs).forEach(function (id) { jobs[id].reject(err); });
    jobs = {};
  }

  function stopWorker() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } }
    worker = null;
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (!Object.keys(jobs).length) stopWorker(); }, IDLE_MS);
  }

  function getWorker() {
    if (worker) return Promise.resolve(worker);
    return platform().resolve(WORKER_URL).then(function (url) {
      if (worker) return worker;
      var w = new Worker(url); // file:// ในบางเบราว์เซอร์โยน error → ใช้แบบในหน้าเว็บแทน
      w.onmessage = function (e) {
        var m = e.data || {};
        var job = m.type === 'result' && jobs[m.id];
        if (!job) return;
        delete jobs[m.id];
        clearTimeout(job.timer);
        touch();
        if (m.error) { var err = codeError(m.error, m.code); err.fromWorker = true; job.reject(err); }
        else if (!(m.width > 0 && m.height > 0) || !(m.data instanceof ArrayBuffer) || m.data.byteLength !== m.width * m.height * 4) {
          job.reject(codeError(I18n.t('ผลการถอดรหัส HEIC ไม่ถูกต้อง')));
        } else job.resolve(new ImageData(new Uint8ClampedArray(m.data), m.width, m.height));
      };
      w.onerror = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var err = codeError((e && e.message) || I18n.t('ตัวถอดรหัส HEIC ทำงานผิดพลาด'));
        stopWorker();
        failAll(err);
      };
      worker = w;
      return w;
    });
  }

  function decodeInWorker(blob, maxPixels) {
    return Promise.all([blob.arrayBuffer(), platform().resolve(LIB, true), getWorker()]).then(function (r) {
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        var job = { resolve: resolve, reject: reject };
        job.timer = setTimeout(function () {
          delete jobs[id];
          stopWorker();
          failAll(codeError(I18n.t('ถอดรหัส HEIC นานเกินไป')));
          reject(codeError(I18n.t('ถอดรหัส HEIC นานเกินไป')));
        }, TIMEOUT_MS);
        jobs[id] = job;
        clearTimeout(idleTimer);
        r[2].postMessage({ type: 'decode', id: id, lib: r[1], buffer: r[0], maxPixels: maxPixels }, [r[0]]);
      });
    });
  }

  // ---------------------------------------------------------------- ในหน้าเว็บ (file://)

  var inlineChain = Promise.resolve();
  var inlineDecoder = null; // ใช้ตัวเดิม: decode ครั้งถัดไปคืนหน่วยความจำของไฟล์ก่อนเอง

  function decodeInline(blob, maxPixels) {
    var run = function () {
      return Promise.all([blob.arrayBuffer(), inlineLib || platform().loadScript(LIB, true).then(function () {
        if (typeof window.libheif !== 'function') throw codeError(I18n.t('โหลดตัวถอดรหัส HEIC ไม่สำเร็จ'));
        inlineLib = Promise.resolve(window.libheif());
        return inlineLib;
      })]).then(function (r) {
        return Promise.resolve(inlineLib).then(function (lib) {
          if (!inlineDecoder) inlineDecoder = new lib.HeifDecoder();
          var images = inlineDecoder.decode(new Uint8Array(r[0])) || [];
          var free = function () { images.forEach(function (im) { try { im.free(); } catch (e) { /* ignore */ } }); };
          if (!images.length) { free(); throw codeError(I18n.t('ไม่ใช่ไฟล์ HEIC/HEIF ที่อ่านได้'), 'not-heif'); }
          var w = images[0].get_width(), h = images[0].get_height();
          if (!(w > 0 && h > 0)) { free(); throw codeError(I18n.t('ขนาดภาพไม่ถูกต้อง')); }
          if (w * h > maxPixels) { free(); throw codeError(I18n.t('ภาพใหญ่เกินไป'), 'too-large'); }
          var out = new ImageData(w, h);
          return new Promise(function (resolve, reject) {
            images[0].display(out, function (d) {
              free();
              if (d) resolve(out); else reject(codeError(I18n.t('ถอดรหัส HEIC ไม่สำเร็จ')));
            });
          });
        });
      });
    };
    var p = inlineChain.then(run, run);
    inlineChain = p.catch(function () { /* ignore */ });
    return p;
  }

  function decode(blob, maxPixels) {
    var max = maxPixels > 0 ? maxPixels : 40e6;
    return isHeif(blob).then(function (ok) {
      if (!ok) throw codeError(I18n.t('ไม่ใช่ไฟล์ HEIC/HEIF'), 'not-heif');
      if (typeof Worker !== 'function' || location.protocol === 'file:') return decodeInline(blob, max).then(done('inline'));
      return decodeInWorker(blob, max).then(done('worker'), function (e) {
        if (e && e.fromWorker) throw e; // ไฟล์เสีย/ใหญ่เกิน — ถอดรหัสในหน้าเว็บก็ไม่ได้เช่นกัน
        // สร้าง/ใช้ worker ไม่ได้ (เช่น นโยบายของหน้าเว็บ) → ลองถอดรหัสในหน้าเว็บ
        console.warn('HEIC worker', e);
        return decodeInline(blob, max).then(done('inline'));
      });
    });
  }

  window.HeicDecoder = {
    isHeif: isHeif,
    decode: decode,
    info: function () { return { mode: stats.mode, decoded: stats.decoded }; }
  };
})();
