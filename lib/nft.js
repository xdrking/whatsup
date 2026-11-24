// Suly Mahlukatı: her grupta her birinden tek tane olan NFT koleksiyonu. `no` veritabanına yazılır:
// sıra değiştirilmez, yeni mahluk sona eklenir. Görsel `no`'dan türetilir (lib/nftResim.js), saklanmaz.
export const NFT_KOMISYON = 5
export const NFT_GERI_ALIM = 50

// Sıra galeride ve `.nft` listesinde görünen sıradır: en değerli önce.
export const NADIRLIK = {
  mitik: { ad: '👑 Mitik', fiyat: 6000 },
  sirket: { ad: '🏢 Mavi Çip', fiyat: 1200 },
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

// İkinci seri (bot sahibinin isteği): şirket NFT'leri ve tek mitik, Suly. Şirketlerin logosu çizilmez, kartta yalnızca
// borsa kodu yazar. `kod` şirketin borsa kodudur.
const YENI_SERI = [
  { ad: 'Suly', sinif: 'mitik', ozel: 'suly' },
  { ad: 'Nvidia Çip Ejderi', sinif: 'sirket', kod: 'NVDA' },
  { ad: 'Apple Elma Lordu', sinif: 'sirket', kod: 'AAPL' },
  { ad: 'Microsoft Pencere Golemi', sinif: 'sirket', kod: 'MSFT' },
  { ad: 'Google Arama Kâhini', sinif: 'sirket', kod: 'GOOGL' },
  { ad: 'Amazon Kargo Devi', sinif: 'sirket', kod: 'AMZN' },
  { ad: 'Meta Göz Bekçisi', sinif: 'sirket', kod: 'META' },
  { ad: 'Tesla Şimşek Atı', sinif: 'sirket', kod: 'TSLA' },
  { ad: 'Netflix Dizi Vampiri', sinif: 'sirket', kod: 'NFLX' },
  { ad: 'Samsung Katlanır Ninja', sinif: 'sirket', kod: 'SMSN' },
  { ad: 'Darbe Generali', sinif: 'efsane' },
  { ad: 'Reborn Ankası', sinif: 'efsane' },
  { ad: 'Kripto Dayı', sinif: 'nadir' },
  { ad: 'Borsa Kurdu', sinif: 'nadir' },
  { ad: 'Offshore Prensi', sinif: 'nadir' },
  { ad: 'Gece Yarısı Hacker', sinif: 'nadir' },
  { ad: 'Simit Avcısı', sinif: 'siradan' },
  { ad: 'Fatura Kaçağı', sinif: 'siradan' },
  { ad: 'Wi-Fi Hırsızı', sinif: 'siradan' },
  { ad: 'Kayıp Şarj Aleti', sinif: 'siradan' },
  { ad: 'Sabah Alarmı', sinif: 'siradan' },
  { ad: 'Market Poşeti', sinif: 'siradan' },
  { ad: 'Omar', sinif: 'efsane', ozel: 'omar' },
]

export const NFTLER = [
  ...EFSANE.map((ad) => ({ ad, sinif: 'efsane' })),
  ...NADIR.map((ad) => ({ ad, sinif: 'nadir' })),
  ...SIRADAN.map((ad) => ({ ad, sinif: 'siradan' })),
  ...YENI_SERI,
].map((n, i) => ({ no: i + 1, fiyat: NADIRLIK[n.sinif].fiyat, ...n }))

export const nftBul = (no) => NFTLER[Number(no) - 1] ?? null

/**
 * Markete geri satış (Suly): markete ödenenin yarısı. Anlık fiyata bağlanmaz, yoksa ucuzken alıp pahalıyken
 * bozan Suly basardı. `alis` 0 ise (fiyatlar sabitken ya da kutudan gelen) taban fiyat sayılır.
 */
export const nftGeriAlim = (satir) => ((satir.alis || nftBul(satir.no)?.fiyat || 0) * NFT_GERI_ALIM) / 100

/** Komisyon yukarı yuvarlanır. */
export const nftKomisyonu = (birim) => Math.ceil((birim * NFT_KOMISYON) / 100)
