// .çark: hak penceresi, ekstra ücret, bonus ve oyun XP'sine etkisi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  ODULLER, EKSTRA_UCRET, HAK_PENCERESI_MS, BONUS_SURESI_MS, bonusluXp, carkCevir,
} = await import('../lib/cark.js')
const { addXp, carkDurumu, carkOyna, getStats } = await import('../lib/stats.js')
const { sureYaz } = await import('../commands/cark.js')

const T = 1_000_000_000
const BOS = { etiket: 'boş' }
const bos = () => BOS

let sayac = 0
const yeniKisi = () => ({ chatJid: 'c@g.us', userJid: `${++sayac}@lid` })

test('ödül tablosu: toplam 100, beklenen XP ekstra ücretin altında', () => {
  assert.equal(ODULLER.reduce((t, o) => t + o.agirlik, 0), 100)
  const ev = ODULLER.reduce((t, o) => t + (o.agirlik / 100) * (o.xp || 0), 0)
  assert.ok(ev < EKSTRA_UCRET, `beklenen XP ${ev}`)
})

test('çekiliş: her ödüle ulaşılır', () => {
  const gorulen = new Set()
  for (let r = 0; r < 100; r++) gorulen.add(carkCevir(() => r))
  assert.equal(gorulen.size, ODULLER.length)
})

test('bonus yukarı yuvarlanır, kayan nokta bir fazla vermez', () => {
  assert.equal(bonusluXp(3, 20), 4)
  assert.equal(bonusluXp(5, 30), 7)
  assert.equal(bonusluXp(10, 30), 13)
  assert.equal(bonusluXp(10, 10), 11)
  assert.equal(bonusluXp(5, 100), 10)
})

test('süre yazısı', () => {
  assert.equal(sureYaz(3_660_000), '1 sa 1 dk')
  assert.equal(sureYaz(1000), '1 dk')
})

test('24 saatte 2 ücretsiz hak, pencere dolunca yenilenir', () => {
  const k = yeniKisi()
  assert.equal(carkOyna({ ...k, cevir: bos, now: T }).kalan, 1)
  const ikinci = carkOyna({ ...k, cevir: bos, now: T + 1000 })
  assert.equal(ikinci.kalan, 0)
  assert.equal(ikinci.yenilenme, T + HAK_PENCERESI_MS)

  const yok = carkOyna({ ...k, cevir: bos, now: T + HAK_PENCERESI_MS - 1 })
  assert.equal(yok.hakYok, true)

  assert.equal(carkDurumu({ ...k, now: T + HAK_PENCERESI_MS }).kalan, 2)
  const yeni = carkOyna({ ...k, cevir: bos, now: T + HAK_PENCERESI_MS })
  assert.equal(yeni.kalan, 1)
  assert.equal(yeni.yenilenme, T + 2 * HAK_PENCERESI_MS)
})

test('ekstra: hak varken ücret alınmaz, hak bitince alınır, XP yetmezse çevrilmez', () => {
  const k = yeniKisi()
  addXp({ ...k, amount: EKSTRA_UCRET + 5 })

  assert.equal(carkOyna({ ...k, ekstra: true, cevir: bos, now: T }).ucret, 0)
  carkOyna({ ...k, cevir: bos, now: T })
  assert.equal(getStats(k.chatJid, k.userJid).xp, EKSTRA_UCRET + 5)

  const ucretli = carkOyna({ ...k, ekstra: true, cevir: () => ({ xp: 10 }), now: T })
  assert.equal(ucretli.ucret, EKSTRA_UCRET)
  assert.equal(ucretli.xp, 15)
  assert.equal(ucretli.kalan, 0)
  assert.equal(ucretli.yenilenme, T + HAK_PENCERESI_MS)

  let cekildi = false
  const yetmez = carkOyna({ ...k, ekstra: true, cevir: () => { cekildi = true; return BOS }, now: T })
  assert.deepEqual(yetmez, { yetersiz: true, xp: 15 })
  assert.equal(cekildi, false)
})

test('bonus yalnızca süresi içinde oyun XP\'sini artırır ve miktarı döner', () => {
  const k = yeniKisi()
  carkOyna({ ...k, cevir: () => ({ bonus: 50 }), now: T })

  assert.equal(addXp({ ...k, amount: 5, at: T + 1 }), 8)
  assert.equal(addXp({ ...k, amount: 5, at: T + BONUS_SURESI_MS }), 5)
  assert.equal(getStats(k.chatJid, k.userJid).xp, 13)
})

test('10 kat bonus 50 XP\'lik oyun ödülünü 500 yapar', () => {
  const k = yeniKisi()
  carkOyna({ ...k, cevir: () => ({ bonus: 900 }), now: T })
  assert.equal(addXp({ ...k, amount: 50, at: T + 1 }), 500)
})

test('bonus başka kişiye ya da gruba geçmez', () => {
  const k = yeniKisi()
  carkOyna({ ...k, cevir: () => ({ bonus: 100 }), now: T })
  assert.equal(addXp({ ...yeniKisi(), amount: 5, at: T + 1 }), 5)
  assert.equal(addXp({ ...k, chatJid: 'baska@g.us', amount: 5, at: T + 1 }), 5)
})

test('bonus üst üste: güçlü olan kalır, süre yenilenir; XP ödülü bonusu silmez', () => {
  const k = yeniKisi()
  carkOyna({ ...k, cevir: () => ({ bonus: 50 }), now: T })
  const zayif = carkOyna({ ...k, cevir: () => ({ bonus: 20 }), now: T + 1000 })
  assert.deepEqual(zayif.bonus, { yuzde: 50, bitis: T + 1000 + BONUS_SURESI_MS })

  addXp({ ...k, amount: EKSTRA_UCRET })
  const xpOdulu = carkOyna({ ...k, ekstra: true, cevir: () => ({ xp: 10 }), now: T + 2000 })
  assert.equal(xpOdulu.bonus.yuzde, 50)
  assert.equal(carkDurumu({ ...k, now: T + 2000 }).bonus.yuzde, 50)
})
