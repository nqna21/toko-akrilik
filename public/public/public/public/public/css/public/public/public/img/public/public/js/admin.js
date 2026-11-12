// Panel admin: pesanan, galeri, harga & info, status sistem. Token disimpan di sessionStorage (hilang saat tab ditutup).
import { api, html, render, $, $$, rp, cm, fmtDate, STATUS, toast, waLink } from './app.js';

const TK = 'akr_admin_token';
let token = '';
try { token = sessionStorage.getItem(TK) || ''; } catch { /* abaikan */ }
let tab = 'ringkasan';
const root = $('#adm');

async function adm(path, opts = {}) {
  try {
    return await api(path, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + token } });
  } catch (e) {
    if (e.status === 401) { token = ''; try { sessionStorage.removeItem(TK); } catch { /* */ } login(e.message); }
    throw e;
  }
}
async function download(key, name) {
  const r = await fetch(`/api/admin/file?key=${encodeURIComponent(key)}&name=${encodeURIComponent(name || '')}`, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) return toast('Gagal mengunduh file.', 'bad');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob());
  a.download = name || key.split('/').pop();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- masuk ---------- */
function login(msg = '') {
  render(root, html`
    <div class="box" style="max-width:420px;margin:12vh auto 0">
      <h1 style="font-size:1.6rem;margin-bottom:1rem">Admin</h1>
      <form id="lf">
        <div class="field"><label class="f" for="tok">Token admin</label><input class="in" id="tok" type="password" autocomplete="current-password" required>
          <div class="hint">Token yang kamu isi di Cloudflare sebagai ADMIN_TOKEN.</div></div>
        <div class="err-text" role="alert">${msg}</div>
        <button class="btn btn-block" type="submit">Masuk</button>
      </form>
    </div>`);
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    token = $('#tok').value.trim();
    try {
      await api('/api/admin/summary', { headers: { authorization: 'Bearer ' + token } });
      try { sessionStorage.setItem(TK, token); } catch { /* */ }
      shell();
    } catch (err) {
      token = '';
      login(err.message);
    }
  };
}

