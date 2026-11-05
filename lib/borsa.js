// .borsa: uydurma hisseler. Saf; yazma lib/stats.js'tedir.
import { randomInt } from 'node:crypto'
import { fnv1a } from './hash.js'

export const SAAT_MS = 60 * 60 * 1000
// Fiyat gün içinde sürekli oynasın diye saatte dört adım atılır.
export const ADIM_MS = 15 * 60 * 1000
export const BASLANGIC_FIYATI = 100
export const IFLAS_FIYATI = 5
export const KOMISYON_YUZDESI = 2
// Kimse bakmazsa fiyat durur; dönüşte en çok 48 saatlik adım işlenir.
export const AZAMI_ADIM = 48 * 4

// Piyasanın havası 6 saatte bir değişir. Yönü değil yalnızca sertliği belirler.
const HAVA_ADIMI = 24
export const HAVALAR = [
  { ad: '😴 Sakin', carpan: 0.5 },
  { ad: '🌤️ Normal', carpan: 1 },
  { ad: '🌪️ Fırtınalı', carpan: 2 },
]

// Adım başına oynaklığın kaçta kaçı: hisseye özel salınım ve ortak piyasa hareketi.
const SALINIM_ORANI = 0.35
const PIYASA_ORANI = 0.2
// Her adımda 1/200 şansla haber çıkar, fiyat oynaklığın iki katı kadar sıçrar.
const HABER_SIKLIGI = 200
const HABER_ORANI = 2
export const HABER_OMRU = 24 * 4

const COZUNURLUK = 1000

// `oynaklik`: hissenin sertliği, yüzde olarak.
export const HISSELER = [
  { kod: 'muz', ad: '🍌 Muz Holding', oynaklik: 2, iyi: 'Muz ihracatında rekor', kotu: 'Muz depolarında çürüme' },
  { kod: 'cay', ad: '🫖 Çay Ocağı', oynaklik: 3, iyi: 'Çay Ocağı şube açtı', kotu: 'Çay Ocağı\'nda şeker krizi' },
  { kod: 'simit', ad: '🥯 Simit A.Ş.', oynaklik: 5, iyi: 'Simit A.Ş. susamı ucuza kapattı', kotu: 'Simit A.Ş.\'de fırın arızası' },
  { kod: 'kedi', ad: '🐈 Kedi Kripto', oynaklik: 8, iyi: 'Kedi Kripto viral oldu', kotu: 'Kedi Kripto\'nun cüzdanı kedi tarafından silindi' },
  { kod: 'roket', ad: '🚀 Roket Teknoloji', oynaklik: 12, iyi: 'Roket yörüngeye oturdu', kotu: 'Roket rampada patladı' },
]

/** -1 ile 1 arasında simetrik sayı. */
function rastgele(rnd) {
  return (rnd(2 * COZUNURLUK + 1) - COZUNURLUK) / COZUNURLUK
}

/** Sohbetin o adımdaki havası. Hash'le çıkar, ayrıca saklanmaz. */
export function piyasaHavasi(chatJid, adim) {
  const n = fnv1a(`${chatJid}|${Math.floor(adim / HAVA_ADIMI)}`) % 10
  return HAVALAR[n < 3 ? 0 : n < 8 ? 1 : 2]
}

/** Bütün hisseleri aynı yöne iten ortak hareket; adım başına bir kez çekilir. */
export function piyasaAdimi(rnd = randomInt) {
  return rastgele(rnd)
}

/**
 * Bir adım. Gerçekçiliği hava, ortak piyasa hareketi ve haber sıçramaları verir;
 * üçü de yönsüzdür, yani fiyatın beklenen değeri aynı kalır ve komisyondan sonra
 * alım satım ortalamada kaybettirir. Fiyat bir ortalamaya dönseydi ya da trendi
 * sürseydi "düşükte al, yüksekte sat" XP basardı. Taban fiyat da aynı açığı
 * açardı, bu yüzden hisse tabanda durmaz, batar.
 *
 * @returns {{ fiyat: number, haber: string | null }}
 */
export function fiyatAdimi(fiyat, hisse, { carpan, piyasa }, rnd = randomInt) {
  const hareket = (SALINIM_ORANI * rastgele(rnd) + PIYASA_ORANI * piyasa) * carpan * hisse.oynaklik
  let yeni = fiyat * (1 + hareket / 100)
  let haber = null

  if (rnd(HABER_SIKLIGI) === 0) {
    const iyi = rnd(2) === 1
    yeni *= 1 + ((iyi ? 1 : -1) * HABER_ORANI * hisse.oynaklik) / 100
    haber = iyi ? hisse.iyi : hisse.kotu
  }

  return { fiyat: yeni, haber }
}

export function komisyon(miktar) {
  return Math.ceil((miktar * KOMISYON_YUZDESI) / 100)
}

export function hisseBul(arg) {
  const kod = String(arg || '').toLocaleLowerCase('tr').replace('ç', 'c')
  return HISSELER.find((h) => h.kod === kod) ?? null
}
