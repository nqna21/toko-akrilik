// FILE HASIL GABUNGAN. Dibuat otomatis oleh dev/build-worker.mjs dari folder functions/.
// Cloudflare Pages (mode lanjutan): letakkan sebagai public/_worker.js. Folder functions/ lalu diabaikan.
const __M = {};

// ===== _lib/util.js =====
__M["_lib/util"] = (() => {
const enc = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const err = (status, message, extra = {}) => json({ ok: false, error: message, ...extra }, status);

// Bungkus handler: ubah HttpError jadi respons JSON rapi, error lain jadi 500 tanpa membocorkan detail.
function handle(fn) {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError) return err(e.status, e.message);
      console.error('Unhandled error:', e && e.stack ? e.stack : e);
      return err(500, 'Terjadi kesalahan di server. Coba lagi sebentar lagi.');
    }
  };
}

async function readJSON(request, maxBytes = 200_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Data terlalu besar.');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Format data tidak valid.');
  }
}

function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const nowSec = () => Math.floor(Date.now() / 1000);

// Pembatas laju per IP (IP di-hash, tidak disimpan mentah).
async function rateLimit(env, name, request, limit, windowSec) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = nowSec();
  const who = (await sha256Hex(ip)).slice(0, 16);
  const k = `${name}:${who}:${Math.floor(now / windowSec)}`;
  const row = await env.DB.prepare(
    'INSERT INTO rl (k, n, ts) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n'
  )
    .bind(k, now)
    .first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rl WHERE ts < ?').bind(now - 172800).run();
  if (row && row.n > limit) throw new HttpError(429, 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.');
}

async function requireAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token || String(token).length < 12) {
    throw new HttpError(503, 'ADMIN_TOKEN belum diatur di Cloudflare (minimal 12 karakter).');
  }
  const h = request.headers.get('authorization') || '';
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!safeEqual(got, token)) {
    await rateLimit(env, 'adm', request, 20, 600);
    throw new HttpError(401, 'Token admin salah.');
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return 'AKR-' + [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

// Ubah 08xx / +62 8xx / 8xx menjadi 628xx. Null jika tidak masuk akal.
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : null;
}

const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);

const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

function parseJSONField(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
return { HttpError, json, err, handle, readJSON, safeEqual, sha256Hex, nowSec, rateLimit, requireAdmin, genCode, normPhone, clean, rupiah, parseJSONField, escapeHtml };
})();

// ===== _lib/catalog.js =====
__M["_lib/catalog"] = (() => {
const { parseJSONField } = __M["_lib/util"];

// Pengaturan yang boleh tampil ke publik.
const PUBLIC_SETTINGS = [
  'shop_name', 'tagline', 'wa_number', 'address', 'jam_layanan', 'bank_info',
  'payment_note', 'prod_time_note', 'instagram', 'tiktok', 'maps_url',
];

async function loadCatalog(env, { all = false } = {}) {
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

function publicCatalog(cat, storage) {
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
return { PUBLIC_SETTINGS, loadCatalog, publicCatalog };
})();

// ===== _lib/notify.js =====
__M["_lib/notify"] = (() => {
const { rupiah } = __M["_lib/util"];

// Susun teks notifikasi (satu tempat, dipakai Windmill maupun Telegram langsung).
function messageFor(event, d, env) {
  const admin = env.SITE_URL ? `\nAdmin: ${env.SITE_URL.replace(/\/$/, '')}/admin.html` : '';
  if (event === 'order_created') {
    const lines = d.items.map((i) => `• ${i.name} ${i.w}×${i.h} cm, ${i.thickness} mm, ${i.finish} ×${i.qty}${i.hasDesign ? '' : ' (desain belum diunggah)'}`);
    return (
      `Pesanan baru ${d.code}\n` +
      `${d.customer} · wa.me/${d.phone}\n` +
      `${lines.join('\n')}\n` +
      `Total: ${rupiah(d.total)} (${d.delivery === 'kirim' ? 'dikirim, ongkir menyusul' : 'diambil'})` +
      admin
    );
  }
  if (event === 'proof_uploaded') {
    return `Bukti bayar masuk untuk ${d.code}\n${d.customer} · total ${rupiah(d.total)}\nCek dan verifikasi di admin.` + admin;
  }
  return `${event} ${d.code || ''}`.trim();
}

// Kirim ke Windmill (jika dipasang). Jika gagal atau tidak dipasang, kirim langsung ke Telegram.
// Tidak pernah melempar error: pesanan pelanggan tidak boleh gagal karena notifikasi.
async function notify(env, event, data) {
  const text = messageFor(event, data, env);
  let delivered = false;

  if (env.WINDMILL_WEBHOOK_URL) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const headers = { 'content-type': 'application/json' };
      if (env.WINDMILL_TOKEN) headers.authorization = `Bearer ${env.WINDMILL_TOKEN}`;
      const r = await fetch(env.WINDMILL_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event, text, data }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      delivered = r.ok;
    } catch (e) {
      console.error('Windmill tidak terjangkau:', e && e.message);
    }
  }

  if (!delivered && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      });
      delivered = r.ok;
    } catch (e) {
      console.error('Telegram gagal:', e && e.message);
    }
  }
  return delivered;
}
return { messageFor, notify };
})();

