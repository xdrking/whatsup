// XP ile oynanan şans oyunları: .bahis (yazı-tura), .slot, .rulet.
// Gerçek para yok; kaybedilen ya da kazanılan yalnızca stats.xp'dir.
// Fonksiyonlar saftır, rastgelelik dışarıdan verilebilir: testler sonucu sabitler.
import { binlik } from './sayi.js'
import { randomInt } from 'node:crypto'
import { trLower } from './turkishWords.js'
import { bahisOyna, getStats, kumarYasagi, seviye } from './stats.js'
import logger from './logger.js'

export const MIN_BAHIS = 10

/** 0 ≤ n < ust tam sayı. */
const zar = (ust) => randomInt(ust)

/**
 * Bahis miktarını çözer: sayı, "hepsi" ya da "yarısı".
 * @returns {{ miktar: number } | { hata: string }}
 */
/** Cüzdanı bu tutarın altında olan kumara giremez; eksiden çıkan da önce bunu toplar. */
export const MIN_KUMAR_BAKIYESI = 500

/** @returns {string | null} oynanamıyorsa kullanıcıya yazılacak metin. */
export function kumarEngeli(xp, yasakBitis = 0, now = Date.now()) {
  if (yasakBitis > now) return `Kumar yasağın var, ${Math.ceil((yasakBitis - now) / 60_000)} dk kaldı.`
  if (xp >= MIN_KUMAR_BAKIYESI) return null
  return `Kumar için cüzdanında en az ${MIN_KUMAR_BAKIYESI} XP olmalı. Senin XP'n: ${binlik(xp)}`
}

