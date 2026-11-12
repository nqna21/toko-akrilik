import { rupiah } from './util.js';

// Susun teks notifikasi (satu tempat, dipakai Windmill maupun Telegram langsung).
export function messageFor(event, d, env) {
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
export async function notify(env, event, data) {
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
