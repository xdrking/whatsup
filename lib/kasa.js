// .market'teki random key'ler. Saf; satın alma ve ödülün yazılması lib/stats.js'tedir.
import { randomInt } from 'node:crypto'
import { kartCek, SETLER } from './kart.js'

const SAAT_MS = 60 * 60 * 1000

const xp = (miktar, agirlik) => ({
  etiket: `${miktar >= 2500 ? '💎' : '💰'} +${miktar.toLocaleString('tr-TR')} XP`, agirlik, xp: miktar,
})
const bos = (agirlik) => ({ etiket: '🔒 Bölge kilitli key çıktı, içi boş', agirlik })
const kat = (yuzde, agirlik) => ({
  etiket: `🚀 1 saat oyunlardan ${(100 + yuzde) / 100} kat XP`, agirlik, bonus: yuzde,
})
const kalkan = (saat, agirlik) => ({
  etiket: `🛡️ ${saat} saat soygun kalkanı`, agirlik, kalkanMs: saat * SAAT_MS,
})
const carkHakki = (agirlik) => ({ etiket: '🎡 +1 ücretsiz çark hakkı', agirlik, carkHakki: 1 })
const soygunHakki = (agirlik) => ({ etiket: '🥷 Bugünlük +1 soygun hakkı', agirlik, soygunHakki: 1 })
const kart = (set, agirlik) => ({ etiket: '🃏 Kart', agirlik, kartSet: set })
const unvan = (ad, agirlik, yedekXp) => ({ etiket: `🏷️ Özel unvan: ${ad}`, agirlik, unvan: ad, yedekXp })

// Satın alma sınırsız olduğu için bir key'in beklenen XP'si, kartların set ödülündeki
// payıyla birlikte fiyatının altında kalmalı (test/ekonomi.test.js denetler). Ağırlıkların toplamı 100: ağırlık = yüzde.
export const KASALAR = [
  {
    ad: '🥉 Bronz Key', fiyat: 50, tur: 'kasa',
    oduller: [bos(20), kart(0, 10), xp(20, 28), xp(50, 22), xp(100, 10), xp(250, 2), carkHakki(3), soygunHakki(3), kalkan(6, 2)],
  },
  {
    ad: '🥈 Gümüş Key', fiyat: 100, tur: 'kasa',
    oduller: [bos(13), kart(0, 12), xp(50, 28), xp(100, 22), xp(250, 8), xp(500, 2), carkHakki(6), soygunHakki(5), kalkan(6, 4)],
  },
  {
    ad: '🥇 Altın Key', fiyat: 250, tur: 'kasa',
    oduller: [bos(12), kart(1, 8), xp(100, 28), xp(250, 20), xp(500, 8), xp(1000, 2), kat(200, 8), carkHakki(6), soygunHakki(2), kalkan(12, 6)],
  },
  {
    ad: '💠 Platin Key', fiyat: 500, tur: 'kasa',
    oduller: [bos(7), kart(1, 8), xp(250, 30), xp(500, 20), xp(1000, 8), xp(2500, 2), kat(200, 8), kat(400, 5), kalkan(24, 7), unvan('🍀 Şanslı', 5, 500)],
  },
  {
    ad: '💎 Elmas Key', fiyat: 750, tur: 'kasa',
    oduller: [bos(6), kart(2, 6), xp(250, 22), xp(500, 28), xp(1000, 14), xp(2500, 3), kat(400, 8), kat(900, 3), kalkan(48, 5), unvan('🗝️ Key Avcısı', 5, 750)],
  },
  {
    ad: '🐉 Efsane Key', fiyat: 1000, tur: 'kasa',
    oduller: [bos(5), kart(2, 5), xp(500, 30), xp(1000, 22), xp(2500, 6), xp(5000, 1), xp(10000, 1), kat(400, 10), kat(900, 6), kalkan(48, 6), unvan('🐉 Efsane', 8, 1000)],
  },
]

function kartiCoz(odul, rnd) {
  if (odul.kartSet === undefined) return odul
  const set = SETLER[odul.kartSet]
  const secilen = kartCek(set, rnd)
  return { ...odul, etiket: `🃏 Kart: ${secilen.ad} (${set.ad})`, kart: secilen.no }
}

export function kasaCek(kasa, rnd = randomInt) {
  let r = rnd(kasa.oduller.reduce((t, o) => t + o.agirlik, 0))
  for (const odul of kasa.oduller) {
    if (r < odul.agirlik) return kartiCoz(odul, rnd)
    r -= odul.agirlik
  }
  return kasa.oduller[0]
}