/* ---------- kerangka ---------- */
const TABS = [['ringkasan', 'Ringkasan'], ['pesanan', 'Pesanan'], ['galeri', 'Galeri'], ['harga', 'Harga & info']];
function shell() {
  render(root, html`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
      <h1 style="font-size:1.6rem">Admin</h1>
      <div><a href="/" class="btn btn-line btn-sm">Lihat toko</a> <button class="btn btn-line btn-sm" id="out" type="button">Keluar</button></div>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`)}</div>
    <div id="pane"></div><div id="drawerMount"></div>`);
  $('#out').onclick = () => { token = ''; try { sessionStorage.removeItem(TK); } catch { /* */ } login(); };
  $('.tabs').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    tab = b.dataset.t;
    $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    drawTab();
  };
  drawTab();
}
const drawTab = () => ({ ringkasan: tabSummary, pesanan: tabOrders, galeri: tabGallery, harga: tabPrices }[tab]());
const errBox = (e) => html`<div class="note bad">${e.message}</div>`;
const pillFor = (s) => (s === 'dibatalkan' ? 'bad' : s === 'selesai' ? 'ok' : ['menunggu_pembayaran', 'menunggu_verifikasi'].includes(s) ? 'warn' : '');

/* ---------- ringkasan + status sistem ---------- */
const CHECK_LABEL = {
  d1_terpasang: 'Database D1 terpasang', tabel_siap: 'Tabel database sudah dibuat', data_awal_siap: 'Data awal (seed) sudah dimuat',
  admin_token_diatur: 'ADMIN_TOKEN diatur', r2_terpasang: 'R2 terpasang (file besar)', telegram_diatur: 'Telegram diatur',
  windmill_diatur: 'Windmill diatur', site_url_diatur: 'SITE_URL diatur',
};
async function tabSummary() {
  const pane = $('#pane');
  render(pane, html`<p class="muted">Memuat…</p>`);
  try {
    const [s, h] = await Promise.all([adm('/api/admin/summary'), fetch('/api/health').then((r) => r.json()).catch(() => null)]);
    render(pane, html`
      <div class="kpis">
        <div class="kpi"><span class="muted small">Pesanan hari ini</span><b>${s.today.n}</b><span class="small">${rp(s.today.nilai)}</span></div>
        <div class="kpi"><span class="muted small">Pesanan bulan ini</span><b>${s.month.n}</b><span class="small">${rp(s.month.nilai)}</span></div>
        <div class="kpi"><span class="muted small">Menunggu verifikasi bayar</span><b>${s.counts.menunggu_verifikasi}</b></div>
        <div class="kpi"><span class="muted small">Sedang diproduksi</span><b>${s.in_production}</b></div>
        <div class="kpi"><span class="muted small">Belum dibayar</span><b>${s.counts.menunggu_pembayaran}</b></div>
      </div>
      <p class="muted small mt">Nilai = jumlah total pesanan yang tidak dibatalkan, bukan uang yang sudah masuk.</p>
      <div class="two mt2">
        <div class="box"><h3>Perlu verifikasi pembayaran</h3>
          ${s.waiting_verification.length ? html`<table class="tbl mt"><tbody>${s.waiting_verification.map((o) => html`<tr class="click" data-open="${o.id}"><td>${o.code}</td><td>${o.customer_name}</td><td class="num">${rp(o.total)}</td></tr>`)}</tbody></table>` : html`<p class="muted mt">Tidak ada.</p>`}</div>
        <div class="box"><h3>Belum dibayar lebih dari 24 jam</h3>
          ${s.unpaid_over_24h.length ? html`<table class="tbl mt"><tbody>${s.unpaid_over_24h.map((o) => html`<tr class="click" data-open="${o.id}"><td>${o.code}</td><td>${o.customer_name}</td><td class="num">${rp(o.total)}</td></tr>`)}</tbody></table>` : html`<p class="muted mt">Tidak ada.</p>`}</div>
      </div>
      <div class="box mt2"><h3>Status sistem</h3>
        ${h ? html`<ul style="list-style:none;padding:0;margin:.75rem 0 0">${Object.entries(h.checks).map(([k, v]) => html`<li>${v ? '✅' : '⚠️'} ${CHECK_LABEL[k] || k}</li>`)}</ul>
          <p class="muted small mt">${h.catatan.r2} ${h.catatan.notifikasi}</p>` : html`<p class="muted mt">Tidak bisa memeriksa.</p>`}</div>`);
    pane.onclick = (e) => { const r = e.target.closest('[data-open]'); if (r) openOrder(Number(r.dataset.open)); };
  } catch (e) { if (e.status !== 401) render(pane, errBox(e)); }
}

/* ---------- pesanan ---------- */
let oFilter = { status: 'aktif', q: '' };
async function tabOrders() {
  const pane = $('#pane');
  render(pane, html`
    <div class="filters">
      <select class="in" id="fs" style="width:auto" aria-label="Filter status"><option value="aktif">Semua yang aktif</option><option value="">Semua termasuk selesai</option>${Object.entries(STATUS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
      <input class="in" id="fq" style="width:auto;flex:1;min-width:180px" placeholder="Cari kode, nama, atau nomor" value="${oFilter.q}" aria-label="Cari pesanan">
      <button class="btn btn-sm" id="fgo" type="button">Cari</button>
    </div>
    <div id="olist" class="scroll-x mt"></div>`);
  $('#fs').value = oFilter.status;
  const go = () => { oFilter = { status: $('#fs').value, q: $('#fq').value.trim() }; loadOrders(); };
  $('#fgo').onclick = go; $('#fs').onchange = go;
  $('#fq').onkeydown = (e) => e.key === 'Enter' && go();
  loadOrders();
}
async function loadOrders() {
  const box = $('#olist');
  render(box, html`<p class="muted">Memuat…</p>`);
  try {
    const d = await adm(`/api/admin/orders?status=${encodeURIComponent(oFilter.status)}&q=${encodeURIComponent(oFilter.q)}`);
    if (!d.orders.length) { render(box, html`<div class="empty"><b>Tidak ada pesanan</b>Pesanan baru muncul di sini.</div>`); return; }
    render(box, html`<table class="tbl"><thead><tr><th>Kode</th><th>Masuk</th><th>Pelanggan</th><th class="num">Total</th><th>Status</th><th>Bukti</th></tr></thead><tbody>
      ${d.orders.map((o) => html`<tr class="click" data-open="${o.id}"><td><b>${o.code}</b></td><td>${fmtDate(o.created_at)}</td><td>${o.customer_name}<br><small class="muted">${o.phone}</small></td><td class="num">${rp(o.total)}</td><td><span class="pill ${pillFor(o.status)}">${STATUS[o.status]}</span></td><td>${o.has_proof ? '✓' : ''}</td></tr>`)}</tbody></table>`);
    box.onclick = (e) => { const r = e.target.closest('[data-open]'); if (r) openOrder(Number(r.dataset.open)); };
  } catch (e) { if (e.status !== 401) render(box, errBox(e)); }
}

async function openOrder(id) {
  const m = $('#drawerMount');
  try {
    const { order: o } = await adm(`/api/admin/orders/${id}`);
    const waMsg = `Halo ${o.customer_name}, pesanan ${o.code} berstatus: ${STATUS[o.status]}.`;
    render(m, html`<div class="drawer-bg" id="dbg"></div>
    <aside class="drawer" role="dialog" aria-label="Detail pesanan ${o.code}">
      <div style="display:flex;justify-content:space-between;gap:1rem"><h2>${o.code}</h2><button class="btn btn-line btn-sm" id="dx" type="button">Tutup</button></div>
      <p><span class="pill ${pillFor(o.status)}">${STATUS[o.status]}</span> <span class="muted small">${fmtDate(o.created_at)}</span></p>
      <p><b>${o.customer_name}</b> · <a href="${waLink(o.phone, waMsg)}" rel="noopener">${o.phone} (WhatsApp)</a>${o.email ? html`<br>${o.email}` : ''}</p>
      <p>${o.delivery === 'kirim' ? html`<b>Dikirim ke:</b> ${o.address}${o.city ? ', ' + o.city : ''}` : html`<b>Diambil sendiri</b>`}</p>
      ${o.note ? html`<p><b>Catatan pelanggan:</b> ${o.note}</p>` : ''}
      <h3 class="mt">Item</h3>
      ${o.items.map((i) => html`<div class="box mt" style="padding:.8rem">
        <b>${i.qty}× ${i.product_name}</b> <span class="muted">${rp(i.line_total)}</span><br>
        <span class="small">${cm(i.w)}×${cm(i.h)} cm · ${cm(i.thickness)} mm · ${i.shape_name} · ${i.finish_name}${i.extras.length ? ' · ' + i.extras.join(', ') : ''}</span>
        ${i.note ? html`<br><span class="small">Catatan: ${i.note}</span>` : ''}
        <div class="mt">${i.design_key ? html`<button class="btn btn-soft btn-sm" data-dl="${i.design_key}" data-name="${i.design_name || ''}" type="button">Unduh desain${i.design_name ? ': ' + i.design_name : ''}</button>` : html`<span class="pill warn">Desain belum diunggah: minta lewat WhatsApp</span>`}</div></div>`)}
      <div class="sum-row mt"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>
      <div class="sum-row"><span>Ongkir</span><span>${rp(o.shipping_fee)}</span></div>
      <div class="sum-row t"><span>Total</span><span>${rp(o.total)}</span></div>
      ${o.proof_key ? html`<p class="mt"><button class="btn btn-soft btn-sm" data-dl="${o.proof_key}" data-name="bukti-${o.code}" type="button">Unduh bukti pembayaran</button></p>` : html`<p class="muted small mt">Bukti pembayaran belum diunggah.</p>`}
      <h3 class="mt2">Perbarui</h3>
      <div class="field"><label class="f" for="ost">Status</label><select class="in" id="ost">${Object.entries(STATUS).map(([k, l]) => html`<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`)}</select></div>
      <div class="field"><label class="f" for="oen">Catatan untuk riwayat (tampil ke pelanggan)</label><input class="in" id="oen" maxlength="200" placeholder="Contoh: mulai dicetak"></div>
      ${o.delivery === 'kirim' ? html`<div class="field"><label class="f" for="osf">Ongkir (Rp)</label><input class="in" id="osf" type="number" min="0" step="500" value="${o.shipping_fee}"></div>
      <div class="field"><label class="f" for="otn">Nomor resi</label><input class="in" id="otn" value="${o.tracking_no || ''}"></div>` : ''}
      <div class="field"><label class="f" for="oan">Catatan internal (tidak tampil ke pelanggan)</label><textarea class="in" id="oan">${o.admin_note || ''}</textarea></div>
      <div class="err-text" id="oerr" role="alert"></div>
      <button class="btn btn-block" id="osave" type="button">Simpan</button>
      <h3 class="mt2">Riwayat</h3>
      <ul class="small">${o.events.map((e) => html`<li>${fmtDate(e.created_at)} · ${e.label}${e.note ? ' · ' + e.note : ''}</li>`)}</ul>
    </aside>`);
    const close = () => render(m, html``);
    $('#dx').onclick = close; $('#dbg').onclick = close;
    m.onclick = (e) => { const b = e.target.closest('[data-dl]'); if (b) download(b.dataset.dl, b.dataset.name); };
    $('#osave').onclick = async () => {
      const body = { status: $('#ost').value, event_note: $('#oen').value, admin_note: $('#oan').value };
      if ($('#osf')) { body.shipping_fee = Number($('#osf').value || 0); body.tracking_no = $('#otn').value; }
      try {
        await adm(`/api/admin/orders/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        toast('Tersimpan.');
        close();
        drawTab();
      } catch (e) { if (e.status !== 401) $('#oerr').textContent = e.message; }
    };
  } catch (e) { if (e.status !== 401) toast(e.message, 'bad'); }
}

