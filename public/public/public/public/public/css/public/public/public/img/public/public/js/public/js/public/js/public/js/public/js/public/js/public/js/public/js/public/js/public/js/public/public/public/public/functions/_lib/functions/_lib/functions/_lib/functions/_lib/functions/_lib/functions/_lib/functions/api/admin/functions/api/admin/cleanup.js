import { handle, json, requireAdmin, nowSec } from '../../_lib/util.js';
import { delFile } from '../../_lib/storage.js';

// Hapus file desain/bukti yang diunggah tapi tidak pernah dipakai pesanan (> 7 hari).
// Dipanggil terjadwal oleh Windmill (windmill/cleanup_files.ts), atau manual dari admin.
export const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const cutoff = nowSec() - 7 * 86400;
  const rows = await env.DB.prepare(
    `SELECT f.key FROM files f
     WHERE f.created_at < ? AND (f.key LIKE 'designs/%' OR f.key LIKE 'proofs/%')
       AND f.key NOT IN (SELECT design_key FROM order_items WHERE design_key IS NOT NULL)
       AND f.key NOT IN (SELECT proof_key FROM orders WHERE proof_key IS NOT NULL)
     LIMIT 200`
  ).bind(cutoff).all();
  for (const r of rows.results) await delFile(env, r.key);
  return json({ ok: true, deleted: rows.results.length });
});