// ===== _lib/pricing.js =====
__M["_lib/pricing"] = (() => {
// Salinan dari public/js/pricing.js. Harus identik (dicek oleh tests/run.mjs).

const roundUp100 = (n) => Math.ceil(n / 100 - 1e-9) * 100;

const toNum = (v) => (typeof v === 'string' && v.trim() === '' ? NaN : Number(v));

function perimeterCm(shape, w, h) {
  const a = w / 2;
  const b = h / 2;
  const base =
    shape.kind === 'ellipse'
      ? Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
      : 2 * (w + h);
  return base * (shape.factor || 1);
}

function computePrice(cat, r) {
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
return { roundUp100, perimeterCm, computePrice };
})();

// ===== _lib/status.js =====
__M["_lib/status"] = (() => {
// Urutan status pesanan dan labelnya. Dipakai server dan (disalin ringkas) di public/js/app.js.
const STATUS = {
  menunggu_pembayaran: 'Menunggu pembayaran',
  menunggu_verifikasi: 'Menunggu verifikasi',
  antrean: 'Antre produksi',
  print_uv: 'Cetak UV',
  cutting: 'Potong (cutting)',
  qc: 'Pemeriksaan akhir',
  siap: 'Siap diambil / dikirim',
  dikirim: 'Dalam pengiriman',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

const STATUS_CODES = Object.keys(STATUS);
return { STATUS, STATUS_CODES };
})();

// ===== _lib/storage.js =====
__M["_lib/storage"] = (() => {
// Penyimpanan file. Jika binding R2 (FILES) dipasang, file masuk ke R2.
// Jika tidak, file kecil disimpan di D1 (tabel files, base64) supaya situs tetap jalan tanpa R2.
const { nowSec } = __M["_lib/util"];

const EXT_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  pdf: 'application/pdf', svg: 'image/svg+xml', ai: 'application/postscript',
  eps: 'application/postscript', cdr: 'application/octet-stream', dxf: 'application/octet-stream',
  zip: 'application/zip',
};
const DESIGN_EXT = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'ai', 'eps', 'cdr', 'dxf', 'zip'];
const PROOF_EXT = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
const GALLERY_EXT = ['png', 'jpg', 'jpeg', 'webp'];

const MB = 1024 * 1024;

function limits(env) {
  return env.FILES
    ? { mode: 'r2', design: 25 * MB, proof: 8 * MB, gallery: 8 * MB }
    : { mode: 'd1', design: Math.floor(1.2 * MB), proof: Math.floor(1.2 * MB), gallery: Math.floor(1.2 * MB) };
}

function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// Cek tanda tangan file supaya ekstensi tidak dipalsukan.
function sniffOk(ext, buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  const eq = (...a) => a.every((v, i) => b[i] === v);
  switch (ext) {
    case 'png': return eq(0x89, 0x50, 0x4e, 0x47);
    case 'jpg': case 'jpeg': return eq(0xff, 0xd8, 0xff);
    case 'webp': return eq(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case 'pdf': return eq(0x25, 0x50, 0x44, 0x46);
    case 'zip': return eq(0x50, 0x4b);
    default: return true;
  }
}

async function putFile(env, key, bytes, mime) {
  const size = bytes.byteLength;
  if (env.FILES) {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
    await env.DB.prepare('INSERT INTO files (key, mime, size, data, created_at) VALUES (?, ?, ?, NULL, ?)')
      .bind(key, mime, size, nowSec())
      .run();
  } else {
    await env.DB.prepare('INSERT INTO files (key, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(key, mime, size, toB64(bytes), nowSec())
      .run();
  }
}

async function hasFile(env, key) {
  const r = await env.DB.prepare('SELECT 1 AS ok FROM files WHERE key = ?').bind(key).first();
  return !!r;
}

async function getFile(env, key) {
  const meta = await env.DB.prepare('SELECT mime, size, data FROM files WHERE key = ?').bind(key).first();
  if (!meta) return null;
  if (env.FILES && meta.data == null) {
    const obj = await env.FILES.get(key);
    if (!obj) return null;
    return { body: obj.body, mime: meta.mime, size: meta.size };
  }
  if (meta.data == null) return null;
  return { body: fromB64(meta.data), mime: meta.mime, size: meta.size };
}

async function delFile(env, key) {
  if (env.FILES) {
    try { await env.FILES.delete(key); } catch (e) { console.error('R2 delete gagal', e); }
  }
  await env.DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run();
}
return { EXT_MIME, DESIGN_EXT, PROOF_EXT, GALLERY_EXT, limits, sniffOk, putFile, hasFile, getFile, delFile };
})();

// ===== api/admin/catalog.js =====
__M["api/admin/catalog"] = (() => {
const { handle, json, HttpError, requireAdmin, readJSON, clean } = __M["_lib/util"];
const { loadCatalog } = __M["_lib/catalog"];

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

const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const cat = await loadCatalog(env, { all: true });
  return json({ ok: true, ...cat });
});

// Simpan harga, produk aktif, dan pengaturan toko sekaligus (satu transaksi).
const onRequestPut = handle(async ({ request, env }) => {
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
return { onRequestGet, onRequestPut };
})();

// ===== api/admin/cleanup.js =====
__M["api/admin/cleanup"] = (() => {
const { handle, json, requireAdmin, nowSec } = __M["_lib/util"];
const { delFile } = __M["_lib/storage"];

// Hapus file desain/bukti yang diunggah tapi tidak pernah dipakai pesanan (> 7 hari).
// Dipanggil terjadwal oleh Windmill (windmill/cleanup_files.ts), atau manual dari admin.
const onRequestPost = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const cutoff = nowSec() - 7 * 86400;
  const rows = await env.DB.prepare(
    `SELECT f.key FROM files f
     WHERE f.created_at < ? AND (f.key LIKE 'designs/%' OR f.key LIKE 'proofs/%')
       AND f.key NOT IN (SELECT design_key FROM order_items WHERE design_key IS NOT NULL)
       AND f.key NOT IN (SELECT proof_key FROM orders WHERE proof_key IS NOT NULL)
     LIMIT 200`
  ).bind(cutoff).all();
  for (const r of rows.results) await delFile(env, r.key);
  return json({ ok: true, deleted: rows.results.length });
});
return { onRequestPost };
})();

