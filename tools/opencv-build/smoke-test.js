// Smoke test for an OpenCV.js build: every function doc-scanner-pdf uses must exist and run.
// Usage: node smoke-test.js path/to/opencv.js
'use strict';
const path = require('path');

// Returns { cv } (wrapped): emscripten 2.x modules are thenables that resolve to themselves,
// so returning/awaiting them directly would loop forever.
async function load(file) {
  const mod = require(path.resolve(file));
  if (mod instanceof Promise) return { cv: await mod }; // emscripten >= 3 (MODULARIZE returns a Promise)
  if (typeof mod.Mat !== 'function') await new Promise(resolve => { mod.onRuntimeInitialized = resolve; });
  return { cv: mod };
}

(async () => {
  const t0 = Date.now();
  const { cv } = await load(process.argv[2]);
  console.log('runtime ready in', Date.now() - t0, 'ms');

  const fns = ['cvtColor', 'GaussianBlur', 'morphologyEx', 'getStructuringElement', 'Canny', 'dilate', 'findContours',
    'contourArea', 'convexHull', 'arcLength', 'approxPolyDP', 'isContourConvex', 'threshold', 'resize',
    'getPerspectiveTransform', 'warpPerspective', 'split', 'merge', 'divide', 'LUT', 'bitwise_or', 'bitwise_not',
    'countNonZero', 'connectedComponentsWithStats', 'medianBlur', 'addWeighted', 'matFromArray', 'matFromImageData',
    'exceptionFromPtr'];
  const missing = fns.filter(f => typeof cv[f] !== 'function');
  const consts = ['CV_8UC1', 'CV_8UC4', 'CV_32FC2', 'CV_32S', 'COLOR_RGBA2GRAY', 'COLOR_RGBA2RGB', 'COLOR_RGB2HSV',
    'COLOR_HSV2RGB', 'COLOR_RGB2GRAY', 'COLOR_GRAY2RGBA', 'COLOR_RGB2RGBA', 'MORPH_RECT', 'MORPH_ELLIPSE', 'MORPH_CLOSE',
    'MORPH_OPEN', 'RETR_LIST', 'CHAIN_APPROX_SIMPLE', 'THRESH_BINARY', 'THRESH_BINARY_INV', 'THRESH_OTSU', 'INTER_AREA',
    'INTER_LINEAR', 'INTER_CUBIC', 'BORDER_REPLICATE', 'CC_STAT_AREA'];
  const missingConsts = consts.filter(c => typeof cv[c] !== 'number');
  if (missing.length || missingConsts.length) {
    console.error('MISSING functions:', missing, 'constants:', missingConsts);
    process.exit(1);
  }

  // Exercise the real pipeline on a synthetic 1600x1200 "photo" and time it.
  const W = 1600, H = 1200;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, paper = x > 300 && x < 1300 && y > 150 && y < 1050;
    const v = paper ? ((y % 40 < 3 && x > 400 && x < 1200) ? 40 : 235 - (x / W) * 60) : 60;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const t1 = Date.now();
  const mats = [];
  const keep = m => (mats.push(m), m);
  const rgba = keep(cv.matFromImageData({ data, width: W, height: H }));
  const gray = keep(new cv.Mat()); cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const blur = keep(new cv.Mat()); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  const k = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)));
  const closed = keep(new cv.Mat()); cv.morphologyEx(blur, closed, cv.MORPH_CLOSE, k);
  const edges = keep(new cv.Mat()); cv.Canny(closed, edges, 30, 90); cv.dilate(edges, edges, k);
  const contours = keep(new cv.MatVector()), hier = keep(new cv.Mat());
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  let quad = null;
  for (let i = 0; i < contours.size(); i++) {
    const c = keep(contours.get(i));
    if (cv.contourArea(c) < W * H * 0.2) continue;
    const hull = keep(new cv.Mat()); cv.convexHull(c, hull, false, true);
    const approx = keep(new cv.Mat()); cv.approxPolyDP(hull, approx, 0.02 * cv.arcLength(hull, true), true);
    if (approx.rows === 4 && cv.isContourConvex(approx)) { quad = Array.from(approx.data32S); break; }
  }
  if (!quad) { console.error('paper quad not found'); process.exit(1); }
  const sp = keep(cv.matFromArray(4, 1, cv.CV_32FC2, quad));
  const dp = keep(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1000, 0, 1000, 900, 0, 900]));
  const M = keep(cv.getPerspectiveTransform(sp, dp));
  const warped = keep(new cv.Mat()); cv.warpPerspective(rgba, warped, M, new cv.Size(1000, 900), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
  const rgb = keep(new cv.Mat()); cv.cvtColor(warped, rgb, cv.COLOR_RGBA2RGB);
  const planes = keep(new cv.MatVector()); cv.split(rgb, planes);
  const p0 = keep(planes.get(0));
  const small = keep(new cv.Mat()); cv.resize(p0, small, new cv.Size(250, 225), 0, 0, cv.INTER_AREA);
  const med = keep(new cv.Mat()); cv.medianBlur(small, med, 21);
  const bg = keep(new cv.Mat()); cv.resize(med, bg, new cv.Size(1000, 900), 0, 0, cv.INTER_LINEAR);
  const div = keep(new cv.Mat()); cv.divide(p0, bg, div, 255, -1);
  const lut = keep(new cv.Mat(1, 256, cv.CV_8UC1)); for (let i = 0; i < 256; i++) lut.data[i] = 255 - i;
  const inv = keep(new cv.Mat()); cv.LUT(div, lut, inv);
  const bin = keep(new cv.Mat()); const otsu = cv.threshold(div, bin, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
  const labels = keep(new cv.Mat()), stats = keep(new cv.Mat()), cents = keep(new cv.Mat());
  const n = cv.connectedComponentsWithStats(bin, labels, stats, cents, 4, cv.CV_32S);
  const hsv = keep(new cv.Mat()); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  const sum = keep(new cv.Mat()); cv.addWeighted(rgb, 1.8, rgb, -0.8, 0, sum);
  const nz = cv.countNonZero(bin);
  mats.forEach(m => { try { m.delete(); } catch (_) { /* ignore */ } });
  console.log(`pipeline OK in ${Date.now() - t1} ms — quad=${quad} otsu=${otsu} components=${n} nonzero=${nz}`);
  process.exit(0);
})().catch(e => { console.error('SMOKE TEST FAILED', e); process.exit(1); });
