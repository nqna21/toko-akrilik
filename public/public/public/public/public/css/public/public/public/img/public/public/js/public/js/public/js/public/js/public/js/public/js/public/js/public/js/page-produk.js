import {
  mountLayout, api, html, raw, render, $, $$, rp, cm, computePrice, dimSVG, esc, cart, toast,
  shrinkImage, uploadFile, waLink,
} from './app.js';

const mb = (n) => (n / 1048576).toFixed(1).replace('.', ',');

async function main() {
  const cat = await mountLayout('produk');
  const mount = $('#pMount');
  const qs = new URLSearchParams(location.search);
  const p = cat && cat.products.find((x) => x.slug === qs.get('slug'));
  if (!p) {
    render(mount, html`<div class="empty"><b>Produk tidak ditemukan</b>Produk ini mungkin sudah tidak dijual.<p class="mt"><a class="btn" href="/katalog.html">Lihat semua produk</a></p></div>`);
    return;
  }
  document.title = `${p.name} · ${cat.settings.shop_name || ''}`;
  $('#crumbNow').textContent = p.name;

  const num = (v, d) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  const thick = p.thickness_options.filter((t) => cat.thicknesses.some((m) => m.thickness_mm === t));
  const fins = cat.finishes.filter((f) => p.finish_options.includes(f.code));
  const shapes = cat.shapes.filter((s) => p.shape_options.includes(s.code));
  const exts = cat.extras.filter((e) => p.extra_options.includes(e.code));
  const lim = cat.storage.design;

  const st = {
    w: num(qs.get('w'), p.default_w),
    h: num(qs.get('h'), p.default_h),
    thickness: thick.includes(num(qs.get('t'), -1)) ? num(qs.get('t'), -1) : thick.includes(p.default_thickness) ? p.default_thickness : thick[0],
    finish: fins.some((f) => f.code === qs.get('f')) ? qs.get('f') : (fins.find((f) => f.code === 'uv_warna') || fins[0] || {}).code,
    shape: shapes.some((s) => s.code === qs.get('s')) ? qs.get('s') : (shapes[0] || {}).code,
    extras: new Set(),
    qty: 1,
    note: '',
    design: null,
    later: false,
    busy: false,
  };

  render(mount, html`
  <div class="cfg">
    <div class="cfg-left">
      <div class="pane cfg-view"><div class="est-view" id="view"></div>
        <p class="hint" id="viewHint">Pratinjau berskala. Garis putus-putus merah muda menunjukkan jalur potong.</p></div>
      <div id="related" class="mt2"></div>
    </div>
    <div>
      <h1>${p.name}</h1>
      <p class="muted">${p.description}</p>
      <p class="small"><button class="linkbtn" style="color:var(--edge-d)" id="share" type="button">Bagikan produk ini</button></p>

      <fieldset class="stp"><legend><i>1</i>Ukuran</legend>
        <div class="dims">
          <div><label class="f" for="w">Lebar (cm)</label><input class="in" id="w" type="number" inputmode="decimal" step="0.5" min="${p.min_w}" max="${p.max_w}" value="${st.w}"></div>
          <div><label class="f" for="h">Tinggi (cm)</label><input class="in" id="h" type="number" inputmode="decimal" step="0.5" min="${p.min_h}" max="${p.max_h}" value="${st.h}"></div>
        </div>
        <div class="hint">Lebar ${cm(p.min_w)}–${cm(p.max_w)} cm, tinggi ${cm(p.min_h)}–${cm(p.max_h)} cm.</div>
        <div class="err-text" id="sizeErr" role="alert"></div>
      </fieldset>

      <fieldset class="stp"><legend><i>2</i>Tebal akrilik</legend>
        <div class="chips">${thick.map((t) => html`<label class="chip"><input type="radio" name="t" value="${t}" ${t === st.thickness ? 'checked' : ''}><span>${cm(t)} mm</span></label>`)}</div>
      </fieldset>

      <fieldset class="stp"><legend><i>3</i>Bentuk potongan</legend>
        ${shapes.map((s) => html`<label class="opt"><input type="radio" name="s" value="${s.code}" ${s.code === st.shape ? 'checked' : ''}><span><b>${s.name}</b><small>${s.description}</small></span></label>`)}
      </fieldset>

      <fieldset class="stp"><legend><i>4</i>Finishing cetak</legend>
        ${fins.map((f) => html`<label class="opt"><input type="radio" name="f" value="${f.code}" ${f.code === st.finish ? 'checked' : ''}><span><b>${f.name}</b><small>${f.description}</small></span></label>`)}
      </fieldset>

      ${exts.length ? html`<fieldset class="stp"><legend><i>5</i>Tambahan <span class="muted small" style="font-weight:400">(opsional, per pcs)</span></legend>
        <div class="chips">${exts.map((e) => html`<label class="chip"><input type="checkbox" name="x" value="${e.code}"><span>${e.name} +${rp(e.price)}</span></label>`)}</div></fieldset>` : ''}

      <fieldset class="stp"><legend><i>${exts.length ? 6 : 5}</i>Desain</legend>
        <div id="designBox"></div>
        <label style="display:flex;gap:.5rem;align-items:center;margin-top:.75rem"><input type="checkbox" id="later"> Saya kirim desain lewat WhatsApp setelah memesan</label>
        <div class="hint">Format: PNG, JPG, WEBP, PDF, SVG, AI, EPS, CDR, DXF, ZIP. Maksimal ${mb(lim)} MB${cat.storage.mode === 'd1' ? ' (foto besar dikecilkan otomatis)' : ''}.</div>
        <div class="err-text" id="designErr" role="alert"></div>
      </fieldset>

      <fieldset class="stp"><legend><i>${exts.length ? 7 : 6}</i>Jumlah dan catatan</legend>
        <div class="dims">
          <div><label class="f" for="qty">Jumlah (pcs)</label><input class="in" id="qty" type="number" inputmode="numeric" min="1" max="${p.max_qty}" step="1" value="1"></div>
        </div>
        <div class="field mt"><label class="f" for="note">Catatan untuk kami (opsional)</label><textarea class="in" id="note" maxlength="300" placeholder="Contoh: warna dasar biru tua, tulisan di tengah"></textarea></div>
      </fieldset>

      <div class="pane pricebox" id="price" aria-live="polite"></div>
    </div>
  </div>`);

  /* ----- pratinjau & harga ----- */
  const read = () => ({ slug: p.slug, w: st.w, h: st.h, thickness: st.thickness, finish: st.finish, shape: st.shape, extras: [...st.extras], qty: st.qty });
  const needsDesign = () => st.finish !== 'polos' || st.shape === 'kontur';

  function update() {
    render($('#view'), dimSVG(st.w, st.h, st.shape === 'bulat' ? 'bulat' : 'kotak'));
    const r = computePrice(cat, read());
    const el = $('#price');
    if (!r.ok) {
      render(el, html`<div class="note bad">${r.error}</div><button class="btn btn-block" disabled>Tambah ke keranjang</button>`);
      $('#sizeErr').textContent = r.field === 'w' || r.field === 'h' ? r.error : '';
      return;
    }
    $('#sizeErr').textContent = '';
    const nextTier = cat.tiers.find((t) => t.min > r.qty);
    const wa = cat.settings.wa_number
      ? waLink(cat.settings.wa_number, `Halo, saya mau tanya ${p.name} ukuran ${cm(st.w)}×${cm(st.h)} cm, ${cm(st.thickness)} mm, ${r.names.finish}, ${r.qty} pcs.`)
      : '';
    render(el, html`
      <div class="muted small">Harga per pcs</div>
      <div class="total">${rp(r.unit)}</div>
      <table class="brk">
        <tr><td>Bahan akrilik ${cm(st.thickness)} mm</td><td>${rp(r.parts.material)}</td></tr>
        ${r.parts.uv ? html`<tr><td>${r.names.finish}</td><td>${rp(r.parts.uv)}</td></tr>` : ''}
        <tr><td>Potong${r.estimated ? ' (perkiraan)' : ''}</td><td>${rp(r.parts.cut)}</td></tr>
        ${r.parts.extras ? html`<tr><td>Tambahan</td><td>${rp(r.parts.extras)}</td></tr>` : ''}
        ${r.minApplied ? html`<tr><td colspan="2" class="muted small">Harga minimum produk berlaku.</td></tr>` : ''}
        <tr class="sum"><td>${r.qty} pcs</td><td>${rp(r.gross)}</td></tr>
        ${r.discount ? html`<tr><td>Diskon jumlah ${r.discountPct}%</td><td>−${rp(r.discount)}</td></tr>` : ''}
        ${r.setup ? html`<tr><td>Biaya setup desain (sekali)</td><td>${rp(r.setup)}</td></tr>` : ''}
        <tr class="sum"><td>Total</td><td>${rp(r.total)}</td></tr>
      </table>
      ${nextTier ? html`<div class="note">Pesan ${nextTier.min} pcs atau lebih, diskon ${nextTier.pct}%.</div>` : ''}
      ${r.estimated ? html`<div class="note warn">Bentuk mengikuti kontur: biaya potong adalah perkiraan dan dikonfirmasi saat file diverifikasi.</div>` : ''}
      <div style="display:grid;gap:.6rem;margin-top:1rem">
        <button class="btn btn-block" id="buy" type="button">Pesan sekarang</button>
        <button class="btn btn-line btn-block" id="add" type="button">Tambah ke keranjang</button>
        ${wa ? html`<a class="btn btn-soft btn-block" href="${wa}" rel="noopener">Tanya lewat WhatsApp</a>` : ''}
      </div>`);
    $('#buy').onclick = () => addToCart(true);
    $('#add').onclick = () => addToCart(false);
  }

  function addToCart(go) {
    const r = computePrice(cat, read());
    if (!r.ok) return toast(r.error, 'bad');
    if (st.busy) return toast('Tunggu sampai desain selesai diunggah.', 'bad');
    if (needsDesign() && !st.design && !st.later) {
      $('#designErr').textContent = 'Unggah desain, atau centang "kirim lewat WhatsApp".';
      $('#designBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    cart.add({
      ...r.normalized, note: st.note.trim(),
      design_key: st.design ? st.design.key : null,
      design_name: st.design ? st.design.name : null,
      design_later: !st.design && st.later,
    });
    if (go) location.href = '/keranjang.html';
    else toast('Ditambahkan ke keranjang.');
  }

  /* ----- unggah desain ----- */
  function drawDesign(msg = '') {
    const box = $('#designBox');
    if (st.busy) {
      render(box, html`<div class="drop on"><span class="spin"></span> Mengunggah desain…</div>`);
    } else if (st.design) {
      render(box, html`<div class="filebox"><span><b>${st.design.name}</b><br><small class="muted">${st.design.shrunk ? 'Dikecilkan otomatis agar bisa diunggah. Kirim file asli lewat WhatsApp bila perlu resolusi penuh.' : 'Siap dikirim bersama pesanan.'}</small></span><button type="button" class="linkbtn" id="rmDesign">Ganti</button></div>`);
      $('#rmDesign').onclick = () => { st.design = null; drawDesign(); };
    } else {
      render(box, html`<label class="drop" id="drop"><input type="file" id="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.ai,.eps,.cdr,.dxf,.zip"><b>Pilih file desain</b><br><span class="small">atau tarik file ke sini</span></label>`);
      const input = $('#file'), drop = $('#drop');
      input.onchange = () => input.files[0] && onFile(input.files[0]);
      ['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('on'); }));
      ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('on'); }));
      drop.addEventListener('drop', (ev) => ev.dataTransfer.files[0] && onFile(ev.dataTransfer.files[0]));
    }
    $('#designErr').textContent = msg;
  }
  async function onFile(file) {
    st.busy = true; drawDesign();
    try {
      const { file: f, shrunk } = await shrinkImage(file, lim);
      if (f.size > lim) throw new Error(`File terlalu besar (${mb(f.size)} MB, maksimal ${mb(lim)} MB). Pilih "kirim lewat WhatsApp" di bawah.`);
      const r = await uploadFile(f, 'design');
      st.design = { key: r.key, name: r.name, shrunk };
      st.busy = false; drawDesign();
    } catch (e) {
      st.busy = false; drawDesign(e.message);
    }
  }

  /* ----- event ----- */
  mount.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'w') st.w = t.value;
    else if (t.id === 'h') st.h = t.value;
    else if (t.id === 'qty') st.qty = t.value === '' ? NaN : Number(t.value);
    else if (t.id === 'note') { st.note = t.value; return; }
    else return;
    update();
  });
  mount.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 't') st.thickness = Number(t.value);
    else if (t.name === 's') st.shape = t.value;
    else if (t.name === 'f') st.finish = t.value;
    else if (t.name === 'x') { t.checked ? st.extras.add(t.value) : st.extras.delete(t.value); }
    else if (t.id === 'later') { st.later = t.checked; $('#designErr').textContent = ''; return; }
    else return;
    update();
  });
  $('#share').onclick = async () => {
    const url = `${location.origin}/p/${p.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else { await navigator.clipboard.writeText(url); toast('Link produk disalin.'); }
    } catch { /* dibatalkan */ }
  };

  drawDesign();
  update();

  /* ----- karya serupa ----- */
  try {
    const g = await api(`/api/gallery?product=${encodeURIComponent(p.slug)}&limit=6`);
    if (g.items.length) {
      render($('#related'), html`<h2 style="font-size:1.1rem;margin-bottom:.6rem">Hasil karya serupa</h2>
        <div class="strip" style="grid-auto-columns:minmax(120px,30%)">${g.items.map((i) => html`<a href="/galeri.html?id=${i.id}" aria-label="${i.title}"><img src="/api/media/${i.image_key}" alt="${i.title}" loading="lazy"></a>`)}</div>`);
    }
  } catch { /* abaikan */ }
}
main();
