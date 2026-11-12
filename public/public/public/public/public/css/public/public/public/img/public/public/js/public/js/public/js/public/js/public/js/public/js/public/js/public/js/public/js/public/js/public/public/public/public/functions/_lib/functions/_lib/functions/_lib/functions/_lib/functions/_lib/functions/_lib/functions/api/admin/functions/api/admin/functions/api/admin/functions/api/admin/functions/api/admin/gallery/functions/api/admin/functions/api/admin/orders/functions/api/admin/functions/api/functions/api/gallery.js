import { handle, json, clean } from '../_lib/util.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const u = new URL(request.url);
  const category = clean(u.searchParams.get('category'), 80);
  const slug = clean(u.searchParams.get('product'), 80);
  const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '60', 10) || 60, 1), 120);

  let sql = 'SELECT id, title, category, description, material_note, product_slug, image_key, created_at FROM gallery WHERE published = 1';
  const args = [];
  if (category) { sql += ' AND category = ?'; args.push(category); }
  if (slug) { sql += ' AND product_slug = ?'; args.push(slug); }
  sql += ' ORDER BY id DESC LIMIT ?';
  args.push(limit);

  const rows = await env.DB.prepare(sql).bind(...args).all();
  const cats = await env.DB.prepare('SELECT category, COUNT(*) AS n FROM gallery WHERE published = 1 AND category != \'\' GROUP BY category ORDER BY category').all();
  return json({ ok: true, items: rows.results, categories: cats.results }, 200, { 'cache-control': 'public, max-age=30' });
});
