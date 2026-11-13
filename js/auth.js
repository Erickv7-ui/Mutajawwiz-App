/* auth.js — gate login client-side (bukan keamanan nyata, hanya overlay) */
(function () {
  'use strict';

  const PASS_KEY = 'lis2627_web_pass';
  const AUTH_KEY = 'lis2627_authed';
  const DEFAULT_PASS = '123456';

  async function sha256Hex(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function getStoredHash() {
    const h = localStorage.getItem(PASS_KEY);
    if (h) return h;
    const def = await sha256Hex(DEFAULT_PASS);
    localStorage.setItem(PASS_KEY, def);
    return def;
  }

  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function toggleGate(on) {
    const gate = document.getElementById('login-gate');
    if (!gate) return;
    if (on) {
      gate.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      gate.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  async function doLogin() {
    const inp = document.getElementById('gate-pass');
    const err = document.getElementById('gate-error');
    const btn = document.getElementById('gate-btn');
    const val = (inp ? inp.value : '').trim();
    if (!val) { if (err) { err.textContent = 'Password wajib diisi.'; show(err); } return; }
    if (btn) { btn.disabled = true; btn.textContent = 'MEMERIKSA...'; }
    try {
      const stored = await getStoredHash();
      const inputHash = await sha256Hex(val);
      if (inputHash !== stored) {
        if (err) { err.textContent = 'Password salah.'; show(err); }
        if (inp) { inp.value = ''; inp.focus(); }
      } else {
        sessionStorage.setItem(AUTH_KEY, '1');
        toggleGate(false);
        if (err) hide(err);
      }
    } catch (e) {
      if (err) { err.textContent = 'Terjadi kesalahan.'; show(err); }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
    }
  }

  async function doChangePass() {
    const oldIn = document.getElementById('gate-old');
    const newIn = document.getElementById('gate-new');
    const confIn = document.getElementById('gate-confirm');
    const err = document.getElementById('gate-change-error');
    const ok = document.getElementById('gate-change-ok');
    const oldVal = (oldIn ? oldIn.value : '').trim();
    const newVal = (newIn ? newIn.value : '').trim();
    const confVal = (confIn ? confIn.value : '').trim();
    if (!oldVal || !newVal || !confVal) { if (err) { err.textContent = 'Semua kolom wajib diisi.'; show(err); } hide(ok); return; }
    if (newVal !== confVal) { if (err) { err.textContent = 'Password baru tidak cocok.'; show(err); } hide(ok); return; }
    try {
      const stored = await getStoredHash();
      if (await sha256Hex(oldVal) !== stored) {
        if (err) { err.textContent = 'Password lama salah.'; show(err); } hide(ok); return;
      }
      localStorage.setItem(PASS_KEY, await sha256Hex(newVal));
      if (err) hide(err);
      if (ok) { ok.textContent = 'Password berhasil diganti.'; show(ok); }
      if (oldIn) oldIn.value = '';
      if (newIn) newIn.value = '';
      if (confIn) confIn.value = '';
    } catch (e) {
      if (err) { err.textContent = 'Gagal mengganti password.'; show(err); } hide(ok);
    }
  }

  function init() {
    const gate = document.getElementById('login-gate');
    if (!gate) return;
    // sudah login?
    try {
      if (sessionStorage.getItem(AUTH_KEY) === '1') { toggleGate(false); return; }
    } catch (e) {}
    toggleGate(true);

    const btn = document.getElementById('gate-btn');
    const inp = document.getElementById('gate-pass');
    const toggle = document.getElementById('gate-toggle-change');
    const changeBox = document.getElementById('gate-change-box');
    const changeBtn = document.getElementById('gate-change-btn');
    const backBtn = document.getElementById('gate-back-btn');

    if (btn) btn.addEventListener('click', doLogin);
    if (inp) {
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
      setTimeout(() => inp.focus(), 100);
    }
    if (toggle && changeBox) {
      toggle.addEventListener('click', function () {
        changeBox.classList.toggle('hidden');
        toggle.textContent = changeBox.classList.contains('hidden') ? 'Ganti Password' : 'Tutup';
      });
    }
    if (changeBtn) changeBtn.addEventListener('click', doChangePass);
    if (backBtn) backBtn.addEventListener('click', function () {
      toggleGate(true);
      if (inp) { inp.value = ''; inp.focus(); }
    });
  }

  window.LISAuth = { logout: function () { sessionStorage.removeItem(AUTH_KEY); location.reload(); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
