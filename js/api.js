/* api.js — wrapper cloud API (Vercel Functions + Vercel Blob)
 * Dipakai semua modul (spa.js, rekap.js, db.js).
 * Default endpoint: /api (same-origin). Bisa diubah di Pengaturan → lis2627_api_url.
 */
(function (global) {
  'use strict';

  var URL_KEY = 'lis2627_api_url';
  var TIMEOUT_MS = 25000;

  function base() {
    var saved = '';
    try { saved = global.localStorage.getItem(URL_KEY) || ''; } catch (e) {}
    var b = (saved || '/api').trim();
    if (b === 'local') return '';
    if (!b) b = '/api';
    return b.replace(/\/+$/, '');
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('Timeout ' + (ms / 1000) + 's — server tidak merespons')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
                   function (e) { clearTimeout(t); reject(e); });
    });
  }

  function parse(res) {
    return res.text().then(function (txt) {
      var data;
      try { data = txt ? JSON.parse(txt) : {}; }
      catch (e) { throw new Error('Respons server bukan JSON (HTTP ' + res.status + ')'); }
      if (!res.ok || data.ok === false) {
        var msg = data.error || ('HTTP ' + res.status);
        var err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  }

  function qs(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function enabled() { return base() !== ''; }

  function get(action, params) {
    if (!enabled()) return Promise.reject(new Error('Mode Lokal aktif'));
    var url = base() + qs(Object.assign({ action: action }, params || {}));
    return withTimeout(fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } }), TIMEOUT_MS)
      .then(parse);
  }

  function post(action, body) {
    if (!enabled()) return Promise.reject(new Error('Mode Lokal aktif — data tidak dikirim ke cloud'));
    var url = base() + (action ? '?action=' + encodeURIComponent(action) : '');
    return withTimeout(fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, body || {})),
    }), TIMEOUT_MS).then(parse);
  }

  var API = {
    base: base,
    enabled: enabled,
    get: get,
    post: post,

    ping: function () { return get('ping'); },
    bootstrap: function () { return get('bootstrap'); },
    master: function () { return get('master'); },
    lis: function () { return get('lis'); },
    logs: function (from, to) { return get('logs', { from: from, to: to }); },
    log: function (date) { return get('log', { date: date }); },

    save: function (rec) { return post('save', rec); },
    saveBulk: function (o) { return post('save_bulk', o); },
    pay: function (o) { return post('pay', o); },
    unpay: function (o) { return post('unpay', o); },
    payBulk: function (o) { return post('pay_bulk', o); },
    toggleHidden: function (o) { return post('toggle_hidden', o); },
    deleteLog: function (o) { return post('deleteLog', o); },
    dbSave: function (o) { return post('db-save', o); },
    dbDelete: function (o) { return post('db-delete', o); },
    exportAll: function (password) { return post('export', { password: password }); },
    clearAll: function (password) { return post('clearall', { password: password }); },
  };

  global.LISApi = API;
})(window);
