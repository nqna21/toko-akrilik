import {
  mountLayout, api, html, render, $, rp, cm, computePrice, paneSVG, cart, lastOrder, toast, uploadFile, shrinkImage, waLink,
} from './app.js';

const mb = (n) => (n / 1048576).toFixed(1).replace('.', ',');

async function main() {
  const cat = await mountLayout('keranjang');
  const mount = $('#cMount');
  if (!cat) {
    render(mount, html`<div class="empty"><b>Keranjang belum bisa dimuat</b>Periksa koneksi internet, lalu <a href="">muat ulang halaman</a>.</div>`);
    return;
  }
  const form = { name: '', phone: '', email: '', delivery: 'ambil', address: '', city: '', note: '' };
  let busy = false;
  let formError = '';

  const lines = () =>
    cart.all().map((it) => {
      const r = computePrice(cat, it);
      const p = cat.products.find((x) => x.slug === it.slug);
      return { it, r, p };
    });

  function draw() {
    const ls = lines();
    if (!ls.length) {
      render(mount, html`<div class="empty"><b>Keranjang masih kosong</b>Pilih produk dulu, atur ukurannya, lalu tambahkan ke sini.<p class="mt"><a class="btn" href="/katalog.html">Lihat produk</a></p></div>`);
      return;
    }
    const bad = ls.some((l) => !l.r.ok);
    const subtotal = ls.reduce((s, l) => s + (l.r.ok ? l.r.total : 0), 0);

    render(mount, html`
    <div class="two">
      <div class="box">
        ${ls.map(({ it, r, p }) => html`
        <div class="row-item">
          <div class="th">${paneSVG(p ? p.kind : 'plakat')}</div>
          <div>
            <h3>${r.ok ? r.product : (p ? p.name : 'Produk tidak tersedia')}</h3>
            <div class="small muted">${cm(it.w)}×${cm(it.h)} cm · ${cm(it.thickness)} mm${r.ok ? html` · ${r.names.finish} · ${r.names.shape}` : ''}</div>
            ${r.ok && r.names.extras.length ? html`<div class="small muted">Tambahan: ${r.names.extras.join(', ')}</div>` : ''}
            <div class="small ${it.design_key ? '' : 'muted'}">${it.design_key ? html`Desain: ${it.design_name}` : it.design_later ? 'Desain dikirim lewat WhatsApp' : 'Tanpa file desain'}</div>
            ${it.note ? html`<div class="small muted">Catatan: ${it.note}</div>` : ''}
            ${r.ok ? '' : html`<div class="note bad">${r.error} Hapus item ini lalu pesan ulang.</div>`}
            <div class="mt" style="display:flex;gap:1rem;align-items:center">
              <span class="qty"><button type="button" data-act="dec" data-id="${it.id}" aria-label="Kurangi jumlah">−</button><input data-act="qty" data-id="${it.id}" type="number" min="1" value="${it.qty}" aria-label="Jumlah"><button type="button" data-act="inc" data-id="${it.id}" aria-label="Tambah jumlah">+</button></span>
              <button class="linkbtn" type="button" data-act="rm" data-id="${it.id}">Hapus</button>
            </div>
          </div>
          <div class="rt"><b>${r.ok ? rp(r.total) : '–'}</b>${r.ok && r.discount ? html`<div class="small muted">hemat ${rp(r.discount)}</div>` : ''}</div>
        </div>`)}
        <p class="mt"><a href="/katalog.html">+ Tambah produk lain</a></p>
      </div>

      <form class="box" id="co" novalidate>
        <h3 style="margin-bottom:1rem">Data pemesan</h3>
        <div class="field"><label class="f" for="name">Nama lengkap</label><input class="in" id="name" name="name" autocomplete="name" value="${form.name}" required></div>
        <div class="field"><label class="f" for="phone">Nomor WhatsApp</label><input class="in" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812 3456 7890" value="${form.phone}" required>
          <div class="hint">Dipakai untuk konfirmasi pesanan dan untuk melacak status.</div></div>
        <div class="field"><label class="f" for="email">Email (opsional)</label><input class="in" id="email" name="email" type="email" autocomplete="email" value="${form.email}"></div>
        <fieldset class="stp" style="margin-bottom:1rem"><legend style="font-size:.92rem">Pengambilan</legend>
          <label class="opt"><input type="radio" name="delivery" value="ambil" ${form.delivery === 'ambil' ? 'checked' : ''}><span><b>Ambil sendiri</b>${cat.settings.address ? html`<small>${cat.settings.address}</small>` : ''}</span></label>
          <label class="opt"><input type="radio" name="delivery" value="kirim" ${form.delivery === 'kirim' ? 'checked' : ''}><span><b>Dikirim</b><small>Ongkir dikonfirmasi admin setelah pesanan masuk.</small></span></label>
        </fieldset>
        ${form.delivery === 'kirim' ? html`
          <div class="field"><label class="f" for="address">Alamat lengkap</label><textarea class="in" id="address" name="address" autocomplete="street-address">${form.address}</textarea></div>
          <div class="field"><label class="f" for="city">Kota / kecamatan</label><input class="in" id="city" name="city" value="${form.city}"></div>` : ''}
        <div class="field"><label class="f" for="cnote">Catatan pesanan (opsional)</label><textarea class="in" id="cnote" name="note" maxlength="500">${form.note}</textarea></div>
        <input type="text" name="hp" id="hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;height:0">

        <div class="sum-row"><span>Subtotal</span><span>${rp(subtotal)}</span></div>
        ${form.delivery === 'kirim' ? html`<div class="sum-row muted"><span>Ongkir</span><span>menyusul</span></div>` : ''}
        <div class="sum-row t"><span>Total</span><span>${rp(subtotal)}</span></div>
        <div class="err-text" id="coErr" role="alert">${formError}</div>
        <button class="btn btn-block" type="submit" ${busy || bad ? 'disabled' : ''}>${busy ? html`<span class="spin"></span> Mengirim pesanan…` : 'Buat pesanan'}</button>
        <p class="hint mt">Setelah pesanan dibuat, kamu mendapat kode pesanan dan info pembayaran.</p>
      </form>
    </div>`);
  }

  /* ----- interaksi keranjang ----- */
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const id = b.dataset.id;
    const it = cart.all().find((x) => x.id === id);
    if (!it) return;
    keep();
    if (b.dataset.act === 'rm') cart.remove(id);
    if (b.dataset.act === 'inc') cart.update(id, { qty: Math.min(it.qty + 1, 1000) });
    if (b.dataset.act === 'dec') cart.update(id, { qty: Math.max(it.qty - 1, 1) });
    draw();
  });
  mount.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'qty') {
      keep();
      cart.update(t.dataset.id, { qty: Math.min(Math.max(parseInt(t.value, 10) || 1, 1), 1000) });
      draw();
    } else if (t.name === 'delivery') {
      keep();
      form.delivery = t.value;
      draw();
    }
  });
  function keep() {
    const f = $('#co');
    if (!f) return;
    for (const k of ['name', 'phone', 'email', 'address', 'city', 'note']) if (f.elements[k]) form[k] = f.elements[k].value;
  }

  /* ----- kirim pesanan ----- */
  mount.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    keep();
    const f = $('#co');
    if (f.elements.hp.value) return;
    formError = '';
    if (form.name.trim().length < 2) return fail('Isi nama lengkap.', 'name');
    if (form.phone.replace(/\D/g, '').length < 9) return fail('Isi nomor WhatsApp yang benar, contoh 0812 3456 7890.', 'phone');
    if (form.delivery === 'kirim' && form.address.trim().length < 8) return fail('Isi alamat pengiriman lengkap.', 'address');

    busy = true; draw();
    try {
      const items = cart.all().map((i) => ({
        slug: i.slug, w: i.w, h: i.h, thickness: i.thickness, finish: i.finish, shape: i.shape, extras: i.extras,
        qty: i.qty, design_key: i.design_key || undefined, design_name: i.design_name || undefined, note: i.note || undefined,
      }));
      const later = cart.all().filter((i) => i.design_later);
      const r = await api('/api/orders', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer: { ...form }, items, hp: '' }),
      });
      lastOrder.set(r.code, r.track_key);
      cart.clear();
      busy = false;
      done(r, later.length > 0);
    } catch (err) {
      busy = false;
      formError = err.message;
      draw();
      $('#coErr').scrollIntoView({ block: 'center' });
    }
  });
  function fail(msg, field) {
    formError = msg;
    draw();
    const el = $('#' + field);
    if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
  }

  /* ----- pesanan berhasil ----- */
  function done(r, needDesignViaWa) {
    const s = cat.settings;
    const wa = s.wa_number ? waLink(s.wa_number, `Halo ${s.shop_name || ''}, saya sudah membuat pesanan ${r.code}.`) : '';
    render(mount, html`
    <div class="box done">
      <h2>Pesanan dibuat. Terima kasih!</h2>
      <p class="muted">Kode pesanan kamu (simpan untuk melacak):</p>
      <div class="code" id="code">${r.code}</div>
      <p><b>Total ${rp(r.total)}</b>${r.delivery === 'kirim' ? ' + ongkir (dikonfirmasi admin)' : ''}</p>
    </div>
    <div class="two mt">
      <div class="box">
        <h3>1. Transfer pembayaran</h3>
        <p class="mt"><b>${s.bank_info || 'Info rekening belum diisi. Hubungi kami lewat WhatsApp.'}</b></p>
        <p class="muted">${s.payment_note || ''}</p>
        <h3 class="mt2">2. Unggah bukti pembayaran</h3>
        <div id="proofBox" class="mt"></div>
      </div>
      <div class="box">
        <h3>3. Pantau pesanan</h3>
        <p class="muted">${s.prod_time_note || ''}</p>
        ${needDesignViaWa ? html`<div class="note warn">Ada item yang desainnya belum diunggah. Kirim file lewat WhatsApp dan sebutkan kode ${r.code}.</div>` : ''}
        <div style="display:grid;gap:.6rem;margin-top:1rem">
          <a class="btn" href="/lacak.html?c=${r.code}">Lacak pesanan</a>
          ${wa ? html`<a class="btn btn-wa" href="${wa}" rel="noopener">Konfirmasi lewat WhatsApp</a>` : ''}
          <a class="btn btn-line" href="/katalog.html">Belanja lagi</a>
        </div>
      </div>
    </div>`);
    drawProof(r);
  }
  function drawProof(r, msg = '', ok = false) {
    const box = $('#proofBox');
    if (ok) { render(box, html`<div class="note">Bukti pembayaran terkirim. Kami akan memverifikasinya.</div>`); return; }
    render(box, html`<label class="drop"><input type="file" id="proof" accept=".png,.jpg,.jpeg,.webp,.pdf"><b>Pilih foto atau PDF bukti transfer</b></label><div class="err-text" role="alert">${msg}</div>`);
    $('#proof').onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      render(box, html`<div class="drop on"><span class="spin"></span> Mengunggah bukti…</div>`);
      try {
        const lim = cat.storage.proof;
        const { file: f } = await shrinkImage(file, lim);
        if (f.size > lim) throw new Error(`File terlalu besar (maks ${mb(lim)} MB).`);
        const up = await uploadFile(f, 'proof');
        await api('/api/proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: r.code, p: r.track_key, key: up.key }) });
        drawProof(r, '', true);
      } catch (err) {
        drawProof(r, err.message);
      }
    };
  }

  draw();
}
main();