export function miktarCoz(arg, xp) {
  const a = trLower(arg || '')
  let miktar
  if (['hepsi', 'all', 'allin', 'hep'].includes(a)) miktar = xp
  else if (['yarısı', 'yarisi', 'yarı', 'yari'].includes(a)) miktar = Math.floor(xp / 2)
  else if (/^\d+$/.test(a)) miktar = Number(a)
  else return { hata: 'Ne kadar basıyorsun? Bir sayı, `hepsi` ya da `yarısı` yaz.' }

  if (miktar < MIN_BAHIS) return { hata: `En az ${MIN_BAHIS} XP basabilirsin. Senin XP'n: ${binlik(xp)}` }
  if (miktar > xp) return { hata: `O kadar XP'n yok. Senin XP'n: ${binlik(xp)}` }
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

// --- Kazı kazan: önce ödül çekilir, sonra kart ona uygun dizilir ---
// Beklenen dönüş %95; değişirse test/kumar.test.js yakalar.
export const KAZI_ODULLERI = [
  { s: '🍀', carpan: 1, agirlik: 150 },
  { s: '🍋', carpan: 2, agirlik: 150 },
  { s: '🍇', carpan: 5, agirlik: 60 },
  { s: '⭐', carpan: 10, agirlik: 15 },
  { s: '💎', carpan: 50, agirlik: 1 },
]
const KAZI_TOPLAM = 1000

function karistir(dizi, rnd) {
  const kopya = [...dizi]
  for (let i = kopya.length - 1; i > 0; i -= 1) {
    const j = rnd(i + 1)
    ;[kopya[i], kopya[j]] = [kopya[j], kopya[i]]
  }
  return kopya
}

/**
 * 9 kutuluk kart. Kazanan sembol tam 3 kez, diğerleri en fazla 2 kez çıkar;
 * böylece kartta görünen sonuç çekilen ödülle her zaman aynıdır.
 */
export function kaziCevir(rnd = zar) {
  let r = rnd(KAZI_TOPLAM)
  let kazanan = null
  for (const o of KAZI_ODULLERI) {
    if (r < o.agirlik) {
      kazanan = o
      break
    }
    r -= o.agirlik
  }

  const kutular = kazanan ? [kazanan.s, kazanan.s, kazanan.s] : []
  const digerleri = KAZI_ODULLERI.filter((o) => o !== kazanan).flatMap((o) => [o.s, o.s])
  kutular.push(...karistir(digerleri, rnd).slice(0, 9 - kutular.length))

  return { kutular: karistir(kutular, rnd), carpan: kazanan?.carpan ?? 0, sembol: kazanan?.s ?? null }
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

/** Kazanç/kayıp, yeni XP ve seviye değişimi satırları. */
export function sonucSatirlari({ once, xp, fark }) {
  const lines = []
  if (fark > 0) lines.push(`✅ Kazandın! *+${binlik(fark)} XP*`)
  else if (fark < 0) lines.push(`❌ Kaybettin. *${binlik(fark)} XP*`)
  else lines.push('🤝 Paran geri döndü.')
  lines.push(`💰 XP: ${binlik(once)} → ${binlik(xp)}`)

  const eski = seviye(once)
  const yeni = seviye(xp)
  if (yeni > eski) lines.push(`🆙 Seviye ${yeni} oldun!`)
  else if (yeni < eski) lines.push(`📉 Seviye düştü: ${yeni}`)
  if (xp === 0) lines.push('🪦 Kasa boşaldı. `.günlük` ile yeniden başla.')

  return lines
}

/**
 * Kumar komutlarının ortak akışı: miktarı çöz, bahsi oyna, sonucu yaz.
 * `anlat(sonuc)` oyuna özgü satırları (makaralar, çıkan sayı…) döner.
 */
export async function kumarOyna({ sock, msg, from, sender, miktarArg, cevir, anlat }) {
  const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

  try {
    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp, kumarYasagi(from, sender))
    if (engel) return await yaz(`🎰 ${engel}`)

    const cozum = miktarCoz(miktarArg, xp)
    if (cozum.hata) return await yaz(`🎰 ${cozum.hata}`)

    const s = bahisOyna({ chatJid: from, userJid: sender, miktar: cozum.miktar, cevir })
    if (!s) return await yaz('🎰 Kumarhane şu an kapalı, sonra dene.')
    if (s.yetersiz) return await yaz(`🎰 O kadar XP'n yok. Senin XP'n: ${binlik(s.xp)}`)

    const lines = [...anlat(s.sonuc), '', ...sonucSatirlari(s)]

    await yaz(lines.join('\n'))
  } catch (err) {
    logger.error({ err, from }, 'Kumar komutu başarısız')
    await yaz('🎰 Bir şeyler ters gitti.').catch((e) =>
      logger.error({ err: e }, 'Kumar hata mesajı gönderilemedi'),
    )
  }
}

// --- Plinko: top 8 sıra çividen geçer, her çivide sola ya da sağa düşer ---
// Düştüğü kutu sağa sapma sayısıdır, yani binom dağılımı: kenarlar nadir, orta sık.
// Her risk tablosunun beklenen dönüşü %95-97; değişirse test/kumar.test.js yakalar.
export const PLINKO_SIRA = 8
export const PLINKO_RISK = {
  düşük: [5, 2, 1.1, 0.9, 0.6, 0.9, 1.1, 2, 5],
  orta: [13, 3, 1.2, 0.7, 0.4, 0.7, 1.2, 3, 13],
  yüksek: [29, 4, 1.4, 0.3, 0.2, 0.3, 1.4, 4, 29],
}

export function plinkoRiskCoz(arg) {
  const a = trLower(arg || '')
  if (!a || ['orta', 'o'].includes(a)) return 'orta'
  if (['düşük', 'dusuk', 'd', 'az'].includes(a)) return 'düşük'
  if (['yüksek', 'yuksek', 'y', 'çok', 'cok'].includes(a)) return 'yüksek'
  return null
}

export function plinkoAt(risk, rnd = zar) {
  const yol = Array.from({ length: PLINKO_SIRA }, () => rnd(2))
  const kutu = yol.reduce((t, x) => t + x, 0)
  return { yol, kutu, carpan: PLINKO_RISK[risk][kutu] }
}

// --- Crash: roket çarpanı yükselir, hedefe varmadan patlarsa bahis yanar ---
// WhatsApp'ta canlı "şimdi çek" yazmak mümkün değil, bu yüzden hedef baştan
// verilir (otomatik çekim). Patlama noktası P(X ≥ x) = CRASH_DONUS / x olacak
// şekilde çekilir: hangi hedef seçilirse seçilsin beklenen dönüş %96'dır.
export const CRASH_DONUS = 0.96
export const CRASH_EN_AZ = 1.01
export const CRASH_EN_COK = 1000
export const CRASH_UZAY = 1_000_000

/** "2", "2.5", "2,5x" gibi hedefleri okur; sınır dışıysa null. */
export function crashHedefCoz(arg) {
  const a = String(arg ?? '').trim().toLowerCase().replace(',', '.').replace(/x$/, '')
  if (!/^\d+(\.\d{1,2})?$/.test(a)) return null
  const h = Number(a)
  return h >= CRASH_EN_AZ && h <= CRASH_EN_COK ? h : null
}

/** Patlama noktası, iki basamağa aşağı yuvarlanmış; en az 1.00. */
export function crashNoktasi(rnd = zar) {
  const u = (rnd(CRASH_UZAY) + 1) / CRASH_UZAY
  return Math.max(1, Math.floor((CRASH_DONUS / u) * 100) / 100)
}

export function crashUc(hedef, rnd = zar) {
  const nokta = crashNoktasi(rnd)
  return { nokta, hedef, carpan: nokta >= hedef ? hedef : 0 }
}
