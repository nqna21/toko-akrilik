// Fungsi bersama semua halaman: HTML aman, API, keranjang, tata letak (header/footer), ilustrasi akrilik.
import { computePrice } from './pricing.js';
export { computePrice };

/* ---------- HTML aman: semua nilai otomatis di-escape ---------- */
class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
const str = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(str).join('') : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += str(v) + strings[i + 1]; });
  return new Raw(out);
}
export const render = (el, r) => { el.innerHTML = r instanceof Raw ? r.s : esc(r); };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- format ---------- */
export const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
export const cm = (n) => String(Number(n)).replace('.', ',');
export const fmtDate = (s) =>
  new Date(s * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export const STATUS = {
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
export const STATUS_FLOW = ['menunggu_pembayaran', 'menunggu_verifikasi', 'antrean', 'print_uv', 'cutting', 'qc', 'siap', 'dikirim', 'selesai'];

/* ---------- API ---------- */
export async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(path, opts);
  } catch {
    const e = new Error('Tidak bisa terhubung ke server. Periksa internet kamu, lalu coba lagi.');
    e.offline = true;
    throw e;
  }
  let d;
  try { d = await r.json(); } catch { d = { ok: false, error: 'Respons server tidak terbaca.' }; }
  if (!r.ok || d.ok === false) {
    const e = new Error(d.error || `Terjadi kesalahan (${r.status}).`);
    e.status = r.status;
    throw e;
  }
  return d;
}
let catPromise = null;
export function getCatalog() {
  if (!catPromise) catPromise = api('/api/catalog').catch((e) => { catPromise = null; throw e; });
  return catPromise;
}

/* ---------- keranjang (localStorage, dengan cadangan di memori) ---------- */
const CART_KEY = 'akr_cart_v1';
let mem = null;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
export const cart = {
  all() {
    if (mem) return mem;
    try { const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  },
  save(v) {
    mem = v;
    try { localStorage.setItem(CART_KEY, JSON.stringify(v)); mem = null; } catch { /* mode privat: tetap di memori */ }
    document.dispatchEvent(new CustomEvent('cart:change'));
  },
  add(item) { this.save([...this.all(), { ...item, id: uid() }]); },
  update(id, patch) { this.save(this.all().map((i) => (i.id === id ? { ...i, ...patch } : i))); },
  remove(id) { this.save(this.all().filter((i) => i.id !== id)); },
  clear() { this.save([]); },
  count() { return this.all().reduce((s, i) => s + (Number(i.qty) || 0), 0); },
};
export const lastOrder = {
  get() { try { return JSON.parse(localStorage.getItem('akr_last') || 'null'); } catch { return null; } },
  set(code, p) { try { localStorage.setItem('akr_last', JSON.stringify({ code, p })); } catch { /* abaikan */ } },
};

/* ---------- toast ---------- */
export function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3800);
}

export const waLink = (num, text = '') => `https://wa.me/${num}${text ? '?text=' + encodeURIComponent(text) : ''}`;

/* ---------- unggah file (dengan pengecilan foto otomatis bila perlu) ---------- */
export async function shrinkImage(file, maxBytes) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size <= maxBytes) return { file, shrunk: false };
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    for (const [type, ext] of [['image/webp', 'webp'], ['image/jpeg', 'jpg']]) {
      for (const q of [0.9, 0.8, 0.7]) {
        const blob = await new Promise((r) => c.toBlob(r, type, q));
        if (blob && blob.type === type && blob.size <= maxBytes) {
          const base = file.name.replace(/\.[^.]+$/, '');
          return { file: new File([blob], `${base}.${ext}`, { type }), shrunk: true };
        }
      }
    }
    scale *= 0.8;
  }
  throw new Error('Foto terlalu besar untuk dikecilkan otomatis. Pakai foto yang lebih kecil.');
}
export async function uploadFile(file, kind) {
  const f = new FormData();
  f.set('file', file);
  f.set('kind', kind);
  return api('/api/upload', { method: 'POST', body: f });
}

