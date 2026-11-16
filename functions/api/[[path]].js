/**
 * Adapter Cloudflare Pages Functions: /api/* -> api/index.js
 *
 * api/index.js ditulis untuk gaya Node (req,res). Di sini Request/Response
 * Cloudflare dijembatani ke bentuk itu, jadi SATU kode backend dipakai di
 * Vercel, Node biasa (server.js), dan Cloudflare.
 *
 * Binding D1 (`env.DB`) otomatis jadi driver database.
 */

import mod from '../../api/index.js';

const handler = mod && mod.default ? mod.default : mod;

function makeReq(request, text) {
  const u = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const buf = text ? Buffer.from(text, 'utf8') : null;
  return {
    method: request.method,
    url: u.pathname + u.search,
    headers,
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || '' },
    // getRawBody() memakai pola stream Node: on('data') lalu on('end').
    on(ev, cb) {
      if (ev === 'data' && buf && buf.length) queueMicrotask(() => cb(buf));
      if (ev === 'end') queueMicrotask(() => cb());
      return this;
    },
  };
}

function makeRes() {
  const state = { status: 200, headers: {}, body: '' };
  return {
    state,
    setHeader(k, v) { state.headers[String(k).toLowerCase()] = String(v); },
    getHeader(k) { return state.headers[String(k).toLowerCase()]; },
    removeHeader(k) { delete state.headers[String(k).toLowerCase()]; },
    get statusCode() { return state.status; },
    set statusCode(v) { state.status = Number(v) || 200; },
    end(chunk) {
      if (chunk) state.body += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    },
    write(chunk) { if (chunk) state.body += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk); },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (typeof handler.configure === 'function') handler.configure(env);

  let text = '';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try { text = await request.text(); } catch { text = ''; }
  }

  const req = makeReq(request, text);
  const res = makeRes();

  try {
    await handler(req, res);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Adapter: ' + e.message }), {
      status: 500, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  const headers = new Headers();
  Object.keys(res.state.headers).forEach((k) => headers.set(k, res.state.headers[k]));
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(res.state.body || '', { status: res.state.status, headers });
}