// ===== api/admin/file.js =====
__M["api/admin/file"] = (() => {
const { handle, err, requireAdmin } = __M["_lib/util"];
const { getFile } = __M["_lib/storage"];

// Unduh file desain atau bukti bayar. Selalu sebagai lampiran, tidak pernah dirender di situs.
const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const u = new URL(request.url);
  const key = u.searchParams.get('key') || '';
  if (!/^(designs|proofs|gallery)\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key)) return err(400, 'Kunci file tidak valid.');
  const f = await getFile(env, key);
  if (!f) return err(404, 'File tidak ditemukan.');
  const name = (u.searchParams.get('name') || key.split('/').pop()).replace(/[^\w.\- ]+/g, '_').slice(0, 100);
  return new Response(f.body, {
    headers: {
      'content-type': f.mime,
      'content-disposition': `attachment; filename="${name}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'no-store',
    },
  });
});
return { onRequestGet };
})();

// ===== api/admin/gallery.js =====
__M["api/admin/gallery"] = (() => {
const { handle, json, HttpError, requireAdmin, clean, nowSec } = __M["_lib/util"];
const { limits, putFile, sniffOk, EXT_MIME, GALLERY_EXT } = __M["_lib/storage"];

const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const rows = await env.DB.prepare('SELECT * FROM gallery ORDER BY id DESC LIMIT 300').all();
  return json({ ok: true, items: rows.results, storage: limits(env) });
});

const onRequestPost = handle(async ({ request, env }) => {
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
return { onRequestGet, onRequestPost };
})();

// ===== api/admin/gallery/[id].js =====
__M["api/admin/gallery/[id]"] = (() => {
const { handle, json, HttpError, requireAdmin, readJSON, clean } = __M["_lib/util"];
const { delFile } = __M["_lib/storage"];

const onRequestDelete = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const g = await env.DB.prepare('SELECT id, image_key FROM gallery WHERE id = ?').bind(Number(params.id)).first();
  if (!g) throw new HttpError(404, 'Karya tidak ditemukan.');
  await env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(g.id).run();
  await delFile(env, g.image_key);
  return json({ ok: true });
});

// Ubah judul/keterangan atau sembunyikan karya tanpa menghapusnya.
const onRequestPatch = handle(async ({ request, env, params }) => {
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
return { onRequestDelete, onRequestPatch };
})();

// ===== api/admin/orders.js =====
__M["api/admin/orders"] = (() => {
const { handle, json, requireAdmin, clean } = __M["_lib/util"];
const { STATUS, STATUS_CODES } = __M["_lib/status"];

const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const u = new URL(request.url);
  const status = clean(u.searchParams.get('status'), 30);
  const q = clean(u.searchParams.get('q'), 60);
  const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '60', 10) || 60, 1), 200);

  const where = [];
  const args = [];
  if (status && STATUS_CODES.includes(status)) { where.push('o.status = ?'); args.push(status); }
  if (status === 'aktif') where.push("o.status NOT IN ('selesai','dibatalkan')");
  if (q) {
    where.push('(o.code LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
               FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY o.id DESC LIMIT ?`;
  const rows = await env.DB.prepare(sql).bind(...args, limit).all();
  return json({
    ok: true,
    statuses: STATUS,
    orders: rows.results.map(({ proof_key, ...o }) => ({ ...o, has_proof: !!proof_key })),
  });
});
return { onRequestGet };
})();

