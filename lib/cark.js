// .çark ödül tablosu ve hak hesabı. Fonksiyonlar saftır; yazma lib/stats.js'tedir.
import { randomInt } from 'node:crypto'

export const UCRETSIZ_HAK = 2
export const HAK_PENCERESI_MS = 24 * 60 * 60 * 1000
export const EKSTRA_UCRET = 100
export const BONUS_SURESI_MS = 60 * 60 * 1000

// Ekstra çevirme sınırsız olduğu için tek çevirmenin beklenen XP'si ücretin
// altında kalmalı, yoksa çark XP basma makinesine döner (test/cark.test.js
// bunu denetler). Ağırlıkların toplamı 100: ağırlık = yüzde olasılık.
export const ODULLER = [
  { etiket: '💨 Boş', agirlik: 25 },
  { etiket: '💰 +25 XP', agirlik: 36, xp: 25 },
  { etiket: '💰 +100 XP', agirlik: 12, xp: 100 },
  { etiket: '💎 +300 XP', agirlik: 4, xp: 300 },
  { etiket: '🏆 +1000 XP', agirlik: 1, xp: 1000 },
  { etiket: '🎰 +2500 XP', agirlik: 2, xp: 2500 },
  // bonus yüzdedir: 200 = 3 kat XP.
  { etiket: '🚀 1 saat oyunlardan 3 kat XP', agirlik: 10, bonus: 200 },
  { etiket: '🔥 1 saat oyunlardan 5 kat XP', agirlik: 7, bonus: 400 },
  { etiket: '👑 1 saat oyunlardan 10 kat XP', agirlik: 3, bonus: 900 },
]
const TOPLAM_AGIRLIK = ODULLER.reduce((t, o) => t + o.agirlik, 0)

export function carkCevir(rnd = randomInt) {
  let r = rnd(TOPLAM_AGIRLIK)
  for (const odul of ODULLER) {
    if (r < odul.agirlik) return odul
    r -= odul.agirlik
  }
  return ODULLER[0]
}

/**
 * Pencere, 24 saatteki ilk ücretsiz çevirmeyle başlar. Takvim günü kullanılmaz:
 * o zaman gece yarısının iki yanında 2 dakikada 4 hak kullanılabilirdi.
 *
 * @returns {{ kalan: number, yenilenme: number | null }}  `yenilenme` ms zaman damgası
 */
export function hakDurumu(kayit, now) {
  const acik = Boolean(kayit?.window_start) && now - kayit.window_start < HAK_PENCERESI_MS
  return {
    kalan: UCRETSIZ_HAK - (acik ? kayit.spins : 0),
    yenilenme: acik ? kayit.window_start + HAK_PENCERESI_MS : null,
  }
}

/** Süresi geçmemiş bonus; yoksa null. */
export function aktifBonus(kayit, now) {
  return kayit?.bonus_until > now ? { yuzde: kayit.bonus_percent, bitis: kayit.bonus_until } : null
}

/** Tam sayı XP: küsuratlı yüzde kalırsa yukarı yuvarlanır. */
export function bonusluXp(miktar, yuzde) {
  return Math.ceil((miktar * (100 + yuzde)) / 100)
}
