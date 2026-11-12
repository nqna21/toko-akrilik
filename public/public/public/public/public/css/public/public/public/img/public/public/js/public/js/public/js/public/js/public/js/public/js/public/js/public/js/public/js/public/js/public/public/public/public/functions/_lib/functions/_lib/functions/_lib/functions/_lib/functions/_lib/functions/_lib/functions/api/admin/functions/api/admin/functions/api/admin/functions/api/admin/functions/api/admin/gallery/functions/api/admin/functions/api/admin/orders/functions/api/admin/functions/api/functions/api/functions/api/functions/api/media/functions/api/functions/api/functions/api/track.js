import { handle, json, HttpError, rateLimit, clean, parseJSONField } from '../_lib/util.js';
import { STATUS } from '../_lib/status.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await rateLimit(env, 'trk', request, 40, 3600);
  const u = new URL(request.url);
  const code = clean(u.searchParams.get('code'), 20).toUpperCase();
  const p4 = clean(u.searchParams.get('p'), 4);

  const o = await env.DB.prepare('SELECT * FROM orders WHERE code = ?').bind(code).first();
  if (!o || p4.length !== 4 || !o.phone.endsWith(p4)) {
    throw new HttpError(404, 'Pesanan tidak ditemukan. Periksa kode dan 4 digit akhir nomor WhatsApp.');
  }
  const [items, events] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(o.id),
    env.DB.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').bind(o.id),
  ]);

  return json({
    ok: true,
    order: {
      code: o.code,
      status: o.status,
      status_label: STATUS[o.status] || o.status,
      customer: o.customer_name.split(' ')[0],
      delivery: o.delivery,
      subtotal: o.subtotal,
      shipping_fee: o.shipping_fee,
      total: o.total,
      has_proof: !!o.proof_key,
      tracking_no: o.tracking_no || '',
      created_at: o.created_at,
      items: items.results.map((i) => ({
        name: i.product_name, w: i.w, h: i.h, thickness: i.thickness, finish: i.finish_name,
        shape: i.shape_name, extras: parseJSONField(i.extras, []), qty: i.qty, line_total: i.line_total,
        has_design: !!i.design_key,
      })),
      events: events.results.map((e) => ({ status: e.status, label: STATUS[e.status] || e.status, note: e.note || '', at: e.created_at })),
    },
  });
});
