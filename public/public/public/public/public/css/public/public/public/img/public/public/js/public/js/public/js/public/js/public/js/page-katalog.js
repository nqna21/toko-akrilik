import { mountLayout, html, render, $, productCard } from './app.js';

async function main() {
  const cat = await mountLayout('katalog');
  if (!cat) {
    render($('#kGrid'), html`<div class="empty"><b>Katalog belum bisa dimuat</b>Periksa koneksi internet, lalu <a href="">muat ulang halaman</a>.</div>`);
    return;
  }
  const qs = new URLSearchParams(location.search);
  const c = qs.get('c') || '';
  const q = (qs.get('q') || '').trim().toLowerCase();

  let list = cat.products;
  if (c) list = list.filter((p) => p.category === c);
  if (q) {
    // Semua kata yang diketik harus cocok di nama, kategori, deskripsi, atau singkatan produk (slug).
    const words = q.split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = `${p.name} ${p.category} ${p.description} ${p.slug.replace(/-/g, ' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  const title = c || (q ? `Hasil untuk “${qs.get('q').trim()}”` : 'Semua produk');
  $('#kTitle').textContent = title;
  $('#crumbNow').textContent = title;
  document.title = `${title} · ${cat.settings.shop_name || 'Katalog'}`;
  $('#kCount').textContent = `${list.length} produk`;

  if (!list.length) {
    render($('#kGrid'), html`<div class="empty" style="grid-column:1/-1"><b>Tidak ada produk yang cocok</b>Coba kata lain, atau <a href="/katalog.html">lihat semua produk</a>.</div>`);
    return;
  }
  render($('#kGrid'), html`${list.map((p) => productCard(p, cat))}`);
}
main();
