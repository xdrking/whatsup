// XP ile oynanan şans oyunları: .bahis (yazı-tura), .slot, .rulet.
// Gerçek para yok; kaybedilen ya da kazanılan yalnızca stats.xp'dir.
// Fonksiyonlar saftır, rastgelelik dışarıdan verilebilir: testler sonucu sabitler.
import { randomInt } from 'node:crypto'
import { trLower } from './turkishWords.js'
import { bahisOyna, getStats, seviye } from './stats.js'
import logger from './logger.js'

export const MIN_BAHIS = 10

/** 0 ≤ n < ust tam sayı. */
const zar = (ust) => randomInt(ust)

/**
 * Bahis miktarını çözer: sayı, "hepsi" ya da "yarısı".
 * @returns {{ miktar: number } | { hata: string }}
 */
export function miktarCoz(arg, xp) {
  const a = trLower(arg || '')
  let miktar
  if (['hepsi', 'all', 'allin', 'hep'].includes(a)) miktar = xp
  else if (['yarısı', 'yarisi', 'yarı', 'yari'].includes(a)) miktar = Math.floor(xp / 2)
  else if (/^\d+$/.test(a)) miktar = Number(a)
  else return { hata: 'Ne kadar basıyorsun? Bir sayı, `hepsi` ya da `yarısı` yaz.' }

  if (miktar < MIN_BAHIS) return { hata: `En az ${MIN_BAHIS} XP basabilirsin. Senin XP'n: ${xp}` }
  if (miktar > xp) return { hata: `O kadar XP'n yok. Senin XP'n: ${xp}` }
  return { miktar }
}

// --- Yazı tura: 2x, adil ---

export function yuzCoz(arg) {
  const a = trLower(arg || '')
  if (['yazı', 'yazi', 'y'].includes(a)) return 'Yazı'
  if (['tura', 't'].includes(a)) return 'Tura'
  return null
}

export function yaziTura(secim, rnd = zar) {
  const sonuc = rnd(2) === 0 ? 'Yazı' : 'Tura'
  return { sonuc, carpan: sonuc === secim ? 2 : 0 }
}

// --- Slot: üç makara, ağırlıklı semboller ---
// Beklenen dönüş ≈ %96: uzun vadede kasa az farkla kazanır, ama büyük ikramiye
// mümkün. Ağırlık ya da çarpan değişirse beklenen değer yeniden hesaplanmalı
// (test/kumar.test.js bunu 0.9-1 aralığında tutar).
export const SEMBOLLER = [
  { s: '🍒', agirlik: 30, uclu: 3 },
  { s: '🍋', agirlik: 25, uclu: 4 },
  { s: '🍇', agirlik: 20, uclu: 6 },
  { s: '🔔', agirlik: 12, uclu: 12 },
  { s: '⭐', agirlik: 8, uclu: 25 },
  { s: '💎', agirlik: 5, uclu: 50 },
]
export const IKILI_CARPAN = 1.5
const TOPLAM_AGIRLIK = SEMBOLLER.reduce((t, x) => t + x.agirlik, 0)

function sembolSec(rnd) {
  let r = rnd(TOPLAM_AGIRLIK)
  for (const x of SEMBOLLER) {
    if (r < x.agirlik) return x
    r -= x.agirlik
  }
  return SEMBOLLER[0]
}

/** Üç makaranın çarpanı: üçü aynı → sembolün çarpanı, ikisi aynı → 1.5x. */
export function slotCarpani(makaralar) {
  const [a, b, c] = makaralar
  if (a === b && b === c) return a.uclu
  if (a === b || b === c || a === c) return IKILI_CARPAN
  return 0
}

export function slotCevir(rnd = zar) {
  const makaralar = [sembolSec(rnd), sembolSec(rnd), sembolSec(rnd)]
  return { makaralar: makaralar.map((x) => x.s), carpan: slotCarpani(makaralar) }
}

// --- Rulet: Avrupa ruleti, tek sıfır ---

const KIRMIZI = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export function renk(sayi) {
  if (sayi === 0) return 'yeşil'
  return KIRMIZI.has(sayi) ? 'kırmızı' : 'siyah'
}

