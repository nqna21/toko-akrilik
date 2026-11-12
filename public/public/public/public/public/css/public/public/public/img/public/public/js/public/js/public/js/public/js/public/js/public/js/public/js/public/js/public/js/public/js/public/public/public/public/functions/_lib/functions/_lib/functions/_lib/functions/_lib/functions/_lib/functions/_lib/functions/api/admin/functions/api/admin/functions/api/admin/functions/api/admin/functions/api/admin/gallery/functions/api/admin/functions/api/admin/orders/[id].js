import { handle, json, HttpError, requireAdmin, readJSON, clean, nowSec, parseJSONField } from '../../../_lib/util.js';
import { STATUS, STATUS_CODES } from '../../../_lib/status.js';

async function fetchOrder(env, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) throw new HttpError(404, 'Pesanan tidak ditemukan.');
  const [items, events] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(id),
    env.DB.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').bind(id),
  ]);
  return {
    ...o,
    items: items.results.map((i) => ({ ...i, extras: parseJSONField(i.extras, []) })),
    events: events.results.map((e) => ({ ...e, label: STATUS[e.status] || e.status })),
  };
}

export const onRequestGet = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  return json({ ok: true, statuses: STATUS, order: await fetchOrder(env, Number(params.id)) });
});

export const onRequestPatch = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const id = Number(params.id);
  const b = await readJSON(request);
  const cur = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!cur) throw new HttpError(404, 'Pesanan tidak ditemukan.');

  const sets = [];
  const args = [];
  const now = nowSec();
  let newStatus = null;

  if (b.status !== undefined) {
    if (!STATUS_CODES.includes(b.status)) throw new HttpError(400, 'Status tidak dikenal.');
    if (b.status !== cur.status) { newStatus = b.status; sets.push('status = ?'); args.push(b.status); }
  }
  if (b.shipping_fee !== undefined) {
    const fee = Number(b.shipping_fee);
    if (!Number.isInteger(fee) || fee < 0 || fee > 10_000_000) throw new HttpError(400, 'Ongkir harus bilangan bulat 0 sampai 10.000.000.');
    sets.push('shipping_fee = ?', 'total = ?');
    args.push(fee, cur.subtotal + fee);
  }
  if (b.tracking_no !== undefined) { sets.push('tracking_no = ?'); args.push(clean(b.tracking_no, 80) || null); }
  if (b.admin_note !== undefined) { sets.push('admin_note = ?'); args.push(clean(b.admin_note, 500) || null); }
  if (!sets.length) return json({ ok: true, order: await fetchOrder(env, id) });

  sets.push('updated_at = ?');
  args.push(now);
  const stmts = [env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id)];
  if (newStatus) {
    stmts.push(
      env.DB.prepare('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, newStatus, clean(b.event_note, 200) || null, now)
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true, order: await fetchOrder(env, id) });
});
