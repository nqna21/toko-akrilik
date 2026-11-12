import { handle, json, requireAdmin, clean } from '../../_lib/util.js';
import { STATUS, STATUS_CODES } from '../../_lib/status.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const u = new URL(request.url);
  const status = clean(u.searchParams.get('status'), 30);
  const q = clean(u.searchParams.get('q'), 60);
  const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '60', 10) || 60, 1), 200);

  const where = [];
  const args = [];
  if (status && STATUS_CODES.includes(status)) { where.push('o.status = ?'); args.push(status); }
  if (status === 'aktif') where.push("o.status NOT IN ('selesai','dibatalkan')");
  if (q) {
    where.push('(o.code LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
               FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY o.id DESC LIMIT ?`;
  const rows = await env.DB.prepare(sql).bind(...args, limit).all();
  return json({
    ok: true,
    statuses: STATUS,
    orders: rows.results.map(({ proof_key, ...o }) => ({ ...o, has_proof: !!proof_key })),
  });
});
