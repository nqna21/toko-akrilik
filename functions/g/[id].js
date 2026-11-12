import { escapeHtml as e } from '../_lib/util.js';

// Halaman bagikan untuk satu karya di galeri (untuk link di bio/caption sosmed).
export async function onRequestGet({ params, env, request }) {
  const origin = new URL(request.url).origin;
  let g = null;
  let shop = 'Akrilik Studio';
  try {
    g = await env.DB.prepare('SELECT * FROM gallery WHERE id = ? AND published = 1').bind(Number(params.id)).first();
    const s = await env.DB.prepare("SELECT value FROM settings WHERE key = 'shop_name'").first();
    if (s) shop = s.value;
  } catch { /* abaikan */ }
  if (!g) return Response.redirect(origin + '/galeri.html', 302);

  const target = `/galeri.html?id=${g.id}`;
  const img = `${origin}/api/media/${g.image_key}`;
  const desc = [g.description, g.material_note].filter(Boolean).join(' · ') || `Hasil karya dari ${shop}.`;
  return new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${e(g.title)} · ${e(shop)}</title>
<meta name="description" content="${e(desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="${e(shop)}">
<meta property="og:title" content="${e(g.title)}"><meta property="og:description" content="${e(desc)}">
<meta property="og:image" content="${e(img)}"><meta property="og:url" content="${e(origin + '/g/' + g.id)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${e(target)}"></head>
<body><a href="${e(target)}">Lihat ${e(g.title)}</a><script>location.replace(${JSON.stringify(target)})</script></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } }
  );
}
