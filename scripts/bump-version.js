// scripts/bump-version.js — naikkan nomor cache-bust (?v=N) di index.html + SERVER_VERSION
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const idx = path.join(root, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const m = html.match(/\?v=(\d+)/);
if (!m) { console.error('GAGAL: tidak ada ?v=N di index.html'); process.exit(1); }

const next = parseInt(m[1], 10) + 1;
html = html.replace(/\?v=\d+/g, '?v=' + next);
fs.writeFileSync(idx, html);

const api = path.join(root, 'api', 'index.js');
let src = fs.readFileSync(api, 'utf8');
src = src.replace(/SERVER_VERSION = 'v\d+'/, "SERVER_VERSION = 'v" + next + "'");
fs.writeFileSync(api, src);

console.log('versi naik ke v' + next + ' (index.html + api/index.js)');
