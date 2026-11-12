import { mountLayout, api, html, render, $, toast } from './app.js';

async function main() {
  const cat = await mountLayout('galeri');
  const qs = new URLSearchParams(location.search);
  const active = qs.get('c') || '';
  const openId = Number(qs.get('id')) || 0;

  let data;
  try {
    data = await api('/api/gallery?limit=120' + (active ? `&category=${encodeURIComponent(active)}` : ''));
  } catch (e) {
    render($('#gMount'), html`<div class="empty"><b>Galeri belum bisa dimuat</b>${e.message}</div>`);
    return;
  }
  const items = data.items;

  render($('#gChips'), html`
    <label class="chip"><input type="radio" name="gc" value="" ${!active ? 'checked' : ''}><span>Semua</span></label>
    ${data.categories.map((c) => html`<label class="chip"><input type="radio" name="gc" value="${c.category}" ${active === c.category ? 'checked' : ''}><span>${c.category} (${c.n})</span></label>`)}`);
  $('#gChips').addEventListener('change', (e) => {
    const v = e.target.value;
    location.search = v ? `?c=${encodeURIComponent(v)}` : '';
  });

  if (!items.length) {
    render($('#gMount'), html`<div class="empty"><b>${active ? 'Belum ada karya di kategori ini' : 'Galeri masih kosong'}</b>Hasil produksi akan tampil di sini.<p class="mt"><a class="btn" href="/katalog.html">Lihat produk</a></p></div>`);
    return;
  }
  render($('#gMount'), html`<div class="masonry">${items.map((i) => html`
    <a href="/galeri.html?id=${i.id}" data-id="${i.id}"><img src="/api/media/${i.image_key}" alt="${i.title}" loading="lazy">
    <div class="cap"><b>${i.title}</b><small>${i.material_note || i.category}</small></div></a>`)}</div>`);

  const dlg = $('#lb');
  const byId = new Map(items.map((i) => [i.id, i]));
  const productName = (slug) => (cat && cat.products.find((p) => p.slug === slug) || {}).name;

  function open(id) {
    const i = byId.get(id);
    if (!i) return;
    const pn = productName(i.product_slug);
    render(dlg, html`
      <button class="btn btn-line btn-sm lb-close" type="button" id="lbClose">Tutup</button>
      <div class="lb-grid">
        <img src="/api/media/${i.image_key}" alt="${i.title}">
        <div class="lb-info">
          <h2>${i.title}</h2>
          ${i.material_note ? html`<p class="pill">${i.material_note}</p>` : ''}
          ${i.description ? html`<p class="mt">${i.description}</p>` : ''}
          <div style="display:grid;gap:.6rem;margin-top:1.25rem">
            ${i.product_slug && pn ? html`<a class="btn" href="/produk.html?slug=${encodeURIComponent(i.product_slug)}">Pesan yang serupa: ${pn}</a>` : html`<a class="btn" href="/katalog.html">Lihat produk</a>`}
            <button class="btn btn-line" type="button" id="lbShare">Bagikan karya ini</button>
          </div>
        </div>
      </div>`);
    $('#lbClose').onclick = () => dlg.close();
    $('#lbShare').onclick = async () => {
      const url = `${location.origin}/g/${i.id}`;
      try {
        if (navigator.share) await navigator.share({ title: i.title, url });
        else { await navigator.clipboard.writeText(url); toast('Link karya disalin.'); }
      } catch { /* dibatalkan */ }
    };
    if (!dlg.open) dlg.showModal();
  }
  $('#gMount').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (!a) return;
    e.preventDefault();
    open(Number(a.dataset.id));
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  if (openId) open(openId);
}
main();
