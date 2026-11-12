import {
  handle, json, HttpError, readJSON, rateLimit, normPhone, genCode, clean, nowSec,
} from '../_lib/util.js';
import { loadCatalog } from '../_lib/catalog.js';
import { computePrice } from '../_lib/pricing.js';
import { hasFile } from '../_lib/storage.js';
import { notify } from '../_lib/notify.js';

const DESIGN_KEY = /^designs\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/;

export const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  await rateLimit(env, 'ord', request, 10, 3600);
  const body = await readJSON(request);

  if (body.hp) throw new HttpError(400, 'Permintaan ditolak.'); // kolom jebakan untuk bot

  const c = body.customer || {};
  const name = clean(c.name, 80);
  const phone = normPhone(c.phone);
  const email = clean(c.email, 120);
  const delivery = c.delivery === 'kirim' ? 'kirim' : 'ambil';
  const address = clean(c.address, 300);
  const city = clean(c.city, 80);
  const note = clean(c.note, 500);

  if (name.length < 2) throw new HttpError(400, 'Isi nama lengkap.');
  if (!phone) throw new HttpError(400, 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Format email tidak valid.');
  if (delivery === 'kirim' && address.length < 8) throw new HttpError(400, 'Isi alamat pengiriman lengkap.');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 30) throw new HttpError(400, 'Keranjang kosong atau terlalu banyak item.');

  const cat = await loadCatalog(env);
  const items = [];
  for (const [i, r] of rawItems.entries()) {
    const p = computePrice(cat, r);
    if (!p.ok) throw new HttpError(400, `Item ${i + 1}: ${p.error}`);
    let designKey = null;
    if (r.design_key) {
      if (!DESIGN_KEY.test(String(r.design_key)) || !(await hasFile(env, r.design_key))) {
        throw new HttpError(400, `Item ${i + 1}: file desain tidak ditemukan. Unggah ulang.`);
      }
      designKey = r.design_key;
    }
    items.push({
      p,
      designKey,
      designName: clean(r.design_name, 120),
      note: clean(r.note, 300),
    });
  }

  const subtotal = items.reduce((s, it) => s + it.p.total, 0);
  const now = nowSec();

  let code = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = genCode();
    const stmts = [
      env.DB.prepare(
        `INSERT INTO orders (code, status, customer_name, phone, email, delivery, address, city, note,
          subtotal, shipping_fee, total, created_at, updated_at)
         VALUES (?, 'menunggu_pembayaran', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(candidate, name, phone, email || null, delivery, address || null, city || null, note || null, subtotal, subtotal, now, now),
      ...items.map(({ p, designKey, designName, note: itemNote }) =>
        env.DB.prepare(
          `INSERT INTO order_items (order_id, product_slug, product_name, w, h, thickness, finish, finish_name,
            shape, shape_name, extras, qty, unit_price, discount, setup_fee, line_total, design_key, design_name, note)
           VALUES ((SELECT id FROM orders WHERE code = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          candidate, p.normalized.slug, p.product, p.normalized.w, p.normalized.h, p.normalized.thickness,
          p.normalized.finish, p.names.finish, p.normalized.shape, p.names.shape, JSON.stringify(p.names.extras),
          p.qty, p.unit, p.discount, p.setup, p.total, designKey, designName || null, itemNote || null
        )
      ),
      env.DB.prepare(
        "INSERT INTO order_events (order_id, status, note, created_at) VALUES ((SELECT id FROM orders WHERE code = ?), 'menunggu_pembayaran', 'Pesanan dibuat', ?)"
      ).bind(candidate, now),
    ];
    try {
      await env.DB.batch(stmts);
      code = candidate;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // tabrakan kode: coba kode baru
    }
  }
  if (!code) throw new HttpError(503, 'Gagal membuat nomor pesanan. Coba lagi.');

  const task = notify(env, 'order_created', {
    code,
    customer: name,
    phone,
    total: subtotal,
    delivery,
    items: items.map(({ p, designKey }) => ({
      name: p.product, w: p.normalized.w, h: p.normalized.h, thickness: p.normalized.thickness,
      finish: p.names.finish, qty: p.qty, hasDesign: !!designKey,
    })),
  });
  if (waitUntil) waitUntil(task);

  return json({
    ok: true,
    code,
    total: subtotal,
    delivery,
    track_key: phone.slice(-4),
    items: items.map(({ p }) => ({ name: p.product, qty: p.qty, total: p.total })),
  }, 201);
});
