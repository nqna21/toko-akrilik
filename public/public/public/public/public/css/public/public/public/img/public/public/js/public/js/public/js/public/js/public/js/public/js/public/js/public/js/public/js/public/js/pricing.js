// Rumus harga. File ini dipakai di browser (hitung langsung) dan di server (hitung ulang saat pesanan).
// PENTING: functions/_lib/pricing.js harus identik dengan file ini. Cek dengan: node tests/run.mjs

export const roundUp100 = (n) => Math.ceil(n / 100 - 1e-9) * 100;

const toNum = (v) => (typeof v === 'string' && v.trim() === '' ? NaN : Number(v));

export function perimeterCm(shape, w, h) {
  const a = w / 2;
  const b = h / 2;
  const base =
    shape.kind === 'ellipse'
      ? Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
      : 2 * (w + h);
  return base * (shape.factor || 1);
}

export function computePrice(cat, r) {
  const fail = (error, field) => ({ ok: false, error, field });
  const p = cat.products.find((x) => x.slug === r.slug);
  if (!p) return fail('Produk tidak ditemukan.', 'slug');

  const w = toNum(r.w);
  const h = toNum(r.h);
  const t = toNum(r.thickness);
  const qty = Number(r.qty);

  if (!(w >= p.min_w && w <= p.max_w)) return fail(`Lebar harus antara ${p.min_w} dan ${p.max_w} cm.`, 'w');
  if (!(h >= p.min_h && h <= p.max_h)) return fail(`Tinggi harus antara ${p.min_h} dan ${p.max_h} cm.`, 'h');
  if (!Number.isInteger(qty) || qty < 1 || qty > p.max_qty) return fail(`Jumlah harus 1 sampai ${p.max_qty}.`, 'qty');
  if (!p.thickness_options.includes(t)) return fail('Tebal akrilik tidak tersedia untuk produk ini.', 'thickness');

  const mat = cat.thicknesses.find((m) => m.thickness_mm === t);
  if (!mat) return fail('Tebal akrilik sedang tidak tersedia.', 'thickness');
  const fin = cat.finishes.find((f) => f.code === r.finish && p.finish_options.includes(f.code));
  if (!fin) return fail('Finishing tidak tersedia untuk produk ini.', 'finish');
  const shp = cat.shapes.find((s) => s.code === r.shape && p.shape_options.includes(s.code));
  if (!shp) return fail('Bentuk potongan tidak tersedia untuk produk ini.', 'shape');

  const codes = Array.isArray(r.extras) ? [...new Set(r.extras.map(String))] : [];
  const extras = codes.map((c) => cat.extras.find((e) => e.code === c && p.extra_options.includes(c)));
  if (extras.some((e) => !e)) return fail('Ada tambahan yang tidak tersedia.', 'extras');

  const area = w * h;
  const perimeter = perimeterCm(shp, w, h);
  const material = area * mat.price_per_cm2;
  const uv = area * fin.uv_per_cm2;
  const cut = perimeter * cat.cutPerCm;
  const extra = extras.reduce((s, e) => s + e.price, 0);
  const raw = roundUp100(material + uv + cut + extra);
  const unit = Math.max(p.min_price, raw);

  const gross = unit * qty;
  const tier = [...cat.tiers].sort((a, b) => b.min - a.min).find((x) => qty >= x.min);
  const pct = tier ? tier.pct : 0;
  const discount = Math.floor((gross * pct) / 100 / 100) * 100;
  const setup = p.setup_fee;
  const total = gross - discount + setup;

  return {
    ok: true,
    product: p.name,
    area,
    perimeter,
    parts: {
      material: Math.round(material),
      uv: Math.round(uv),
      cut: Math.round(cut),
      extras: extra,
    },
    minApplied: unit > raw,
    unit,
    qty,
    gross,
    discountPct: pct,
    discount,
    setup,
    total,
    estimated: !!shp.estimated,
    names: {
      finish: fin.name,
      shape: shp.name,
      extras: extras.map((e) => e.name),
    },
    normalized: { slug: p.slug, w, h, thickness: t, finish: fin.code, shape: shp.code, extras: extras.map((e) => e.code), qty },
  };
}
