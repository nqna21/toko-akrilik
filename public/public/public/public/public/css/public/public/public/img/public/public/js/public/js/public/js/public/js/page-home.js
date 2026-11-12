import { mountLayout, api, html, render, $, rp, cm, computePrice, dimSVG, productCard, esc } from './app.js';

async function main() {
  const cat = await mountLayout('home');
  if (!cat) {
    render($('#main'), html`<div class="sec"><div class="empty"><b>Katalog belum bisa dimuat</b>Periksa koneksi internet, lalu <a href="">muat ulang halaman</a>.</div></div>`);
    return;
  }
  if (!cat.products.length) {
    render($('#featured'), html`<div class="empty"><b>Belum ada produk aktif</b>Produk akan tampil di sini.</div>`);
    return;
  }

  /* ----- kategori ----- */
  const groups = {};
  for (const p of cat.products) groups[p.category] = (groups[p.category] || 0) + 1;
  render($('#cats'), html`${Object.entries(groups).map(([c, n]) => html`<a class="cat-tile" href="/katalog.html?c=${encodeURIComponent(c)}">${c}<small>${n} produk</small></a>`)}`);

  /* ----- produk pilihan ----- */
  render($('#featured'), html`${cat.products.slice(0, 8).map((p) => productCard(p, cat))}`);

  /* ----- hitung cepat ----- */
  const prod = cat.products.find((p) => p.slug === 'potong-custom') || cat.products[0];
  const shape = prod.shape_options.includes('kotak') ? 'kotak' : prod.shape_options[0];
  const eW = $('#eW'), eH = $('#eH'), eT = $('#eT'), eF = $('#eF');
  eW.min = prod.min_w; eW.max = prod.max_w; eW.value = Math.min(Math.max(20, prod.min_w), prod.max_w);
  eH.min = prod.min_h; eH.max = prod.max_h; eH.value = Math.min(Math.max(20, prod.min_h), prod.max_h);
  const thick = prod.thickness_options.filter((t) => cat.thicknesses.some((m) => m.thickness_mm === t));
  render(eT, html`${thick.map((t) => html`<option value="${t}" ${t === prod.default_thickness ? 'selected' : ''}>${cm(t)} mm</option>`)}`);
  const fins = cat.finishes.filter((f) => prod.finish_options.includes(f.code));
  render(eF, html`${fins.map((f) => html`<option value="${f.code}">${f.name}</option>`)}`);
  const pick = fins.find((f) => f.code === 'uv_warna') || fins[0];
  if (pick) eF.value = pick.code;

  const update = () => {
    const r = computePrice(cat, { slug: prod.slug, w: eW.value, h: eH.value, thickness: eT.value, finish: eF.value, shape, extras: [], qty: 1 });
    render($('#estView'), dimSVG(eW.value, eH.value, 'kotak'));
    $('#eErr').textContent = r.ok ? '' : r.error;
    $('#ePrice').textContent = r.ok ? rp(r.unit) : '–';
    const q = new URLSearchParams({ slug: prod.slug, w: eW.value, h: eH.value, t: eT.value, f: eF.value, s: shape });
    $('#eGo').href = `/produk.html?${q}`;
  };
  ['input', 'change'].forEach((ev) => $('#est').addEventListener(ev, update));
  update();

  /* ----- karya terbaru ----- */
  try {
    const g = await api('/api/gallery?limit=10');
    if (g.items.length) {
      render($('#recent'), html`<div class="strip">${g.items.map((i) => html`<a href="/galeri.html?id=${i.id}" aria-label="${i.title}"><img src="/api/media/${i.image_key}" alt="${i.title}" loading="lazy"></a>`)}</div>`);
    } else {
      render($('#recent'), html`<div class="empty"><b>Hasil karya akan tampil di sini</b>Foto produk yang sudah jadi muncul otomatis setelah ditambahkan.</div>`);
    }
  } catch {
    render($('#recent'), html`<div class="empty">Galeri belum bisa dimuat.</div>`);
  }
}
main();
