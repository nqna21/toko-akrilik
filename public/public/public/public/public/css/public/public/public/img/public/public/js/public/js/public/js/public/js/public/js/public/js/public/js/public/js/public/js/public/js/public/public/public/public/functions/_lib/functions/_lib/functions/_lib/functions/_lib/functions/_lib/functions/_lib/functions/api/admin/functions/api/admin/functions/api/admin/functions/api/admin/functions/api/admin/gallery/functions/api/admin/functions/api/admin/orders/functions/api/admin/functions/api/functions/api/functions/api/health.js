import { handle, json } from '../_lib/util.js';

// Buka /api/health setelah deploy untuk memeriksa semua pengaturan Cloudflare.
export const onRequestGet = handle(async ({ env }) => {
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