/** Rulet seçimi: renk, tek/çift ya da 0-36 arası sayı; anlaşılmazsa null. */
export function ruletSecimCoz(arg) {
  const a = trLower(arg || '')
  if (['kırmızı', 'kirmizi', 'k'].includes(a)) return { tur: 'renk', deger: 'kırmızı' }
  if (['siyah', 's'].includes(a)) return { tur: 'renk', deger: 'siyah' }
  if (a === 'tek') return { tur: 'parite', deger: 'tek' }
  if (['çift', 'cift'].includes(a)) return { tur: 'parite', deger: 'çift' }
  if (/^\d{1,2}$/.test(a) && Number(a) <= 36) return { tur: 'sayi', deger: Number(a) }
  return null
}

/** Renk ve tek/çift 2x, sayı 36x. Sıfır gelirse renk ve tek/çift kaybeder. */
export function ruletCarpani(secim, sayi) {
  if (secim.tur === 'sayi') return secim.deger === sayi ? 36 : 0
  if (sayi === 0) return 0
  if (secim.tur === 'renk') return renk(sayi) === secim.deger ? 2 : 0
  return (sayi % 2 === 0 ? 'çift' : 'tek') === secim.deger ? 2 : 0
}

export function ruletCevir(secim, rnd = zar) {
  const sayi = rnd(37)
  return { sayi, renk: renk(sayi), carpan: ruletCarpani(secim, sayi) }
}

/**
 * Komut argümanlarından miktar ve seçim kelimesini ayırır. Sıra serbesttir;
 * ikisi de sayıysa (".rulet 100 17") ilk sayı miktar sayılır.
 */
export function argumanlariAyir(args) {
  const miktarKelimeleri = /^(\d+|hepsi|all|allin|hep|yarısı|yarisi|yarı|yari)$/i
  let miktar = null
  const kalan = []
  for (const a of args) {
    if (miktar === null && miktarKelimeleri.test(a)) miktar = a
    else kalan.push(a)
  }
  return { miktar, secim: kalan[0] ?? null }
}

/**
 * Üç kumar komutunun ortak akışı: miktarı çöz, bahsi oyna, sonucu yaz.
 * `anlat(sonuc)` oyuna özgü satırları (makaralar, çıkan sayı…) döner.
 */
export async function kumarOyna({ sock, msg, from, sender, miktarArg, cevir, anlat }) {
  const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

  try {
    const cozum = miktarCoz(miktarArg, getStats(from, sender).xp)
    if (cozum.hata) return await yaz(`🎰 ${cozum.hata}`)

    const s = bahisOyna({ chatJid: from, userJid: sender, miktar: cozum.miktar, cevir })
    if (!s) return await yaz('🎰 Kumarhane şu an kapalı, sonra dene.')
    if (s.yetersiz) return await yaz(`🎰 O kadar XP'n yok. Senin XP'n: ${s.xp}`)

    const lines = [...anlat(s.sonuc), '']
    if (s.fark > 0) lines.push(`✅ Kazandın! *+${s.fark} XP*`)
    else if (s.fark < 0) lines.push(`❌ Kaybettin. *${s.fark} XP*`)
    else lines.push('🤝 Paran geri döndü.')
    lines.push(`💰 XP: ${s.once} → ${s.xp}`)

    const eski = seviye(s.once)
    const yeni = seviye(s.xp)
    if (yeni > eski) lines.push(`🆙 Seviye ${yeni} oldun!`)
    else if (yeni < eski) lines.push(`📉 Seviye düştü: ${yeni}`)
    if (s.xp === 0) lines.push('🪦 Kasa boşaldı. `.günlük` ile yeniden başla.')

    await yaz(lines.join('\n'))
  } catch (err) {
    logger.error({ err, from }, 'Kumar komutu başarısız')
    await yaz('🎰 Bir şeyler ters gitti.').catch((e) =>
      logger.error({ err: e }, 'Kumar hata mesajı gönderilemedi'),
    )
  }
}
