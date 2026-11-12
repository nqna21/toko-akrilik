-- Data awal. SEMUA HARGA DI SINI ADALAH CONTOH, bukan harga nyata.
-- Ubah lewat admin.html > tab "Harga & info", lalu klik "Simpan & tandai harga final".
-- Selama belum disimpan dari admin, situs menampilkan banner "mode uji" ke pengunjung.
-- Aman dijalankan berulang (INSERT OR IGNORE).

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('shop_name',      'Akrilik Studio'),
  ('tagline',        'Cetak UV dan potong akrilik sesuai desainmu'),
  ('wa_number',      '6281234567890'),
  ('address',        'Tangerang, Banten'),
  ('jam_layanan',    'Senin–Sabtu, 09.00–17.00'),
  ('bank_info',      'BCA 0000000000 a.n. NAMA PEMILIK'),
  ('payment_note',   'Transfer sesuai total pesanan, lalu unggah bukti pembayaran di halaman Lacak Pesanan.'),
  ('prod_time_note', 'Estimasi waktu produksi dikonfirmasi admin saat pembayaran diverifikasi.'),
  ('instagram',      ''),
  ('tiktok',         ''),
  ('maps_url',       ''),
  ('cut_per_cm',     '2'),
  ('discount_tiers', '[{"min":10,"pct":5},{"min":50,"pct":10},{"min":100,"pct":15}]'),
  ('prices_confirmed', '0');

-- Harga bahan per cm² (contoh)
INSERT OR IGNORE INTO materials (thickness_mm, price_per_cm2) VALUES
  (2, 7), (3, 10), (5, 16), (8, 26), (10, 33);

-- Finishing cetak UV, biaya per cm² (contoh)
INSERT OR IGNORE INTO finishes (code, name, description, uv_per_cm2, sort) VALUES
  ('polos',      'Tanpa cetak',               'Akrilik bening atau warna polos, hanya dipotong.',           0,  1),
  ('uv_warna',   'Cetak UV warna',            'Cetak full color langsung di permukaan akrilik.',            6,  2),
  ('uv_putih',   'Cetak UV warna + putih',    'Ada lapisan putih supaya warna tetap pekat di akrilik bening.', 9, 3),
  ('uv_varnish', 'Cetak UV + varnish timbul', 'Lapisan varnish bertekstur pada bagian tertentu.',          14, 4);

-- Bentuk potongan. factor = pengali keliling; estimated = 1 berarti harga potong diperkirakan.
INSERT OR IGNORE INTO shapes (code, name, description, kind, factor, estimated, sort) VALUES
  ('kotak',  'Persegi / persegi panjang', 'Potongan lurus mengikuti ukuran.',                   'rect',    1,   0, 1),
  ('bulat',  'Bulat / oval',              'Isi lebar dan tinggi yang sama untuk lingkaran.',     'ellipse', 1,   0, 2),
  ('kontur', 'Mengikuti kontur desain',   'Dipotong mengikuti garis desain. Biaya potong diperkirakan, dikonfirmasi saat verifikasi file.', 'rect', 1.4, 1, 3);

-- Tambahan per pcs (contoh)
INSERT OR IGNORE INTO extras (code, name, description, price, sort) VALUES
  ('lubang',   'Lubang gantung',     'Lubang untuk tali atau paku.',        500, 1),
  ('ring',     'Ring kunci',         'Ring besi untuk gantungan kunci.',    800, 2),
  ('kaki',     'Kaki penyangga',     'Penyangga akrilik agar bisa berdiri.', 3000, 3),
  ('double',   'Double tape / 3M',   'Perekat di bagian belakang.',         1000, 4);

-- Produk
INSERT OR IGNORE INTO products
 (slug, name, category, kind, description, min_w, max_w, min_h, max_h, default_w, default_h,
  thickness_options, default_thickness, finish_options, shape_options, extra_options, min_price, setup_fee, sort)
VALUES
 ('plakat-akrilik', 'Plakat Akrilik', 'Plakat & Penghargaan', 'plakat',
  'Plakat penghargaan dan kenang-kenangan dengan cetak UV di permukaan akrilik.',
  10, 60, 10, 80, 20, 30,
  '[5,8,10]', 8, '["uv_warna","uv_putih","uv_varnish"]', '["kotak","bulat","kontur"]', '["double","kaki"]', 45000, 0, 1),

 ('papan-nama-meja', 'Papan Nama Meja', 'Plakat & Penghargaan', 'nama',
  'Papan nama untuk meja kerja, resepsionis, atau meja acara.',
  10, 40, 4, 15, 20, 6,
  '[3,5]', 3, '["polos","uv_warna","uv_putih"]', '["kotak","kontur"]', '["kaki","double"]', 20000, 0, 2),

 ('signage-akrilik', 'Signage & Papan Petunjuk', 'Signage & Papan Nama', 'signage',
  'Papan nama usaha, petunjuk ruangan, dan penanda area dari akrilik.',
  10, 120, 10, 120, 40, 20,
  '[3,5,8]', 5, '["polos","uv_warna","uv_putih"]', '["kotak","bulat","kontur"]', '["lubang","double"]', 30000, 0, 3),

 ('ganci-akrilik', 'Gantungan Kunci Akrilik', 'Gantungan Kunci & Merchandise', 'ganci',
  'Gantungan kunci dan merchandise kecil, cocok untuk pesanan banyak.',
  2, 12, 2, 12, 5, 5,
  '[2,3]', 3, '["uv_warna","uv_putih"]', '["kotak","bulat","kontur"]', '["lubang","ring"]', 3000, 25000, 4),

 ('tent-card', 'Tent Card & Menu Stand', 'Display & Stand', 'tent',
  'Kartu meja untuk menu, promo, atau nomor meja.',
  5, 30, 5, 30, 10, 15,
  '[3,5]', 3, '["polos","uv_warna","uv_putih"]', '["kotak","kontur"]', '["kaki"]', 8000, 15000, 5),

 ('display-akrilik', 'Display Produk Akrilik', 'Display & Stand', 'display',
  'Rak dan stand kecil untuk memajang produk.',
  5, 60, 5, 60, 15, 15,
  '[3,5,8]', 5, '["polos","uv_warna","uv_putih"]', '["kotak","kontur"]', '["kaki","double"]', 25000, 20000, 6),

 ('potong-custom', 'Potong Akrilik Custom', 'Custom Potong', 'custom',
  'Kirim file desain dan kami potong akrilik sesuai garis potong, dengan atau tanpa cetak.',
  2, 120, 2, 120, 20, 20,
  '[2,3,5,8,10]', 3, '["polos","uv_warna","uv_putih","uv_varnish"]', '["kotak","bulat","kontur"]', '["lubang","ring","kaki","double"]', 10000, 15000, 7);