// ===== api/admin/orders/[id].js =====
__M["api/admin/orders/[id]"] = (() => {
const { handle, json, HttpError, requireAdmin, readJSON, clean, nowSec, parseJSONField } = __M["_lib/util"];
const { STATUS, STATUS_CODES } = __M["_lib/status"];

async function fetchOrder(env, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) throw new HttpError(404, 'Pesanan tidak ditemukan.');
  const [items, events] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(id),
    env.DB.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').bind(id),
  ]);
  return {
    ...o,
    items: items.results.map((i) => ({ ...i, extras: parseJSONField(i.extras, []) })),
    events: events.results.map((e) => ({ ...e, label: STATUS[e.status] || e.status })),
  };
}

const onRequestGet = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  return json({ ok: true, statuses: STATUS, order: await fetchOrder(env, Number(params.id)) });
});

const onRequestPatch = handle(async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const id = Number(params.id);
  const b = await readJSON(request);
  const cur = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!cur) throw new HttpError(404, 'Pesanan tidak ditemukan.');

  const sets = [];
  const args = [];
  const now = nowSec();
  let newStatus = null;

  if (b.status !== undefined) {
    if (!STATUS_CODES.includes(b.status)) throw new HttpError(400, 'Status tidak dikenal.');
    if (b.status !== cur.status) { newStatus = b.status; sets.push('status = ?'); args.push(b.status); }
  }
  if (b.shipping_fee !== undefined) {
    const fee = Number(b.shipping_fee);
    if (!Number.isInteger(fee) || fee < 0 || fee > 10_000_000) throw new HttpError(400, 'Ongkir harus bilangan bulat 0 sampai 10.000.000.');
    sets.push('shipping_fee = ?', 'total = ?');
    args.push(fee, cur.subtotal + fee);
  }
  if (b.tracking_no !== undefined) { sets.push('tracking_no = ?'); args.push(clean(b.tracking_no, 80) || null); }
  if (b.admin_note !== undefined) { sets.push('admin_note = ?'); args.push(clean(b.admin_note, 500) || null); }
  if (!sets.length) return json({ ok: true, order: await fetchOrder(env, id) });

  sets.push('updated_at = ?');
  args.push(now);
  const stmts = [env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id)];
  if (newStatus) {
    stmts.push(
      env.DB.prepare('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, newStatus, clean(b.event_note, 200) || null, now)
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true, order: await fetchOrder(env, id) });
});
return { onRequestGet, onRequestPatch };
})();

// ===== api/admin/summary.js =====
__M["api/admin/summary"] = (() => {
const { handle, json, requireAdmin, nowSec } = __M["_lib/util"];
const { STATUS } = __M["_lib/status"];

// Ringkasan untuk halaman admin dan untuk rekap harian Windmill. Zona waktu: WIB (UTC+7).
const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const now = nowSec();
  const WIB = 7 * 3600;
  const dayStart = Math.floor((now + WIB) / 86400) * 86400 - WIB;
  const d = new Date((now + WIB) * 1000);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000 - WIB;

  const [byStatus, today, month, unpaid, waiting] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS nilai FROM orders WHERE created_at >= ? AND status != 'dibatalkan'").bind(dayStart),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS nilai FROM orders WHERE created_at >= ? AND status != 'dibatalkan'").bind(monthStart),
    env.DB.prepare("SELECT id, code, customer_name, phone, total, created_at FROM orders WHERE status = 'menunggu_pembayaran' AND created_at < ? ORDER BY created_at LIMIT 20").bind(now - 86400),
    env.DB.prepare("SELECT id, code, customer_name, total, updated_at FROM orders WHERE status = 'menunggu_verifikasi' ORDER BY updated_at LIMIT 20"),
  ]);

  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, 0]));
  for (const r of byStatus.results) counts[r.status] = r.n;

  return json({
    ok: true,
    counts,
    today: today.results[0],
    month: month.results[0],
    unpaid_over_24h: unpaid.results,
    waiting_verification: waiting.results,
    in_production: counts.antrean + counts.print_uv + counts.cutting + counts.qc,
  });
});
return { onRequestGet };
})();

