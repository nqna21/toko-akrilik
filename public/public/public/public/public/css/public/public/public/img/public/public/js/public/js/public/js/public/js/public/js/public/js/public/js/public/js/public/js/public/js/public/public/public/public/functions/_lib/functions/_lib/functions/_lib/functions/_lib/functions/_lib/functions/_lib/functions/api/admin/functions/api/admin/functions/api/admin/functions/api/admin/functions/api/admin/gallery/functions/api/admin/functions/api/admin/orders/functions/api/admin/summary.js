import { handle, json, requireAdmin, nowSec } from '../../_lib/util.js';
import { STATUS } from '../../_lib/status.js';

// Ringkasan untuk halaman admin dan untuk rekap harian Windmill. Zona waktu: WIB (UTC+7).
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const now = nowSec();
  const WIB = 7 * 3600;
  const dayStart = Math.floor((now + WIB) / 86400) * 86400 - WIB;
  const d = new Date((now + WIB) * 1000);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000 - WIB;

  const [byStatus, today, month, unpaid, waiting] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS nilai FROM orders WHERE created_at >= ? AND status != 'dibatalkan'").bind(dayStart),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS nilai FROM orders WHERE created_at >= ? AND status != 'dibatalkan'").bind(monthStart),
    env.DB.prepare("SELECT id, code, customer_name, phone, total, created_at FROM orders WHERE status = 'menunggu_pembayaran' AND created_at < ? ORDER BY created_at LIMIT 20").bind(now - 86400),
    env.DB.prepare("SELECT id, code, customer_name, total, updated_at FROM orders WHERE status = 'menunggu_verifikasi' ORDER BY updated_at LIMIT 20"),
  ]);

  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, 0]));
  for (const r of byStatus.results) counts[r.status] = r.n;

  return json({
    ok: true,
    counts,
    today: today.results[0],
    month: month.results[0],
    unpaid_over_24h: unpaid.results,
    waiting_verification: waiting.results,
    in_production: counts.antrean + counts.print_uv + counts.cutting + counts.qc,
  });
});
