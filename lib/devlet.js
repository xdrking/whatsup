// Başkan, bakanlıklar, hazine ve darbe kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'
import { ASGARI_FAIZ, AZAMI_FAIZ } from './banka.js'
import { KREDI_FAIZ_FARKI } from './kredi.js'
import { KEFALET_YUZDESI } from './hapis.js'
import { SECIM_SURE_MS } from './secim.js'

// `kod` veritabanına yazılır, değiştirilmez. Her makamın kendi haftalık seçimi vardır.
// Bakanlık yetkisi günde bir kez kullanılır; para basmayan yetkiler seçildi (enflasyon).
export const MAKAMLAR = [
  { kod: 'baskan', ad: '🏛️ Başkan', adlar: ['başkan', 'baskan', 'başkanlık', 'baskanlik'] },
  {
    kod: 'icisleri', ad: '🚔 İçişleri Bakanı', adlar: ['içişleri', 'icisleri'],
    yetki: 'af', aciklama: 'günde bir kişiyi kefaletsiz hapisten çıkarır',
  },
  {
    kod: 'adalet', ad: '⚖️ Adalet Bakanı', adlar: ['adalet'],
    yetki: 'tutukla', aciklama: 'günde bir kişiyi 1 saat hapse atar',
  },
  {
    kod: 'savunma', ad: '🛡️ Savunma Bakanı', adlar: ['savunma'],
    yetki: 'kalkan', aciklama: 'günde bir kişiye 24 saat soygun kalkanı verir',
  },
]

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

/** Destek vermeyenin her şeyine el konur (bot sahibinin kararı). Eksi cüzdan alınmaz. */
export function darbeCezasi({ banka, cuzdan, coin, suly = 0, mulkler }) {
  return {
    banka: Math.max(0, banka),
    cuzdan: Math.max(0, cuzdan),
    coin: Math.max(0, coin),
    suly: Math.max(0, suly),
    mulkler: mulkler.map((m) => ({ kod: m.kod, adet: m.adet })).filter((m) => m.adet > 0),
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
    'Grubun yöneticisi. Bakanları atamaz, onlar da seçimle gelir.',
    '',
    `• \`.faizkararı <oran>\` — bankanın saatlik faizini belirler, günde bir kez. Oran ${ASGARI_FAIZ} ile ${AZAMI_FAIZ} arası, en çok 2 ondalık (\`0,25\`). Kredi faizi bunun ${KREDI_FAIZ_FARKI} puan üstüdür.`,
    '   Yüksek faiz bankadakilere para basar, kur ve enflasyon artar. Eksi faiz bankadaki parayı eritir, enflasyonu frenler.',
    `• \`.hazine ver @kişi <miktar>\` — hazineden (botun kasası) üyeye XP aktarır. Günde en çok ${HAZINE_KISI} kişi, kişi başı o anki piyasanın %${HAZINE_YUZDESI}'si. Kendine aktaramaz.`,
    '   Hazine kumar kazançlarını ve kiraları da öder, kumar kayıpları ve vergiler hazineye girer.',
    '• `.hazine` — kasa, bugünkü aktarımlar ve kalan sınır.',
  ],
  icisleri: () => [
    'Hapishanenin anahtarı sende.',
    '',
    '• `.bakan af @kişi` — hapisteki birini kefalet ödemeden hemen çıkarır. Günde bir kez.',
    '   Hapiste olmayan birini seçersen hakkın yanmaz.',
  ],
  adalet: () => [
    'Tutuklama kararı sende.',
    '',
    `• \`.bakan tutukla @kişi\` — ${TUTUKLAMA_SAATI} saat hapis. Günde bir kez.`,
    `   Hapisteki kumar oynayamaz, soygun yapamaz, çalışamaz. Kefaleti cüzdan ve bankasının %${KEFALET_YUZDESI}'sidir (\`.kefalet @kişi\`), İçişleri Bakanı affedebilir.`,
    '   Zaten hapisteki birini seçersen hakkın yanmaz.',
  ],
  savunma: () => [
    'Soygunlara karşı koruma sende.',
    '',
    `• \`.bakan kalkan @kişi\` — ${KALKAN_MS / 3_600_000} saat soygun kalkanı. \`.soygun\` ve \`.soygun herkes\` o kişiye işlemez. Günde bir kez, kendine de verebilirsin.`,
    '   `.hacizall`\'a karşı korumaz, ona sigorta korur.',
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
      'Ayrıntı: `.help başkan`, `.help içişleri`, `.help adalet`, `.help savunma`',
      ...ortak,
    ].join('\n')
  }
  const m = makamBul(a)
  if (!m) return null
  return [`*${m.ad}*`, '', ...GOREVLER[m.kod](), ...ortak].join('\n')
}
