/*
 * Scanner — เครื่องมือฝั่งหน้าเว็บ (canvas, ค่าตั้งต้น, เรขาคณิตของกรอบครอป)
 * งานประมวลผลภาพหนักทั้งหมดอยู่ใน cv-core.js และถูกเรียกผ่าน CvEngine (Web Worker)
 */
(function () {
  'use strict';

  function defaultSettings() {
    return { filter: 'enhance', removeShadow: true, brightness: 0, contrast: 0, bwStrength: 0, rotation: 0 };
  }

  /** canvas สำหรับงานภายใน (ถูกอ่านพิกเซลบ่อย จึงตั้ง willReadFrequently) */
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    c.getContext('2d', { willReadFrequently: true });
    return c;
  }

  /** คืนหน่วยความจำของ canvas ทันที (สำคัญบน iOS ที่จำกัดหน่วยความจำ canvas รวม) */
  function releaseCanvas(c) {
    if (c && c.width) { c.width = 0; c.height = 0; }
  }

  function sourceSize(src) {
    return {
      w: src.videoWidth || src.naturalWidth || src.width,
      h: src.videoHeight || src.naturalHeight || src.height
    };
  }

  /** วาดภาพลง canvas ใหม่โดยย่อให้ด้านยาวไม่เกิน maxSide (ไม่ขยาย) */
  function scaledCanvas(src, maxSide) {
    var sz = sourceSize(src);
    var s = Math.min(1, maxSide / Math.max(sz.w, sz.h));
    var c = makeCanvas(sz.w * s, sz.h * s);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return { canvas: c, scale: c.width / sz.w };
  }

  function rotateCanvas(c, deg) {
    deg = ((deg % 360) + 360) % 360;
    if (!deg) return c;
    var swap = deg === 90 || deg === 270;
    var out = makeCanvas(swap ? c.height : c.width, swap ? c.width : c.height);
    var ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    return out;
  }

  window.Scanner = {
    FILTERS: ScanCore.FILTERS,
    defaultSettings: defaultSettings,
    makeCanvas: makeCanvas,
    releaseCanvas: releaseCanvas,
    sourceSize: sourceSize,
    scaledCanvas: scaledCanvas,
    rotateCanvas: rotateCanvas,
    fullQuad: ScanCore.fullQuad,
    orderCorners: ScanCore.orderCorners,
    isValidQuad: ScanCore.isValidQuad,
    outputSize: ScanCore.outputSize
  };
})();
