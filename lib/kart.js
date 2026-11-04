// Kart koleksiyonu. Kartlar random key'lerden çıkar. Saf; yazma lib/stats.js'tedir.
import { randomInt } from 'node:crypto'

const NORMAL_AGIRLIK = 3
const NADIR_AGIRLIK = 1

const setler = [
  ['🍢 Sokak Lezzetleri', 1500, ['Simit', 'Midye', 'Kokoreç', 'Tantuni', 'Islak Hamburger', '⭐ Künefe']],
  ['🏛️ Antik Şehirler', 7500, ['Efes', 'Troya', 'Hattuşa', 'Zeugma', 'Nemrut', '⭐ Göbeklitepe']],
  ['🐉 Efsaneler', 25000, ['Tulpar', 'Alkarısı', 'Karakoncolos', 'Tepegöz', 'Şahmaran', '⭐ Zümrüdüanka']],
]

// Her setin son kartı nadirdir. `no` kullanıcının yazdığı kart numarasıdır, sırası
// değişirse veritabanındaki kartlar başka karta dönüşür: yeni kart sona eklenir.
let sira = 0
export const SETLER = setler.map(([ad, odul, kartlar]) => ({
  ad,
  odul,
  kartlar: kartlar.map((kartAdi, i) => ({
    no: (sira += 1),
    ad: kartAdi,
    agirlik: i === kartlar.length - 1 ? NADIR_AGIRLIK : NORMAL_AGIRLIK,
  })),
}))

export const kartBul = (no) => SETLER.flatMap((s) => s.kartlar).find((k) => k.no === no) ?? null

/**
 * Bir seti bitirmek için ortalama çekilmesi gereken kart sayısı. Nadir kart
 * darboğazdır, bu yüzden key tablolarının kart değeri hesabı buna dayanır.
 */
export const setCekisi = (set) => set.kartlar.reduce((t, k) => t + k.agirlik, 0)

export function kartCek(set, rnd = randomInt) {
  let r = rnd(setCekisi(set))
  for (const kart of set.kartlar) {
    if (r < kart.agirlik) return kart
    r -= kart.agirlik
  }
  return set.kartlar[0]
}