/* ---------- ilustrasi akrilik ---------- */
let svgN = 0;
export function paneSVG(kind = 'plakat') {
  const id = 'p' + ++svgN;
  const F = `fill="url(#${id}f)" stroke="#12B5C9" stroke-width="1.6" stroke-linejoin="round"`;
  const L = 'fill="none" stroke="#0E1A2B" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"';
  const C = 'fill="none" stroke="#D01F6B" stroke-width="1.3" stroke-dasharray="4 3" stroke-linejoin="round"';
  const art = {
    plakat: `<rect x="30" y="12" width="100" height="86" rx="3" ${F}/><rect x="38" y="20" width="84" height="70" ${C}/><circle cx="80" cy="46" r="11" ${L}/><path d="M52 68h56M60 77h40" ${L}/>`,
    nama: `<rect x="12" y="36" width="136" height="38" rx="3" ${F}/><rect x="19" y="42" width="122" height="26" ${C}/><path d="M32 55h50M32 62h30" ${L}/><circle cx="122" cy="55" r="6" ${L}/>`,
    signage: `<rect x="14" y="24" width="132" height="62" rx="3" ${F}/><rect x="21" y="31" width="118" height="48" ${C}/><path d="M34 55h60M34 64h38M108 47l14 8-14 8" ${L}/>`,
    ganci: `<rect x="50" y="26" width="60" height="72" rx="14" ${F}/><rect x="56" y="32" width="48" height="60" rx="10" ${C}/><circle cx="80" cy="42" r="5" ${L}/><ellipse cx="80" cy="16" rx="9" ry="7" ${L}/><path d="M60 68h40M66 78h28" ${L}/>`,
    tent: `<path d="M28 96 80 18l52 78z" ${F}/><path d="M42 90 80 33l38 57z" ${C}/><path d="M64 74h32M68 83h24" ${L}/>`,
    display: `<rect x="26" y="72" width="108" height="24" rx="2" ${F}/><rect x="40" y="46" width="80" height="24" rx="2" ${F}/><rect x="56" y="20" width="48" height="24" rx="2" ${F}/><path d="M30 78h100" ${C}/>`,
    custom: `<path d="M80 10l17 29 33 5-24 23 6 33-32-17-32 17 6-33-24-23 33-5z" ${F}/><path d="M80 20l12 22 25 4-18 17 4 25-23-12-23 12 4-25-18-17 25-4z" ${C}/>`,
  };
  return raw(
    `<svg viewBox="0 0 160 112" role="img" aria-label="Ilustrasi akrilik" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c9eef3"/></linearGradient></defs>` +
      (art[kind] || art.plakat) + '</svg>'
  );
}
// Pratinjau berskala: kotak atau bulat sesuai ukuran yang diketik, lengkap dengan garis potong dan label.
export function dimSVG(w, h, shape = 'kotak') {
  const id = 'd' + ++svgN;
  w = Number(w) || 10; h = Number(h) || 10;
  const s = Math.min(230 / w, 120 / h);
  const rw = Math.max(w * s, 14), rh = Math.max(h * s, 14);
  const x = (320 - rw) / 2 + 8, y = (172 - rh) / 2 - 2;
  const body = shape === 'bulat'
    ? `<ellipse cx="${x + rw / 2}" cy="${y + rh / 2}" rx="${rw / 2}" ry="${rh / 2}" fill="url(#${id}f)" stroke="#12B5C9" stroke-width="2"/><ellipse cx="${x + rw / 2}" cy="${y + rh / 2}" rx="${Math.max(rw / 2 - 6, 2)}" ry="${Math.max(rh / 2 - 6, 2)}" fill="none" stroke="#D01F6B" stroke-width="1.3" stroke-dasharray="4 3"/>`
    : `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="3" fill="url(#${id}f)" stroke="#12B5C9" stroke-width="2"/><rect x="${x + 6}" y="${y + 6}" width="${Math.max(rw - 12, 2)}" height="${Math.max(rh - 12, 2)}" fill="none" stroke="#D01F6B" stroke-width="1.3" stroke-dasharray="4 3"/>`;
  return raw(
    `<svg viewBox="0 0 320 190" role="img" aria-label="Pratinjau ukuran ${esc(cm(w))} kali ${esc(cm(h))} cm" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#c9eef3" stop-opacity=".8"/></linearGradient></defs>` +
      body +
      `<text x="${x + rw / 2}" y="${Math.min(y + rh + 18, 186)}" text-anchor="middle" font-size="12" font-weight="700" fill="#0E1A2B">${esc(cm(w))} cm</text>` +
      `<text transform="translate(${Math.max(x - 8, 12)} ${y + rh / 2}) rotate(-90)" text-anchor="middle" font-size="12" font-weight="700" fill="#0E1A2B">${esc(cm(h))} cm</text></svg>`
  );
}

/* ---------- tata letak: header + footer ---------- */
const LOGO = `<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="3" y="5" width="28" height="24" rx="3" fill="#E3F7FA" stroke="#12B5C9" stroke-width="2"/><rect x="8" y="10" width="18" height="14" fill="none" stroke="#D01F6B" stroke-width="1.5" stroke-dasharray="3 2.5"/></svg>`;
const I_CART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 7H6"/></svg>`;
const I_TRACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>`;
const I_WA = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.3-4.7A8 8 0 1 1 21 12z"/><path d="M9 9.5c0 3 2.500 5.500 5.500 5.500l1.200-1.300-1.800-1-.9.700a4 4 0 0 1-1.800-1.800l.7-.9-1-1.800z" fill="currentColor" stroke="none"/></svg>`;

