// Urutan status pesanan dan labelnya. Dipakai server dan (disalin ringkas) di public/js/app.js.
export const STATUS = {
  menunggu_pembayaran: 'Menunggu pembayaran',
  menunggu_verifikasi: 'Menunggu verifikasi',
  antrean: 'Antre produksi',
  print_uv: 'Cetak UV',
  cutting: 'Potong (cutting)',
  qc: 'Pemeriksaan akhir',
  siap: 'Siap diambil / dikirim',
  dikirim: 'Dalam pengiriman',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

export const STATUS_CODES = Object.keys(STATUS);
