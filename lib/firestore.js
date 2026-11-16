/**
 * Backend database: Google Cloud Firestore (REST API, tanpa dependency tambahan).
 *
 * Aktif kalau env `DB_DRIVER=firestore` dan `GOOGLE_SA_JSON` berisi isi service
 * account JSON (boleh juga base64). Kalau tidak, api/index.js tetap pakai Vercel
 * Blob seperti sebelumnya — jadi menambah file ini tidak mengubah apa pun.
 *
 * Alasan: Advanced Blob Ops cepat habis karena tiap simpan/hapus = 1 op, dan tiap
 * baca = 1 list + N get. Di Firestore, simpan = 1 dokumen, hapus = 1 dokumen,
 * baca = 1 query berhalaman.
 */
const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/datastore';
const HOST = 'https://firestore.googleapis.com/v1';

let _saCache = null;
let _saTried = false;

function serviceAccount() {
  if (_saTried) return _saCache;
  _saTried = true;
  let raw = process.env.GOOGLE_SA_JSON || process.env.FIREBASE_SA_JSON || '';
  if (!raw) return null;
  raw = String(raw).trim();
  try {
    if (raw.startsWith('{')) _saCache = JSON.parse(raw);
    else _saCache = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (e) {
    console.warn('GOOGLE_SA_JSON tidak bisa dibaca:', e.message);
    _saCache = null;
  }
  return _saCache;
}

/**
 * Di Cloud Run / Compute Engine tidak perlu file kunci: kredensial diambil dari
 * metadata server (Application Default Credentials). Set K_SERVICE otomatis ada
 * di Cloud Run, jadi mode ini aktif sendiri — tidak ada key JSON yang bisa bocor.
 */
function useADC() {
  if (String(process.env.GOOGLE_ADC || '') === '1') return true;
  return !!process.env.K_SERVICE;
}

let _metaProject = '';

async function metadataProject() {
  if (_metaProject) return _metaProject;
  try {
    const res = await fetch('http://metadata.google.internal/computeMetadata/v1/project/project-id', {
      headers: { 'Metadata-Flavor': 'Google' },
    });
    if (res.ok) _metaProject = (await res.text()).trim();
  } catch { /* bukan di Google Cloud */ }
  return _metaProject;
}

function projectId() {
  const sa = serviceAccount();
  return (sa && sa.project_id) || process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || _metaProject || '';
}

function ready() {
  if (useADC()) return true; // project id diambil dari metadata saat request pertama
  const sa = serviceAccount();
  return !!(sa && sa.client_email && sa.private_key && projectId());
}

// ---------- auth ----------
let _tok = { value: '', exp: 0 };

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tok.value && _tok.exp - 60 > now) return _tok.value;
  if (useADC()) {
    const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' },
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error('gagal ambil token metadata: ' + res.status);
    _tok = { value: j.access_token, exp: now + (Number(j.expires_in) || 3600) };
    return _tok.value;
  }
  const sa = serviceAccount();
  if (!sa) throw new Error('service account belum diset');
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  const sig = b64u(signer.sign(sa.private_key));
  const assertion = header + '.' + claim + '.' + sig;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
      '&assertion=' + encodeURIComponent(assertion),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('gagal ambil token Google: ' + (j.error_description || j.error || res.status));
  _tok = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return _tok.value;
}

/** Pastikan project id sudah ada (di Cloud Run diambil dari metadata). */
async function ensureProject() {
  if (projectId()) return projectId();
  if (useADC()) await metadataProject();
  return projectId();
}

// ---------- nilai Firestore <-> JS ----------
function encVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (!isFinite(v)) return { nullValue: null };
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encVal) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  return { stringValue: String(v) };
}

function decVal(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decVal);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}

function encFields(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    if (obj[k] === undefined) return;
    out[k] = encVal(obj[k]);
  });
  return out;
}

function decFields(fields) {
  const out = {};
  Object.keys(fields || {}).forEach((k) => { out[k] = decVal(fields[k]); });
  return out;
}

// ---------- HTTP ----------
async function api(method, path, body) {
  const token = await accessToken();
  const res = await fetch(HOST + path, {
    method,
    headers: Object.assign(
      { Authorization: 'Bearer ' + token },
      body ? { 'Content-Type': 'application/json' } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = (json && (json.error && json.error.message)) || text.slice(0, 200) || res.status;
    throw new Error('firestore ' + res.status + ': ' + msg);
  }
  return json || {};
}

function basePath() {
  return '/projects/' + projectId() + '/databases/(default)/documents';
}

/** ID dokumen Firestore tidak boleh mengandung '/'. */
function docId(id) {
  return String(id == null ? '' : id).replace(/\//g, '_') || ('doc-' + Date.now());
}

function docName(col, id) {
  return 'projects/' + projectId() + '/databases/(default)/documents/' + col + '/' + docId(id);
}

/** Baca semua dokumen satu collection (berhalaman). */
async function listAll(col, pageSize) {
  await ensureProject();
  const out = [];
  let token = '';
  for (let guard = 0; guard < 200; guard++) {
    const q = '?pageSize=' + (pageSize || 300) + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    const j = await api('GET', basePath() + '/' + col + q);
    (j.documents || []).forEach((d) => {
      const id = String(d.name || '').split('/').pop();
      out.push({ id, data: decFields(d.fields || {}) });
    });
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return out;
}

async function getDoc(col, id) {
  await ensureProject();
  try {
    const j = await api('GET', basePath() + '/' + col + '/' + docId(id));
    return j ? decFields(j.fields || {}) : null;
  } catch (e) {
    if (/404/.test(e.message)) return null;
    throw e;
  }
}

/** Tulis banyak dokumen dalam commit berkelompok (maks 400 per commit). */
async function setDocs(col, docs, idOf) {
  await ensureProject();
  const writes = [];
  for (const d of docs || []) {
    const id = typeof idOf === 'function' ? idOf(d) : (d.id || d.id_log);
    if (!id) continue;
    writes.push({ update: { name: docName(col, id), fields: encFields(d) } });
  }
  for (let i = 0; i < writes.length; i += 400) {
    await api('POST', basePath() + ':commit', { writes: writes.slice(i, i + 400) });
  }
  return writes.length;
}

async function deleteDocs(col, ids) {
  await ensureProject();
  const writes = (ids || []).filter(Boolean).map((id) => ({ delete: docName(col, id) }));
  for (let i = 0; i < writes.length; i += 400) {
    await api('POST', basePath() + ':commit', { writes: writes.slice(i, i + 400) });
  }
  return writes.length;
}

/** Ganti seluruh isi collection (dipakai dedupe / hapus semua / migrasi). */
async function replaceAll(col, docs, idOf) {
  const existing = await listAll(col);
  const keep = new Set();
  const idf = typeof idOf === 'function' ? idOf : (d) => d.id || d.id_log;
  (docs || []).forEach((d) => { const id = idf(d); if (id) keep.add(docId(id)); });
  const drop = existing.map((d) => d.id).filter((id) => !keep.has(id));
  if (drop.length) await deleteDocs(col, drop);
  return await setDocs(col, docs, idOf);
}

async function clearCollection(col) {
  const existing = await listAll(col);
  if (existing.length) await deleteDocs(col, existing.map((d) => d.id));
  return existing.length;
}

module.exports = {
  ready, projectId, accessToken, ensureProject, useADC,
  listAll, getDoc, setDocs, deleteDocs, replaceAll, clearCollection,
  docId,
  // untuk uji lokal
  __test: { encVal, decVal, encFields, decFields, b64u },
};
