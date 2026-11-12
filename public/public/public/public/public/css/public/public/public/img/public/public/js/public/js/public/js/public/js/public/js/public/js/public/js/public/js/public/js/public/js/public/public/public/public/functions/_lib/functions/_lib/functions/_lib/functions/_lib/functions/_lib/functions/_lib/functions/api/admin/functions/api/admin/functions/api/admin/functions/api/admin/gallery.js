import { handle, json, HttpError, requireAdmin, clean, nowSec } from '../../_lib/util.js';
import { limits, putFile, sniffOk, EXT_MIME, GALLERY_EXT } from '../../_lib/storage.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const rows = await env.DB.prepare('SELECT * FROM gallery ORDER BY id DESC LIMIT 300').all();
  return json({ ok: true, items: rows.results, storage: limits(env) });
});

export const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') throw new HttpError(400, 'Pilih foto dulu.');

  const title = clean(form.get('title'), 100);
  if (title.length < 2) throw new HttpError(400, 'Isi judul karya.');
  const ext = (String(file.name || '').split('.').pop() || '').toLowerCase();
  if (!GALLERY_EXT.includes(ext)) throw new HttpError(400, 'Foto harus berformat jpg, png, atau webp.');
  const lim = limits(env);
  if (file.size > lim.gallery) {
    throw new HttpError(413, `Foto terlalu besar (maks ${(lim.gallery / 1048576).toFixed(1)} MB). Halaman admin mengecilkan foto otomatis; coba unggah ulang.`);
  }
  const bytes = await file.arrayBuffer();
  if (!sniffOk(ext, bytes)) throw new HttpError(400, 'Isi file tidak cocok dengan ekstensinya.');

  const slug = clean(form.get('product_slug'), 80) || null;
  if (slug) {
    const p = await env.DB.prepare('SELECT 1 AS ok FROM products WHERE slug = ?').bind(slug).first();
    if (!p) throw new HttpError(400, 'Produk tertaut tidak ada.');
  }
  const key = `gallery/${crypto.randomUUID()}.${ext}`;
  await putFile(env, key, bytes, EXT_MIME[ext]);
  const r = await env.DB.prepare(
    'INSERT INTO gallery (title, category, description, material_note, product_slug, image_key, published, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
  )
    .bind(title, clean(form.get('category'), 80), clean(form.get('description'), 500), clean(form.get('material_note'), 160), slug, key, nowSec())
    .run();
  return json({ ok: true, id: r.meta && r.meta.last_row_id, key }, 201);
});
