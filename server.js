/**
 * Server mandiri (bukan Vercel) — satu proses Node yang melayani:
 *   - file statis: index.html, css/, js/, assets/
 *   - API: semua request ke /api/* diteruskan ke api/index.js (handler Node biasa)
 *
 * Dipakai kalau hosting pindah ke Cloud Run / Render / Fly / VPS.
 * Jalankan: node server.js   (PORT dari env, default 3000)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const handler = require('./api/index.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // cleanUrls: /rekap -> /rekap.html kalau ada
  const candidates = [];
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  candidates.push(safe);
  if (!path.extname(safe)) candidates.push(safe + '.html', safe + '/index.html');

  for (const cand of candidates) {
    const full = path.join(ROOT, cand);
    if (!full.startsWith(ROOT)) continue;
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(full).pipe(res);
      return true;
    } catch { /* lanjut kandidat berikutnya */ }
  }
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    // Samakan bentuk request dengan yang diharapkan api/index.js
    return handler(req, res).catch((err) => {
      console.error('API error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      } else res.end();
    });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (serveStatic(req, res, url.pathname)) return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

server.listen(PORT, () => {
  console.log('server jalan di port ' + PORT + ' (driver DB: ' + (process.env.DB_DRIVER || 'blob') + ')');
});
