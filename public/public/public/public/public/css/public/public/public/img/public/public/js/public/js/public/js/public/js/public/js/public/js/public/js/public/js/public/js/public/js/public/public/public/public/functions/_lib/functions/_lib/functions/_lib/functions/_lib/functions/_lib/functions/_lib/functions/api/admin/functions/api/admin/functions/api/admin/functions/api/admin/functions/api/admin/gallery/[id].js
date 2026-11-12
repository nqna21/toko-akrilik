import { handle, json, HttpError, requireAdmin, readJSON, clean } from '../../../_lib/util.js';
import { delFile } from '../../../_lib/storage.js';

export const onRequestDelete = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const g = await env.DB.prepare('SELECT id, image_key FROM gallery WHERE id = ?').bind(Number(params.id)).first();
  if (!g) throw new HttpError(404, 'Karya tidak ditemukan.');
  await env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(g.id).run();
  await delFile(env, g.image_key);
  return json({ ok: true });
});

// Ubah judul/keterangan atau sembunyikan karya tanpa menghapusnya.
export const onRequestPatch = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const id = Number(params.id);
  const b = await readJSON(request);
  const g = await env.DB.prepare('SELECT * FROM gallery WHERE id = ?').bind(id).first();
  if (!g) throw new HttpError(404, 'Karya tidak ditemukan.');
  await env.DB.prepare('UPDATE gallery SET title = ?, description = ?, material_note = ?, published = ? WHERE id = ?')
    .bind(
      b.title !== undefined ? clean(b.title, 100) || g.title : g.title,
      b.description !== undefined ? clean(b.description, 500) : g.description,
      b.material_note !== undefined ? clean(b.material_note, 160) : g.material_note,
      b.published !== undefined ? (b.published ? 1 : 0) : g.published,
      id
    )
    .run();
  return json({ ok: true });
});
