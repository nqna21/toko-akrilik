import { parseJSONField } from './util.js';

// Pengaturan yang boleh tampil ke publik.
export const PUBLIC_SETTINGS = [
  'shop_name', 'tagline', 'wa_number', 'address', 'jam_layanan', 'bank_info',
  'payment_note', 'prod_time_note', 'instagram', 'tiktok', 'maps_url',
];

export async function loadCatalog(env, { all = false } = {}) {
  const act = all ? '' : 'WHERE active = 1';
  const [pr, ma, fi, sh, ex, se, gl] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM products ${act} ORDER BY sort, id`),
    env.DB.prepare(`SELECT * FROM materials ${act} ORDER BY thickness_mm`),
    env.DB.prepare(`SELECT * FROM finishes ${act} ORDER BY sort, code`),
    env.DB.prepare('SELECT * FROM shapes ORDER BY sort, code'),
    env.DB.prepare(`SELECT * FROM extras ${act} ORDER BY sort, code`),
    env.DB.prepare('SELECT key, value FROM settings'),
    env.DB.prepare(
      'SELECT product_slug, image_key FROM gallery WHERE published = 1 AND product_slug IS NOT NULL ORDER BY id DESC'
    ),
  ]);

  const settings = Object.fromEntries(se.results.map((r) => [r.key, r.value]));
  const cover = {};
  for (const g of gl.results) if (!cover[g.product_slug]) cover[g.product_slug] = g.image_key;

  const products = pr.results.map((p) => ({
    ...p,
    thickness_options: parseJSONField(p.thickness_options, []),
    finish_options: parseJSONField(p.finish_options, []),
    shape_options: parseJSONField(p.shape_options, []),
    extra_options: parseJSONField(p.extra_options, []),
    cover: cover[p.slug] || null,
  }));

  const tiers = parseJSONField(settings.discount_tiers, [])
    .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.pct))
    .sort((a, b) => a.min - b.min);

  return {
    products,
    thicknesses: ma.results,
    finishes: fi.results,
    shapes: sh.results,
    extras: ex.results,
    cutPerCm: Number(settings.cut_per_cm) || 0,
    tiers,
    settings,
    demo: settings.prices_confirmed !== '1',
  };
}

export function publicCatalog(cat, storage) {
  const settings = {};
  for (const k of PUBLIC_SETTINGS) settings[k] = cat.settings[k] || '';
  return {
    ok: true,
    products: cat.products,
    thicknesses: cat.thicknesses,
    finishes: cat.finishes,
    shapes: cat.shapes,
    extras: cat.extras,
    cutPerCm: cat.cutPerCm,
    tiers: cat.tiers,
    settings,
    demo: cat.demo,
    storage,
  };
}
