import { handle, json, HttpError, rateLimit } from '../_lib/util.js';
import { limits, putFile, sniffOk, EXT_MIME, DESIGN_EXT, PROOF_EXT } from '../_lib/storage.js';

const mb = (n) => (n / 1024 / 1024).toFixed(1).replace('.', ',');

export const onRequestPost = handle(async ({ request, env }) => {
  await rateLimit(env, 'up', request, 30, 3600);
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
    throw new HttpError(400, 'Unggah file memakai form multipart.');
  }
  const lim = limits(env);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > Math.max(lim.design, lim.proof) + 200_000) {
    throw new HttpError(413, `File terlalu besar. Maksimal ${mb(lim.design)} MB.`);
  }

  const form = await request.formData();
  const file = form.get('file');
  const kind = form.get('kind') === 'proof' ? 'proof' : 'design';
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
    throw new HttpError(400, 'File tidak ditemukan.');
  }

  const name = String(file.name || 'file').slice(0, 120);
  const ext = (name.split('.').pop() || '').toLowerCase();
  const allowed = kind === 'proof' ? PROOF_EXT : DESIGN_EXT;
  if (!allowed.includes(ext)) {
    throw new HttpError(400, `Format .${ext} tidak didukung. Gunakan: ${allowed.join(', ')}.`);
  }
  if (file.size > lim[kind]) {
    const hint = lim.mode === 'd1' ? ' Kecilkan file, atau kirim desain lewat WhatsApp setelah memesan.' : '';
    throw new HttpError(413, `File terlalu besar (${mb(file.size)} MB). Maksimal ${mb(lim[kind])} MB.${hint}`);
  }

  const bytes = await file.arrayBuffer();
  if (!sniffOk(ext, bytes)) throw new HttpError(400, 'Isi file tidak cocok dengan ekstensinya.');

  const key = `${kind === 'proof' ? 'proofs' : 'designs'}/${crypto.randomUUID()}.${ext}`;
  await putFile(env, key, bytes, EXT_MIME[ext]);
  return json({ ok: true, key, name, size: file.size });
});
