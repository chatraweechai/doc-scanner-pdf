/*
 * AppPlatform ของแอป Android (repo chatraweechai/doc-scanner-pdf-android) — ใช้แทน js/boot.js ของเวอร์ชันเว็บ
 *
 * หน้าเว็บ, โค้ด และไลบรารีทั้งหมดอยู่ในแอป (assets/www) เปิดผ่าน https://appassets.androidplatform.net/
 * (MainActivity.kt เสิร์ฟให้ ไม่ใช้อินเทอร์เน็ต) โค้ดของแอปจึงเหมือนเวอร์ชันเว็บทุกไบต์
 * สิ่งที่ WebView ทำเองไม่ได้ ส่งให้ Android ทำผ่าน DocScannerBridge (WebMessageListener
 * ที่รับข้อความจากหน้าเว็บของแอปเท่านั้น):
 *   saveFile  — ไฟล์ PDF/.txt → หน้าต่าง "บันทึกเป็น" ของ Android
 *   shareFile / shareText — แชร์ไปแอปอื่น (Web Share API ไม่มีใน WebView)
 * สร้างอัตโนมัติโดย tools/convert/build.js — แก้ที่ tools/convert/templates/platform.js
 */
(function () {
  'use strict';

  var SOURCE = /*@SOURCE@*/null;
  var CHUNK = 192 * 1024;           // ไบต์ต่อข้อความ (base64 ~256 KB)
  var bridge = window.DocScannerBridge || null;

  // ไฟล์นี้อยู่ใน <head>: ซ่อนหน้าไว้จนโหลดหน้าครบ (js/i18n.js แปลข้อความแล้ว) — ไม่เห็นภาษาไทยแวบก่อนเป็นภาษาอังกฤษ
  var root = document.documentElement;
  root.style.visibility = 'hidden';
  function reveal() { root.style.visibility = ''; }
  document.addEventListener('DOMContentLoaded', reveal);
  setTimeout(reveal, 3000);

  // ข้อความของไฟล์นี้และของแอป Android (ข้อผิดพลาดจาก BridgeProtocol.kt / TransferStore.kt) เป็นภาษาไทย —
  // หน้าเว็บภาษาอังกฤษแปลด้วย js/i18n.js ของแอป (I18n.add ไม่ทับคำแปลของแอป)
  var EN = {
    'โหลดไฟล์ {src} ไม่สำเร็จ': 'Couldn’t load {src}',
    'ทำรายการไม่สำเร็จ': 'The action failed',
    'แอปรุ่นนี้ส่งไฟล์ให้ Android ไม่ได้ — อัปเดต Android System WebView': 'This app can’t hand files to Android — update Android System WebView',
    'วิธีอนุญาตกล้อง: เปิด "การตั้งค่า" ของเครื่อง → แอป → สแกนเอกสาร PDF → สิทธิ์ → กล้อง → อนุญาต แล้วกด "ลองอีกครั้ง"':
      'To allow the camera: open your device "Settings" → Apps → Doc Scanner PDF → Permissions → Camera → Allow, then press "Try again"',
    'ข้อความยาวเกินไป': 'The message is too long',
    'รูปแบบข้อความไม่ถูกต้อง': 'Invalid message format',
    'รหัสคำขอไม่ถูกต้อง': 'Invalid request ID',
    'รหัสคำขอซ้ำ': 'Duplicate request ID',
    'มีไฟล์ที่กำลังส่งมากเกินไป': 'Too many files are being sent',
    'สร้างโฟลเดอร์ชั่วคราวไม่ได้': 'Couldn’t create a temporary folder',
    'ไม่พบไฟล์ที่กำลังส่ง': 'The file being sent was not found',
    'ลำดับชิ้นไฟล์ไม่ถูกต้อง': 'File parts are out of order',
    'ข้อมูลไฟล์เสีย': 'The file data is damaged',
    'ไฟล์ใหญ่กว่าที่แจ้งไว้': 'The file is larger than announced'
  };
  var translated = false;
  function useDictionary() {
    if (!translated && window.I18n && typeof I18n.add === 'function') { I18n.add(EN); translated = true; }
    return translated;
  }
  /** ข้อความในภาษาของหน้าเว็บ ({ชื่อ} = ตัวแปร) */
  function tr(text, params) {
    if (useDictionary()) return I18n.t(text, params);
    return text.replace(/\{(\w+)\}/g, function (m, k) { return params && k in params ? String(params[k]) : m; });
  }

  var HEX = /^[0-9a-f]{7,40}$/;
  var commit = SOURCE && HEX.test(SOURCE.commit) ? SOURCE.commit.slice(0, 12) : 'dev';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var d = new Date();
  var opened = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
    '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  window.APP_BUILD = { commit: commit, page: commit, opened: opened, v: commit + '-' + opened };

  function abs(path) { return new URL(path, document.baseURI).href; }

  function loadScriptTag(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(s); };
      s.onerror = function () { s.remove(); reject(new Error(tr('โหลดไฟล์ {src} ไม่สำเร็จ', { src: src }))); };
      document.head.appendChild(s);
    });
  }

  // ---------- สะพานไปยัง Android ----------
  var pending = {};
  var seq = 0;

  function onReply(ev) {
    var msg;
    try { msg = JSON.parse(ev && typeof ev.data === 'string' ? ev.data : ''); } catch (_) { return; }
    if (!msg || typeof msg.id !== 'string' || !Object.prototype.hasOwnProperty.call(pending, msg.id)) return;
    var p = pending[msg.id];
    delete pending[msg.id];
    if (msg.ok === true) p.resolve(msg.result);
    else p.reject(new Error(typeof msg.error === 'string' && msg.error ? msg.error : tr('ทำรายการไม่สำเร็จ')));
  }
  if (bridge) {
    if (typeof bridge.addEventListener === 'function') bridge.addEventListener('message', onReply);
    else bridge.onmessage = onReply;
  }

  function post(obj) { bridge.postMessage(JSON.stringify(obj)); }

  /** ส่งคำขอแล้วรอคำตอบจาก Android (ไม่มีเวลาหมด: การบันทึกรอผู้ใช้เลือกที่เก็บไฟล์) */
  function request(first, after) {
    if (!bridge) return Promise.reject(new Error(tr('แอปรุ่นนี้ส่งไฟล์ให้ Android ไม่ได้ — อัปเดต Android System WebView')));
    var id = 'r' + (++seq) + '-' + Date.now().toString(36);
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      try {
        first.id = id;
        post(first);
        if (after) after(id);
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  function base64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ชนิดไฟล์ตามนามสกุล เมื่อ Blob ไม่บอกชนิด — Android รับเฉพาะชนิดใน FileNames.EXTENSIONS
  var TYPES = {
    pdf: 'application/pdf', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  function mimeOf(blob, name) {
    var t = String(blob && blob.type || '').split(';')[0].trim().toLowerCase();
    if (t) return t;
    var ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1];
    return TYPES[String(ext).toLowerCase()] || 'text/plain';
  }

  /** ส่งไฟล์เป็นชิ้น ๆ แล้วให้ Android บันทึก (kind = save) หรือแชร์ (kind = share) */
  function transfer(kind, blob, name) {
    return blob.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
      return request({ v: 1, op: 'begin', kind: kind, name: String(name), mime: mimeOf(blob, name), size: bytes.length, chunks: chunks },
        function (id) {
          for (var i = 0; i < chunks; i++) {
            post({ v: 1, op: 'chunk', id: id, index: i, data: base64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
          }
          post({ v: 1, op: 'end', id: id });
        });
    });
  }

  // ภาษาของหน้าจอ → Android: ข้อความของแอป (Toast, ข้อผิดพลาดการบันทึก/แชร์) ใช้ภาษาเดียวกับหน้าเว็บ
  // ส่งตอนเปิดและทุกครั้งที่ผู้ใช้กดปุ่มเปลี่ยนภาษา (แอปจำไว้ใช้ครั้งต่อไป)
  function sendLanguage(lang) {
    if (!bridge || (lang !== 'th' && lang !== 'en')) return;
    request({ v: 1, op: 'lang', lang: lang }).catch(function (e) { console.warn('language → Android', e); });
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!useDictionary()) return;
    sendLanguage(I18n.lang);
    I18n.onChange(sendLanguage);
  });

  // เลขรุ่นของแอป (v1.0.N ตาม Release) — MainActivity ต่อท้าย user agent ด้วย " DocScannerPDF/1.0.N"
  var appVersion = /\sDocScannerPDF\/(\d{1,3}\.\d{1,3}\.\d{1,3})(?:\s|$)/.exec(' ' + (navigator.userAgent || ''));

  window.AppPlatform = {
    id: 'android',
    label: 'Android',
    /** แสดง "เวอร์ชัน v1.0.N (Android)" แทนเลข commit และเวลาที่เปิด */
    versionLabel: appVersion ? 'v' + appVersion[1] : '',
    build: window.APP_BUILD,
    source: SOURCE,
    resolve: function (path) { return Promise.resolve(abs(path)); },
    loadScript: function (path) { return loadScriptTag(path); },
    /** บันทึกไฟล์ผ่านหน้าต่าง "บันทึกเป็น" ของ Android — false = ผู้ใช้ยกเลิก */
    saveFile: function (blob, name) {
      return transfer('save', blob, name).then(function (r) { return r === 'saved'; });
    },
    shareFile: function (blob, name) {
      return transfer('share', blob, name).then(function () { return true; });
    },
    shareText: function (text, title) {
      return request({ v: 1, op: 'shareText', text: String(text), title: String(title || '') }).then(function () { return true; });
    },
    cameraHelp: function (reason) {
      if (reason !== 'denied') return '';
      return tr('วิธีอนุญาตกล้อง: เปิด "การตั้งค่า" ของเครื่อง → แอป → สแกนเอกสาร PDF → สิทธิ์ → กล้อง → อนุญาต แล้วกด "ลองอีกครั้ง"');
    },
    /**
     * ปุ่มย้อนกลับของ Android (MainActivity เรียก) — คืน true ถ้าหน้าเว็บจัดการเอง
     * ปิดหน้าต่างที่เปิดอยู่ก่อน (เหมือนกด Esc) แล้วจึงย้อนหน้า (กล้อง/ครอป/แก้ไข → หน้าหลัก)
     */
    onBack: function () {
      var dlg = document.querySelector('dialog[open]');
      if (dlg) {
        var ev = new Event('cancel', { cancelable: true });
        if (dlg.dispatchEvent(ev) && dlg.hasAttribute('open')) dlg.close();
        return true;
      }
      var st = history.state;
      if (st && typeof st.v === 'string' && st.v !== 'home') {
        history.back();
        return true;
      }
      return false;
    }
  };
})();
