const enc = new TextEncoder();

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const err = (status, message, extra = {}) => json({ ok: false, error: message, ...extra }, status);

// Bungkus handler: ubah HttpError jadi respons JSON rapi, error lain jadi 500 tanpa membocorkan detail.
export function handle(fn) {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError) return err(e.status, e.message);
      console.error('Unhandled error:', e && e.stack ? e.stack : e);
      return err(500, 'Terjadi kesalahan di server. Coba lagi sebentar lagi.');
    }
  };
}

export async function readJSON(request, maxBytes = 200_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Data terlalu besar.');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Format data tidak valid.');
  }
}

export function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const nowSec = () => Math.floor(Date.now() / 1000);

// Pembatas laju per IP (IP di-hash, tidak disimpan mentah).
export async function rateLimit(env, name, request, limit, windowSec) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = nowSec();
  const who = (await sha256Hex(ip)).slice(0, 16);
  const k = `${name}:${who}:${Math.floor(now / windowSec)}`;
  const row = await env.DB.prepare(
    'INSERT INTO rl (k, n, ts) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n'
  )
    .bind(k, now)
    .first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rl WHERE ts < ?').bind(now - 172800).run();
  if (row && row.n > limit) throw new HttpError(429, 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.');
}

export async function requireAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token || String(token).length < 12) {
    throw new HttpError(503, 'ADMIN_TOKEN belum diatur di Cloudflare (minimal 12 karakter).');
  }
  const h = request.headers.get('authorization') || '';
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!safeEqual(got, token)) {
    await rateLimit(env, 'adm', request, 20, 600);
    throw new HttpError(401, 'Token admin salah.');
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function genCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return 'AKR-' + [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

// Ubah 08xx / +62 8xx / 8xx menjadi 628xx. Null jika tidak masuk akal.
export function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : null;
}

export const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);

export const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

export function parseJSONField(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
