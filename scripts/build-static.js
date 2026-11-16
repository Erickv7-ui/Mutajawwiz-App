/**
 * Siapkan folder dist/ untuk Firebase Hosting (hanya file yang perlu diakses browser).
 * Jalankan: node scripts/build-static.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const COPY = ['index.html', 'css', 'js', 'data', 'assets', 'favicon.ico'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function copy(src, dst) {
  if (!fs.existsSync(src)) return 0;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(src)) n += copy(path.join(src, f), path.join(dst, f));
    return n;
  }
  fs.copyFileSync(src, dst);
  return 1;
}

let total = 0;
for (const item of COPY) total += copy(path.join(ROOT, item), path.join(OUT, item));
console.log('dist/ siap: ' + total + ' file');
