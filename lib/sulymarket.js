// .sulymarket: Suly ile alışveriş yapılan oyun içi kara borsa. Kurallar burada saftır, yazma
// lib/stats.js'in sonundaki kara borsa bölümündedir. Yeni ürün = URUNLER'e bir satır.
// `kod` veritabanına yazılır, değiştirilmez. Fiyat tam Suly'dir: Suly kurla büyüdüğü için
// ayrıca ölçeklenmez. Ödenen Suly yanar.
import { trLower } from './turkishWords.js'
import { elKoymaPayi } from './devlet.js'

const GUN_MS = 24 * 60 * 60 * 1000

export const HACK_GUNLUK = 2
export const HACK_KORUNMA_MS = 12 * 60 * 60 * 1000
export const DUVAR_MS = 3 * GUN_MS
export const AZAMI_ADET = 1000

// Hacker tek kullanımlıktır. Yüzdeler kurbanın bankası, cüzdanı ve coininden alınan paydır,
// `mulkPayi` mülk adedinin payı (en az bir mülk: `mulkEnAz`). Çalınan para hackleyenin bankasına girer.
export const HACKERLAR = [
  { kod: 'caylak', adlar: ['çaylak', 'caylak'], banka: 10, cuzdan: 0, coin: 0, mulkPayi: 0, mulkEnAz: 0, nft: false, sans: 45 },
  { kod: 'usta', adlar: ['usta'], banka: 20, cuzdan: 10, coin: 0, mulkPayi: 0, mulkEnAz: 1, nft: false, sans: 55 },
  { kod: 'karasapka', adlar: ['karaşapka', 'karasapka', 'kara'], banka: 30, cuzdan: 20, coin: 20, mulkPayi: 1 / 3, mulkEnAz: 1, nft: true, sans: 65 },
]

// tur: silah (çetenin cephaneliğine girer), hacker ve arac (kişinin envanterine girer), duvar (süre ekler).
export const URUNLER = [
  { kod: 'musta', tur: 'silah', ad: '👊 Muşta', fiyat: 5, guc: 2 },
  { kod: 'tabanca', tur: 'silah', ad: '🔫 Tabanca', fiyat: 15, guc: 8 },
  { kod: 'pompali', tur: 'silah', ad: '💥 Pompalı', fiyat: 40, guc: 24 },
  { kod: 'zirhli', tur: 'silah', ad: '🚙 Zırhlı araç', fiyat: 120, guc: 80 },
  { kod: 'roket', tur: 'silah', ad: '🚀 Roketatar', fiyat: 300, guc: 220 },
  { kod: 'bomba', tur: 'silah', ad: '💣 Bomba', fiyat: 60, guc: 0, patlama: 60, not: 'baskında patlar, +60 güç' },
  { kod: 'caylak', tur: 'hacker', ad: '👶 Çaylak hacker', fiyat: 30 },
  { kod: 'usta', tur: 'hacker', ad: '🧑‍💻 Usta hacker', fiyat: 100 },
  { kod: 'karasapka', tur: 'hacker', ad: '🎩 Kara şapka', fiyat: 300 },
  { kod: 'vpn', tur: 'arac', ad: '🛰️ VPN', fiyat: 15, not: 'yakalanınca kimliğini gizler' },
  { kod: 'duvar', tur: 'duvar', ad: '🧱 Güvenlik duvarı', fiyat: 40, not: '3 gün hacklenemezsin' },
  { kod: 'cilingir', tur: 'arac', ad: '🗝️ Çilingir', fiyat: 25, not: 'birinin soygun kalkanını kırar' },
  { kod: 'firar', tur: 'arac', ad: '🪪 Firar planı', fiyat: 20, not: 'hapisten kaçırır' },
]

export const urunKoduyla = (kod) => URUNLER.find((u) => u.kod === kod) ?? null

export function hackerBul(ad) {
  const a = trLower(ad || '')
  return HACKERLAR.find((h) => h.adlar.includes(a)) ?? null
}

/** Hacker'ın alacağı pay. Mülk en pahalıdan başlar. */
export function hackPayi(hacker, { banka, cuzdan, coin, mulkler }) {
  const yuzde = { banka: hacker.banka, cuzdan: hacker.cuzdan, coin: hacker.coin, suly: 0 }
  const toplam = mulkler.reduce((t, m) => t + Math.max(0, m.adet), 0)
  const adet = Math.min(toplam, Math.max(hacker.mulkEnAz, Math.floor(toplam * hacker.mulkPayi + 1e-9)))
  const pay = elKoymaPayi({ banka, cuzdan: Math.max(0, cuzdan), coin, mulkler }, yuzde, toplam ? adet / toplam : 0)
  return { banka: pay.banka, cuzdan: pay.cuzdan, coin: pay.coin, mulkler: pay.mulkler }
}

// --- Çete cephaneliği ---

export const UYE_GUCU = 5
export const BASKIN_ARALIGI_MS = 6 * 60 * 60 * 1000
export const BASKIN_KORUNMA_MS = 12 * 60 * 60 * 1000
export const BASKIN_AZAMI_BOMBA = 3
export const GANIMET_YUZDESI = 20
export const KAYBEDEN_KAYIP_YUZDESI = 25
export const KAZANAN_KAYIP_YUZDESI = 5
const SOYGUN_BONUS_TAVANI = 10
const SOYGUN_BONUS_BOLEN = 40

/** @param {{ kod: string, adet: number }[]} silahlar */
export function silahGucu(silahlar) {
  return silahlar.reduce((t, s) => t + s.adet * (urunKoduyla(s.kod)?.guc ?? 0), 0)
}

export const ceteGucu = (uye, silahlar) => uye * UYE_GUCU + silahGucu(silahlar)

/** Çete silahlandıkça üyelerin `.soygun` şansına eklenen yüzde puanı. */
export function soygunBonusu(guc) {
  return Math.min(SOYGUN_BONUS_TAVANI, Math.floor(guc / SOYGUN_BONUS_BOLEN))
}

/** Güç oranı; %10-90: zayıf çetenin hep umudu, güçlünün hep riski olsun. */
export function baskinSansi(saldiran, savunan) {
  return Math.min(90, Math.max(10, Math.round((100 * saldiran) / Math.max(1, saldiran + savunan))))
}

/** Kaybedilen silah adedi; küsurat zarla yuvarlanır, yoksa tek silahlı çete hiç kaybetmezdi. */
export function silahKaybi(adet, yuzde, rnd) {
  const toplam = adet * yuzde
  return Math.floor(toplam / 100) + (rnd(100) < toplam % 100 ? 1 : 0)
}