// ===== api/catalog.js =====
__M["api/catalog"] = (() => {
const { handle, json } = __M["_lib/util"];
const { loadCatalog, publicCatalog } = __M["_lib/catalog"];
const { limits } = __M["_lib/storage"];

const onRequestGet = handle(async ({ env }) => {
  const cat = await loadCatalog(env);
  const lim = limits(env);
  return json(publicCatalog(cat, lim), 200, { 'cache-control': 'public, max-age=30' });
});
return { onRequestGet };
})();

// ===== api/gallery.js =====
__M["api/gallery"] = (() => {
const { handle, json, clean } = __M["_lib/util"];

const onRequestGet = handle(async ({ request, env }) => {
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
return { onRequestGet };
})();

// ===== api/health.js =====
__M["api/health"] = (() => {
const { handle, json } = __M["_lib/util"];

// Buka /api/health setelah deploy untuk memeriksa semua pengaturan Cloudflare.
const onRequestGet = handle(async ({ env }) => {
  const checks = {
    d1_terpasang: !!env.DB,
    tabel_siap: false,
    data_awal_siap: false,
    r2_terpasang: !!env.FILES,
    admin_token_diatur: !!env.ADMIN_TOKEN && String(env.ADMIN_TOKEN).length >= 12,
    telegram_diatur: !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID,
    windmill_diatur: !!env.WINDMILL_WEBHOOK_URL,
    site_url_diatur: !!env.SITE_URL,
  };
  if (env.DB) {
    try {
      const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('orders','products','settings','files','gallery')").first();
      checks.tabel_siap = t && t.n === 5;
      if (checks.tabel_siap) {
        const p = await env.DB.prepare('SELECT COUNT(*) AS n FROM products').first();
        checks.data_awal_siap = p && p.n > 0;
      }
    } catch {
      /* tabel belum dibuat */
    }
  }
  const wajib = ['d1_terpasang', 'tabel_siap', 'data_awal_siap', 'admin_token_diatur'];
  const ok = wajib.every((k) => checks[k]);
  return json({
    ok,
    checks,
    catatan: {
      r2: checks.r2_terpasang ? 'File disimpan di R2.' : 'R2 belum dipasang: file dibatasi ±1,2 MB dan disimpan di D1.',
      notifikasi: checks.telegram_diatur || checks.windmill_diatur ? 'Notifikasi aktif.' : 'Notifikasi belum aktif: pesanan tetap masuk, tapi kamu tidak diberi tahu.',
    },
  }, ok ? 200 : 503);
});
return { onRequestGet };
})();

// ===== api/media/[[path]].js =====
__M["api/media/[[path]]"] = (() => {
const { handle, err } = __M["_lib/util"];
const { getFile } = __M["_lib/storage"];

// Hanya foto galeri yang publik. File desain dan bukti bayar hanya lewat /api/admin/file.
const onRequestGet = handle(async ({ params, env }) => {
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
return { onRequestGet };
})();

// ===== api/orders.js =====
__M["api/orders"] = (() => {
const { handle, json, HttpError, readJSON, rateLimit, normPhone, genCode, clean, nowSec } = __M["_lib/util"];
const { loadCatalog } = __M["_lib/catalog"];
const { computePrice } = __M["_lib/pricing"];
const { hasFile } = __M["_lib/storage"];
const { notify } = __M["_lib/notify"];

const DESIGN_KEY = /^designs\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/;

const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  await rateLimit(env, 'ord', request, 10, 3600);
  const body = await readJSON(request);

  if (body.hp) throw new HttpError(400, 'Permintaan ditolak.'); // kolom jebakan untuk bot

  const c = body.customer || {};
  const name = clean(c.name, 80);
  const phone = normPhone(c.phone);
  const email = clean(c.email, 120);
  const delivery = c.delivery === 'kirim' ? 'kirim' : 'ambil';
  const address = clean(c.address, 300);
  const city = clean(c.city, 80);
  const note = clean(c.note, 500);

  if (name.length < 2) throw new HttpError(400, 'Isi nama lengkap.');
  if (!phone) throw new HttpError(400, 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Format email tidak valid.');
  if (delivery === 'kirim' && address.length < 8) throw new HttpError(400, 'Isi alamat pengiriman lengkap.');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 30) throw new HttpError(400, 'Keranjang kosong atau terlalu banyak item.');

  const cat = await loadCatalog(env);
  const items = [];
  for (const [i, r] of rawItems.entries()) {
    const p = computePrice(cat, r);
    if (!p.ok) throw new HttpError(400, `Item ${i + 1}: ${p.error}`);
    let designKey = null;
    if (r.design_key) {
      if (!DESIGN_KEY.test(String(r.design_key)) || !(await hasFile(env, r.design_key))) {
        throw new HttpError(400, `Item ${i + 1}: file desain tidak ditemukan. Unggah ulang.`);
      }
      designKey = r.design_key;
    }
    items.push({
      p,
      designKey,
      designName: clean(r.design_name, 120),
      note: clean(r.note, 300),
    });
  }

  const subtotal = items.reduce((s, it) => s + it.p.total, 0);
  const now = nowSec();

  let code = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = genCode();
    const stmts = [
      env.DB.prepare(
        `INSERT INTO orders (code, status, customer_name, phone, email, delivery, address, city, note,
          subtotal, shipping_fee, total, created_at, updated_at)
         VALUES (?, 'menunggu_pembayaran', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(candidate, name, phone, email || null, delivery, address || null, city || null, note || null, subtotal, subtotal, now, now),
      ...items.map(({ p, designKey, designName, note: itemNote }) =>
        env.DB.prepare(
          `INSERT INTO order_items (order_id, product_slug, product_name, w, h, thickness, finish, finish_name,
            shape, shape_name, extras, qty, unit_price, discount, setup_fee, line_total, design_key, design_name, note)
           VALUES ((SELECT id FROM orders WHERE code = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          candidate, p.normalized.slug, p.product, p.normalized.w, p.normalized.h, p.normalized.thickness,
          p.normalized.finish, p.names.finish, p.normalized.shape, p.names.shape, JSON.stringify(p.names.extras),
          p.qty, p.unit, p.discount, p.setup, p.total, designKey, designName || null, itemNote || null
        )
      ),
      env.DB.prepare(
        "INSERT INTO order_events (order_id, status, note, created_at) VALUES ((SELECT id FROM orders WHERE code = ?), 'menunggu_pembayaran', 'Pesanan dibuat', ?)"
      ).bind(candidate, now),
    ];
    try {
      await env.DB.batch(stmts);
      code = candidate;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // tabrakan kode: coba kode baru
    }
  }
  if (!code) throw new HttpError(503, 'Gagal membuat nomor pesanan. Coba lagi.');

  const task = notify(env, 'order_created', {
    code,
    customer: name,
    phone,
    total: subtotal,
    delivery,
    items: items.map(({ p, designKey }) => ({
      name: p.product, w: p.normalized.w, h: p.normalized.h, thickness: p.normalized.thickness,
      finish: p.names.finish, qty: p.qty, hasDesign: !!designKey,
    })),
  });
  if (waitUntil) waitUntil(task);

  return json({
    ok: true,
    code,
    total: subtotal,
    delivery,
    track_key: phone.slice(-4),
    items: items.map(({ p }) => ({ name: p.product, qty: p.qty, total: p.total })),
  }, 201);
});
return { onRequestPost };
})();

// ===== api/proof.js =====
__M["api/proof"] = (() => {
const { handle, json, HttpError, readJSON, rateLimit, nowSec, clean } = __M["_lib/util"];
const { hasFile } = __M["_lib/storage"];
const { notify } = __M["_lib/notify"];

// Pelanggan menautkan bukti bayar (file sudah diunggah lewat /api/upload kind=proof).
const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  await rateLimit(env, 'proof', request, 15, 3600);
  const b = await readJSON(request);
  const code = clean(b.code, 20).toUpperCase();
  const p4 = clean(b.p, 4);
  const key = String(b.key || '');

  if (!/^proofs\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key) || !(await hasFile(env, key))) {
    throw new HttpError(400, 'File bukti tidak ditemukan. Unggah ulang.');
  }
  const o = await env.DB.prepare('SELECT id, status, phone, customer_name, total FROM orders WHERE code = ?').bind(code).first();
  if (!o || !o.phone.endsWith(p4) || p4.length !== 4) throw new HttpError(404, 'Pesanan tidak ditemukan. Periksa kode dan 4 digit akhir nomor WhatsApp.');
  if (!['menunggu_pembayaran', 'menunggu_verifikasi'].includes(o.status)) {
    throw new HttpError(409, 'Pesanan ini sudah diproses, bukti bayar tidak bisa diganti.');
  }

  const now = nowSec();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET proof_key = ?, status = 'menunggu_verifikasi', updated_at = ? WHERE id = ?").bind(key, now, o.id),
    env.DB.prepare("INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, 'menunggu_verifikasi', 'Bukti pembayaran diunggah', ?)").bind(o.id, now),
  ]);
  const task = notify(env, 'proof_uploaded', { code, customer: o.customer_name, total: o.total });
  if (waitUntil) waitUntil(task);
  return json({ ok: true, status: 'menunggu_verifikasi' });
});
return { onRequestPost };
})();

