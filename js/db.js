/* db.js — Panel 06: CRUD database Anggota & Language Improvement Section (LIS)
 * Sub-panel terpisah, data disimpan ke cloud (api db-save / db-delete).
 */
(function (global) {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var H = function () { return global.LIS || {}; };
  function esc(s) { return H().escapeHtml ? H().escapeHtml(s) : String(s == null ? '' : s); }
  function toast(m, t) { if (H().showToast) H().showToast(m, t || 'yellow'); }

  var state = {
    tab: 'anggota',
    pageAng: 1,
    pageLis: 1,
    sizeAng: 25,
    sizeLis: 10,
  };

  function rows(table) {
    return (table === 'lis' ? (H().lis || []) : (H().anggota || []));
  }

  function password() {
    var typed = ((el('db-admin-pass') && el('db-admin-pass').value) || '').trim();
    if (typed) return typed;
    if (H().adminPass) { var hp = H().adminPass(); if (hp) return String(hp).trim(); }
    if (global.LISAdminPin) return String(global.LISAdminPin() || '').trim();
    return '';
  }

  function filtered(table) {
    var q = ((el(table === 'lis' ? 'db-lis-search' : 'db-ang-search') || {}).value || '').trim().toLowerCase();
    var rayon = table === 'anggota' ? ((el('db-ang-rayon') || {}).value || '') : '';
    var section = table === 'lis' ? ((el('db-lis-section') || {}).value || '') : '';
    var status = table === 'anggota' ? ((el('db-ang-status') || {}).value || '') : '';

    return rows(table).filter(function (r) {
      if (rayon && r.rayon !== rayon) return false;
      if (section && (r.section || '') !== section) return false;
      if (status && (r.status || 'Aktif') !== status) return false;
      if (q) {
        var hay = [r.nama, r.stambuk, r.kamar, r.kelas, r.section, r.alamat, r.rayon]
          .map(function (v) { return String(v || '').toLowerCase(); }).join(' ');
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sectionOptions() {
    var sel = el('db-lis-section');
    if (!sel) return;
    var cur = sel.value;
    var uniq = Array.from(new Set(rows('lis').map(function (r) { return (r.section || '').trim(); }).filter(Boolean))).sort();
    sel.innerHTML = '<option value="">Semua Section</option>' +
      uniq.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    if (cur && uniq.indexOf(cur) !== -1) sel.value = cur;
  }

  function renderAnggota() {
    var tbody = el('db-ang-table');
    if (!tbody) return;
    var list = filtered('anggota');
    var size = state.sizeAng;
    var pages = Math.max(1, Math.ceil(list.length / size));
    if (state.pageAng > pages) state.pageAng = pages;
    var start = (state.pageAng - 1) * size;
    var slice = list.slice(start, start + size);

    tbody.innerHTML = slice.length ? slice.map(function (r, i) {
      var nonaktif = (r.status || 'Aktif') === 'Nonaktif';
      return '<tr class="' + (nonaktif ? 'opacity-60' : '') + '">' +
        '<td class="font-mono-code text-xs">' + (start + i + 1) + '</td>' +
        '<td class="font-mono-code text-xs">' + esc(r.stambuk || '-') + '</td>' +
        '<td class="font-extrabold">' + esc(r.nama) + '</td>' +
        '<td class="text-xs">' + esc(r.kelas || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.tingkat || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.rayon || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.kamar || '-') + '</td>' +
        '<td><span class="tag ' + (nonaktif ? 'bg-[#E8E3D8] text-black' : 'bg-[#CFF2DA] text-black') + '">' + esc(r.status || 'Aktif') + '</span></td>' +
        '<td class="whitespace-nowrap">' +
          '<button class="btn py-1 px-2 text-[11px] mr-1" data-db-edit="anggota" data-id="' + esc(r.id || '') + '">Ubah</button>' +
          '<button class="btn btn-red py-1 px-2 text-[11px]" data-db-del="anggota" data-id="' + esc(r.id || '') + '">Hapus</button>' +
        '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="9" class="text-center text-xs font-bold text-black/60 py-4">Tidak ada data.</td></tr>';

    var info = el('db-ang-page-info');
    if (info) info.textContent = list.length
      ? `Menampilkan ${start + 1}-${Math.min(start + size, list.length)} dari ${list.length} anggota`
      : 'Tidak ada anggota';
    var count = el('db-ang-count');
    if (count) count.textContent = rows('anggota').length + ' anggota';
  }

  function renderLis() {
    var tbody = el('db-lis-table');
    if (!tbody) return;
    sectionOptions();
    var list = filtered('lis');
    var size = state.sizeLis;
    var pages = Math.max(1, Math.ceil(list.length / size));
    if (state.pageLis > pages) state.pageLis = pages;
    var start = (state.pageLis - 1) * size;
    var slice = list.slice(start, start + size);

    tbody.innerHTML = slice.length ? slice.map(function (r, i) {
      var nonaktif = (r.status || 'Aktif') === 'Nonaktif';
      return '<tr class="' + (nonaktif ? 'opacity-60' : '') + '">' +
        '<td class="font-mono-code text-xs">' + (start + i + 1) + '</td>' +
        '<td class="font-mono-code text-xs">' + esc(r.stambuk || '-') + '</td>' +
        '<td class="font-extrabold">' + esc(r.nama) + '</td>' +
        '<td class="text-xs">' + esc(r.kelas || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.section || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.alamat || '-') + '</td>' +
        '<td><span class="tag ' + (nonaktif ? 'bg-[#E8E3D8] text-black' : 'bg-[#CFF2DA] text-black') + '">' + esc(r.status || 'Aktif') + '</span></td>' +
        '<td class="whitespace-nowrap">' +
          '<button class="btn py-1 px-2 text-[11px] mr-1" data-db-edit="lis" data-id="' + esc(r.id || '') + '">Ubah</button>' +
          '<button class="btn btn-red py-1 px-2 text-[11px]" data-db-del="lis" data-id="' + esc(r.id || '') + '">Hapus</button>' +
        '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="8" class="text-center text-xs font-bold text-black/60 py-4">Tidak ada data.</td></tr>';

    var info = el('db-lis-page-info');
    if (info) info.textContent = list.length
      ? `Menampilkan ${start + 1}-${Math.min(start + size, list.length)} dari ${list.length} pengurus`
      : 'Tidak ada pengurus';
    var count = el('db-lis-count');
    if (count) count.textContent = rows('lis').length + ' pengurus';
  }

  function render() {
    if (state.tab === 'lis') renderLis();
    else renderAnggota();
    var tabA = el('db-tab-anggota');
    var tabL = el('db-tab-lis');
    var panelA = el('db-panel-anggota');
    var panelL = el('db-panel-lis');
    if (tabA) tabA.className = state.tab === 'anggota' ? 'btn btn-purple' : 'btn';
    if (tabL) tabL.className = state.tab === 'lis' ? 'btn btn-pink' : 'btn';
    if (panelA) panelA.classList.toggle('hidden', state.tab !== 'anggota');
    if (panelL) panelL.classList.toggle('hidden', state.tab !== 'lis');
  }

  function setTab(tab) {
    state.tab = tab === 'lis' ? 'lis' : 'anggota';
    render();
  }

  function openForm(table, id) {
    var rec = id ? rows(table).find(function (r) { return String(r.id) === String(id); }) : null;
    el('db-form-table').value = table;
    el('db-form-id').value = rec ? (rec.id || '') : '';
    el('db-modal-title').textContent = (rec ? 'Ubah ' : 'Tambah ') + (table === 'lis' ? 'Pengurus LIS' : 'Anggota');
    el('db-form-error').classList.add('hidden');

    el('db-f-nama').value = rec ? (rec.nama || '') : '';
    el('db-f-stambuk').value = rec ? (rec.stambuk || '') : '';
    el('db-f-kelas').value = rec ? (rec.kelas || '') : '';
    el('db-f-tingkat').value = rec ? (rec.tingkat || '') : '';
    el('db-f-rayon').value = rec ? (rec.rayon || '') : '';
    el('db-f-kamar').value = rec ? (rec.kamar || '') : '';
    el('db-f-section').value = rec ? (rec.section || '') : '';
    el('db-f-alamat').value = rec ? (rec.alamat || '') : '';
    el('db-f-status').value = rec ? (rec.status || 'Aktif') : 'Aktif';

    document.querySelectorAll('.db-angka-only').forEach(function (n) {
      n.classList.toggle('hidden', table === 'lis');
    });
    document.querySelectorAll('.db-lis-only').forEach(function (n) {
      n.classList.toggle('hidden', table !== 'lis');
    });

    var m = el('db-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(function () { el('db-f-nama') && el('db-f-nama').focus(); }, 80);
  }

  function closeForm() {
    var m = el('db-modal');
    if (!m) return;
    m.classList.add('hidden');
    m.classList.remove('flex');
  }

  async function saveForm() {
    var table = el('db-form-table').value === 'lis' ? 'lis' : 'anggota';
    var nama = (el('db-f-nama').value || '').trim();
    var errEl = el('db-form-error');
    var fail = function (msg) {
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
      toast(msg, 'red');
    };

    if (!nama) { fail('Nama wajib diisi.'); return; }

    var pass = password();
    if (!pass) { fail('Isi Password Admin Server dulu.'); return; }
    var api = H().api ? H().api() : null;
    if (!api) { fail('Mode Lokal aktif — perubahan database butuh cloud.'); return; }

    var rec = {
      id: el('db-form-id').value || '',
      nama: nama,
      stambuk: (el('db-f-stambuk').value || '').trim(),
      kelas: (el('db-f-kelas').value || '').trim(),
      status: el('db-f-status').value || 'Aktif',
    };
    if (table === 'lis') {
      rec.section = (el('db-f-section').value || '').trim();
      rec.alamat = (el('db-f-alamat').value || '').trim();
    } else {
      rec.tingkat = (el('db-f-tingkat').value || '').trim();
      rec.rayon = (el('db-f-rayon').value || '').trim();
      rec.kamar = (el('db-f-kamar').value || '').trim();
    }
    if (!rec.id) delete rec.id;

    var btn = el('db-form-save');
    if (btn) { btn.disabled = true; btn.textContent = 'MENYIMPAN...'; }
    try {
      await api.dbSave({ table: table, record: rec, password: pass });
      await refresh(table);
      closeForm();
      toast((rec.id ? 'Data diperbarui.' : 'Data ditambahkan.') , 'green');
    } catch (err) {
      fail(err.status === 401 ? 'Password Admin Server salah.' : 'Gagal simpan: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    }
  }

  function removeRow(table, id) {
    var rec = rows(table).find(function (r) { return String(r.id) === String(id); });
    if (!rec) return;
    var pass = password();
    if (!pass) { toast('Isi Password Admin Server dulu.', 'red'); return; }
    var api = H().api ? H().api() : null;
    if (!api) { toast('Mode Lokal aktif — hapus data butuh cloud.', 'red'); return; }

    var label = rec.nama + (rec.stambuk ? ' (' + rec.stambuk + ')' : '');
    var run = function (hard) {
      api.dbDelete({ table: table, id: id, password: pass, hard: hard })
        .then(function () { return refresh(table); })
        .then(function () { toast(hard ? 'Data dihapus permanen.' : 'Data dinonaktifkan.', hard ? 'red' : 'yellow'); })
        .catch(function (err) {
          toast(err.status === 401 ? 'Password Admin Server salah.' : 'Gagal hapus: ' + err.message, 'red');
        });
    };

    if (H().openConfirm) {
      H().openConfirm(
        'Nonaktifkan data ini?',
        label + ' akan ditandai Nonaktif (masih tersimpan, tidak muncul di input absensi). Tekan OK untuk lanjut.',
        function () { run(false); }
      );
    } else if (confirm('Nonaktifkan ' + label + '?')) {
      run(false);
    }
  }

  async function refresh(table) {
    var api = H().api ? H().api() : null;
    if (!api) return;
    try {
      if (table === 'lis') {
        var rl = await api.lis();
        if (rl && Array.isArray(rl.data)) H().lis = rl.data;
      } else {
        var ra = await api.master();
        if (ra && Array.isArray(ra.data)) H().anggota = ra.data;
      }
      if (H().renderAll) H().renderAll();
      render();
    } catch (err) {
      toast('Gagal memuat ulang: ' + err.message, 'red');
    }
  }

  function init() {
    var bind = function (id, ev, fn) {
      var e = el(id);
      if (e) e.addEventListener(ev, fn);
    };

    bind('db-tab-anggota', 'click', function () { setTab('anggota'); });
    bind('db-tab-lis', 'click', function () { setTab('lis'); });

    bind('db-ang-search', 'input', function () { state.pageAng = 1; renderAnggota(); });
    bind('db-ang-rayon', 'change', function () { state.pageAng = 1; renderAnggota(); });
    bind('db-ang-status', 'change', function () { state.pageAng = 1; renderAnggota(); });
    bind('db-ang-add', 'click', function () { openForm('anggota'); });
    bind('db-ang-refresh', 'click', function () { refresh('anggota'); });
    bind('db-ang-prev', 'click', function () { state.pageAng = Math.max(1, state.pageAng - 1); renderAnggota(); });
    bind('db-ang-next', 'click', function () { state.pageAng += 1; renderAnggota(); });

    bind('db-lis-search', 'input', function () { state.pageLis = 1; renderLis(); });
    bind('db-lis-section', 'change', function () { state.pageLis = 1; renderLis(); });
    bind('db-lis-add', 'click', function () { openForm('lis'); });
    bind('db-lis-refresh', 'click', function () { refresh('lis'); });
    bind('db-lis-prev', 'click', function () { state.pageLis = Math.max(1, state.pageLis - 1); renderLis(); });
    bind('db-lis-next', 'click', function () { state.pageLis += 1; renderLis(); });

    bind('db-form-save', 'click', saveForm);
    bind('db-form-cancel', 'click', closeForm);
    bind('db-form-cancel-2', 'click', closeForm);

    // delegasi tombol Ubah / Hapus di tabel
    document.addEventListener('click', function (e) {
      var edit = e.target.closest && e.target.closest('[data-db-edit]');
      if (edit) { openForm(edit.getAttribute('data-db-edit'), edit.getAttribute('data-id')); return; }
      var del = e.target.closest && e.target.closest('[data-db-del]');
      if (del) { removeRow(del.getAttribute('data-db-del'), del.getAttribute('data-id')); }
    });

    render();
  }

  global.LISDb = { init: init, render: render, refresh: refresh, openForm: openForm };
})(window);
