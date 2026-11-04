// .borsa: uydurma hisseler. Saf; yazma lib/stats.js'tedir.
import { randomInt } from 'node:crypto'

export const SAAT_MS = 60 * 60 * 1000
export const BASLANGIC_FIYATI = 100
export const IFLAS_FIYATI = 5
export const KOMISYON_YUZDESI = 2
// Kimse bakmazsa fiyat durur; dönüşte en çok bu kadar saat işlenir.
export const AZAMI_ADIM = 48

// `oynaklik`: saatlik en büyük değişim yüzdesi.
export const HISSELER = [
  { kod: 'muz', ad: '🍌 Muz Holding', oynaklik: 2 },
  { kod: 'cay', ad: '🫖 Çay Ocağı', oynaklik: 3 },
  { kod: 'simit', ad: '🥯 Simit A.Ş.', oynaklik: 5 },
  { kod: 'kedi', ad: '🐈 Kedi Kripto', oynaklik: 8 },
  { kod: 'roket', ad: '🚀 Roket Teknoloji', oynaklik: 12 },
]

/**
 * Bir saatlik adım. Artış ve düşüş simetriktir: fiyatın beklenen değeri aynı
 * kaldığı için komisyondan sonra alım satım ortalamada kaybettirir. Fiyat bir
 * ortalamaya dönseydi "düşükte al, yüksekte sat" XP basardı. Taban fiyat da
 * aynı açığı açardı, bu yüzden hisse tabanda durmaz, batar.
 */
export function fiyatAdimi(fiyat, oynaklik, rnd = randomInt) {
  return fiyat * (1 + (rnd(2 * oynaklik + 1) - oynaklik) / 100)
}

export function komisyon(miktar) {
  return Math.ceil((miktar * KOMISYON_YUZDESI) / 100)
}

export function hisseBul(arg) {
  const kod = String(arg || '').toLocaleLowerCase('tr').replace('ç', 'c')
  return HISSELER.find((h) => h.kod === kod) ?? null
}
