// Başkan, bakanlıklar, hazine ve darbe kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'
import { ASGARI_FAIZ, AZAMI_FAIZ } from './banka.js'
import { KREDI_FAIZ_FARKI } from './kredi.js'
import { KEFALET_YUZDESI } from './hapis.js'
import { SECIM_SURE_MS } from './secim.js'

// `kod` veritabanına yazılır, değiştirilmez. Her makamın kendi haftalık seçimi vardır.
// Bakanlık yetkisi günde BAKAN_GUNLUK kez kullanılır (bot sahibinin kararı); para basmayan yetkiler seçildi (enflasyon).
export const MAKAMLAR = [
  { kod: 'baskan', ad: '🏛️ Başkan', adlar: ['başkan', 'baskan', 'başkanlık', 'baskanlik'] },
  {
    kod: 'icisleri', ad: '🚔 İçişleri Bakanı', adlar: ['içişleri', 'icisleri'],
    yetki: 'af', aciklama: 'günde 5 kişiyi kefaletsiz hapisten çıkarır',
  },
  {
    kod: 'adalet', ad: '⚖️ Adalet Bakanı', adlar: ['adalet'],
    yetki: 'tutukla', aciklama: 'günde 5 kişiyi 1 saat hapse atar',
  },
  {
    kod: 'savunma', ad: '🛡️ Savunma Bakanı', adlar: ['savunma'],
    yetki: 'kalkan', aciklama: 'günde 5 kişiye 24 saat soygun kalkanı verir',
  },
  {
    kod: 'disisleri', ad: '🌍 Dışişleri Bakanı', adlar: ['dışişleri', 'disisleri'],
    yetki: 'ambargo', aciklama: 'günde 5 kişiye 24 saat ambargo koyar, para ve mülk gönderemez',
  },
]

export const BAKAN_GUNLUK = 5
export const AMBARGO_MS = 24 * 60 * 60 * 1000

/** `.devret`, `.coindevret`, `.mülk devret` ambargoda bunu yazar. */
export function ambargoMesaji(bitis) {
  const saat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(bitis)
  return `🌍 Ambargodasın, ${saat}'e kadar para ve mülk gönderemezsin.`
}

export const TUTUKLAMA_SAATI = 1
export const KALKAN_MS = 24 * 60 * 60 * 1000

export function makamBul(metin) {
  const a = trLower(metin || '')
  return MAKAMLAR.find((m) => m.adlar.includes(a) || m.kod === a) ?? null
}

export const makamKoduyla = (kod) => MAKAMLAR.find((m) => m.kod === kod) ?? null
export const yetkiyleMakam = (yetki) => MAKAMLAR.find((m) => m.yetki === yetki) ?? null

// Başkanın hazineden aktarımı: günde en çok 10 kişi, kişi başı anlık piyasanın %20'si (bot sahibinin
// kararı). Hazinenin yüzdesi olsaydı hazine piyasadan kat kat büyük olduğu için kur bir günde katlanırdı.
export const HAZINE_KISI = 10
export const HAZINE_YUZDESI = 20

export const hazineLimiti = (arz) => Math.floor((Math.max(0, arz) * HAZINE_YUZDESI) / 100)

// Darbe: destek vermeyenden el konulanlar ve destekçinin ödülü.
export const DARBE_SURE_MS = 10 * 60 * 1000
// Destekçi başına 1 coinin XP karşılığı (günün kuru), hazineden.
export const darbeOdulu = (kur) => kur

// Destek vermeyenin varlığından bot hesabına geçen pay (bot sahibinin kararı).
export const DARBE_YUZDE = { banka: 60, cuzdan: 60, coin: 60, suly: 60 }
// Darbeden sonra her hisse bu aralıkta (yüzde) değer kaybeder.
export const DARBE_BORSA_DUSUS = [45, 55]

const yuzdesi = (x, yuzde) => Math.floor((Math.max(0, x) * yuzde) / 100)

/**
 * Mülklerin toplam adedinin 3'te 2'si (aşağı yuvarlanır) alınır, en pahalıdan başlanır.
 * `mulkler`: `{ kod, adet, fiyat }`.
 */
export const darbeCezasi = (varlik) => elKoymaPayi(varlik, DARBE_YUZDE, 2 / 3)

// Susturulduğu halde yazmaya devam edenden el konulan pay (bot sahibinin kararı): her şeyin yarısı.
export const SPAM_YUZDE = { banka: 50, cuzdan: 50, coin: 50, suly: 50 }
export const spamCezasi = (varlik) => elKoymaPayi(varlik, SPAM_YUZDE, 1 / 2)

/** Varlıklardan alınacak pay; mülk adedi `mulkPayi` ile aşağı yuvarlanır, en pahalıdan başlanır. */
export function elKoymaPayi({ banka, cuzdan, coin, suly = 0, mulkler }, yuzde, mulkPayi) {
  let kalan = Math.floor(mulkler.reduce((t, m) => t + Math.max(0, m.adet), 0) * mulkPayi + 1e-9)
  const alinan = []
  for (const m of [...mulkler].sort((a, b) => b.fiyat - a.fiyat)) {
    const adet = Math.min(kalan, Math.max(0, m.adet))
    if (adet > 0) alinan.push({ kod: m.kod, adet })
    kalan -= adet
  }
  return {
    banka: yuzdesi(banka, yuzde.banka),
    cuzdan: yuzdesi(cuzdan, yuzde.cuzdan),
    coin: yuzdesi(coin, yuzde.coin),
    suly: yuzdesi(suly, yuzde.suly),
    mulkler: alinan,
  }
}

