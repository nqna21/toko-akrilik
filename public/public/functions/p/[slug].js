import { escapeHtml as e } from '../_lib/util.js';
import { loadCatalog } from '../_lib/catalog.js';

// Halaman bagikan untuk produk: memberi pratinjau (judul + gambar) di WhatsApp, Instagram, TikTok, Facebook,
// lalu mengarahkan pengunjung ke konfigurator.
export async function onRequestGet({ params, env, request }) {
  const origin = new URL(request.url).origin;
  let p = null;
  let shop = 'Akrilik Studio';
  try {
    const cat = await loadCatalog(env);
    p = cat.products.find((x) => x.slug === params.slug);
    shop = cat.settings.shop_name || shop;
  } catch { /* tampilkan halaman umum */ }
  if (!p) return Response.redirect(origin + '/katalog.html', 302);

  const target = `/produk.html?slug=${encodeURIComponent(p.slug)}`;
  const img = p.cover ? `${origin}/api/media/${p.cover}` : `${origin}/img/og-default.png`;
  const desc = p.description || `${p.name} dari ${shop}.`;
  return new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${e(p.name)} · ${e(shop)}</title>
<meta name="description" content="${e(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${e(shop)}">
<meta property="og:title" content="${e(p.name)}"><meta property="og:description" content="${e(desc)}">
<meta property="og:image" content="${e(img)}"><meta property="og:url" content="${e(origin + '/p/' + p.slug)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${e(origin + target)}">
<meta http-equiv="refresh" content="0;url=${e(target)}"></head>
<body><a href="${e(target)}">Buka ${e(p.name)}</a><script>location.replace(${JSON.stringify(target)})</script></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }
  );
}
