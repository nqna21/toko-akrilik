import { handle, json, HttpError, readJSON, rateLimit, nowSec, clean } from '../_lib/util.js';
import { hasFile } from '../_lib/storage.js';
import { notify } from '../_lib/notify.js';

// Pelanggan menautkan bukti bayar (file sudah diunggah lewat /api/upload kind=proof).
export const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  await rateLimit(env, 'proof', request, 15, 3600);
  const b = await readJSON(request);
  const code = clean(b.code, 20).toUpperCase();
  const p4 = clean(b.p, 4);
  const key = String(b.key || '');

  if (!/^proofs\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key) || !(await hasFile(env, key))) {
    throw new HttpError(400, 'File bukti tidak ditemukan. Unggah ulang.');
  }
  const o = await env.DB.prepare('SELECT id, status, phone, customer_name, total FROM orders WHERE code = ?').bind(code).first();
  if (!o || !o.phone.endsWith(p4) || p4.length !== 4) throw new HttpError(404, 'Pesanan tidak ditemukan. Periksa kode dan 4 digit akhir nomor WhatsApp.');
  if (!['menunggu_pembayaran', 'menunggu_verifikasi'].includes(o.status)) {
    throw new HttpError(409, 'Pesanan ini sudah diproses, bukti bayar tidak bisa diganti.');
  }

  const now = nowSec();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET proof_key = ?, status = 'menunggu_verifikasi', updated_at = ? WHERE id = ?").bind(key, now, o.id),
    env.DB.prepare("INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, 'menunggu_verifikasi', 'Bukti pembayaran diunggah', ?)").bind(o.id, now),
  ]);
  const task = notify(env, 'proof_uploaded', { code, customer: o.customer_name, total: o.total });
  if (waitUntil) waitUntil(task);
  return json({ ok: true, status: 'menunggu_verifikasi' });
});