// ===== api/track.js =====
__M["api/track"] = (() => {
const { handle, json, HttpError, rateLimit, clean, parseJSONField } = __M["_lib/util"];
const { STATUS } = __M["_lib/status"];

const onRequestGet = handle(async ({ request, env }) => {
  await rateLimit(env, 'trk', request, 40, 3600);
  const u = new URL(request.url);
  const code = clean(u.searchParams.get('code'), 20).toUpperCase();
  const p4 = clean(u.searchParams.get('p'), 4);

  const o = await env.DB.prepare('SELECT * FROM orders WHERE code = ?').bind(code).first();
  if (!o || p4.length !== 4 || !o.phone.endsWith(p4)) {
    throw new HttpError(404, 'Pesanan tidak ditemukan. Periksa kode dan 4 digit akhir nomor WhatsApp.');
  }
  const [items, events] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(o.id),
    env.DB.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').bind(o.id),
  ]);

  return json({
    ok: true,
    order: {
      code: o.code,
      status: o.status,
      status_label: STATUS[o.status] || o.status,
      customer: o.customer_name.split(' ')[0],
      delivery: o.delivery,
      subtotal: o.subtotal,
      shipping_fee: o.shipping_fee,
      total: o.total,
      has_proof: !!o.proof_key,
      tracking_no: o.tracking_no || '',
      created_at: o.created_at,
      items: items.results.map((i) => ({
        name: i.product_name, w: i.w, h: i.h, thickness: i.thickness, finish: i.finish_name,
        shape: i.shape_name, extras: parseJSONField(i.extras, []), qty: i.qty, line_total: i.line_total,
        has_design: !!i.design_key,
      })),
      events: events.results.map((e) => ({ status: e.status, label: STATUS[e.status] || e.status, note: e.note || '', at: e.created_at })),
    },
  });
});
return { onRequestGet };
})();

