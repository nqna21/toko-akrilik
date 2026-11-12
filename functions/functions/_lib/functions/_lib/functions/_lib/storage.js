// Penyimpanan file. Jika binding R2 (FILES) dipasang, file masuk ke R2.
// Jika tidak, file kecil disimpan di D1 (tabel files, base64) supaya situs tetap jalan tanpa R2.
import { nowSec } from './util.js';

export const EXT_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  pdf: 'application/pdf', svg: 'image/svg+xml', ai: 'application/postscript',
  eps: 'application/postscript', cdr: 'application/octet-stream', dxf: 'application/octet-stream',
  zip: 'application/zip',
};
export const DESIGN_EXT = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'ai', 'eps', 'cdr', 'dxf', 'zip'];
export const PROOF_EXT = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
export const GALLERY_EXT = ['png', 'jpg', 'jpeg', 'webp'];

const MB = 1024 * 1024;

export function limits(env) {
  return env.FILES
    ? { mode: 'r2', design: 25 * MB, proof: 8 * MB, gallery: 8 * MB }
    : { mode: 'd1', design: Math.floor(1.2 * MB), proof: Math.floor(1.2 * MB), gallery: Math.floor(1.2 * MB) };
}

function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// Cek tanda tangan file supaya ekstensi tidak dipalsukan.
export function sniffOk(ext, buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  const eq = (...a) => a.every((v, i) => b[i] === v);
  switch (ext) {
    case 'png': return eq(0x89, 0x50, 0x4e, 0x47);
    case 'jpg': case 'jpeg': return eq(0xff, 0xd8, 0xff);
    case 'webp': return eq(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case 'pdf': return eq(0x25, 0x50, 0x44, 0x46);
    case 'zip': return eq(0x50, 0x4b);
    default: return true;
  }
}

export async function putFile(env, key, bytes, mime) {
  const size = bytes.byteLength;
  if (env.FILES) {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
    await env.DB.prepare('INSERT INTO files (key, mime, size, data, created_at) VALUES (?, ?, ?, NULL, ?)')
      .bind(key, mime, size, nowSec())
      .run();
  } else {
    await env.DB.prepare('INSERT INTO files (key, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(key, mime, size, toB64(bytes), nowSec())
      .run();
  }
}

export async function hasFile(env, key) {
  const r = await env.DB.prepare('SELECT 1 AS ok FROM files WHERE key = ?').bind(key).first();
  return !!r;
}

export async function getFile(env, key) {
  const meta = await env.DB.prepare('SELECT mime, size, data FROM files WHERE key = ?').bind(key).first();
  if (!meta) return null;
  if (env.FILES && meta.data == null) {
    const obj = await env.FILES.get(key);
    if (!obj) return null;
    return { body: obj.body, mime: meta.mime, size: meta.size };
  }
  if (meta.data == null) return null;
  return { body: fromB64(meta.data), mime: meta.mime, size: meta.size };
}

export async function delFile(env, key) {
  if (env.FILES) {
    try { await env.FILES.delete(key); } catch (e) { console.error('R2 delete gagal', e); }
  }
  await env.DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run();
}
