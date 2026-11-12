import {
  mountLayout, api, html, render, $, rp, cm, fmtDate, STATUS_FLOW, STATUS, lastOrder, uploadFile, shrinkImage, waLink,
} from './app.js';

async function main() {
  const cat = await mountLayout('lacak');
  const qs = new URLSearchParams(location.search);
  const last = lastOrder.get();
  $('#tCode').value = (qs.get('c') || (last && last.code) || '').toUpperCase();
  $('#tP').value = (qs.get('c') ? (last && last.code === qs.get('c').toUpperCase() ? last.p : '') : (last && last.p) || '') || '';

  const out = $('#tOut');
  async function lookup(code, p) {
    $('#tErr').textContent = '';
    render(out, html`<div class="box"><span class="spin"></span> Mencari pesanan…</div>`);
    try {
      const d = await api(`/api/track?code=${encodeURIComponent(code)}&p=${encodeURIComponent(p)}`);
      show(d.order, code, p);
    } catch (e) {
      render(out, html`<div class="empty"><b>Pesanan tidak ditemukan</b>${e.message}</div>`);
      $('#tErr').textContent = e.status === 404 || e.status === 429 ? e.message : '';
    }
  }

  function show(o, code, p) {
    const s = (cat && cat.settings) || {};
    const have = new Map(o.events.map((e) => [e.status, e]));
    const flow = STATUS_FLOW.filter((k) => k !== 'dikirim' || o.delivery === 'kirim');
    const curIdx = flow.indexOf(o.status);
    const cancelled = o.status === 'dibatalkan';
    const pillClass = cancelled ? 'bad' : o.status === 'selesai' ? 'ok' : ['menunggu_pembayaran', 'menunggu_verifikasi'].includes(o.status) ? 'warn' : '';
    const unpaid = ['menunggu_pembayaran', 'menunggu_verifikasi'].includes(o.status);
    const wa = s.wa_number ? waLink(s.wa_number, `Halo, saya mau tanya pesanan ${o.code}.`) : '';

    render(out, html`
    <div class="box">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center">
        <div><div class="muted small">Pesanan</div><b style="font:800 1.4rem var(--f-display)">${o.code}</b></div>
        <span class="pill ${pillClass}">${o.status_label}</span>
      </div>
      <p class="muted small mt">Dibuat ${fmtDate(o.created_at)} · atas nama ${o.customer}</p>

      ${cancelled ? html`<div class="note bad">Pesanan ini dibatalkan. Hubungi kami jika ini tidak sesuai.</div>` : html`
      <ol class="tl">${flow.map((k, i) => {
        const e = have.get(k);
        const on = i <= curIdx;
        return html`<li class="${on ? 'on' : ''} ${i === curIdx ? 'now' : ''}"><b>${STATUS[k]}</b>${e ? html`<span class="small">${fmtDate(e.at)}${e.note ? ' · ' + e.note : ''}</span>` : ''}</li>`;
      })}</ol>`}
      ${o.tracking_no ? html`<div class="note">Nomor resi / pengiriman: <b>${o.tracking_no}</b></div>` : ''}

      <h3 class="mt2" style="margin-bottom:.5rem">Isi pesanan</h3>
      ${o.items.map((i) => html`<div class="sum-row"><span>${i.qty}× ${i.name}<br><small class="muted">${cm(i.w)}×${cm(i.h)} cm · ${cm(i.thickness)} mm · ${i.finish}</small></span><span>${rp(i.line_total)}</span></div>`)}
      <div class="sum-row"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>
      ${o.delivery === 'kirim' ? html`<div class="sum-row"><span>Ongkir</span><span>${o.shipping_fee ? rp(o.shipping_fee) : 'menunggu konfirmasi'}</span></div>` : ''}
      <div class="sum-row t"><span>Total</span><span>${rp(o.total)}</span></div>

      ${unpaid && !cancelled ? html`
      <h3 class="mt2">${o.has_proof ? 'Bukti pembayaran terkirim' : 'Pembayaran'}</h3>
      <p class="mt"><b>${s.bank_info || ''}</b></p>
      ${o.has_proof ? html`<div class="note">Bukti sudah kami terima dan sedang diverifikasi. Kamu bisa mengunggah ulang bila salah file.</div>` : html`<p class="muted">${s.payment_note || ''}</p>`}
      <div id="proofBox" class="mt"></div>` : ''}
      ${wa ? html`<p class="mt2"><a class="btn btn-soft" href="${wa}" rel="noopener">Tanya lewat WhatsApp</a></p>` : ''}
    </div>`);

    if (unpaid && !cancelled) drawProof(code, p);
  }

  function drawProof(code, p, msg = '') {
    const box = $('#proofBox');
    if (!box) return;
    render(box, html`<label class="drop"><input type="file" id="proof" accept=".png,.jpg,.jpeg,.webp,.pdf"><b>Pilih foto atau PDF bukti transfer</b></label><div class="err-text" role="alert">${msg}</div>`);
    $('#proof').onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      render(box, html`<div class="drop on"><span class="spin"></span> Mengunggah bukti…</div>`);
      try {
        const lim = cat.storage.proof;
        const { file: f } = await shrinkImage(file, lim);
        if (f.size > lim) throw new Error(`File terlalu besar (maks ${(lim / 1048576).toFixed(1)} MB).`);
        const up = await uploadFile(f, 'proof');
        await api('/api/proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, p, key: up.key }) });
        lookup(code, p);
      } catch (err) {
        drawProof(code, p, err.message);
      }
    };
  }

  $('#tForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#tCode').value.trim().toUpperCase();
    const p = $('#tP').value.replace(/\D/g, '').slice(-4);
    if (!code || p.length !== 4) {
      $('#tErr').textContent = 'Isi kode pesanan dan 4 digit terakhir nomor WhatsApp.';
      return;
    }
    lookup(code, p);
  });
  if ($('#tCode').value && $('#tP').value.length === 4) lookup($('#tCode').value.trim(), $('#tP').value);
}
main();