// ===== api/upload.js =====
__M["api/upload"] = (() => {
const { handle, json, HttpError, rateLimit } = __M["_lib/util"];
const { limits, putFile, sniffOk, EXT_MIME, DESIGN_EXT, PROOF_EXT } = __M["_lib/storage"];

const mb = (n) => (n / 1024 / 1024).toFixed(1).replace('.', ',');

const onRequestPost = handle(async ({ request, env }) => {
  await rateLimit(env, 'up', request, 30, 3600);
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
    throw new HttpError(400, 'Unggah file memakai form multipart.');
  }
  const lim = limits(env);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > Math.max(lim.design, lim.proof) + 200_000) {
    throw new HttpError(413, `File terlalu besar. Maksimal ${mb(lim.design)} MB.`);
  }

  const form = await request.formData();
  const file = form.get('file');
  const kind = form.get('kind') === 'proof' ? 'proof' : 'design';
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
    throw new HttpError(400, 'File tidak ditemukan.');
  }

  const name = String(file.name || 'file').slice(0, 120);
  const ext = (name.split('.').pop() || '').toLowerCase();
  const allowed = kind === 'proof' ? PROOF_EXT : DESIGN_EXT;
  if (!allowed.includes(ext)) {
    throw new HttpError(400, `Format .${ext} tidak didukung. Gunakan: ${allowed.join(', ')}.`);
  }
  if (file.size > lim[kind]) {
    const hint = lim.mode === 'd1' ? ' Kecilkan file, atau kirim desain lewat WhatsApp setelah memesan.' : '';
    throw new HttpError(413, `File terlalu besar (${mb(file.size)} MB). Maksimal ${mb(lim[kind])} MB.${hint}`);
  }

  const bytes = await file.arrayBuffer();
  if (!sniffOk(ext, bytes)) throw new HttpError(400, 'Isi file tidak cocok dengan ekstensinya.');

  const key = `${kind === 'proof' ? 'proofs' : 'designs'}/${crypto.randomUUID()}.${ext}`;
  await putFile(env, key, bytes, EXT_MIME[ext]);
  return json({ ok: true, key, name, size: file.size });
});
return { onRequestPost };
})();

