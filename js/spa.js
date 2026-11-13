/* spa.js — logika SPA v3 (dipisah dari index.html, lalu dipatch untuk cloud + panel 6) */
// ===================== MASTER DATA (diisi dari cloud / cache lokal) =====================
    let MASTER_ANGGOTA = [];
    let LIS_ANGGOTA = [];
    const MASTER_CACHE_KEY = 'lis2627_master_cache';
    const LIS_CACHE_KEY = 'lis2627_lis_cache';

    // ===================== STATE & STORAGE ENGINE =====================
    const STORAGE_KEY = 'lis2627_logs_v3';
    const API_KEY = 'lis2627_api_url';
    const PIN_STORAGE_KEY = 'lis2627_admin_pin';
    const TARIF_STORAGE_KEY = 'lis2627_tarif_v2';
    const ADMIN_SESSION_KEY = 'lis2627_admin_session_unlocked';

    const PAGE_TITLES = {
      dashboard: '01. Dashboard & Analitik',
      input: '02. Input & Piket Lapangan',
      tagihan: '03. Pembayaran & Denda',
      laporan: '04. Laporan & Mahkamah',
      settings: '05. Pengaturan & PIN',
      database: '06. Database Anggota & LIS'
    };

    function safeGetStorage(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    }

    function safeSetStorage(key, val) {
      try { window.localStorage.setItem(key, val); } catch {}
    }

    function safeRemoveStorage(key) {
      try { window.localStorage.removeItem(key); } catch {}
    }

    function getSessionAdminState() {
      try { return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'; } catch { return false; }
    }

    function setSessionAdminState(val) {
      try {
        if (val) window.sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
        else window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
      } catch {}
    }

    function getToday() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    let allLogs = [];
    let apiUrl = safeGetStorage(API_KEY) || '/api';
    let isAdminUnlocked = getSessionAdminState();
    let charts = {};
    let pendingLunasKey = null;
    let pendingLunasHidden = false;
    let pendingConfirmCallback = null;
    const selectedBulkKeys = new Set();

    // ===================== PIN PROTECTION FOR ADMIN SESSION =====================
    function syncAdminLockUI() {
      const inpIndo = document.getElementById('tarif-indonesian');
      const inpJava = document.getElementById('tarif-javanese');
      const badge = document.getElementById('btn-toggle-tarif-lock');
      const hint = document.getElementById('tarif-lock-hint');
      const sideBadge = document.getElementById('sidebar-pin-badge');
      const actionBtn = document.getElementById('btn-admin-unlock-tarif');
      const adminPassInput = document.getElementById('admin-pass');
      const clearSessionBadge = document.getElementById('admin-clear-session-badge');

      if (isAdminUnlocked) {
        inpIndo.removeAttribute('readonly');
        inpJava.removeAttribute('readonly');
        badge.className = 'tag bg-[#00E676] text-black cursor-pointer';
        badge.textContent = 'Unlocked (Sesi Aktif)';
        hint.innerHTML = `<span class="text-[#008A3E] font-extrabold">Sesi Admin aktif hingga web ditutup — seluruh fitur admin terbuka</span>`;
        if (actionBtn) {
          actionBtn.className = 'btn btn-red py-1.5 px-3 text-xs';
          actionBtn.textContent = 'Kunci Sesi Admin';
        }
        if (sideBadge) {
          sideBadge.className = 'text-[10px] font-extrabold uppercase px-2.5 py-0.5 bg-[#00E676] text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] cursor-pointer';
          sideBadge.textContent = 'Unlocked';
        }
        if (adminPassInput) adminPassInput.classList.add('hidden');
        if (clearSessionBadge) clearSessionBadge.classList.remove('hidden');
      } else {
        inpIndo.setAttribute('readonly', true);
        inpJava.setAttribute('readonly', true);
        badge.className = 'tag bg-[#FF4D4D] text-white cursor-pointer';
        badge.textContent = 'Locked PIN';
        hint.innerHTML = `<span>Buka kunci PIN Admin sekali untuk mengakses fitur admin hingga web ditutup</span>`;
        if (actionBtn) {
          actionBtn.className = 'btn btn-yellow py-1.5 px-3 text-xs';
          actionBtn.textContent = 'Buka Kunci Admin';
        }
        if (sideBadge) {
          sideBadge.className = 'text-[10px] font-extrabold uppercase px-2.5 py-0.5 bg-[#FF4D4D] text-white border-2 border-black shadow-[1.5px_1.5px_0px_#000] cursor-pointer';
          sideBadge.textContent = 'Locked';
        }
        if (adminPassInput) adminPassInput.classList.remove('hidden');
        if (clearSessionBadge) clearSessionBadge.classList.add('hidden');
      }
    }

    function unlockAdminSession() {
      isAdminUnlocked = true;
      setSessionAdminState(true);
      syncAdminLockUI();
    }

    function openPinModal() {
      const modal = document.getElementById('pin-modal');
      const inp = document.getElementById('pin-verify-input');
      const err = document.getElementById('pin-error-text');
      inp.value = '';
      err.classList.add('hidden');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => inp.focus(), 80);
    }

    function closePinModal() {
      const modal = document.getElementById('pin-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function verifyAdminPin() {
      const inp = document.getElementById('pin-verify-input');
      const err = document.getElementById('pin-error-text');
      const card = document.getElementById('pin-modal-card');

      if (inp.value.trim() === getAdminPin()) {
        unlockAdminSession();
        closePinModal();
        showToast('Sesi Admin Terbuka! Berlaku hingga web ditutup.', 'green');
      } else {
        err.classList.remove('hidden');
        card.classList.remove('animate-shake');
        void card.offsetWidth;
        card.classList.add('animate-shake');
        inp.value = '';
        inp.focus();
      }
    }

    function lockAdminSession() {
      isAdminUnlocked = false;
      setSessionAdminState(false);
      syncAdminLockUI();
      showToast('Sesi Admin dikunci kembali.', 'yellow');
    }

    // Sumber tunggal PIN Pusat (selalu selaras di seluruh modul & modal)
    function getAdminPin() {
      const saved = safeGetStorage(PIN_STORAGE_KEY);
      return (saved && saved.trim()) ? saved.trim() : '2627';
    }

    function formatRupiah(n) {
      return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    }

    function escapeHtml(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showToast(msg, type = 'yellow') {
      const wrap = document.getElementById('toast');
      const box = document.getElementById('toast-box');
      const colors = {
        yellow: 'bg-[#FFE600] text-black',
        green: 'bg-[#00E676] text-black',
        red: 'bg-[#FF4D4D] text-white'
      };
      box.className = `box toast-anim px-4 py-3 text-xs font-extrabold uppercase ${colors[type] || colors.yellow}`;
      document.getElementById('toast-msg').textContent = msg;
      wrap.classList.remove('hidden');
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => wrap.classList.add('hidden'), 3200);
    }

    function loadSavedTarif() {
      try {
        const saved = JSON.parse(safeGetStorage(TARIF_STORAGE_KEY) || 'null');
        if (saved) {
          document.getElementById('tarif-indonesian').value = saved.Indonesian || 2000;
          document.getElementById('tarif-javanese').value = saved.Javanese || 2000;
        }
      } catch {}
      updateTarifDisplayBadges();
    }

    function updateTarifDisplayBadges() {
      const tarif = getTarif();
      const dispIndo = document.getElementById('tag-display-tarif-indo');
      const dispJava = document.getElementById('tag-display-tarif-java');
      if (dispIndo) dispIndo.textContent = formatRupiah(tarif.Indonesian);
      if (dispJava) dispJava.textContent = formatRupiah(tarif.Javanese);
    }

    function saveTarifToStorage() {
      const tarif = getTarif();
      safeSetStorage(TARIF_STORAGE_KEY, JSON.stringify(tarif));
      updateTarifDisplayBadges();
    }

    /** Key localStorage website lama (Mutajawwiz-Application / v1) */
    const LEGACY_STORAGE_KEYS = ['absensi_logs_local'];

    /** Normalisasi record log lama supaya kompatibel dengan model baru */
    function normalizeLegacyLog(r) {
      const ts = r.timestamp || '';
      const id = r.id || r.id_log || ('LOG-' + (ts || Date.now()));
      let tgl = r.tgl || '';
      let waktu = r.waktu || '';
      if (ts) {
        const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(ts);
        if (m) { tgl = tgl || m[1]; waktu = waktu || m[2]; }
      }
      return {
        id,
        tgl,
        waktu,
        timestamp: ts,
        stambuk: r.stambuk || '',
        nama: r.nama || '',
        label: r.label || r.kelas || '',
        kelas: r.kelas || r.label || '',
        tingkat: r.tingkat || '',
        rayon: r.rayon || '',
        kamar: r.kamar || '',
        bahasa: r.bahasa || 'Indonesian',
        ucapan: r.ucapan || '',
        pengabsen: r.pengabsen || '',
        lunas: !!r.lunas,
        tgl_lunas: r.tgl_lunas || '',
        penerima: r.penerima || '',
      };
    }

    /** Ambil log dari key website lama lalu gabungkan (tanpa hapus apa pun) */
    function migrateLegacyLogs() {
      const existing = new Set(allLogs.map(l => String(l.id || l.id_log || '')));
      let added = 0;
      for (const key of LEGACY_STORAGE_KEYS) {
        let raw = '';
        try { raw = safeGetStorage(key) || ''; } catch { raw = ''; }
        if (!raw) continue;
        let arr = [];
        try { arr = JSON.parse(raw); } catch { arr = []; }
        if (!Array.isArray(arr)) continue;
        for (const r of arr) {
          if (!r || !r.nama) continue;
          const rec = normalizeLegacyLog(r);
          if (existing.has(String(rec.id))) continue;
          existing.add(String(rec.id));
          allLogs.push(rec);
          added++;
        }
      }
      if (added) {
        saveLogs();
        console.info('[migrasi] ' + added + ' log lama dipulihkan dari website lama');
      }
      return added;
    }

    /** Isi rayon & tingkat dari kamar/kelas kalau kosong */
    function enrichLogs() {
      const rayonNames = ['Madinah', 'Ampel (1)', 'Ampel (2)', 'Gunung Jati', 'MTQ', 'RL'];
      let changed = false;
      allLogs.forEach(l => {
        if (!l.rayon && l.kamar) {
          const km = String(l.kamar);
          const hit = rayonNames.find(rn => km.startsWith(rn) || km.includes(rn));
          if (hit) { l.rayon = hit; changed = true; }
        }
        if (!l.tingkat && l.kelas) {
          const m = /^(\d|[IV]+)\b/.exec(String(l.kelas));
          if (m) { l.tingkat = m[1]; changed = true; }
        }
        // fallback: cari rayon dari master berdasar nama
        if (!l.rayon && l.nama) {
          const m = MASTER_ANGGOTA.find(a => a.nama === l.nama);
          if (m && m.rayon) { l.rayon = m.rayon; changed = true; }
        }
      });
      if (changed) saveLogs();
    }

    function loadLogs() {
      try {
        const parsed = JSON.parse(safeGetStorage(STORAGE_KEY) || '[]');
        allLogs = Array.isArray(parsed) ? parsed : [];
      } catch {
        allLogs = [];
      }
      try { migrateLegacyLogs(); } catch (err) { console.warn('[migrasi] gagal:', err.message); }
      try { enrichLogs(); } catch (e) { console.warn('[enrich] gagal:', e.message); }
      // Bersihkan cache duplikat lama (lebih dari 250 = hampir pasti duplikat)
      if (allLogs.length > 250) {
        console.warn('[cleanup] cache lokal', allLogs.length, 'baris → dibuang, cloud jadi sumber tunggal');
        allLogs = [];
        try { safeSetStorage(STORAGE_KEY, '[]'); } catch {}
      }
    }

    function saveLogs() {
      safeSetStorage(STORAGE_KEY, JSON.stringify(allLogs));
    }

    // ===================== CLOUD SYNC =====================
    function cacheMaster(list) {
      try { safeSetStorage(MASTER_CACHE_KEY, JSON.stringify(list)); } catch {}
    }

    function readCachedMaster() {
      try {
        const parsed = JSON.parse(safeGetStorage(MASTER_CACHE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }

    function cacheLis(list) {
      try { safeSetStorage(LIS_CACHE_KEY, JSON.stringify(list)); } catch {}
    }

    function readCachedLis() {
      try {
        const parsed = JSON.parse(safeGetStorage(LIS_CACHE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }

    function normalizeMember(row) {
      const nama = String(row.nama || '').trim();
      const stambuk = String(row.stambuk || '').trim();
      return Object.assign({}, row, {
        nama,
        stambuk,
        label: row.label || (stambuk ? `${stambuk} — ${nama}` : nama),
        kamar: row.kamar || '-',
        kelas: row.kelas || '-',
        rayon: row.rayon || '-',
        tingkat: row.tingkat || '',
        status: row.status || 'Aktif',
      });
    }

    /** Hanya file statis dari repo (CDN) — cepat, tanpa nunggu cloud */
    async function loadMasterDataStatic() {
      try {
        const [sm, sl] = await Promise.allSettled([
          fetch('data/master.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null),
          fetch('data/lis.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null),
        ]);
        if (sm.status === 'fulfilled' && Array.isArray(sm.value) && sm.value.length) {
          MASTER_ANGGOTA = sm.value.map(normalizeMember);
          cacheMaster(MASTER_ANGGOTA);
        }
        if (sl.status === 'fulfilled' && Array.isArray(sl.value)) {
          LIS_ANGGOTA = sl.value.map(normalizeMember);
          cacheLis(LIS_ANGGOTA);
        }
      } catch (e) { console.warn('[static] gagal:', e.message); }
      if (!MASTER_ANGGOTA.length) MASTER_ANGGOTA = readCachedMaster().map(normalizeMember);
      if (!LIS_ANGGOTA.length) LIS_ANGGOTA = readCachedLis().map(normalizeMember);
      try { refreshPengabsenList(); } catch (e) {}
      return true;
    }

    /** Terapkan log dari cloud: gabung dengan cache lokal, dedup by id + konten */
    function applyCloudLogs(cloudData) {
      const cloud = Array.isArray(cloudData) ? cloudData : [];
      if (!cloud.length) return false;
      // Cloud = sumber tunggal. Jangan gabung cache lokal (cache lama bisa berisi duplikat).
      allLogs = cloud.filter(l => l && (l.id_log || l.id));
      try { enrichLogs(); } catch (e) {}
      saveLogs();
      try { refreshPengabsenList(); } catch (e) {}
      try { renderDashboard(); } catch (e) {}
      try { renderTagihan(); } catch (e) {}
      try { renderLaporan(); } catch (e) {}
      try { renderInputLogToday(); } catch (e) {}
      return true;
    }

    /** Muat master anggota + LIS: cloud dulu, fallback cache lokal */
    async function loadMasterData() {
      const api = cloudOn() ? window.LISApi : null;
      let fromCloud = false;

      // 1) Baca file statis dari repo (CDN, instan) — database manual di GitHub
      try {
        const [sm, sl] = await Promise.allSettled([
          fetch('data/master.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null),
          fetch('data/lis.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null),
        ]);
        if (sm.status === 'fulfilled' && Array.isArray(sm.value) && sm.value.length) {
          MASTER_ANGGOTA = sm.value.map(normalizeMember);
          cacheMaster(MASTER_ANGGOTA);
        }
        if (sl.status === 'fulfilled' && Array.isArray(sl.value)) {
          LIS_ANGGOTA = sl.value.map(normalizeMember);
          cacheLis(LIS_ANGGOTA);
        }
      } catch (e) { console.warn('[static] gagal:', e.message); }

      // 2) Cloud menyusul di background (hanya kalau ada perubahan / edit dari panel)
      if (api) {
        const [mRes, lRes] = await Promise.allSettled([api.master(), api.lis()]);
        if (mRes.status === 'fulfilled' && mRes.value && Array.isArray(mRes.value.data) && mRes.value.data.length) {
          MASTER_ANGGOTA = mRes.value.data.map(normalizeMember);
          cacheMaster(MASTER_ANGGOTA);
          fromCloud = true;
        } else if (mRes.status === 'rejected') {
          console.warn('[master] cloud gagal:', mRes.reason && mRes.reason.message);
        }
        if (lRes.status === 'fulfilled' && lRes.value && Array.isArray(lRes.value.data)) {
          LIS_ANGGOTA = lRes.value.data.map(normalizeMember);
          cacheLis(LIS_ANGGOTA);
        } else if (lRes.status === 'rejected') {
          console.warn('[lis] cloud gagal:', lRes.reason && lRes.reason.message);
        }
      }
      if (!MASTER_ANGGOTA.length) MASTER_ANGGOTA = readCachedMaster().map(normalizeMember);
      if (!LIS_ANGGOTA.length) LIS_ANGGOTA = readCachedLis().map(normalizeMember);
      // Petugas absen datang dari daftar LIS
      try { refreshPengabsenList(); } catch (e) { console.warn('[pengabsen]', e.message); }
      return fromCloud;
    }

    /** Muat log absensi dari cloud; gabung dengan cache lokal kalau offline */
    async function loadLogsFromCloud() {
      const api = cloudOn() ? window.LISApi : null;
      if (!api) return false;
      try {
        const res = await api.logs();
        const cloud = Array.isArray(res.data) ? res.data : [];
        const contentKey = (l) => [l.tgl, l.stambuk || l.nama, l.nama, l.bahasa,
          (l.ucapan || 'None').toLowerCase(), l.kamar, l.pengabsen].join('|');
        // Gabung lokal + cloud, dedup berdasarkan id DAN konten
        const merged = [];
        const seenId = new Set();
        const seenContent = new Set();
        // cloud dulu (otoritatif), lalu lokal yang belum ada
        [...cloud, ...(allLogs || [])].forEach(l => {
          if (!l) return;
          const id = l.id_log || l.id;
          const ck = contentKey(l);
          if (id && seenId.has(id)) return;
          if (seenContent.has(ck)) return;
          if (id) seenId.add(id);
          seenContent.add(ck);
          merged.push(l);
        });
        allLogs = merged.filter(l => l && (l.id_log || l.id));
        try { enrichLogs(); } catch (e) { console.warn('[enrich] gagal:', e.message); }
        saveLogs();
        refreshPengabsenList();
        // Backfill DIMATIKAN: bikin duplikat di cloud (server sudah idempotent via content check)
        return true;
      } catch (err) {
        console.warn('[logs] cloud gagal:', err.message);
        return false;
      }
    }

    function cloudOn() {
      return !!(window.LISApi && window.LISApi.enabled());
    }

    function refreshMemberBadges() {
      const total = MASTER_ANGGOTA.length;
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      set('member-count-badge', total);
      set('inp-member-count', total);
      set('set-total-anggota', total);
      set('set-total-lis', LIS_ANGGOTA.length);
    }

    /** Datalist petugas absen: dari nama pengabsen di log lama, bukan dari daftar LIS */
    /**
     * Sumber petugas absen = anggota LIS (Language Improvement Section).
     * Datalist = autofill by keyword (native: mengetik menyaring opsi).
     * Nama dari log lama tetap dimasukkan sebagai pelengkap agar tidak hilang.
     */
    function refreshPengabsenList() {
      const dl = document.getElementById('pengabsen-list');
      if (!dl) return;
      const names = [];
      const seen = new Set();
      const push = (n) => {
        const v = String(n || '').trim().replace(/\s+/g, ' ');
        if (!v) return;
        // Buang nama CAPSLOCK semua (mis. "RAFI", "ALI ZHOFIR") — pakai nama lengkap proper case
        const isAllCaps = v.length > 2 && v === v.toUpperCase() && /[A-Z]/.test(v);
        if (isAllCaps) return;
        const k = v.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        names.push(v);
      };
      (LIS_ANGGOTA || []).forEach(m => push(m.nama));
      (allLogs || []).forEach(l => push(l.pengabsen));
      dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
      const info = document.getElementById('pengabsen-source');
      if (info) info.textContent = (LIS_ANGGOTA || []).length + ' petugas LIS';
    }

    function updateClock() {
      const now = new Date();
      document.getElementById('clock').textContent =
        now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' • ' +
        now.toTimeString().slice(0, 8);
    }

    function setConnectionBadge(mode) {
      const dot = document.getElementById('status-dot');
      const txt = document.getElementById('status-text');
      if (mode === 'cloud') {
        dot.className = 'w-2.5 h-2.5 bg-[#B6EFC8] border border-black';
        txt.className = 'text-[10px] font-extrabold uppercase text-black';
        txt.textContent = 'Cloud On';
      } else {
        dot.className = 'w-2.5 h-2.5 bg-[#FFE8A3] border border-black';
        txt.className = 'text-[10px] font-extrabold uppercase text-black';
        txt.textContent = 'Lokal';
      }
    }

    // ===================== SIDEBAR & NAVIGATION =====================
    function openSidebarMobile() {
      const backdrop = document.getElementById('sidebar-backdrop');
      document.getElementById('sidebar').classList.remove('-translate-x-full');
      backdrop.classList.remove('hidden');
      requestAnimationFrame(() => backdrop.classList.remove('opacity-0'));
    }

    function closeSidebarMobile() {
      const backdrop = document.getElementById('sidebar-backdrop');
      document.getElementById('sidebar').classList.add('-translate-x-full');
      backdrop.classList.add('opacity-0');
      setTimeout(() => backdrop.classList.add('hidden'), 280);
    }

    const TOPBAR_PILL_STYLES = {
      dashboard: 'bg-[#FFE600] text-black',
      input: 'bg-[#00D2FF] text-black',
      tagihan: 'bg-[#00E676] text-black',
      laporan: 'bg-[#FF66B2] text-black',
      settings: 'bg-[#D6C2FF] text-black',
      database: 'bg-[#FFE8A3] text-black'
    };

    function switchPage(pageId) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`page-${pageId}`);
      void target.offsetWidth;
      target.classList.add('active');

      document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.page === pageId);
      });

      const topbarPill = document.getElementById('topbar-pill');
      if (topbarPill && TOPBAR_PILL_STYLES[pageId]) {
        topbarPill.className = `inline-block px-2.5 py-0.5 border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-mono-code text-[10px] font-extrabold uppercase ${TOPBAR_PILL_STYLES[pageId]}`;
      }

      const bc = document.getElementById('topbar-breadcrumb');
      if (bc && PAGE_TITLES[pageId]) bc.textContent = PAGE_TITLES[pageId];

      closeSidebarMobile();

      if (pageId === 'dashboard') renderDashboard();
      if (pageId === 'input') renderInputLogToday();
      if (pageId === 'tagihan') renderTagihan();
      if (pageId === 'laporan') {
        renderLaporan();
        if (window.LISRekap) window.LISRekap.render();
      }
      if (pageId === 'database' && window.LISDb) window.LISDb.render();
      if (history.replaceState) history.replaceState(null, '', '#' + pageId);
    }

    // ===================== CONSOLIDATED BILLS ENGINE =====================
    function getTarif() {
      return {
        Indonesian: Math.max(0, parseInt(document.getElementById('tarif-indonesian')?.value) || 2000),
        Javanese: Math.max(0, parseInt(document.getElementById('tarif-javanese')?.value) || 2000)
      };
    }

    function getConsolidatedTagihan() {
      const tarif = getTarif();
      const map = {};

      allLogs.forEach(log => {
        const key = `${log.tgl}__${log.stambuk || log.nama}`;
        if (!map[key]) {
          map[key] = {
            key,
            stambuk: log.stambuk || '',
            tgl: log.tgl,
            nama: log.nama,
            kelas: log.kelas,
            rayon: log.rayon,
            kamar: log.kamar,
            logs: [],
            indo: 0,
            java: 0,
            totalDenda: 0,
            lunas: true,
            hidden: false,
            tgl_lunas: '',
            penerima: ''
          };
        }

        map[key].logs.push(log);
        if (log.bahasa === 'Javanese') {
          map[key].java++;
          map[key].totalDenda += tarif.Javanese;
        } else {
          map[key].indo++;
          map[key].totalDenda += tarif.Indonesian;
        }

        if (!log.lunas) {
          map[key].lunas = false;
        } else {
          map[key].tgl_lunas = log.tgl_lunas || map[key].tgl_lunas;
          map[key].penerima = log.penerima || map[key].penerima;
        }
        // Hidden: bayar lunas tapi TIDAK masuk hitungan total kas
        if (log.hidden) map[key].hidden = true;
      });

      return Object.values(map).sort((a, b) => b.tgl.localeCompare(a.tgl));
    }

    // ===================== RENDER DASHBOARD =====================
    function renderDashboard() {
      const today = getToday();
      const todayLogs = allLogs.filter(l => l.tgl === today);
      const bills = getConsolidatedTagihan();

      // Hidden tidak dihitung di total kas maupun tunggakan
      const visibleBills = bills.filter(b => !b.hidden);
      const lunasBills = visibleBills.filter(b => b.lunas);
      const tunggakanBills = visibleBills.filter(b => !b.lunas);
      const totalLunas = lunasBills.reduce((s, b) => s + b.totalDenda, 0);
      const totalTunggakan = tunggakanBills.reduce((s, b) => s + b.totalDenda, 0);

      const petugasSet = new Set(allLogs.map(l => l.pengabsen).filter(Boolean));
      const uniqueSantri = new Set(allLogs.map(l => l.nama)).size;

      document.getElementById('dash-total-absen').textContent = allLogs.length;
      document.getElementById('dash-hari-ini-absen').textContent = `Hari ini: ${todayLogs.length} entri`;
      document.getElementById('dash-total-lunas').textContent = formatRupiah(totalLunas);
      document.getElementById('dash-lunas-count').textContent = `${lunasBills.length} tagihan lunas`;
      document.getElementById('dash-total-tunggakan').textContent = formatRupiah(totalTunggakan);
      document.getElementById('dash-tunggakan-count').textContent = `${tunggakanBills.length} tagihan aktif`;
      document.getElementById('dash-petugas').textContent = Math.max(1, petugasSet.size);
      document.getElementById('dash-petugas-desc').textContent = `${uniqueSantri} santri tercatat`;

      // Top 5 Pelanggar
      const countMap = {};
      allLogs.forEach(l => {
        if (!countMap[l.nama]) countMap[l.nama] = { nama: l.nama, kelas: l.kelas, rayon: l.rayon, count: 0 };
        countMap[l.nama].count++;
      });
      const top5 = Object.values(countMap).sort((a, b) => b.count - a.count).slice(0, 5);
      const topEl = document.getElementById('top5-list');
      topEl.innerHTML = top5.length === 0
        ? `<p class="text-xs font-bold text-black/60 py-6 text-center">Belum ada catatan.</p>`
        : top5.map((item, idx) => `
            <div class="py-2.5 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-black text-[#FFE600] font-mono-code font-extrabold text-[10px] flex items-center justify-center shrink-0">${idx + 1}</span>
                  <span class="font-extrabold text-xs text-black truncate">${escapeHtml(item.nama)}</span>
                </div>
                <div class="text-[11px] font-bold text-black/70 pl-7 mt-0.5">${escapeHtml(item.kelas)} • ${escapeHtml(item.rayon)}</div>
              </div>
              <span class="tag ${item.count >= 3 ? 'bg-[#FF4D4D] text-white' : 'bg-[#FFE600] text-black'} shrink-0">${item.count}x</span>
            </div>
          `).join('');

      // Today Log Table
      const todayBody = document.getElementById('dash-log-today');
      todayBody.innerHTML = todayLogs.length === 0
        ? `<tr><td colspan="8" class="text-center text-xs text-black/60 py-6">Belum ada pelanggaran tercatat hari ini (${today}).</td></tr>`
        : todayLogs.slice().reverse().map((l, idx) => {
            const stambukVal = l.stambuk || MASTER_ANGGOTA.find(a => a.nama === l.nama)?.stambuk || '-';
            return `
            <tr>
              <td class="font-mono-code text-xs text-black/60">${todayLogs.length - idx}</td>
              <td class="font-mono-code text-xs text-black">${escapeHtml(l.waktu || '-')}</td>
              <td><span class="font-mono-code text-xs font-extrabold bg-[#FFE600] text-black border border-black px-2 py-0.5">${escapeHtml(stambukVal)}</span></td>
              <td class="font-extrabold text-black">${escapeHtml(l.nama)}</td>
              <td>${escapeHtml(l.kelas)}</td>
              <td>${escapeHtml(l.kamar)}</td>
              <td>
                <span class="tag ${l.bahasa === 'Javanese' ? 'bg-[#FF4D4D] text-white' : 'bg-[#00D2FF] text-black'}">
                  ${escapeHtml(l.bahasa)}
                </span>
              </td>
              <td class="text-xs italic text-black/80">${escapeHtml(l.ucapan || '-')}</td>
            </tr>
          `;
          }).join('');

      renderCharts();
    }

    function chartPalette() {
      const cs = getComputedStyle(document.documentElement);
      const v = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb;
      return {
        ink: v('--chart-ink', '#000000'),
        grid: v('--chart-grid', '#E5E5E5'),
        border: v('--chart-border', '#000000'),
        c: [
          v('--chart-1', '#00D2FF'), v('--chart-2', '#00E676'), v('--chart-3', '#FFE600'),
          v('--chart-4', '#FF66B2'), v('--chart-5', '#B388FF'), v('--chart-6', '#FF9100'),
          v('--chart-7', '#FF4D4D')
        ]
      };
    }

    function renderCharts() {
      const P = chartPalette();
      // 1. Tren 7 Hari
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        days.push(d);
      }
      const trendData = days.map(d => allLogs.filter(l => l.tgl === d).length);

      if (charts.tren) charts.tren.destroy();
      charts.tren = new Chart(document.getElementById('chart-tren'), {
        type: 'bar',
        data: {
          labels: days.map(d => d.slice(5)),
          datasets: [{
            label: 'Jumlah Pelanggaran',
            data: trendData,
            backgroundColor: P.c,
            borderColor: P.border,
            borderWidth: 2.5,
            borderRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: P.ink, font: { weight: '800', size: 11 } } },
            y: { beginAtZero: true, ticks: { stepSize: 1, color: P.ink, font: { weight: '800', size: 11 } }, grid: { color: P.grid } }
          }
        }
      });

      // 2. Distribusi Bahasa
      const indoCount = allLogs.filter(l => l.bahasa === 'Indonesian').length;
      const javaCount = allLogs.filter(l => l.bahasa === 'Javanese').length;

      if (charts.bahasa) charts.bahasa.destroy();
      charts.bahasa = new Chart(document.getElementById('chart-bahasa'), {
        type: 'doughnut',
        data: {
          labels: ['Indonesian (Medium)', 'Javanese (Extreme)'],
          datasets: [{
            data: [indoCount, javaCount],
            backgroundColor: [P.c[0], P.c[6]],
            borderColor: P.border,
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: { legend: { position: 'bottom', labels: { color: P.ink, font: { weight: '800', size: 11 } } } }
        }
      });

      // 3. Statistik Tingkat Kelas 1-4
      const levels = [1, 2, 3, 4];
      const indoPerLvl = levels.map(lvl => allLogs.filter(l => Number(l.tingkat) === lvl && l.bahasa === 'Indonesian').length);
      const javaPerLvl = levels.map(lvl => allLogs.filter(l => Number(l.tingkat) === lvl && l.bahasa === 'Javanese').length);

      if (charts.kelas) charts.kelas.destroy();
      charts.kelas = new Chart(document.getElementById('chart-kelas'), {
        type: 'bar',
        data: {
          labels: ['Tingkat 1', 'Tingkat 2', 'Tingkat 3', 'Tingkat 4'],
          datasets: [
            { label: 'Indonesian', data: indoPerLvl, backgroundColor: P.c[0], borderColor: P.border, borderWidth: 2.5, borderRadius: 0 },
            { label: 'Javanese', data: javaPerLvl, backgroundColor: P.c[6], borderColor: P.border, borderWidth: 2.5, borderRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: P.ink, font: { weight: '800', size: 11 } } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: P.ink, font: { weight: '800', size: 11 } } },
            y: { beginAtZero: true, ticks: { stepSize: 1, color: P.ink, font: { weight: '800', size: 11 } }, grid: { color: P.grid } }
          }
        }
      });
    }

    // ===================== INPUT & PIKET =====================
    function initDatalist() {
      const dl = document.getElementById('inp-datalist');
      dl.innerHTML = MASTER_ANGGOTA.map(a =>
        `<option value="${escapeHtml(a.label)}">${escapeHtml(a.stambuk)} — ${escapeHtml(a.kelas)} (${escapeHtml(a.kamar)})</option>`
      ).join('');
    }

    function findAnggotaByInput(val) {
      const q = (val || '').trim().toLowerCase();
      if (!q) return null;
      return MASTER_ANGGOTA.find(a =>
        a.label.toLowerCase() === q ||
        a.nama.toLowerCase() === q ||
        a.stambuk === q
      ) || MASTER_ANGGOTA.find(a => a.label.toLowerCase().includes(q));
    }

    function syncSelectedMemberPreview() {
      const m = findAnggotaByInput(document.getElementById('inp-search').value);
      document.getElementById('inp-stambuk').value = m ? m.stambuk : '';
      document.getElementById('inp-kelas').value = m ? `${m.kelas} (Tingkat ${m.tingkat})` : '';
      document.getElementById('inp-rayon').value = m ? m.rayon : '';
      document.getElementById('inp-kamar').value = m ? m.kamar : '';
    }

    function updateRadioCardStyles() {
      const isJava = document.querySelector('input[name="inp-bahasa"]:checked')?.value === 'Javanese';
      const optIndo = document.getElementById('opt-indonesian');
      const optJava = document.getElementById('opt-javanese');
      optIndo.className = isJava
        ? 'border-2 border-black bg-white p-3.5 flex items-center gap-3 cursor-pointer transition-all'
        : 'border-2 border-black bg-[#00D2FF] shadow-[1.5px_1.5px_0px_#000] p-3.5 flex items-center gap-3 cursor-pointer transition-all';
      optJava.className = isJava
        ? 'border-2 border-black bg-[#FF66B2] shadow-[1.5px_1.5px_0px_#000] p-3.5 flex items-center gap-3 cursor-pointer transition-all'
        : 'border-2 border-black bg-white p-3.5 flex items-center gap-3 cursor-pointer transition-all';
    }

    async function handleSingleSave() {
      const m = findAnggotaByInput(document.getElementById('inp-search').value);
      if (!m) {
        showToast('Pilih nama anggota yang valid dari daftar!', 'red');
        return;
      }
      const tgl = document.getElementById('inp-tanggal').value || getToday();
      const pengabsen = document.getElementById('inp-pengabsen').value.trim() || '';
      const bahasa = document.querySelector('input[name="inp-bahasa"]:checked')?.value || 'Indonesian';
      const ucapan = document.getElementById('inp-ucapan').value.trim();
      const btn = document.getElementById('btn-simpan');
      const btnLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'MENYIMPAN...'; }

      const rec = {
        id: 'L-' + Date.now(),
        tgl,
        waktu: new Date().toTimeString().slice(0, 5),
        stambuk: m.stambuk,
        nama: m.nama,
        label: m.label,
        kelas: m.kelas,
        tingkat: m.tingkat,
        rayon: m.rayon,
        kamar: m.kamar,
        bahasa,
        ucapan: ucapan || 'None',
        pengabsen,
        lunas: false
      };

      try {
        let saved = rec;
        if (cloudOn()) {
          const res = await window.LISApi.save(rec);
          saved = Object.assign({}, rec, {
            id: res.id_log || rec.id,
            id_log: res.id_log || rec.id,
            tgl: res.tgl || tgl,
            waktu: res.timestamp ? String(res.timestamp).slice(11, 16) : rec.waktu
          });
        }
        allLogs.push(saved);
        saveLogs();
        document.getElementById('inp-search').value = '';
        document.getElementById('inp-ucapan').value = '';
        syncSelectedMemberPreview();
        renderInputLogToday();
        renderDashboard();
        showToast(`Tercatat: ${m.nama} (${bahasa})`, 'green');
      } catch (err) {
        showToast('Gagal menyimpan: ' + err.message, 'red');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
      }
    }

    function renderInputLogToday() {
      const today = document.getElementById('inp-tanggal').value || getToday();
      const list = allLogs.filter(l => l.tgl === today).slice().reverse();
      const container = document.getElementById('inp-log-today');

      container.innerHTML = list.length === 0
        ? `<p class="text-xs font-bold text-black/60 text-center py-6">Belum ada entri pada tanggal ${today}.</p>`
        : list.map(l => {
            const stambukVal = l.stambuk || MASTER_ANGGOTA.find(a => a.nama === l.nama)?.stambuk || '-';
            return `
            <div class="box-flat p-3 bg-[#FFF9C4] shadow-[1.5px_1.5px_0px_#000] flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono-code text-[10px] font-extrabold bg-black text-[#FFE600] px-1.5 py-0.5 shrink-0">${escapeHtml(stambukVal)}</span>
                  <span class="font-extrabold text-xs text-black truncate">${escapeHtml(l.nama)}</span>
                </div>
                <div class="text-[11px] font-bold text-black/75 mt-0.5">${escapeHtml(l.kamar)} • ${escapeHtml(l.waktu)}</div>
              </div>
              <span class="tag ${l.bahasa === 'Javanese' ? 'bg-[#FF4D4D] text-white' : 'bg-[#00D2FF] text-black'} shrink-0">
                ${escapeHtml(l.bahasa)}
              </span>
            </div>
          `;
          }).join('');
    }

    function renderMassList() {
      const rayon = document.getElementById('mass-rayon').value;
      const q = (document.getElementById('mass-search-filter')?.value || '').toLowerCase();
      const list = MASTER_ANGGOTA.filter(a => {
        const matchRayon = !rayon || a.rayon === rayon;
        const matchQ = !q || a.nama.toLowerCase().includes(q) || a.kamar.toLowerCase().includes(q);
        return matchRayon && matchQ;
      });

      const container = document.getElementById('mass-list');
      if (list.length === 0) {
        container.innerHTML = `<p class="text-xs font-bold text-black/60 text-center py-6">Database anggota kosong (0 santri).</p>`;
        return;
      }
      container.innerHTML = list.map(a => `
        <label class="py-2.5 px-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 rounded-lg">
          <div class="flex items-center gap-2.5 min-w-0">
            <input type="checkbox" value="${escapeHtml(a.id)}" class="mass-chk w-4 h-4 accent-sky-600 rounded" />
            <div class="min-w-0">
              <div class="text-xs font-semibold truncate text-slate-800">${escapeHtml(a.nama)}</div>
              <div class="text-[11px] font-medium text-slate-500">${escapeHtml(a.kelas)} • ${escapeHtml(a.kamar)}</div>
            </div>
          </div>
          <span class="font-mono-code text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">${escapeHtml(a.stambuk)}</span>
        </label>
      `).join('');
    }

    async function handleMassSave() {
      const checked = Array.from(document.querySelectorAll('.mass-chk:checked')).map(c => c.value);
      if (checked.length === 0) {
        showToast('Centang minimal satu anggota terlebih dahulu!', 'red');
        return;
      }
      const tgl = document.getElementById('mass-tanggal').value || getToday();
      const bahasa = document.getElementById('mass-bahasa').value;
      const pengabsen = document.getElementById('inp-pengabsen').value.trim() || '';
      const waktu = new Date().toTimeString().slice(0, 5);
      const btn = document.getElementById('btn-mass-simpan');
      const btnLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; }

      let ok = 0;
      const failed = [];
      for (let i = 0; i < checked.length; i++) {
        const m = MASTER_ANGGOTA.find(a => a.id === checked[i]) || MASTER_ANGGOTA.find(a => a.stambuk === checked[i]);
        if (!m) continue;
        if (btn) btn.textContent = `MENYIMPAN ${i + 1}/${checked.length}...`;
        const rec = {
          id: 'L-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          tgl,
          waktu,
          stambuk: m.stambuk,
          nama: m.nama,
          label: m.label,
          kelas: m.kelas,
          tingkat: m.tingkat,
          rayon: m.rayon,
          kamar: m.kamar,
          bahasa,
          ucapan: 'Razia Keliling Kamar',
          pengabsen,
          lunas: false
        };
        try {
          let saved = rec;
          if (cloudOn()) {
            const res = await window.LISApi.save(rec);
            saved = Object.assign({}, rec, {
              id: res.id_log || rec.id,
              id_log: res.id_log || rec.id,
              tgl: res.tgl || tgl,
            });
          }
          allLogs.push(saved);
          ok++;
        } catch (err) {
          failed.push(m.nama + ' (' + err.message + ')');
        }
      }

      saveLogs();
      if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
      document.querySelectorAll('.mass-chk').forEach(c => (c.checked = false));
      renderInputLogToday();
      renderDashboard();
      if (failed.length) {
        showToast(`${ok} tersimpan, ${failed.length} gagal. Cek koneksi cloud.`, 'red');
        console.warn('[mass] gagal:', failed);
      } else {
        showToast(`${ok} anggota berhasil dicatat serentak!`, 'green');
      }
    }

    // ===================== PEMBAYARAN & DENDA =====================
    function renderTagihan() {
      const allBills = getConsolidatedTagihan();
      const visibleBills = allBills.filter(b => !b.hidden);
      const hiddenBills = allBills.filter(b => b.hidden);
      const lunasBills = visibleBills.filter(b => b.lunas);
      const unpaidBills = visibleBills.filter(b => !b.lunas);

      document.getElementById('tag-total-tunggakan').textContent = formatRupiah(unpaidBills.reduce((s, b) => s + b.totalDenda, 0));
      document.getElementById('tag-belum-lunas-count').textContent = `${unpaidBills.length} Tagihan Belum Lunas`;
      document.getElementById('tag-total-lunas').textContent = formatRupiah(lunasBills.reduce((s, b) => s + b.totalDenda, 0));
      document.getElementById('tag-lunas-count').textContent = `${lunasBills.length} Tagihan Selesai`;
      // tampilkan badge hidden count kalau ada
      const hidBadge = document.getElementById('tag-hidden-count');
      if (hidBadge) hidBadge.textContent = hiddenBills.length > 0 ? `${hiddenBills.length} Hidden` : '';

      const q = document.getElementById('tag-search').value.toLowerCase();
      const st = document.getElementById('tag-status-filter').value;
      const ry = document.getElementById('tag-rayon-filter').value;

      const filtered = allBills.filter(b => {
        const matchQ = !q || b.nama.toLowerCase().includes(q) || b.kamar.toLowerCase().includes(q);
        const matchSt = !st
          || (st === 'lunas' && b.lunas && !b.hidden)
          || (st === 'belum' && !b.lunas)
          || (st === 'hidden' && b.hidden);
        const matchRy = !ry || b.rayon === ry;
        return matchQ && matchSt && matchRy;
      });

      const tbody = document.getElementById('tagihan-list');
      const emptyEl = document.getElementById('tagihan-empty');

      if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }

      emptyEl.classList.add('hidden');
      tbody.innerHTML = filtered.map(b => {
        const parts = [];
        if (b.indo > 0) parts.push(`${b.indo}x Indonesian`);
        if (b.java > 0) parts.push(`${b.java}x Javanese`);

        const checked = selectedBulkKeys.has(b.key);
        return `
          <tr class="${b.lunas ? 'row-lunas' : ''} ${b.hidden ? 'row-hidden' : ''}">
            <td class="text-center">
              ${!b.lunas ? `<input type="checkbox" class="bulk-check" data-key="${escapeHtml(b.key)}" ${checked ? 'checked' : ''} onchange="toggleBulkKey('${escapeHtml(b.key)}', this.checked)" />` : ''}
            </td>
            <td class="font-mono-code text-xs text-black whitespace-nowrap">${escapeHtml(b.tgl)}</td>
            <td>
              <div class="font-extrabold text-black">${escapeHtml(b.nama)}</div>
              <div class="text-[11px] font-bold text-black/70">${escapeHtml(b.kelas)} • ${escapeHtml(b.kamar)}</div>
            </td>
            <td>
              <div class="flex flex-wrap items-center gap-1.5">
                ${b.logs.length > 1 ? `<span class="tag bg-[#B388FF] text-black">Gabungan ${b.logs.length}x</span>` : ''}
                <span class="text-xs font-extrabold text-black">${parts.join(' + ')}</span>
              </div>
            </td>
            <td class="font-extrabold text-black whitespace-nowrap">${formatRupiah(b.totalDenda)}</td>
            <td>
              ${b.hidden
                ? `<span class="tag bg-[#9E6BFF] text-black">Hidden</span>
                   <div class="text-[11px] font-bold text-black/75 mt-1">${escapeHtml(b.tgl_lunas)} • ${escapeHtml(b.penerima)}</div>`
                : b.lunas
                ? `<span class="tag bg-[#00E676] text-black">✓ Lunas</span>
                   <div class="text-[11px] font-bold text-black/75 mt-1">${escapeHtml(b.tgl_lunas)} • ${escapeHtml(b.penerima)}</div>`
                : `<span class="tag bg-[#FF4D4D] text-white">Belum Lunas</span>`
              }
            </td>
            <td class="text-right whitespace-nowrap">
              ${b.lunas
                ? `<button onclick="toggleHidden('${escapeHtml(b.key)}')" class="btn ${b.hidden ? 'btn-yellow' : ''} py-1 px-2 text-[10px]" title="Bayar lunas tapi tidak masuk hitung total">${b.hidden ? 'Unhide' : 'Hide'}</button> <button onclick="requestBatalLunas('${escapeHtml(b.key)}')" class="btn py-1 px-2.5 text-[11px]">Batal</button>`
                : `<button onclick="openLunasModal('${escapeHtml(b.key)}')" class="btn btn-green py-1 px-3 text-[11px]">Lunasi</button> <button onclick="openLunasModal('${escapeHtml(b.key)}', true)" class="btn py-1 px-2 text-[10px]" title="Lunasi sebagai hidden">Hide</button>`
              }
            </td>
          </tr>
        `;
      }).join('');
    }

    function toggleBulkKey(key, checked) {
      if (checked) selectedBulkKeys.add(key); else selectedBulkKeys.delete(key);
      updateBulkBar();
    }

    function selectAllBulk(checked) {
      const bills = getConsolidatedTagihan();
      const unpaid = bills.filter(b => !b.lunas && !b.hidden);
      selectedBulkKeys.clear();
      if (checked) unpaid.forEach(b => selectedBulkKeys.add(b.key));
      document.querySelectorAll('.bulk-check').forEach(cb => {
        cb.checked = selectedBulkKeys.has(cb.dataset.key);
      });
      updateBulkBar();
    }

    function updateBulkBar() {
      const bar = document.getElementById('bulk-bar');
      const count = document.getElementById('bulk-count');
      if (!bar) return;
      const n = selectedBulkKeys.size;
      if (count) count.textContent = n;
      if (n > 0) bar.classList.remove('hidden'); else bar.classList.add('hidden');
    }

    async function confirmLunasBulk() {
      if (selectedBulkKeys.size === 0) return;
      if (!isAdminUnlocked) {
        showToast('Buka kunci sesi admin dulu (halaman Pengawasan & PIN).', 'red');
        return;
      }
      const serverPass = (document.getElementById('admin-pass')?.value || '').trim();
      if (cloudOn() && !serverPass) {
        showToast('Isi Password Admin Server di Pengaturan dulu.', 'red');
        return;
      }
      const penerima = document.getElementById('lunas-penerima-input')?.value?.trim() || 'Petugas LIS';
      const today = getToday();
      const bills = getConsolidatedTagihan();
      const items = [];
      const keys = Array.from(selectedBulkKeys);
      keys.forEach(k => {
        const b = bills.find(x => x.key === k);
        if (!b) return;
        const stambuks = Array.from(new Set((b.logs || []).map(l => l.stambuk).filter(Boolean)));
        const targets = stambuks.length ? stambuks : [b.stambuk];
        targets.forEach(stambuk => items.push({ tgl: b.tgl, stambuk, nama: b.nama, hidden: false }));
      });
      if (items.length === 0) return;

      const btn = document.getElementById('btn-bulk-lunas');
      if (btn) { btn.disabled = true; btn.textContent = 'MENYIMPAN...'; }
      try {
        if (cloudOn()) {
          await window.LISApi.payBulk({ items, penerima, tgl_lunas: today, password: serverPass });
        }
        keys.forEach(k => {
          allLogs.forEach(l => {
            if (`${l.tgl}__${l.stambuk || l.nama}` === k) {
              l.lunas = true; l.tgl_lunas = today; l.penerima = penerima; l.hidden = false;
            }
          });
        });
        selectedBulkKeys.clear();
        saveLogs();
        renderTagihan();
        renderDashboard();
        updateBulkBar();
        showToast(`${items.length} tagihan berhasil dilunasi massal.`, 'green');
      } catch (err) {
        const msg = err.status === 401 ? 'Password Admin Server salah.' : 'Gagal lunas masal: ' + err.message;
        showToast(msg, 'red');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'LUNAS MASAL'; }
      }
    }

    async function toggleHidden(key) {
      if (!isAdminUnlocked) {
        showToast('Buka kunci sesi admin dulu.', 'red');
        return;
      }
      const serverPass = (document.getElementById('admin-pass')?.value || '').trim();
      const bills = getConsolidatedTagihan();
      const b = bills.find(x => x.key === key);
      if (!b) return;
      const stambuks = Array.from(new Set((b.logs || []).map(l => l.stambuk).filter(Boolean)));
      const targets = stambuks.length ? stambuks : [b.stambuk];
      try {
        for (const stambuk of targets) {
          if (cloudOn() && serverPass) {
            await window.LISApi.toggleHidden({ tgl: b.tgl, stambuk, nama: b.nama, password: serverPass, penerima: 'Petugas LIS' });
          }
        }
        const newHidden = !b.hidden;
        allLogs.forEach(l => {
          if (`${l.tgl}__${l.stambuk || l.nama}` === key) {
            l.hidden = newHidden;
            if (newHidden) { l.lunas = true; l.tgl_lunas = l.tgl_lunas || getToday(); l.penerima = l.penerima || 'Petugas LIS'; }
          }
        });
        saveLogs();
        renderTagihan();
        renderDashboard();
        showToast(newHidden ? 'Pembayaran disembunyikan dari total.' : 'Pembayaran ditampilkan kembali.', 'yellow');
      } catch (err) {
        showToast('Gagal toggle hidden: ' + err.message, 'red');
      }
    }

    function openLunasModal(key, hidden) {
      const bill = getConsolidatedTagihan().find(b => b.key === key);
      if (!bill) return;
      pendingLunasKey = key;
      pendingLunasHidden = !!hidden;
      // Auto-fill penerima dari pengabsen aktif
      const activePengabsen = document.getElementById('inp-pengabsen')?.value?.trim();
      const penerimaInput = document.getElementById('lunas-penerima-input');
      if (penerimaInput && activePengabsen) penerimaInput.value = activePengabsen;
      document.getElementById('lunas-modal-info').innerHTML = `
        <div>Santri: <b>${escapeHtml(bill.nama)}</b> (${escapeHtml(bill.kamar)})</div>
        <div>Tanggal Pelanggaran: <b>${escapeHtml(bill.tgl)}</b></div>
        <div class="mt-1 text-sm">Nominal Denda: <b>${formatRupiah(bill.totalDenda)}</b></div>
      `;
      const pinWrapper = document.getElementById('lunas-pin-wrapper');
      const unlockedNotice = document.getElementById('lunas-unlocked-notice');
      const pinInput = document.getElementById('lunas-pin-input');
      const pinErr = document.getElementById('lunas-pin-error');
      const confirmBtn = document.getElementById('btn-confirm-lunas');

      if (pinInput) pinInput.value = '';
      if (pinErr) pinErr.classList.add('hidden');

      if (isAdminUnlocked) {
        if (pinWrapper) pinWrapper.classList.add('hidden');
        if (unlockedNotice) unlockedNotice.classList.remove('hidden');
        if (confirmBtn) confirmBtn.textContent = '✓ Konfirmasi Lunasi';
      } else {
        if (pinWrapper) pinWrapper.classList.remove('hidden');
        if (unlockedNotice) unlockedNotice.classList.add('hidden');
        if (confirmBtn) confirmBtn.textContent = 'Verifikasi & Lunasi';
      }

      const modal = document.getElementById('lunas-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (!isAdminUnlocked) {
        setTimeout(() => pinInput?.focus(), 80);
      }
    }

    function closeLunasModal() {
      const modal = document.getElementById('lunas-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      pendingLunasKey = null;
      pendingLunasHidden = false;
    }

    function confirmLunasAction() {
      if (!pendingLunasKey) return;
      const pinInput = document.getElementById('lunas-pin-input');
      const pinErr = document.getElementById('lunas-pin-error');
      const card = document.getElementById('lunas-modal-card');

      if (!isAdminUnlocked) {
        if ((pinInput?.value || '').trim() !== getAdminPin()) {
          if (pinErr) pinErr.classList.remove('hidden');
          if (card) {
            card.classList.remove('animate-shake');
            void card.offsetWidth;
            card.classList.add('animate-shake');
          }
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
          }
          showToast('PIN Pusat salah! Pelunasan ditolak.', 'red');
          return;
        }
        // Otomatis buka sesi admin agar pelunasan berikutnya tidak perlu input PIN lagi
        unlockAdminSession();
      }

      const penerima = document.getElementById('lunas-penerima-input').value.trim() || 'Petugas LIS';
      const today = getToday();
      const bill = getConsolidatedTagihan().find(b => b.key === pendingLunasKey);
      if (!bill) { closeLunasModal(); return; }

      const serverPass = (document.getElementById('admin-pass')?.value || pinInput?.value || '').trim();
      if (cloudOn() && !serverPass) {
        showToast('Isi Password Admin Server di halaman Pengaturan dulu.', 'red');
        return;
      }

      const targets = Array.from(new Set((bill.logs || []).map(l => l.stambuk).filter(Boolean)));
      const confirmBtn = document.getElementById('btn-confirm-lunas');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'MENYIMPAN...'; }

      (async () => {
        try {
          if (cloudOn()) {
            for (const stambuk of (targets.length ? targets : [bill.stambuk])) {
              await window.LISApi.pay({
                tgl: bill.tgl,
                stambuk,
                nama: bill.nama,
                password: serverPass,
                penerima,
                tgl_lunas: today,
              });
            }
          }
          allLogs.forEach(l => {
            if (`${l.tgl}__${l.stambuk || l.nama}` === pendingLunasKey) {
              l.lunas = true;
              l.tgl_lunas = today;
              l.penerima = penerima;
            }
          });
          saveLogs();
          closeLunasModal();
          renderTagihan();
          renderDashboard();
          showToast('Tagihan berhasil ditandai LUNAS.', 'green');
        } catch (err) {
          const msg = err.status === 401 ? 'Password Admin Server salah.' : 'Gagal melunasi: ' + err.message;
          showToast(msg, 'red');
        } finally {
          if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✓ Konfirmasi Lunasi'; }
        }
      })();
    }

    function requestBatalLunas(key) {
      openConfirmModal(
        'Batalkan Status Lunas?',
        'Tagihan ini akan dikembalikan menjadi Belum Lunas (Tunggakan Aktif).',
        async () => {
          const bill = getConsolidatedTagihan().find(b => b.key === key);
          const serverPass = (document.getElementById('admin-pass')?.value || '').trim();
          try {
            if (cloudOn() && bill) {
              if (!serverPass) { showToast('Isi Password Admin Server di Pengaturan dulu.', 'red'); return; }
              const targets = Array.from(new Set((bill.logs || []).map(l => l.stambuk).filter(Boolean)));
              for (const stambuk of (targets.length ? targets : [bill.stambuk])) {
                await window.LISApi.unpay({ tgl: bill.tgl, stambuk, nama: bill.nama, password: serverPass });
              }
            }
            allLogs.forEach(l => {
              if (`${l.tgl}__${l.stambuk || l.nama}` === key) {
                l.lunas = false;
                l.tgl_lunas = '';
                l.penerima = '';
              }
            });
            saveLogs();
            renderTagihan();
            renderDashboard();
            showToast('Status lunas dibatalkan.', 'yellow');
          } catch (err) {
            const msg = err.status === 401 ? 'Password Admin Server salah.' : 'Gagal membatalkan: ' + err.message;
            showToast(msg, 'red');
          }
        }
      );
    }

    // ===================== CUSTOM CONFIRM MODAL =====================
    function openConfirmModal(title, desc, onConfirm) {
      document.getElementById('confirm-modal-title').textContent = title;
      document.getElementById('confirm-modal-desc').textContent = desc;
      pendingConfirmCallback = onConfirm;
      const modal = document.getElementById('confirm-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeConfirmModal() {
      const modal = document.getElementById('confirm-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      pendingConfirmCallback = null;
    }

    // ===================== LAPORAN & SURAT PANGGILAN =====================
    function renderLaporan() {
      const rayons = ['Madinah', 'Ampel (1)', 'Ampel (2)', 'Gunung Jati', 'MTQ', 'RL'];
      const tbody = document.getElementById('lap-rayon-table');

      const rayonOf = (l) => {
        if (l.rayon) return l.rayon;
        const km = String(l.kamar || '');
        return rayons.find(rn => km.startsWith(rn) || km.includes(rn)) || '';
      };
      tbody.innerHTML = rayons.map(r => {
        const subset = allLogs.filter(l => rayonOf(l) === r);
        const indo = subset.filter(l => l.bahasa === 'Indonesian').length;
        const java = subset.filter(l => l.bahasa === 'Javanese').length;
        const unik = new Set(subset.map(l => l.nama)).size;

        const lvlCount = {};
        subset.forEach(l => { lvlCount[l.tingkat] = (lvlCount[l.tingkat] || 0) + 1; });
        const topLvl = Object.entries(lvlCount).sort((a, b) => b[1] - a[1])[0];

        return `
          <tr>
            <td class="font-extrabold">${escapeHtml(r)}</td>
            <td class="font-extrabold">${subset.length}</td>
            <td>${indo}</td>
            <td class="text-[#DC2626] font-extrabold">${java}</td>
            <td>${unik} santri</td>
            <td>${topLvl ? `Tingkat ${topLvl[0]} (${topLvl[1]}x)` : '-'}</td>
          </tr>
        `;
      }).join('');
    }

    function downloadCSV(filename, headers, rows) {
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`File ${filename} berhasil diunduh!`, 'green');
    }

    function exportLogsByFilter(logs, filename) {
      if (logs.length === 0) {
        showToast('Tidak ada data pelanggaran untuk diekspor.', 'red');
        return;
      }
      const headers = ['No', 'Stambuk', 'Name Of Offenders', 'Date', 'Class', 'Room', 'Speaking', 'Group', 'Utterance', 'Officer'];
      const rows = logs.map((l, idx) => [
        idx + 1,
        l.stambuk || MASTER_ANGGOTA.find(a => a.nama === l.nama)?.stambuk || '-',
        l.nama,
        l.tgl,
        l.kelas,
        l.kamar,
        l.bahasa,
        l.bahasa === 'Javanese' ? 'Extreme' : 'Medium',
        l.ucapan || '-',
        l.pengabsen || '-'
      ]);
      downloadCSV(filename, headers, rows);
    }

    function openSuratModal() {
      const countMap = {};
      allLogs.forEach(l => {
        if (!countMap[l.nama]) countMap[l.nama] = { nama: l.nama, kelas: l.kelas, kamar: l.kamar, indo: 0, java: 0, total: 0 };
        countMap[l.nama].total++;
        if (l.bahasa === 'Javanese') countMap[l.nama].java++;
        else countMap[l.nama].indo++;
      });

      const target = Object.values(countMap).sort((a, b) => b.total - a.total)[0];
      const body = document.getElementById('surat-body');

      if (!target) {
        body.innerHTML = `<p>Belum ada data pelanggaran tercatat untuk diterbitkan surat panggilan.</p>`;
      } else {
        body.innerHTML = `
          <p>Kepada Yth. Saudara: <b class="underline">${escapeHtml(target.nama)}</b></p>
          <p>Kelas / Kamar: <b>${escapeHtml(target.kelas)} / ${escapeHtml(target.kamar)}</b></p>
          <p>Catatan Pelanggaran: <b>${target.total} Kali</b> (${target.indo} Indonesian, ${target.java} Javanese)</p>
          <p class="pt-2 border-t-2 border-black">
            Berdasarkan catatan kedisiplinan bahasa <b>LIS 26-27</b>, saudara diwajibkan hadir di Kantor Pusat Language Improvement Section malam ini pukul <b>20.30 WIB</b> untuk mengikuti sidang mahkamah &amp; pembinaan muhadatsah.
          </p>
        `;
      }

      const modal = document.getElementById('surat-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    // ===================== INITIALIZATION =====================
    // ===================== PUBLIC HOOKS (dipakai rekap.js & db.js) =====================
    window.LIS = {
      get logs() { return allLogs; },
      set logs(v) { allLogs = Array.isArray(v) ? v : []; },
      get anggota() { return MASTER_ANGGOTA; },
      set anggota(v) { MASTER_ANGGOTA = Array.isArray(v) ? v.map(normalizeMember) : []; },
      get lis() { return LIS_ANGGOTA; },
      set lis(v) { LIS_ANGGOTA = Array.isArray(v) ? v.map(normalizeMember) : []; },
      saveLogs,
      showToast,
      escapeHtml,
      formatRupiah,
      getToday,
      getTarif,
      getBills: getConsolidatedTagihan,
      renderAll: () => {
        refreshMemberBadges();
        try { refreshPengabsenList(); } catch (e) {}
        initDatalist();
        renderMassList();
        renderDashboard();
        renderInputLogToday();
        renderTagihan();
        renderLaporan();
        if (window.LISRekap) window.LISRekap.render();
      },
      openConfirm: openConfirmModal,
      refreshPengabsen: refreshPengabsenList,
      cloudOn,
      api: () => (cloudOn() ? window.LISApi : null),
      adminPass: () => (document.getElementById('admin-pass')?.value || '').trim(),
    };

    window.addEventListener('DOMContentLoaded', async () => {
      const today = getToday();
      document.getElementById('inp-tanggal').value = today;
      document.getElementById('mass-tanggal').value = today;
      document.getElementById('lap-tgl-harian').value = today;
      document.getElementById('lap-dari').value = today;
      document.getElementById('lap-hingga').value = today;
      const apiInput = document.getElementById('api-url-input');
      if (apiInput) apiInput.value = apiUrl === 'local' ? '' : apiUrl;

      // Popup Informasi Aplikasi (jalan duluan, sebelum apapun)
      (function initPopup() {
        const pop = document.getElementById('info-popup');
        const close = document.getElementById('popup-close');
        const btn = document.getElementById('info-btn');
        const show = () => { if (pop) pop.classList.add('show'); };
        const hide = () => { if (pop) pop.classList.remove('show'); };
        if (close) close.addEventListener('click', hide);
        if (btn) btn.addEventListener('click', () => { if (pop) pop.classList.toggle('show'); });
        const seen = (() => { try { return sessionStorage.getItem('lis2627_info_seen') === '1'; } catch (e) { return false; } })();
        if (!seen) { show(); try { sessionStorage.setItem('lis2627_info_seen', '1'); } catch (e) {} }
      })();

      // 1. cache lokal dulu biar UI langsung terisi
      loadLogs();
      loadSavedTarif();
      syncAdminLockUI();
      refreshMemberBadges();
      updateClock();
      setInterval(updateClock, 1000);
      setConnectionBadge('local');

      // 2. Static CDN + cloud bootstrap PARALEL — UI render dari statik duluan
      try {
        const cloudPromise = (cloudOn() ? window.LISApi.bootstrap().catch(e => { console.warn('[bootstrap] cloud:', e.message); return null; }) : Promise.resolve(null));

        // Static fetch duluan ( cepat )
        await loadMasterDataStatic();
        refreshMemberBadges();
        initDatalist();
        renderMassList();
        renderDashboard();
        setConnectionBadge('local');

        // Cloud menyusul di background
        const cloud = await cloudPromise;
        if (cloud && cloud.ok) {
          if (cloud.master && Array.isArray(cloud.master.data) && cloud.master.data.length) {
            MASTER_ANGGOTA = cloud.master.data.map(normalizeMember);
            cacheMaster(MASTER_ANGGOTA);
          }
          if (cloud.lis && Array.isArray(cloud.lis.data)) {
            LIS_ANGGOTA = cloud.lis.data.map(normalizeMember);
            cacheLis(LIS_ANGGOTA);
          }
          if (cloud.logs && Array.isArray(cloud.logs.data)) {
            applyCloudLogs(cloud.logs.data);
          }
          refreshMemberBadges();
          initDatalist();
          renderMassList();
          renderDashboard();
          refreshPengabsenList();
          setConnectionBadge('cloud');
        }
      } catch (err) {
        console.warn('[bootstrap]', err.message);
        initDatalist();
        renderMassList();
      }

      renderDashboard();
      if (window.LISRekap) window.LISRekap.init();
      if (window.LISDb) window.LISDb.init();

      window.addEventListener('lis-theme-change', () => {
        const dash = document.getElementById('page-dashboard');
        if (dash && dash.classList.contains('active')) renderCharts();
      });

      // Sidebar & Mobile Drawer Navigation
      document.getElementById('btn-open-sidebar').addEventListener('click', openSidebarMobile);
      document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebarMobile);
      document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebarMobile);

      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchPage(btn.dataset.page));
      });

      // Deep-link lewat hash (#laporan, #database, ...)
      function pageFromHash() {
        const h = (window.location.hash || '').replace(/^#\/?/, '');
        if (!h) return null;
        return document.getElementById('page-' + h) ? h : null;
      }
      window.addEventListener('hashchange', () => {
        const p = pageFromHash();
        if (p) switchPage(p);
      });
      const deep = pageFromHash();
      if (deep) switchPage(deep);
      // Quick actions
      document.getElementById('btn-input-absensi').addEventListener('click', () => switchPage('input'));
      document.getElementById('btn-lihat-semua-top').addEventListener('click', () => switchPage('tagihan'));
      document.getElementById('btn-cek-tagihan').addEventListener('click', () => switchPage('tagihan'));

      // Input form events
      document.getElementById('inp-search').addEventListener('input', syncSelectedMemberPreview);
      document.getElementById('inp-tanggal').addEventListener('change', renderInputLogToday);
      document.querySelectorAll('input[name="inp-bahasa"]').forEach(r => r.addEventListener('change', updateRadioCardStyles));
      document.getElementById('btn-simpan').addEventListener('click', handleSingleSave);

      // Input sub-modes
      document.getElementById('btn-mode-satuan').addEventListener('click', () => {
        document.getElementById('mode-satuan').classList.remove('hidden');
        document.getElementById('mode-massal').classList.add('hidden');
        document.getElementById('btn-mode-satuan').className = 'btn btn-yellow py-2 px-3.5 text-xs';
        document.getElementById('btn-mode-massal').className = 'btn py-2 px-3.5 text-xs';
      });
      document.getElementById('btn-mode-massal').addEventListener('click', () => {
        document.getElementById('mode-massal').classList.remove('hidden');
        document.getElementById('mode-satuan').classList.add('hidden');
        document.getElementById('btn-mode-massal').className = 'btn btn-yellow py-2 px-3.5 text-xs';
        document.getElementById('btn-mode-satuan').className = 'btn py-2 px-3.5 text-xs';
      });

      // Mass mode events
      document.getElementById('mass-rayon').addEventListener('change', renderMassList);
      document.getElementById('mass-search-filter').addEventListener('input', renderMassList);
      document.getElementById('btn-mass-load').addEventListener('click', renderMassList);
      document.getElementById('btn-mass-simpan').addEventListener('click', handleMassSave);

      // PIN-protected Tarif Events
      document.getElementById('btn-toggle-tarif-lock').addEventListener('click', () => {
        if (isAdminUnlocked) lockAdminSession();
        else openPinModal();
      });

      ['tarif-indonesian', 'tarif-javanese'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('click', () => {
          if (!isAdminUnlocked) openPinModal();
        });
        el.addEventListener('change', () => {
          if (!isAdminUnlocked) return;
          saveTarifToStorage();
          renderTagihan();
        });
      });

      document.getElementById('btn-simpan-tarif').addEventListener('click', () => {
        if (!isAdminUnlocked) {
          openPinModal();
          return;
        }
        saveTarifToStorage();
        renderTagihan();
        showToast('Tarif denda berhasil disimpan! Sesi Admin tetap aktif.', 'green');
      });

      document.getElementById('btn-verify-pin-submit').addEventListener('click', verifyAdminPin);
      document.getElementById('pin-verify-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyAdminPin();
      });

      // Update PIN in Settings
      document.getElementById('btn-update-pin').addEventListener('click', () => {
        const oldPin = document.getElementById('pin-old-input').value.trim();
        const newPin = document.getElementById('pin-new-input').value.trim();
        if (oldPin !== getAdminPin()) {
          showToast('PIN lama tidak sesuai dengan PIN Pusat!', 'red');
          return;
        }
        if (!/^\d{4,8}$/.test(newPin)) {
          showToast('PIN baru wajib 4–8 digit angka!', 'red');
          return;
        }
        safeSetStorage(PIN_STORAGE_KEY, newPin);
        document.getElementById('pin-old-input').value = '';
        document.getElementById('pin-new-input').value = '';
        showToast('PIN Pusat berhasil diperbarui & diselaraskan!', 'green');
      });

      // Tagihan filter events
      document.getElementById('tag-search').addEventListener('input', renderTagihan);
      document.getElementById('tag-status-filter').addEventListener('change', renderTagihan);
      document.getElementById('tag-rayon-filter').addEventListener('change', renderTagihan);
      document.getElementById('tag-tampilkan').addEventListener('click', () => {
        document.getElementById('tag-search').value = '';
        document.getElementById('tag-status-filter').value = '';
        document.getElementById('tag-rayon-filter').value = '';
        renderTagihan();
      });

      document.getElementById('btn-ekspor-tagihan-csv').addEventListener('click', () => {
        const bills = getConsolidatedTagihan();
        downloadCSV(
          `Keuangan_LIS_26-27_${getToday()}.csv`,
          ['Tanggal', 'Nama', 'Kelas', 'Kamar', 'Indonesian', 'Javanese', 'Total_Denda', 'Status', 'Tgl_Lunas', 'Penerima'],
          bills.map(b => [b.tgl, b.nama, b.kelas, b.kamar, b.indo, b.java, b.totalDenda, b.lunas ? 'LUNAS' : 'BELUM LUNAS', b.tgl_lunas || '-', b.penerima || '-'])
        );
      });

      // Modal confirm buttons
      document.getElementById('btn-confirm-lunas').addEventListener('click', confirmLunasAction);
      document.getElementById('lunas-pin-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmLunasAction();
      });
      document.getElementById('btn-confirm-yes').addEventListener('click', () => {
        if (pendingConfirmCallback) pendingConfirmCallback();
        closeConfirmModal();
      });

      // Laporan & Export buttons
      document.getElementById('btn-ekspor-hari-ini').addEventListener('click', () => {
        const t = getToday();
        exportLogsByFilter(allLogs.filter(l => l.tgl === t), `LIS_26-27_${t}.csv`);
      });

      document.getElementById('btn-unduh-harian').addEventListener('click', () => {
        const t = document.getElementById('lap-tgl-harian').value || getToday();
        exportLogsByFilter(allLogs.filter(l => l.tgl === t), `LIS_26-27_${t}.csv`);
      });

      document.getElementById('btn-unduh-rekap').addEventListener('click', () => {
        const d1 = document.getElementById('lap-dari').value;
        const d2 = document.getElementById('lap-hingga').value;
        const subset = allLogs.filter(l => (!d1 || l.tgl >= d1) && (!d2 || l.tgl <= d2));
        exportLogsByFilter(subset, `Rekap_LIS_${d1}_sd_${d2}.csv`);
      });

      document.getElementById('btn-unduh-statistik').addEventListener('click', () => {
        const rayons = ['Madinah', 'Ampel (1)', 'Ampel (2)', 'Gunung Jati', 'MTQ', 'RL'];
        const rows = rayons.map(r => {
          const s = allLogs.filter(l => l.rayon === r);
          return [r, s.length, s.filter(x => x.bahasa === 'Indonesian').length, s.filter(x => x.bahasa === 'Javanese').length, new Set(s.map(x => x.nama)).size];
        });
        downloadCSV(`Statistik_Rayon_LIS_${getToday()}.csv`, ['Rayon', 'Total', 'Indonesian', 'Javanese', 'Santri_Unik'], rows);
      });

      document.getElementById('btn-pratinjau-surat').addEventListener('click', openSuratModal);
      document.getElementById('close-surat').addEventListener('click', () => {
        document.getElementById('surat-modal').classList.add('hidden');
        document.getElementById('surat-modal').classList.remove('flex');
      });
      document.getElementById('btn-cetak-surat').addEventListener('click', () => window.print());

      // Settings buttons
      document.getElementById('btn-simpan-api').addEventListener('click', () => {
        apiUrl = document.getElementById('api-url-input').value.trim() || '/api';
        safeSetStorage(API_KEY, apiUrl);
        setConnectionBadge(cloudOn() ? 'cloud' : 'local');
        showToast('Konfigurasi API disimpan: ' + apiUrl, 'green');
      });

      document.getElementById('btn-tes-api').addEventListener('click', async () => {
        if (!cloudOn()) {
          showToast('Mode Lokal aktif — tidak ada koneksi cloud.', 'yellow');
          return;
        }
        try {
          const res = await window.LISApi.ping();
          showToast('Cloud OK • server ' + (res.ts || '-'), 'green');
          setConnectionBadge('cloud');
        } catch (err) {
          showToast('Cloud gagal: ' + err.message, 'red');
          setConnectionBadge('local');
        }
      });

      document.getElementById('btn-mode-lokal').addEventListener('click', () => {
        apiUrl = 'local';
        safeSetStorage(API_KEY, 'local');
        document.getElementById('api-url-input').value = '';
        setConnectionBadge('local');
        showToast('Beralih ke Mode Lokal (data hanya di browser ini).', 'yellow');
      });

      document.getElementById('btn-admin-export').addEventListener('click', async () => {
        const pass = document.getElementById('admin-pass').value.trim();
        if (cloudOn() && pass) {
          try {
            const res = await window.LISApi.exportAll(pass);
            exportLogsByFilter(res.data || [], `Backup_Penuh_LIS_26-27_${getToday()}.csv`);
            showToast((res.data || []).length + ' baris cloud diunduh.', 'green');
            return;
          } catch (err) {
            if (err.status === 401) {
              // PIN admin lokal bukan password server — fallback ke export lokal
              exportLogsByFilter(allLogs, `Backup_Penuh_LIS_26-27_${getToday()}.csv`);
              showToast('Password server salah — data lokal diekspor.', 'yellow');
            } else {
              showToast('Gagal export: ' + err.message, 'red');
            }
            return;
          }
        }
        exportLogsByFilter(allLogs, `Backup_Penuh_LIS_26-27_${getToday()}.csv`);
      });

      document.getElementById('btn-admin-clear').addEventListener('click', () => {
        if (!isAdminUnlocked) {
          const pass = document.getElementById('admin-pass').value.trim();
          if (!pass) {
            openPinModal();
            return;
          }
          if (pass !== getAdminPin()) {
            showToast('PIN Pusat salah!', 'red');
            return;
          }
          unlockAdminSession();
        }
        openConfirmModal(
          'Hapus Semua Data Pelanggaran?',
          'Seluruh log absensi dan riwayat denda di browser ini akan dikosongkan permanen.',
          async () => {
            try {
              if (cloudOn()) {
                // Password server BEDA dengan PIN admin lokal.
                const srvPass = window.prompt('Masukkan Password Admin Server (default: LIS26-27) untuk menghapus data cloud:');
                if (srvPass === null) return;
                if (!String(srvPass).trim()) { showToast('Password Admin Server wajib diisi.', 'red'); return; }
                await window.LISApi.clearAll(String(srvPass).trim());
              }
              allLogs = [];
              saveLogs();
              renderDashboard();
              renderTagihan();
              document.getElementById('admin-pass').value = '';
              showToast('Seluruh data berhasil dihapus.', 'red');
            } catch (err) {
              showToast(err.status === 401 ? 'Password Admin Server salah (default LIS26-27).' : 'Gagal hapus: ' + err.message, 'red');
            }
          }
        );
      });

      // Bersihkan cache lokal (tanpa password)
      document.getElementById('btn-clear-cache').addEventListener('click', () => {
        openConfirmModal(
          'Bersihkan Cache Lokal?',
          'Semua cache lokal (log duplikat, tarif lama, sesi) akan dibuang. Halaman akan dimuat ulang.',
          () => {
            try {
              ['lis2627_logs_v3','lis2627_tarif_v2','lis2627_admin_pin','lis2627_api_url','lis2627_info_seen','lis2627_authed'].forEach(k => {
                try { localStorage.removeItem(k); } catch(e){}
                try { sessionStorage.removeItem(k); } catch(e){}
              });
            } catch(e){}
            location.reload();
          }
        );
      });
    });