const DESTEK = ['destek', 'evet', 'kabul', 'katılıyorum', 'katiliyorum', '👍']
const KARSI = ['karşı', 'karsi', 'hayır', 'hayir', 'red', 'ret', '👎']

/** Darbe yanıtı: 'destek', 'karsi' ya da anlaşılmazsa null. */
export function darbeOyu(metin) {
  const a = trLower(String(metin || '').trim()).replace(/[.!]+$/, '')
  if (DESTEK.includes(a)) return 'destek'
  if (KARSI.includes(a)) return 'karsi'
  return null
}

// `.help başkan`, `.help savunma`…: makam sahibi görevini okusun diye. Sayılar sabitlerden gelir.
const GOREVLER = {
  baskan: () => [
    'Grubun yöneticisi. Bakanlar seçimle gelir, başkan istediği bakanlığa kayyum atayabilir.',
    '',
    `• \`.faizkararı <oran>\` — bankanın saatlik faizini belirler, günde bir kez. Oran ${ASGARI_FAIZ} ile ${AZAMI_FAIZ} arası, en çok 2 ondalık (\`0,25\`). Kredi faizi bunun ${KREDI_FAIZ_FARKI} puan üstüdür.`,
    '   Yüksek faiz bankadakilere para basar, kur ve enflasyon artar. Eksi faiz bankadaki parayı eritir, enflasyonu frenler.',
    `• \`.hazine ver @kişi <miktar>\` — hazineden (botun kasası) üyeye XP aktarır. Günde en çok ${HAZINE_KISI} kişi, kişi başı o anki piyasanın %${HAZINE_YUZDESI}'si. Kendine aktaramaz.`,
    '   Hazine kumar kazançlarını ve kiraları da öder, kumar kayıpları ve vergiler hazineye girer.',
    '• `.hazine` — kasa, bugünkü aktarımlar ve kalan sınır.',
    '• `.kayyum <bakanlık> @kişi` — bakanı görevden alır, yerine o kişiyi atar. O bakanlığın seçimi askıya alınır, açık seçim iptal olur (ücretler yanar).',
    '   `.kayyum kaldır <bakanlık>` seçimi yeniden açar, kayyum yenisi seçilene kadar kalır.',
  ],
  icisleri: () => [
    'Hapishanenin anahtarı sende.',
    '',
    `• \`.bakan af @kişi\` — hapisteki birini kefalet ödemeden hemen çıkarır. Günde ${BAKAN_GUNLUK} kez.`,
    '   Hapiste olmayan birini seçersen hakkın yanmaz.',
    '• `.kumaraf @kişi` — günlük kumar tavanını doldurup gece yarısına kadar yasak yiyenin yasağını kaldırır. Aynı günlük hakkı harcar.',
  ],
  adalet: () => [
    'Tutuklama kararı sende.',
    '',
    `• \`.bakan tutukla @kişi\` — ${TUTUKLAMA_SAATI} saat hapis. Günde ${BAKAN_GUNLUK} kez.`,
    `   Hapisteki kumar oynayamaz, soygun yapamaz, çalışamaz. Kefaleti cüzdan ve bankasının %${KEFALET_YUZDESI}'sidir (\`.kefalet @kişi\`), İçişleri Bakanı affedebilir.`,
    '   Zaten hapisteki birini seçersen hakkın yanmaz.',
  ],
  savunma: () => [
    'Soygunlara karşı koruma sende.',
    '',
    `• \`.bakan kalkan @kişi\` — ${KALKAN_MS / 3_600_000} saat soygun kalkanı. \`.soygun\` ve \`.soygun herkes\` o kişiye işlemez. Günde ${BAKAN_GUNLUK} kez, kendine de verebilirsin.`,
    '   `.hacizall`\'a karşı korumaz, ona sigorta korur.',
  ],
  disisleri: () => [
    'Ambargo kararı sende.',
    '',
    `• \`.bakan ambargo @kişi\` — ${AMBARGO_MS / 3_600_000} saat ambargo: \`.devret\`, \`.coindevret\` ve \`.mülk devret\` yapamaz. Günde ${BAKAN_GUNLUK} kez.`,
    '   Zaten ambargolu birini seçersen hakkın yanmaz.',
  ],
}

const HUKUMET_ADLARI = ['makam', 'makamlar', 'hükümet', 'hukumet', 'bakanlar', 'bakanlık', 'bakanlik', 'devlet']

/** `.help` makam yazımı: makamın görev metni, `makamlar` için hepsi, değilse null. */
export function makamRehberi(metin) {
  const a = trLower(metin || '')
  const ortak = [
    '',
    `Makam yenisi seçilene kadar sende kalır. Seçim: \`.seçim aday <makam>\`, sandık ${SECIM_SURE_MS / 60_000} dk açık kalır.`,
    'Hükümet ve açık seçimler: `.seçim`',
  ]
  if (HUKUMET_ADLARI.includes(a)) {
    return [
      '🏛️ *Makamlar*',
      '',
      `${MAKAMLAR[0].ad}: \`.faizkararı\` ve \`.hazine ver\``,
      ...MAKAMLAR.filter((m) => m.yetki).map((m) => `${m.ad}: \`.bakan ${m.yetki} @kişi\`, ${m.aciklama}`),
      '',
      'Ayrıntı: `.help başkan`, `.help içişleri`, `.help adalet`, `.help savunma`, `.help dışişleri`',
      ...ortak,
    ].join('\n')
  }
  const m = makamBul(a)
  if (!m) return null
  return [`*${m.ad}*`, '', ...GOREVLER[m.kod](), ...ortak].join('\n')
}
