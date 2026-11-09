// Başkan, bakanlıklar, hazine ve darbe kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'

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

// Başkanın hazineden aktarımı: günde en çok 3 kişi, toplam günün açılışındaki piyasanın %10'u
// (bot sahibinin kararı). Hazinenin yüzdesi olsaydı hazine piyasadan büyük olduğu için kur bir
// günde katlanırdı.
export const HAZINE_KISI = 3
export const HAZINE_YUZDESI = 10

export const hazineLimiti = (arz) => Math.floor((Math.max(0, arz) * HAZINE_YUZDESI) / 100)

// Darbe: destek vermeyenden el konulanlar ve destekçinin ödülü.
export const DARBE_SURE_MS = 10 * 60 * 1000
export const DARBE_YUZDE = { banka: 60, cuzdan: 60, coin: 60 }
// Destekçi başına 1 coinin XP karşılığı (günün kuru), hazineden.
export const darbeOdulu = (kur) => kur

/** Mülkün yarısı aşağı yuvarlanır: tek evi olanın evi gitmez. */
export function darbeCezasi({ banka, cuzdan, coin, mulkler }) {
  return {
    banka: Math.floor((Math.max(0, banka) * DARBE_YUZDE.banka) / 100),
    cuzdan: Math.floor((Math.max(0, cuzdan) * DARBE_YUZDE.cuzdan) / 100),
    coin: Math.floor((Math.max(0, coin) * DARBE_YUZDE.coin) / 100),
    mulkler: mulkler.map((m) => ({ kod: m.kod, adet: Math.floor(m.adet / 2) })).filter((m) => m.adet > 0),
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
