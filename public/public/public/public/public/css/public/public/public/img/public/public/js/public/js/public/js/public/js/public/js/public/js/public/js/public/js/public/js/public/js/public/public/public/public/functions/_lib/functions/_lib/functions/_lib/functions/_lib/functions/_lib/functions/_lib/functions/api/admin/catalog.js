import { handle, json, HttpError, requireAdmin, readJSON, clean } from '../../_lib/util.js';
import { loadCatalog } from '../../_lib/catalog.js';

const EDITABLE = [
  'shop_name', 'tagline', 'wa_number', 'address', 'jam_layanan', 'bank_info', 'payment_note',
  'prod_time_note', 'instagram', 'tiktok', 'maps_url', 'cut_per_cm', 'discount_tiers',
];

const money = (v, label, max = 10_000_000) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `${label} harus angka 0 sampai ${max.toLocaleString('id-ID')}.`);
  return n;
};
const flag = (v) => (v ? 1 : 0);

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const cat = await loadCatalog(env, { all: true });
  return json({ ok: true, ...cat });
});

// Simpan harga, produk aktif, dan pengaturan toko sekaligus (satu transaksi).
export const onRequestPut = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const b = await readJSON(request, 400_000);
  const stmts = [];

  for (const m of b.materials || []) {
    stmts.push(
      env.DB.prepare('UPDATE materials SET price_per_cm2 = ?, active = ? WHERE thickness_mm = ?')
        .bind(money(m.price_per_cm2, `Harga bahan ${m.thickness_mm} mm`, 100000), flag(m.active), Number(m.thickness_mm))
    );
  }
  for (const f of b.finishes || []) {
    stmts.push(
      env.DB.prepare('UPDATE finishes SET uv_per_cm2 = ?, active = ? WHERE code = ?')
        .bind(money(f.uv_per_cm2, `Harga ${f.code}`, 100000), flag(f.active), clean(f.code, 40))
    );
  }
  for (const e of b.extras || []) {
    stmts.push(
      env.DB.prepare('UPDATE extras SET price = ?, active = ? WHERE code = ?')
        .bind(Math.round(money(e.price, `Harga ${e.code}`)), flag(e.active), clean(e.code, 40))
    );
  }
  for (const p of b.products || []) {
    stmts.push(
      env.DB.prepare('UPDATE products SET min_price = ?, setup_fee = ?, active = ? WHERE slug = ?')
        .bind(Math.round(money(p.min_price, `Harga minimum ${p.slug}`)), Math.round(money(p.setup_fee, `Biaya setup ${p.slug}`)), flag(p.active), clean(p.slug, 80))
    );
  }

  const s = b.settings || {};
  for (const k of EDITABLE) {
    if (s[k] === undefined) continue;
    let v = clean(s[k], 500);
    if (k === 'cut_per_cm') v = String(money(v, 'Biaya potong per cm', 10000));
    if (k === 'wa_number') {
      v = v.replace(/\D/g, '');
      if (v.startsWith('0')) v = '62' + v.slice(1);
      if (v && !/^62\d{8,13}$/.test(v)) throw new HttpError(400, 'Nomor WhatsApp toko tidak valid. Contoh: 6281234567890.');
    }
    if (k === 'discount_tiers') {
      let t;
      try { t = JSON.parse(v); } catch { throw new HttpError(400, 'Tingkat diskon harus berformat JSON, contoh: [{"min":10,"pct":5}].'); }
      if (!Array.isArray(t) || t.some((x) => !(x.min >= 2 && x.pct >= 0 && x.pct <= 50))) {
        throw new HttpError(400, 'Tiap diskon butuh "min" (≥2) dan "pct" (0–50).');
      }
    }
    stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v));
  }
  if (b.confirm_prices) {
    stmts.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES ('prices_confirmed', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"));
  }
  if (!stmts.length) throw new HttpError(400, 'Tidak ada perubahan.');
  await env.DB.batch(stmts);
  return json({ ok: true, catalog: await loadCatalog(env, { all: true }) });
});
