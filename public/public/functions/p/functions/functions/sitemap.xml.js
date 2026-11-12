import { escapeHtml as e } from './_lib/util.js';

export async function onRequestGet({ env, request }) {
  const origin = new URL(request.url).origin;
  const urls = ['/', '/katalog.html', '/galeri.html', '/cara-order.html', '/faq.html', '/lacak.html'];
  try {
    const p = await env.DB.prepare('SELECT slug FROM products WHERE active = 1 ORDER BY sort').all();
    for (const r of p.results) urls.push(`/p/${r.slug}`);
    const g = await env.DB.prepare('SELECT id FROM gallery WHERE published = 1 ORDER BY id DESC LIMIT 500').all();
    for (const r of g.results) urls.push(`/g/${r.id}`);
  } catch { /* sitemap dasar saja */ }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${e(origin + u)}</loc></url>`)
    .join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
