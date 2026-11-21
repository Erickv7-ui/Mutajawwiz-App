/* rekap.js — Rekap Harian + Export XLSX template resmi (halaman 04 Laporan)
 * Butuh: api.js (window.LISApi), xlsx-writer.js (window.AbsensiXLSX), spa.js (window.LIS)
 */
(function (global) {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var H = function () { return global.LIS || {}; };

  /** Tanggal saja — buang bagian jam kalau ada (mis. '2026-11-15 06:21' / ISO) */
  function dOnly(v) { return String(v || '').slice(0, 10); }

  function today() { return (H().getToday ? H().getToday() : new Date().toISOString().slice(0, 10)); }
  function rupiah(n) { return H().formatRupiah ? H().formatRupiah(n) : 'Rp' + (n || 0); }
  function esc(s) { return H().escapeHtml ? H().escapeHtml(s) : String(s == null ? '' : s); }
  function toast(msg, type) { if (H().showToast) H().showToast(msg, type || 'yellow'); }

  function tarifOf(bahasa) {
    var t = H().getTarif ? H().getTarif() : { Indonesian: 2000, Javanese: 2000 };
    return String(bahasa).toLowerCase().indexOf('jav') !== -1 ? t.Javanese : t.Indonesian;
  }

  function filteredRows() {
    var logs = H().logs || [];
    var tgl = (el('rekap-tanggal') && el('rekap-tanggal').value) || today();
    var q = ((el('rekap-search') && el('rekap-search').value) || '').trim().toLowerCase();
    var rayon = (el('rekap-rayon') && el('rekap-rayon').value) || '';
    var bahasa = (el('rekap-bahasa') && el('rekap-bahasa').value) || '';

    return logs.filter(function (l) {
      if (String(l.tgl || '').slice(0, 10) !== tgl) return false;
      if (rayon && l.rayon !== rayon) return false;
      if (bahasa && l.bahasa !== bahasa) return false;
      if (q) {
        var hay = (String(l.nama || '') + ' ' + String(l.stambuk || '') + ' ' + String(l.kamar || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      return String(a.timestamp || a.waktu || '').localeCompare(String(b.timestamp || b.waktu || ''));
    });
  }

  function render() {
    var rows = filteredRows();
    var tbody = el('rekap-table');
    if (!tbody) return;

    var totalDenda = 0, totalLunas = 0;
    rows.forEach(function (r) {
      var d = tarifOf(r.bahasa);
      totalDenda += d;
      if (r.lunas) totalLunas += d;
    });

    var set = function (id, v) { var e = el(id); if (e) e.textContent = v; };
    set('rekap-total-kasus', rows.length);
    set('rekap-total-denda', rupiah(totalDenda));
    set('rekap-total-lunas', rupiah(totalLunas));
    set('rekap-total-tunggakan', rupiah(totalDenda - totalLunas));
    set('rekap-count-badge', rows.length + ' entri');

    var empty = el('rekap-empty');
    if (empty) empty.classList.toggle('hidden', rows.length > 0);

    tbody.innerHTML = rows.map(function (r, i) {
      var denda = tarifOf(r.bahasa);
      return '<tr>' +
        '<td class="font-mono-code text-xs">' + (i + 1) + '</td>' +
        '<td class="font-mono-code text-xs">' + esc(r.waktu || String(r.timestamp || '').slice(11, 16)) + '</td>' +
        '<td class="font-mono-code text-xs">' + esc(r.stambuk || '-') + '</td>' +
        '<td class="font-extrabold">' + esc(r.nama) + '</td>' +
        '<td class="text-xs">' + esc(r.kelas || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.kamar || '-') + '</td>' +
        '<td><span class="tag ' + (r.bahasa === 'Javanese' ? 'bg-[#FFD9DC] text-black' : 'bg-[#A8E6F5] text-black') + '">' + esc(r.bahasa) + '</span></td>' +
        '<td class="text-xs">' + esc(r.ucapan || '-') + '</td>' +
        '<td class="text-xs">' + esc(r.pengabsen || '-') + '</td>' +
        '<td class="font-mono-code text-xs">' + rupiah(denda) + '</td>' +
        '<td><span class="tag ' + (r.lunas ? 'bg-[#CFF2DA] text-black' : 'bg-[#FFD9DC] text-black') + '">' + (r.lunas ? 'Lunas' : 'Belum') + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function downloadCSV(rows) {
    if (!rows.length) { toast('Tidak ada data untuk diunduh.', 'red'); return; }
    var headers = ['No', 'Stambuk', 'Nama', 'Kelas', 'Kamar', 'Rayon', 'Bahasa', 'Ucapan', 'Petugas', 'Tanggal', 'Waktu', 'Status', 'Penerima'];
    var lines = [headers.join(',')];
    sortByKelas(rows).forEach(function (r, i) {
      var cells = [i + 1, r.stambuk || '', r.nama || '', r.kelas || '', r.kamar || '', r.rayon || '',
        r.bahasa || '', r.ucapan || '', r.pengabsen || '', dOnly(r.tgl || r.timestamp), r.waktu || '',
        r.lunas ? 'Lunas' : 'Belum', r.penerima || ''];
      lines.push(cells.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Rekap_Harian_' + ((el('rekap-tanggal') && el('rekap-tanggal').value) || today()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast(rows.length + ' baris CSV diunduh.', 'green');
  }

  // ---------- XLSX (template resmi) ----------
  function roomOf(r) {
    var raw = String(r.kamar || '').trim();
    var num = /(\d+)\s*$/.exec(raw);
    if (num) return num[1];
    if (/mtq/i.test(raw)) return 'MTQ';
    return '-';
  }

  function groupOf(r) {
    return String(r.bahasa || '').toLowerCase().indexOf('jav') !== -1 ? 'Extreme' : 'Medium';
  }

  function speakingOf(r) {
    return String(r.bahasa || '').toLowerCase().indexOf('jav') !== -1 ? 'Javanese Language' : 'Indonesian Language';
  }

  /** Peringkat kelas: makin tinggi makin besar. "3"/"III"/"3A" -> 3 */
  function kelasRank(v) {
    var s = String(v || '').trim().toUpperCase();
    var num = /(\d+)/.exec(s);
    if (num) return parseInt(num[1], 10);
    var roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
    if (roman[s]) return roman[s];
    var pre = /^(VI|IV|V|III|II|I)\b/.exec(s);
    if (pre && roman[pre[1]]) return roman[pre[1]];
    return 0;
  }

  /** Urut kelas tertinggi dulu, lalu nama, lalu jam catat */
  function sortByKelas(rows) {
    return rows.slice().sort(function (a, b) {
      var ra = kelasRank(a.tingkat || a.kelas), rb = kelasRank(b.tingkat || b.kelas);
      if (ra !== rb) return rb - ra;
      var na = String(a.nama || '').toLowerCase(), nb = String(b.nama || '').toLowerCase();
      if (na !== nb) return na < nb ? -1 : 1;
      return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
    });
  }

  /**
   * Satu sheet untuk semua tanggal: tiap baris = 1 santri pada 1 tanggal.
   * Duplikat (santri yg sama, tanggal yg sama) dijumlah ke kolom 'jumlah'
   * (berapa kali kena hari itu) — bukan ditulis 2 baris.
   * Urut: kelas tertinggi dulu, lalu nama, lalu tanggal.
   */
  function buildSheets(rows) {
    var byKey = {};
    rows.forEach(function (r) {
      var d = dOnly(r.tgl || r.timestamp);
      var k = d + '__' + String(r.stambuk || r.nama || '').trim().toLowerCase();
      if (!byKey[k]) {
        byKey[k] = {
          nama: r.nama,
          date: d,
          kelas: r.tingkat || r.kelas || '-',
          kamar: roomOf(r),
          speaking: speakingOf(r),
          group: groupOf(r),
          jumlah: 0,
          _ts: String(r.timestamp || r.waktu || '')
        };
      }
      byKey[k].jumlah++;
    });
    var list = Object.keys(byKey).map(function (k) { return byKey[k]; });
    list.sort(function (a, b) {
      var ra = kelasRank(a.kelas), rb = kelasRank(b.kelas);
      if (ra !== rb) return rb - ra;
      var na = String(a.nama || '').toLowerCase(), nb = String(b.nama || '').toLowerCase();
      if (na !== nb) return na < nb ? -1 : 1;
      return String(a.date).localeCompare(String(b.date));
    });
    return [{ name: 'Rekap Absensi', rows: list }];
  }

  /** Filter status bayar dari panel export: '' semua | 'sudah' lunas | 'belum' belum lunas */
  function statusFilterOf() {
    var v = (el('xlsx-status') && el('xlsx-status').value) || '';
    return v;
  }

  function applyStatusFilter(rows, statusF) {
    if (statusF !== 'sudah' && statusF !== 'belum') return rows;
    return rows.filter(function (r) {
      var lunas = !!r.lunas;
      return statusF === 'sudah' ? lunas : !lunas;
    });
  }

  function downloadXLSX(rows, fname) {
    if (!global.AbsensiXLSX) { toast('Modul XLSX belum termuat.', 'red'); return; }
    if (!rows.length) { toast('Tidak ada data untuk diunduh.', 'red'); return; }
    var sheets = buildSheets(rows);
    var blob = global.AbsensiXLSX.buildWorkbook(sheets);
    global.AbsensiXLSX.downloadBlob(blob, fname);
    var total = sheets.reduce(function (n, s) { return n + s.rows.length; }, 0);
    toast(sheets.length + ' sheet, ' + total + ' baris diunduh.', 'green');
  }

  function xlsxHarian() {
    var rows = applyStatusFilter(filteredRows(), statusFilterOf());
    downloadXLSX(rows, 'Absensi_' + ((el('rekap-tanggal') && el('rekap-tanggal').value) || today()) + '.xlsx');
  }

  async function xlsxRange() {
    var api = H().api ? H().api() : null;
    var all = el('xlsx-semua') && el('xlsx-semua').checked;
    var from = (el('xlsx-dari') && el('xlsx-dari').value) || '';
    var to = (el('xlsx-hingga') && el('xlsx-hingga').value) || '';
    var kelasF = (el('xlsx-kelas') && el('xlsx-kelas').value) || '';
    var bahasaF = (el('xlsx-bahasa') && el('xlsx-bahasa').value) || '';
    var namaF = ((el('xlsx-nama') && el('xlsx-nama').value) || '').trim().toLowerCase();
    var statusF = statusFilterOf();
    var dupOnly = el('xlsx-dup') && el('xlsx-dup').checked;
    var pass = ((el('xlsx-pass') && el('xlsx-pass').value) || '').trim();
    if (!pass && H().adminPass) pass = String(H().adminPass() || '').trim();
    var btn = el('xlsx-btn');

    if (!all && (!from || !to)) { toast('Pilih rentang tanggal dulu.', 'red'); return; }
    if (!all && from > to) { toast('Tanggal awal harus lebih dulu.', 'red'); return; }
    if (all && !pass) { toast('Mode semua tanggal butuh password admin.', 'red'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'MENYIAPKAN...'; }
    try {
      var rows = [];
      if (all) {
        if (!api) throw new Error('Mode Lokal aktif — data cloud tidak tersedia');
        var res = await api.exportAll(pass);
        rows = res.data || [];
      } else if (api) {
        var r2 = await api.logs(from, to);
        rows = r2.data || [];
      } else {
        rows = (H().logs || []).filter(function (l) {
          var d = String(l.tgl || '').slice(0, 10);
          return d >= from && d <= to;
        });
      }

      var filtered = rows.filter(function (r) {
        if (kelasF && String(r.tingkat || '') !== String(kelasF)) return false;
        if (bahasaF && r.bahasa !== bahasaF) return false;
        if (namaF && String(r.nama || '').toLowerCase().indexOf(namaF) === -1) return false;
        if (statusF === 'sudah' && !r.lunas) return false;
        if (statusF === 'belum' && r.lunas) return false;
        return true;
      });

      if (dupOnly) {
        var perDate = {};
        filtered.forEach(function (r) {
          var d = String(r.tgl || '').slice(0, 10);
          var k = String(r.stambuk || r.nama || '').trim().toLowerCase();
          perDate[d] = perDate[d] || {};
          perDate[d][k] = (perDate[d][k] || 0) + 1;
        });
        filtered = filtered.filter(function (r) {
          var d = String(r.tgl || '').slice(0, 10);
          var k = String(r.stambuk || r.nama || '').trim().toLowerCase();
          return perDate[d][k] > 1;
        });
      }

      var stamp = today().replace(/-/g, '');
      downloadXLSX(filtered, all
        ? 'Absensi_Semua_Tanggal_' + stamp + '.xlsx'
        : 'Absensi_' + from + '_sd_' + to + '.xlsx');
    } catch (err) {
      toast(err.status === 401 ? 'Password Admin Server salah.' : 'Gagal buat XLSX: ' + err.message, 'red');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Unduh XLSX'; }
    }
  }

  // ============================ REKAP PEMBAYARAN (XLSX) ============================
  /**
   * Export XLSX rekap pembayaran: 1 sheet, 1 baris per tagihan (tgl + santri).
   * Kolom: No | Tanggal | Stambuk | Nama | Kelas | Bahasa | Jumlah Kena | Total Denda | Status Bayar | Penerima
   * Duplikat pelanggaran hari yg sama sudah otomatis jadi 1 baris (Jumlah Kena = jumlah log).
   * Filter lengkap: rentang tanggal, kelas, bahasa, nama, status bayar.
   * Data ambil dari tagihan terkonsolidasi (sudah termasuk biaya kertas) di sisi klien.
   */
  function bahasaOfBill(b) {
    var j = b.java || 0, i = b.indo || 0;
    if (j > 0 && i > 0) return 'Indonesian & Javanese';
    return j > 0 ? 'Javanese' : 'Indonesian';
  }

  async function payXlsxRange() {
    var X = global.AbsensiXLSX;
    if (!X || !X.buildPayWorkbook) { toast('Modul XLSX belum termuat.', 'red'); return; }
    var dari = (el('pay-xlsx-dari') && el('pay-xlsx-dari').value) || '';
    var hingga = (el('pay-xlsx-hingga') && el('pay-xlsx-hingga').value) || '';
    var kelasF = (el('pay-xlsx-kelas') && el('pay-xlsx-kelas').value) || '';
    var bahasaF = (el('pay-xlsx-bahasa') && el('pay-xlsx-bahasa').value) || '';
    var namaF = ((el('pay-xlsx-nama') && el('pay-xlsx-nama').value) || '').trim().toLowerCase();
    var statusF = (el('pay-xlsx-status') && el('pay-xlsx-status').value) || '';
    var btn = el('pay-xlsx-btn');

    if (!dari || !hingga) { toast('Pilih rentang tanggal dulu.', 'red'); return; }
    if (dari > hingga) { toast('Tanggal awal harus lebih dulu.', 'red'); return; }

    var getBills = H().getBills;
    if (typeof getBills !== 'function') { toast('Data tagihan belum siap.', 'red'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'MENYIAPKAN...'; }
    try {
      var bills = getBills() || [];
      var rows = bills.filter(function (b) {
        if (b.hidden) return false;            // hidden = diarsipkan, tidak masuk rekap pembayaran
        var d = String(b.tgl || '').slice(0, 10);
        if (d < dari || d > hingga) return false;
        if (kelasF && String(kelasRank(b.kelas)) !== String(kelasF)) return false;
        if (bahasaF === 'Javanese' && !(b.java > 0)) return false;
        if (bahasaF === 'Indonesian' && !(b.indo > 0)) return false;
        if (namaF && String(b.nama || '').toLowerCase().indexOf(namaF) === -1) return false;
        if (statusF === 'sudah' && !b.lunas) return false;
        if (statusF === 'belum' && b.lunas) return false;
        return true;
      }).map(function (b) {
        return {
          tgl: String(b.tgl || '').slice(0, 10),
          stambuk: b.stambuk || '',
          nama: b.nama || '',
          kelas: b.kelas || '-',
          bahasa: bahasaOfBill(b),
          jumlah: (b.logs && b.logs.length) || 1,
          total: Math.round(Number(b.totalDenda) || 0),
          status: b.lunas ? 'Sudah Bayar' : 'Belum Bayar',
          penerima: b.penerima || ''
        };
      });

      // urut kelas tertinggi dulu, lalu nama, lalu tanggal
      rows.sort(function (a, b) {
        var ra = kelasRank(a.kelas), rb = kelasRank(b.kelas);
        if (ra !== rb) return rb - ra;
        var na = String(a.nama).toLowerCase(), nb = String(b.nama).toLowerCase();
        if (na !== nb) return na < nb ? -1 : 1;
        return String(a.tgl).localeCompare(String(b.tgl));
      });

      if (!rows.length) { toast('Tidak ada tagihan untuk filter ini.', 'red'); return; }

      var blob = X.buildPayWorkbook([{ name: 'Rekap Pembayaran', rows: rows }]);
      X.downloadBlob(blob, 'Rekap_Pembayaran_' + dari + '_sd_' + hingga + '.xlsx');
      toast(rows.length + ' tagihan diunduh.', 'green');
    } catch (err) {
      toast('Gagal buat XLSX pembayaran: ' + err.message, 'red');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Unduh XLSX Pembayaran'; }
    }
  }

  function syncAllToggle() {
    var all = el('xlsx-semua');
    var on = all && all.checked;
    ['xlsx-dari', 'xlsx-hingga'].forEach(function (id) {
      var e = el(id);
      if (e) e.disabled = on;
    });
  }

  function init() {
    var t = today();
    ['rekap-tanggal', 'xlsx-dari', 'xlsx-hingga', 'pay-xlsx-dari', 'pay-xlsx-hingga'].forEach(function (id) {
      var e = el(id);
      if (e && !e.value) e.value = t;
    });

    var bind = function (id, ev, fn) {
      var e = el(id);
      if (e) e.addEventListener(ev, fn);
    };

    bind('rekap-btn-tampil', 'click', render);
    bind('rekap-tanggal', 'change', render);
    bind('rekap-search', 'input', render);
    bind('rekap-rayon', 'change', render);
    bind('rekap-bahasa', 'change', render);
    bind('rekap-btn-csv', 'click', function () { downloadCSV(filteredRows()); });
    bind('rekap-btn-xlsx', 'click', xlsxHarian);
    bind('xlsx-btn', 'click', xlsxRange);
    bind('pay-xlsx-btn', 'click', payXlsxRange);
    bind('xlsx-semua', 'change', syncAllToggle);

    syncAllToggle();
    render();
  }

  global.LISRekap = { init: init, render: render, xlsxHarian: xlsxHarian };
})(window);
