import { handle, err } from '../../_lib/util.js';
import { getFile } from '../../_lib/storage.js';

// Hanya foto galeri yang publik. File desain dan bukti bayar hanya lewat /api/admin/file.
export const onRequestGet = handle(async ({ params, env }) => {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!/^gallery\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/.test(key)) return err(404, 'Tidak ditemukan.');
  const f = await getFile(env, key);
  if (!f) return err(404, 'Tidak ditemukan.');
  return new Response(f.body, {
    headers: {
      'content-type': f.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
});
