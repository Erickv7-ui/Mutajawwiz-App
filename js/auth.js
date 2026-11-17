/* auth.js — gate login client-side (bukan keamanan nyata, hanya overlay) */
(function () {
  'use strict';

  var PASS_KEY = 'lis2627_web_pass_v2';
  var AUTH_KEY = 'lis2627_authed';
  var UNTIL_KEY = 'lis2627_authed_until';   // sisa versi lama (v60) — dibersihkan, tidak dipakai lagi
  var DEFAULT_PASS = '123456';

  /* Hash sederhana, tidak butuh crypto.subtle (aman di http/file://) */
  function hash(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = (h1 ^ c) * 16777619 >>> 0;
      h2 = (h2 + c * (i + 7)) >>> 0;
    }
    return h1.toString(16) + '-' + h2.toString(16) + '-' + str.length.toString(16);
  }

  function storedHash() {
    var h = localStorage.getItem(PASS_KEY);
    if (h) return h;
    var def = hash(DEFAULT_PASS);
    try { localStorage.setItem(PASS_KEY, def); } catch (e) {}
    return def;
  }

  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function gate(on) {
    var g = $('login-gate');
    var root = document.documentElement;
    if (on) {
      if (root) root.classList.remove('authed');
      if (g) { g.classList.remove('hidden'); g.style.display = 'flex'; }
      document.body.style.overflow = 'hidden';
    } else {
      if (root) root.classList.add('authed');
      if (g) { g.classList.add('hidden'); g.style.display = 'none'; }
      document.body.style.overflow = '';
    }
  }

  /* Sesi hanya berlaku di tab yang sedang dipakai: refresh tidak minta password,
     tapi begitu tab/browser ditutup, buka lagi harus password. */
  function isAuthed() {
    try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return false; }
  }

  function saveAuthed() {
    try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (e) {}
    try { localStorage.removeItem(UNTIL_KEY); localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }

  function clearAuthed() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
    try { localStorage.removeItem(UNTIL_KEY); localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }

  function setErr(msg) {
    var e = $('gate-error');
    if (e) { e.textContent = msg || ''; if (msg) show(e); else hide(e); }
  }

  function doLogin() {
    var inp = $('gate-pass');
    var btn = $('gate-btn');
    var val = inp ? String(inp.value || '').trim() : '';
    if (!val) { setErr('Password wajib diisi.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'MEMERIKSA...'; }
    try {
      var stored = storedHash();
      if (hash(val) !== stored) {
        setErr('Password salah.');
        if (inp) { inp.value = ''; inp.focus(); }
      } else {
        saveAuthed();
        setErr('');
        gate(false);
      }
    } catch (e) {
      setErr('Error: ' + (e && e.message ? e.message : 'tidak diketahui'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
    }
  }

  function doChangePass() {
    var oldIn = $('gate-old'), newIn = $('gate-new'), confIn = $('gate-confirm');
    var err = $('gate-change-error'), ok = $('gate-change-ok');
    var oldVal = oldIn ? String(oldIn.value || '').trim() : '';
    var newVal = newIn ? String(newIn.value || '').trim() : '';
    var confVal = confIn ? String(confIn.value || '').trim() : '';
    hide(ok);
    if (!oldVal || !newVal || !confVal) { if (err) { err.textContent = 'Semua kolom wajib diisi.'; show(err); } return; }
    if (newVal !== confVal) { if (err) { err.textContent = 'Password baru tidak cocok.'; show(err); } return; }
    if (hash(oldVal) !== storedHash()) { if (err) { err.textContent = 'Password lama salah.'; show(err); } return; }
    try {
      localStorage.setItem(PASS_KEY, hash(newVal));
      hide(err);
      if (ok) { ok.textContent = 'Password berhasil diganti.'; show(ok); }
      if (oldIn) oldIn.value = '';
      if (newIn) newIn.value = '';
      if (confIn) confIn.value = '';
    } catch (e) {
      if (err) { err.textContent = 'Gagal menyimpan password.'; show(err); }
    }
  }

  function init() {
    var g = $('login-gate');
    if (!g) return;

    gate(!isAuthed());

    // hint "password default" cuma relevan kalau password belum pernah diganti
    try {
      var hint = $('gate-hint');
      if (hint && storedHash() !== hash(DEFAULT_PASS)) hint.style.display = 'none';
    } catch (e) {}

    // Reset password darurat: buka web dengan ?resetpass=1
    try {
      var qp = new URLSearchParams(location.search);
      if (qp.get('resetpass') === '1') {
        localStorage.removeItem(PASS_KEY);
        clearAuthed();
        gate(true);
      }
    } catch (e) {}

    var btn = $('gate-btn');
    var inp = $('gate-pass');
    if (btn) btn.onclick = function (ev) { if (ev) ev.preventDefault(); doLogin(); };
    if (inp) {
      inp.onkeydown = function (ev) { if (ev && ev.key === 'Enter') { ev.preventDefault(); doLogin(); } };
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 120);
    }

    var toggle = $('gate-toggle-change');
    var box = $('gate-change-box');
    if (toggle && box) {
      toggle.onclick = function () {
        box.classList.toggle('hidden');
        toggle.textContent = box.classList.contains('hidden') ? 'Ganti Password' : 'Tutup';
      };
    }
    var cbtn = $('gate-change-btn');
    if (cbtn) cbtn.onclick = function (ev) { if (ev) ev.preventDefault(); doChangePass(); };
    var back = $('gate-back-btn');
    if (back) back.onclick = function () { gate(true); if (inp) { inp.value = ''; inp.focus(); } };
  }

  window.LISAuth = {
    logout: function () { clearAuthed(); location.reload(); },
    reset: function () { try { localStorage.removeItem(PASS_KEY); } catch (e) {} clearAuthed(); location.reload(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