/* ---------- galeri ---------- */
async function prepPhoto(file, maxBytes) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  for (const [type, ext] of [['image/webp', 'webp'], ['image/jpeg', 'jpg']]) {
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const b = await new Promise((r) => c.toBlob(r, type, q));
      if (b && b.type === type && b.size <= maxBytes) return new File([b], `foto.${ext}`, { type });
    }
  }
  throw new Error('Foto terlalu besar. Pakai foto yang lebih kecil.');
}
async function tabGallery() {
  const pane = $('#pane');
  render(pane, html`<p class="muted">Memuat…</p>`);
  try {
    const [g, c] = await Promise.all([adm('/api/admin/gallery'), api('/api/catalog')]);
    const cats = [...new Set(c.products.map((p) => p.category))];
    render(pane, html`
    <form class="box" id="gf">
      <h3 style="margin-bottom:.75rem">Tambah hasil karya</h3>
      <div class="two" style="padding:0;gap:1rem">
        <div>
          <div class="field"><label class="f" for="gfile">Foto</label><input class="in" id="gfile" type="file" accept="image/png,image/jpeg,image/webp" required><div class="hint">Foto otomatis dikecilkan agar halaman cepat dibuka.</div></div>
          <div class="field"><label class="f" for="gt">Judul</label><input class="in" id="gt" maxlength="100" required placeholder="Contoh: Plakat wisuda 20×30"></div>
          <div class="field"><label class="f" for="gd">Keterangan (opsional)</label><textarea class="in" id="gd" maxlength="500"></textarea></div>
        </div>
        <div>
          <div class="field"><label class="f" for="gc">Kategori</label><select class="in" id="gc">${cats.map((x) => html`<option>${x}</option>`)}</select></div>
          <div class="field"><label class="f" for="gp">Tautkan ke produk (untuk tombol "pesan yang serupa")</label><select class="in" id="gp"><option value="">Tidak ditautkan</option>${c.products.map((p) => html`<option value="${p.slug}">${p.name}</option>`)}</select></div>
          <div class="field"><label class="f" for="gm">Bahan dan finishing (opsional)</label><input class="in" id="gm" maxlength="160" placeholder="Akrilik 8 mm, UV putih + warna"></div>
        </div>
      </div>
      <div class="err-text" id="gerr" role="alert"></div>
      <button class="btn" type="submit">Unggah karya</button>
    </form>
    <h3 class="mt2" style="margin-bottom:.75rem">Karya yang sudah ada (${g.items.length})</h3>
    ${g.items.length ? html`<div class="g-adm">${g.items.map((i) => html`<figure><img src="/api/media/${i.image_key}" alt="${i.title}" loading="lazy"><figcaption><b>${i.title}</b>${i.published ? '' : html` <span class="pill warn">tersembunyi</span>`}<br>
      <button class="linkbtn" style="color:var(--edge-d)" data-pub="${i.id}" data-v="${i.published ? 0 : 1}" type="button">${i.published ? 'Sembunyikan' : 'Tampilkan'}</button> ·
      <button class="linkbtn" data-del="${i.id}" type="button">Hapus</button> ·
      <button class="linkbtn" style="color:var(--edge-d)" data-copy="${location.origin}/g/${i.id}" type="button">Salin link</button></figcaption></figure>`)}</div>` : html`<div class="empty"><b>Belum ada karya</b>Unggah foto hasil produksi pertamamu di atas.</div>`}`);

    $('#gf').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.submitter; btn.disabled = true; $('#gerr').textContent = '';
      try {
        const photo = await prepPhoto($('#gfile').files[0], g.storage.gallery);
        const f = new FormData();
        f.set('file', photo); f.set('title', $('#gt').value); f.set('description', $('#gd').value);
        f.set('category', $('#gc').value); f.set('product_slug', $('#gp').value); f.set('material_note', $('#gm').value);
        await adm('/api/admin/gallery', { method: 'POST', body: f });
        toast('Karya ditambahkan.');
        tabGallery();
      } catch (err) { if (err.status !== 401) $('#gerr').textContent = err.message; btn.disabled = false; }
    };
    pane.onclick = async (e) => {
      const b = e.target.closest('button[data-pub],button[data-del],button[data-copy]');
      if (!b) return;
      try {
        if (b.dataset.copy) { await navigator.clipboard.writeText(b.dataset.copy); return toast('Link disalin.'); }
        if (b.dataset.del) {
          if (!confirm('Hapus karya ini? Foto ikut terhapus.')) return;
          await adm(`/api/admin/gallery/${b.dataset.del}`, { method: 'DELETE' });
        } else {
          await adm(`/api/admin/gallery/${b.dataset.pub}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ published: b.dataset.v === '1' }) });
        }
        tabGallery();
      } catch (err) { if (err.status !== 401) toast(err.message, 'bad'); }
    };
  } catch (e) { if (e.status !== 401) render(pane, errBox(e)); }
}

/* ---------- harga & info ---------- */
const SETTING_FIELDS = [
  ['shop_name', 'Nama usaha'], ['tagline', 'Slogan'], ['wa_number', 'Nomor WhatsApp toko (format 62…)'], ['address', 'Alamat / kota'],
  ['jam_layanan', 'Jam layanan'], ['bank_info', 'Info rekening pembayaran'], ['payment_note', 'Petunjuk pembayaran'],
  ['prod_time_note', 'Catatan estimasi produksi'], ['instagram', 'Link Instagram'], ['tiktok', 'Link TikTok'], ['maps_url', 'Link Google Maps'],
];
async function tabPrices() {
  const pane = $('#pane');
  render(pane, html`<p class="muted">Memuat…</p>`);
  try {
    const c = await adm('/api/admin/catalog');
    const tiers = c.tiers.length ? c.tiers : [];
    render(pane, html`
    ${c.demo ? html`<div class="note warn"><b>Harga masih contoh.</b> Situs menampilkan banner "mode uji" ke pengunjung sampai kamu mengisi harga sebenarnya lalu menekan <b>Simpan &amp; tandai harga final</b>.</div>` : ''}
    <form id="pf">
      <div class="box mt"><h3>Bahan akrilik (Rp per cm²)</h3><div class="scroll-x"><table class="tbl mt"><thead><tr><th>Tebal</th><th>Harga per cm²</th><th>Dijual</th></tr></thead><tbody>
        ${c.thicknesses.map((m) => html`<tr data-m="${m.thickness_mm}"><td>${cm(m.thickness_mm)} mm</td><td><input class="in" type="number" step="0.1" min="0" value="${m.price_per_cm2}" data-f="price"></td><td><input type="checkbox" data-f="active" ${m.active ? 'checked' : ''}></td></tr>`)}</tbody></table></div>
        <p class="hint">Contoh: lembar 3 mm seharga Rp300.000 berukuran 100×100 cm = 10.000 cm², jadi Rp30 per cm². Tambahkan margin dan sisa potong sesuai kebutuhan.</p></div>

      <div class="box mt"><h3>Cetak UV (Rp per cm²) dan potong</h3><div class="scroll-x"><table class="tbl mt"><thead><tr><th>Finishing</th><th>Harga per cm²</th><th>Dijual</th></tr></thead><tbody>
        ${c.finishes.map((f) => html`<tr data-fin="${f.code}"><td>${f.name}</td><td><input class="in" type="number" step="0.1" min="0" value="${f.uv_per_cm2}" data-f="price"></td><td><input type="checkbox" data-f="active" ${f.active ? 'checked' : ''}></td></tr>`)}</tbody></table></div>
        <div class="field mt"><label class="f" for="cut">Biaya potong (Rp per cm keliling)</label><input class="in" id="cut" type="number" step="0.1" min="0" value="${c.cutPerCm}" style="max-width:200px"></div></div>

      <div class="box mt"><h3>Tambahan (Rp per pcs)</h3><div class="scroll-x"><table class="tbl mt"><thead><tr><th>Tambahan</th><th>Harga</th><th>Dijual</th></tr></thead><tbody>
        ${c.extras.map((x) => html`<tr data-x="${x.code}"><td>${x.name}</td><td><input class="in" type="number" step="100" min="0" value="${x.price}" data-f="price"></td><td><input type="checkbox" data-f="active" ${x.active ? 'checked' : ''}></td></tr>`)}</tbody></table></div></div>

      <div class="box mt"><h3>Produk</h3><div class="scroll-x"><table class="tbl mt"><thead><tr><th>Produk</th><th>Harga minimum per pcs</th><th>Biaya setup desain</th><th>Dijual</th></tr></thead><tbody>
        ${c.products.map((p) => html`<tr data-p="${p.slug}"><td>${p.name}</td><td><input class="in" type="number" step="500" min="0" value="${p.min_price}" data-f="min"></td><td><input class="in" type="number" step="500" min="0" value="${p.setup_fee}" data-f="setup"></td><td><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''}></td></tr>`)}</tbody></table></div>
        <p class="hint">Harga minimum melindungi pesanan kecil agar tetap menguntungkan. Biaya setup dikenakan sekali per desain.</p></div>

      <div class="box mt"><h3>Diskon jumlah</h3><div id="tiers" class="mt">
        ${tiers.map((t) => html`<div class="dims tier" style="margin-bottom:.5rem"><input class="in" type="number" min="2" value="${t.min}" aria-label="Minimal pcs" data-f="min"><input class="in" type="number" min="0" max="50" value="${t.pct}" aria-label="Diskon persen" data-f="pct"></div>`)}</div>
        <p class="hint">Kolom kiri: minimal jumlah (pcs). Kolom kanan: diskon (%). Kosongkan keduanya untuk menghapus.</p>
        <button class="btn btn-line btn-sm" type="button" id="addTier">+ Tambah tingkat</button></div>

      <div class="box mt"><h3>Info toko</h3><div class="two" style="padding:0;gap:1rem">
        ${SETTING_FIELDS.map(([k, l]) => html`<div class="field"><label class="f" for="s_${k}">${l}</label><input class="in" id="s_${k}" data-s="${k}" value="${c.settings[k] || ''}"></div>`)}</div></div>

      <div class="err-text" id="perr" role="alert"></div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem">
        <button class="btn" type="submit" data-final="1">Simpan &amp; tandai harga final</button>
        <button class="btn btn-line" type="submit" data-final="0">Simpan saja</button>
      </div>
    </form>`);

    $('#addTier').onclick = () => {
      const d = document.createElement('div');
      d.className = 'dims tier'; d.style.marginBottom = '.5rem';
      d.innerHTML = '<input class="in" type="number" min="2" aria-label="Minimal pcs" data-f="min"><input class="in" type="number" min="0" max="50" aria-label="Diskon persen" data-f="pct">';
      $('#tiers').append(d);
    };
    $('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const final = e.submitter.dataset.final === '1';
      const val = (row, f) => row.querySelector(`[data-f="${f}"]`);
      const tierList = $$('.tier').map((r) => ({ min: Number(val(r, 'min').value), pct: Number(val(r, 'pct').value) })).filter((t) => val($$('.tier')[0], 'min') && t.min > 0);
      const settings = Object.fromEntries($$('[data-s]').map((i) => [i.dataset.s, i.value]));
      settings.cut_per_cm = $('#cut').value;
      settings.discount_tiers = JSON.stringify(tierList);
      const body = {
        materials: $$('[data-m]').map((r) => ({ thickness_mm: Number(r.dataset.m), price_per_cm2: val(r, 'price').value, active: val(r, 'active').checked })),
        finishes: $$('[data-fin]').map((r) => ({ code: r.dataset.fin, uv_per_cm2: val(r, 'price').value, active: val(r, 'active').checked })),
        extras: $$('[data-x]').map((r) => ({ code: r.dataset.x, price: val(r, 'price').value, active: val(r, 'active').checked })),
        products: $$('[data-p]').map((r) => ({ slug: r.dataset.p, min_price: val(r, 'min').value, setup_fee: val(r, 'setup').value, active: val(r, 'active').checked })),
        settings, confirm_prices: final,
      };
      $('#perr').textContent = '';
      try {
        await adm('/api/admin/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        toast(final ? 'Tersimpan. Harga ditandai final.' : 'Tersimpan.');
        tabPrices();
      } catch (err) { if (err.status !== 401) { $('#perr').textContent = err.message; $('#perr').scrollIntoView({ block: 'center' }); } }
    };
  } catch (e) { if (e.status !== 401) render(pane, errBox(e)); }
}

if (token) {
  api('/api/admin/summary', { headers: { authorization: 'Bearer ' + token } }).then(shell, () => login());
} else {
  login();
}
