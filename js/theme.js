/* theme.js — pengelola tema Terang / Gelap (localStorage: lis2627_theme)
 * Attribute data-theme dipasang di <html>. Event 'lis-theme-change' dipakai
 * spa.js untuk menggambar ulang chart dengan palet tema aktif.
 */
(function (global) {
  'use strict';

  var KEY = 'lis2627_theme';

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'dark' || v === 'light' ? v : '';
    } catch (e) {
      return '';
    }
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function paint(t) {
    var dark = t === 'dark';
    var sun = document.getElementById('theme-icon-sun');
    var moon = document.getElementById('theme-icon-moon');
    var lab = document.getElementById('theme-label');
    var btn = document.getElementById('btn-theme');
    if (sun) sun.classList.toggle('hidden', dark);
    if (moon) moon.classList.toggle('hidden', !dark);
    if (lab) lab.textContent = dark ? 'Terang' : 'Gelap';
    if (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.title = dark ? 'Beralih ke tema Terang' : 'Beralih ke tema Gelap';
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#101114' : '#FBF7EF');
  }

  function apply(t, save) {
    var mode = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    if (save !== false) {
      try { localStorage.setItem(KEY, mode); } catch (e) {}
    }
    paint(mode);
    global.dispatchEvent(new CustomEvent('lis-theme-change', { detail: { theme: mode } }));
  }

  function toggle() {
    apply(current() === 'dark' ? 'light' : 'dark', true);
  }

  function init() {
    var btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', toggle);
    paint(current());
    // ikut preferensi OS hanya kalau user belum pernah memilih
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function (e) {
        if (!stored()) apply(e.matches ? 'dark' : 'light', false);
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LISTheme = { get: current, set: apply, toggle: toggle };
})(window);