export async function mountLayout(active = '') {
  let cat = null;
  try { cat = await getCatalog(); } catch { /* header dasar tetap tampil */ }
  const s = cat ? cat.settings : {};
  const name = s.shop_name || 'Akrilik Studio';
  const cats = cat ? [...new Set(cat.products.map((p) => p.category))] : [];
  const curCat = new URLSearchParams(location.search).get('c') || '';
  const wa = s.wa_number ? waLink(s.wa_number, `Halo ${name}, saya mau tanya soal cetak akrilik.`) : '';
  document.title = document.title.includes('·') ? document.title : `${document.title} · ${name}`;

  const top = $('#top');
  if (top) {
    render(top, html`
      ${cat && cat.demo ? html`<div class="demo-bar" role="note"><b>Mode uji:</b> harga di situs ini masih contoh dan belum final.</div>` : ''}
      <div class="promo"><div class="wrap">
        <div class="l"><a href="/cara-order.html">Cara order</a><a href="/cara-order.html#desain">Panduan desain</a><a href="/faq.html">FAQ</a></div>
        <div class="r"><span>${s.jam_layanan || ''}</span>${wa ? html`<a href="${wa}" rel="noopener" style="margin:0">WhatsApp</a>` : ''}</div>
      </div></div>
      <header class="hdr"><div class="wrap hdr-row">
        <a class="logo" href="/" aria-label="${name}, beranda">${raw(LOGO)}${name}</a>
        <form class="search" action="/katalog.html" role="search">
          <label class="sr" for="q">Cari produk</label>
          <input id="q" name="q" type="search" placeholder="Cari plakat, gantungan kunci, signage" autocomplete="off">
          <button type="submit">Cari</button>
        </form>
        <div class="acts">
          <a class="act" href="/lacak.html">${raw(I_TRACK)}<span class="t">Lacak pesanan</span></a>
          <a class="act" href="/keranjang.html" aria-label="Keranjang">${raw(I_CART)}<span class="t">Keranjang</span><span class="badge-n" id="cartN"></span></a>
        </div>
      </div></header>
      <nav class="catnav" aria-label="Kategori produk"><div class="wrap">
        <a href="/katalog.html" ${active === 'katalog' && !curCat ? 'aria-current="true"' : ''}>Semua produk</a>
        ${cats.map((c) => html`<a href="/katalog.html?c=${encodeURIComponent(c)}" ${curCat === c ? 'aria-current="true"' : ''}>${c}</a>`)}
        <a href="/galeri.html" ${active === 'galeri' ? 'aria-current="true"' : ''}>Galeri karya</a>
      </div></nav>`);
    $('#q').value = new URLSearchParams(location.search).get('q') || '';
    const upd = () => { const n = cart.count(); $('#cartN').textContent = n ? String(n) : ''; };
    upd();
    document.addEventListener('cart:change', upd);
  }

  const foot = $('#foot');
  if (foot) {
    render(foot, html`
      <footer class="foot"><div class="wrap">
        <div class="foot-grid">
          <div><a class="logo" href="/">${raw(LOGO)}${name}</a><p>${s.tagline || ''}</p></div>
          <div><h3>Produk</h3>${cats.map((c) => html`<a href="/katalog.html?c=${encodeURIComponent(c)}">${c}</a>`)}<a href="/galeri.html">Galeri karya</a></div>
          <div><h3>Layanan pelanggan</h3><a href="/cara-order.html">Cara order</a><a href="/cara-order.html#desain">Panduan desain</a><a href="/faq.html">FAQ</a><a href="/lacak.html">Lacak pesanan</a></div>
          <div><h3>Hubungi kami</h3>
            ${s.address ? html`<p>${s.address}</p>` : ''}${s.jam_layanan ? html`<p>${s.jam_layanan}</p>` : ''}
            ${wa ? html`<a href="${wa}" rel="noopener">Chat WhatsApp</a>` : ''}
            ${s.instagram ? html`<a href="${s.instagram}" rel="noopener">Instagram</a>` : ''}
            ${s.tiktok ? html`<a href="${s.tiktok}" rel="noopener">TikTok</a>` : ''}
            ${s.maps_url ? html`<a href="${s.maps_url}" rel="noopener">Lihat di peta</a>` : ''}
          </div>
        </div>
        <div class="copy">© ${new Date().getFullYear()} ${name}</div>
      </div></footer>
      ${wa ? html`<a class="fab" href="${wa}" rel="noopener" aria-label="Chat WhatsApp">${raw(I_WA)}<span>Chat</span></a>` : ''}`);
  }
  return cat;
}

export function productCard(p, cat) {
  const lo = cheapest(p, cat);
  return html`<a class="pcard" href="/produk.html?slug=${encodeURIComponent(p.slug)}">
    <div class="pic">${p.cover ? html`<img src="/api/media/${p.cover}" alt="${p.name}" loading="lazy">` : paneSVG(p.kind)}</div>
    <div class="body"><div class="cat">${p.category}</div><h3>${p.name}</h3>
      <div class="price">${lo ? html`<small>Mulai </small>${rp(lo)}` : html`<small>Lihat harga</small>`}</div></div></a>`;
}
// Harga terendah = ukuran, tebal, dan finishing terkecil dari produk itu.
export function cheapest(p, cat) {
  const r = computePrice(cat, {
    slug: p.slug, w: p.min_w, h: p.min_h, thickness: Math.min(...p.thickness_options),
    finish: p.finish_options[0], shape: p.shape_options[0], extras: [], qty: 1,
  });
  return r.ok ? r.unit : null;
}
