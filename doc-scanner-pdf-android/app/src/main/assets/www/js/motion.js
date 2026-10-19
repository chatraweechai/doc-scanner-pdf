/*
 * motion.js — แอนิเมชันของหน้าจอที่ต้องใช้โค้ด (Web Animations API) — แอนิเมชันอื่นอยู่ใน css/style.css
 *
 *   Motion.enabled()                  false เมื่อเครื่องตั้ง "ลดการเคลื่อนไหว" (prefers-reduced-motion) หรือเบราว์เซอร์ไม่มี Element.animate
 *   Motion.flip(container, selector, change)
 *                                     จำตำแหน่งรายการ (selector ที่มี data-id) → เรียก change() ที่สร้างรายการใหม่ →
 *                                     รายการเดิมเลื่อนจากที่เดิมไปที่ใหม่, รายการใหม่ค่อย ๆ ปรากฏ,
 *                                     รายการที่หายไปเหลือ "เงา" (.motion-ghost) ที่ย่อและจางหายไป
 *   Motion.play(el, frames, opts)     เล่นแอนิเมชันหนึ่งครั้ง (ไม่ทำอะไรเมื่อปิดการเคลื่อนไหว)
 *   Motion.bump(el)                   เด้งเล็กน้อย เช่น ตัวเลขจำนวนหน้าที่เปลี่ยน
 *
 * แอนิเมชันเป็นเพียงภาพ: DOM จริงเปลี่ยนทันทีเสมอ — โค้ดส่วนอื่นและชุดทดสอบไม่ต้องรอแอนิเมชัน
 * เงาของรายการที่ลบไม่มี class/ปุ่มของรายการจริง (aria-hidden, กดไม่ได้) และถูกลบทิ้งเมื่อจบ
 */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(.2, .8, .2, 1)';
  var MAX_GHOSTS = 12;
  var reduce = null;
  try { reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (_) { reduce = null; }
  var stats = { played: 0, moved: 0, entered: 0, ghosts: 0 }; // สำหรับชุดทดสอบ

  function enabled() {
    return !(reduce && reduce.matches) && typeof Element === 'function' && typeof Element.prototype.animate === 'function';
  }

  function play(el, frames, opts) {
    if (!el || !enabled()) return null;
    try {
      var a = el.animate(frames, Object.assign({ duration: 240, easing: EASE }, opts || {}));
      stats.played++;
      return a;
    } catch (_) {
      return null;
    }
  }

  function bump(el) {
    return play(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 320 });
  }

  function visibleRect(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }

  /** เงาของรายการที่ถูกลบ: กล่องขนาดเดิมที่ตำแหน่งเดิม พร้อมภาพย่อ (ย้าย <img> เดิมมา — ภาพถูกถอดรหัสแล้ว ไม่ต้องโหลดใหม่) */
  function ghost(rect, oldEl) {
    var g = document.createElement('div');
    g.className = 'motion-ghost';
    g.setAttribute('aria-hidden', 'true');
    g.style.left = rect.left + 'px';
    g.style.top = rect.top + 'px';
    g.style.width = rect.width + 'px';
    g.style.height = rect.height + 'px';
    var img = oldEl && oldEl.querySelector('img');
    if (img && img.getAttribute('src')) {
      img.removeAttribute('class');
      g.appendChild(img);
    }
    document.body.appendChild(g);
    stats.ghosts++;
    var done = function () { g.remove(); };
    var a = play(g, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.82)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    if (a && a.finished) a.finished.then(done, done); else done();
    setTimeout(done, 1000); // กันค้าง (เช่น แท็บถูกซ่อนระหว่างเล่น)
  }

  function flip(container, selector, change) {
    if (!enabled() || !container) { change(); return; }
    var before = Object.create(null);
    Array.prototype.forEach.call(container.querySelectorAll(selector), function (el) {
      var r = visibleRect(el);
      var id = el.getAttribute('data-id');
      if (r && id) before[id] = { rect: r, el: el };
    });
    change();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var onScreen = function (r) { return r.bottom > 0 && r.top < vh; };
    var seen = Object.create(null);
    Array.prototype.forEach.call(container.querySelectorAll(selector), function (el) {
      var id = el.getAttribute('data-id');
      if (!id) return;
      seen[id] = true;
      var r = visibleRect(el);
      if (!r) return;
      var old = before[id];
      if (!onScreen(r) && !(old && onScreen(old.rect))) return; // นอกจอทั้งก่อนและหลัง: ไม่ต้องเคลื่อนไหว
      if (old) {
        var dx = old.rect.left - r.left, dy = old.rect.top - r.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        if (play(el, [{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }], { duration: 280 })) stats.moved++;
      } else if (play(el, [{ opacity: 0, transform: 'translateY(10px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 260 })) {
        stats.entered++;
      }
    });
    // เงาเฉพาะรายการที่มองเห็นอยู่ และไม่เกิน MAX_GHOSTS (เช่น "ลบทั้งหมด" 200 หน้า ไม่สร้างเงา 200 อัน)
    var gone = Object.keys(before).filter(function (id) { return !seen[id] && onScreen(before[id].rect); });
    gone.slice(0, MAX_GHOSTS).forEach(function (id) { ghost(before[id].rect, before[id].el); });
  }

  window.Motion = { enabled: enabled, play: play, bump: bump, flip: flip, _stats: stats };
})();
