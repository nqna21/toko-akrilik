import { handle, err, requireAdmin } from '../../_lib/util.js';
import { getFile } from '../../_lib/storage.js';

// Unduh file desain atau bukti bayar. Selalu sebagai lampiran, tidak pernah dirender di situs.
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const u = new URL(request.url);
  const key = u.searchParams.get('key') || '';
  if (!/^(designs|proofs|gallery)\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key)) return err(400, 'Kunci file tidak valid.');
  const f = await getFile(env, key);
  if (!f) return err(404, 'File tidak ditemukan.');
  const name = (u.searchParams.get('name') || key.split('/').pop()).replace(/[^\w.\- ]+/g, '_').slice(0, 100);
  return new Response(f.body, {
    headers: {
      'content-type': f.mime,
      'content-disposition': `attachment; filename="${name}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'no-store',
    },
  });
});