// ===== g/[id].js =====
__M["g/[id]"] = (() => {
const { escapeHtml: e } = __M["_lib/util"];

// Halaman bagikan untuk satu karya di galeri (untuk link di bio/caption sosmed).
async function onRequestGet({ params, env, request }) {
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
return { onRequestGet };
})();

// ===== p/[slug].js =====
__M["p/[slug]"] = (() => {
const { escapeHtml: e } = __M["_lib/util"];
const { loadCatalog } = __M["_lib/catalog"];

// Halaman bagikan untuk produk: memberi pratinjau (judul + gambar) di WhatsApp, Instagram, TikTok, Facebook,
// lalu mengarahkan pengunjung ke konfigurator.
async function onRequestGet({ params, env, request }) {
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
return { onRequestGet };
})();

// ===== robots.txt.js =====
__M["robots.txt"] = (() => {
async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  return new Response(
    `User-agent: *\nDisallow: /admin.html\nDisallow: /api/\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } }
  );
}
return { onRequestGet };
})();

// ===== sitemap.xml.js =====
__M["sitemap.xml"] = (() => {
const { escapeHtml: e } = __M["_lib/util"];

async function onRequestGet({ env, request }) {
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
return { onRequestGet };
})();

// ===== penjalur (meniru Pages Functions) =====
const ROUTES = [
  { segs: ["api","admin","catalog"], mod: __M["api/admin/catalog"] },
  { segs: ["api","admin","cleanup"], mod: __M["api/admin/cleanup"] },
  { segs: ["api","admin","file"], mod: __M["api/admin/file"] },
  { segs: ["api","admin","gallery"], mod: __M["api/admin/gallery"] },
  { segs: ["api","admin","gallery","[id]"], mod: __M["api/admin/gallery/[id]"] },
  { segs: ["api","admin","orders"], mod: __M["api/admin/orders"] },
  { segs: ["api","admin","orders","[id]"], mod: __M["api/admin/orders/[id]"] },
  { segs: ["api","admin","summary"], mod: __M["api/admin/summary"] },
  { segs: ["api","catalog"], mod: __M["api/catalog"] },
  { segs: ["api","gallery"], mod: __M["api/gallery"] },
  { segs: ["api","health"], mod: __M["api/health"] },
  { segs: ["api","media","[[path]]"], mod: __M["api/media/[[path]]"] },
  { segs: ["api","orders"], mod: __M["api/orders"] },
  { segs: ["api","proof"], mod: __M["api/proof"] },
  { segs: ["api","track"], mod: __M["api/track"] },
  { segs: ["api","upload"], mod: __M["api/upload"] },
  { segs: ["g","[id]"], mod: __M["g/[id]"] },
  { segs: ["p","[slug]"], mod: __M["p/[slug]"] },
  { segs: ["robots.txt"], mod: __M["robots.txt"] },
  { segs: ["sitemap.xml"], mod: __M["sitemap.xml"] },
];

function matchRoute(route, parts) {
  const params = {};
  let score = 0;
  for (let i = 0; i < route.segs.length; i++) {
    const s = route.segs[i];
    if (s.startsWith('[[')) { params[s.slice(2, -2)] = parts.slice(i); return { params, score }; }
    if (i >= parts.length) return null;
    if (s.startsWith('[')) { params[s.slice(1, -1)] = decodeURIComponent(parts[i]); score += 1; continue; }
    if (s !== parts[i]) return null;
    score += 10;
  }
  return route.segs.length === parts.length ? { params, score } : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let parts;
    try { parts = url.pathname.split('/').filter(Boolean); } catch { parts = []; }
    let best = null;
    for (const r of ROUTES) {
      let m = null;
      try { m = matchRoute(r, parts); } catch { m = null; }
      if (m && (!best || m.score > best.m.score)) best = { r, m };
    }
    if (best) {
      const fn = best.r.mod['onRequest' + request.method[0] + request.method.slice(1).toLowerCase()] || best.r.mod.onRequest;
      if (!fn) return new Response('Method Not Allowed', { status: 405 });
      return fn({ request, env, params: best.m.params, waitUntil: (p) => ctx.waitUntil(p), next: () => env.ASSETS.fetch(request) });
    }
    return env.ASSETS.fetch(request);
  },
};
