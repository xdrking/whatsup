// Suly Mahlukatı: her grupta her birinden tek tane olan NFT koleksiyonu. `no` veritabanına yazılır:
// sıra değiştirilmez, yeni mahluk sona eklenir. Görsel `no`'dan türetilir (lib/nftResim.js), saklanmaz.
export const NFT_KOMISYON = 5
export const NFT_GERI_ALIM = 50

export const NADIRLIK = {
  efsane: { ad: '🟡 Efsane', fiyat: 300 },
  nadir: { ad: '🟣 Nadir', fiyat: 75 },
  siradan: { ad: '⚪ Sıradan', fiyat: 20 },
}

const EFSANE = ['Genesis Suly', 'Altın Kasa Bekçisi', 'Satoşi Dayı']
const NADIR = ['Lazer Göz', 'Dubai Müteahhidi', 'Holding Veliahdı', 'Gece Kuşu 03.00', 'Balina Hasan', 'Kör Nişancı', 'Siber Derviş']
const SIRADAN = [
  'Tost Bağımlısı', 'Vergi Kaçağı', 'Dolmuş Kaptanı', 'Kredi Mağduru', 'Çay Ocağı', 'Sessiz Üye', 'Son Görülme Kapalı',
  'Halısaha Yedeği', 'Apartman Yöneticisi', 'Kombi Ustası', 'Hayalet Emlakçı', 'Bozuk Para', 'Pide Kurdu', 'Excel Büyücüsü',
  'Kopya Kağıdı', 'Öğle Uykusu', 'Tek Tik', 'Mavi Tik', 'Şarjı Bitik', 'Ping 999',
]

export const NFTLER = [
  ...EFSANE.map((ad) => ({ ad, sinif: 'efsane' })),
  ...NADIR.map((ad) => ({ ad, sinif: 'nadir' })),
  ...SIRADAN.map((ad) => ({ ad, sinif: 'siradan' })),
].map((n, i) => ({ no: i + 1, fiyat: NADIRLIK[n.sinif].fiyat, ...n }))

export const nftBul = (no) => NFTLER[Number(no) - 1] ?? null

/** Komisyon yukarı yuvarlanır. */
export const nftKomisyonu = (birim) => Math.ceil((birim * NFT_KOMISYON) / 100)
