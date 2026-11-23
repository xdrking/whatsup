// Faz 74 yeraltı kuralları: .vurgun (Merkez Bankası soygunu), .offshore, .izsür, fidye yazılımı,
// .muhbir, sahte kimlik ve gizemli kutu. Saf; yazma lib/stats.js'in sonundaki yeraltı bölümündedir.
import { trLower } from './turkishWords.js'

const SAAT_MS = 60 * 60 * 1000
const GUN_MS = 24 * SAAT_MS

// --- .vurgun ---
export const VURGUN_ARALIGI_MS = 12 * SAAT_MS
export const VURGUN_LOBI_MS = 3 * 60_000
export const VURGUN_EN_AZ = 3
// Ganimet hazineden çıkar. Hazine piyasadan kat kat büyük olabildiği için ikisinin küçüğü alınır:
// yalnızca hazinenin yüzdesi olsaydı tek vurgun kuru katlardı (.hazine ver'deki gibi).
export const VURGUN_KASA_YUZDESI = 10
export const VURGUN_ARZ_YUZDESI = 10
const VURGUN_TABAN_SANS = 15
const VURGUN_TAVAN_SANS = 65

// `gerek`: rolün harcadığı envanter. Hacker'da elindeki en iyisi gider.
export const ROLLER = [
  { kod: 'hacker', ad: '💻 Hacker', adlar: ['hacker', 'hack'], not: 'bir hacker harcar, +10 ile +20' },
  { kod: 'kasaci', ad: '🗝️ Kasacı', adlar: ['kasacı', 'kasaci', 'çilingir', 'cilingir'], not: 'çilingir harcar, +10' },
  { kod: 'silahci', ad: '🔫 Silahçı', adlar: ['silahçı', 'silahci'], not: 'silahlı çete ister, +5 ve soygun bonusu' },
  { kod: 'sofor', ad: '🚗 Şoför', adlar: ['şoför', 'sofor', 'soför', 'şöför'], not: '+5' },
  { kod: 'gozcu', ad: '👀 Gözcü', adlar: ['gözcü', 'gozcu'], not: '+5' },
]
const HACKER_PUANI = { caylak: 10, usta: 15, karasapka: 20 }

export const rolKoduyla = (kod) => ROLLER.find((r) => r.kod === kod) ?? null

export function rolBul(metin) {
  const a = trLower(metin || '').trim()
  return ROLLER.find((r) => r.adlar.includes(a)) ?? null
}

/** @param {{ roller: string[], hacker?: string | null, silahBonusu?: number }} ekip */
export function vurgunSansi({ roller, hacker = null, silahBonusu = 0 }) {
  let sans = VURGUN_TABAN_SANS
  if (roller.includes('hacker')) sans += HACKER_PUANI[hacker] ?? 0
  if (roller.includes('kasaci')) sans += 10
  if (roller.includes('silahci')) sans += 5 + silahBonusu
  if (roller.includes('sofor')) sans += 5
  if (roller.includes('gozcu')) sans += 5
  return Math.min(VURGUN_TAVAN_SANS, sans)
}

export function vurgunGanimeti(kasa, arz) {
  return Math.max(0, Math.floor(Math.min((kasa * VURGUN_KASA_YUZDESI) / 100, (arz * VURGUN_ARZ_YUZDESI) / 100)))
}

// --- .offshore ---
export const OFFSHORE_KOMISYON = 10
export const OFFSHORE_AZAMI_GUN = 3
// Her gün için baskın olasılığı; baskında paranın yarısına el konur.
export const OFFSHORE_RISK = 8
export const OFFSHORE_BASKIN_YUZDESI = 50

export const offshoreKomisyonu = (miktar) => Math.ceil((miktar * OFFSHORE_KOMISYON) / 100)
export const offshoreBitis = (gun, now) => now + gun * GUN_MS

// --- .izsür ---
export const IZ_SURESI_MS = GUN_MS
export const IZ_SANSI = 50

// --- Fidye yazılımı ---
export const FIDYE_MS = 6 * SAAT_MS
export const FIDYE_YUZDESI = 10
export const FIDYE_SANSI = 60

export const fidyeTutari = (banka) => Math.floor((banka * FIDYE_YUZDESI) / 100)

// --- .muhbir (tam Suly, ödenen yanar) ---
export const MUHBIR_KIM = 20
export const MUHBIR_DOSYA = 15
export const MUHBIR_SURE_MS = 7 * GUN_MS

// --- Sahte kimlik ---
export const MASKE_MS = SAAT_MS

// --- Gizemli kutu ---
export const KUTU_HAPIS_SAATI = 1
// `agirlik` toplamı 100. Beklenen değer fiyatın altında kalmalı (test denetler): kutu Suly basmasın.
// Silah çıkarsa çeteye girer, çetesizse yerine VPN verilir.
export const KUTU_ODULLERI = [
  { agirlik: 16, tur: 'bos' },
  { agirlik: 8, tur: 'polis' },
  { agirlik: 20, tur: 'urun', kod: 'musta', adet: 2 },
  { agirlik: 18, tur: 'urun', kod: 'vpn', adet: 1 },
  { agirlik: 12, tur: 'urun', kod: 'tabanca', adet: 1 },
  { agirlik: 8, tur: 'urun', kod: 'cilingir', adet: 1 },
  { agirlik: 8, tur: 'urun', kod: 'caylak', adet: 1 },
  { agirlik: 5, tur: 'urun', kod: 'duvar', adet: 1 },
  { agirlik: 2, tur: 'urun', kod: 'usta', adet: 1 },
  { agirlik: 3, tur: 'nft' },
]

export function kutuCek(rnd) {
  let r = rnd(100)
  for (const odul of KUTU_ODULLERI) {
    if (r < odul.agirlik) return odul
    r -= odul.agirlik
  }
  return KUTU_ODULLERI[0]
}
