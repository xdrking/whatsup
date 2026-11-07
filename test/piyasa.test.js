// Piyasa olayları, .yatırım ve .tefeci.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { OLAYLAR, olayDilimi, olayUygula, piyasaOlayi } = await import('../lib/olay.js')
const { RISKLER, yatirimSonucu } = await import('../lib/yatirim.js')
const { geriOdeme } = await import('../lib/tefeci.js')
const {
  addXp, bankaYatir, bankaBakiyesi, getStats, iflasEt, krediCek, recordMessage, tefeciCevap, tefeciDurumu, tefeciOde,
  tefeciTeklif, xpAyarla, xpDevret, yatirimTopla, yatirimYap,
} = await import('../lib/stats.js')

const SAAT = 60 * 60 * 1000
const T = Date.UTC(2026, 10, 7, 3) // İstanbul 06:00, dilim başı
let n = 0
const yeniGrup = () => `p${++n}@g.us`
const xp = (c, u) => getStats(c, u).xp

test('olay 6 saat sürer, dilim İstanbul 00/06/12/18 başlar', () => {
  assert.equal(OLAYLAR.reduce((t, o) => t + o.agirlik, 0), 100)
  assert.equal(olayDilimi(T), olayDilimi(T + 6 * SAAT - 1))
  assert.notEqual(olayDilimi(T), olayDilimi(T - 1))
  const o = piyasaOlayi('a@g.us', T + SAAT)
  assert.equal(o.bitis, T + 6 * SAAT)
  assert.deepEqual(piyasaOlayi('a@g.us', T + 2 * SAAT), o)
  assert.equal(olayUygula({ maas: 150 }, 'maas', 1000), 1500)
  assert.equal(olayUygula({}, 'maas', 1000), 1000)
})

test('olaylar zamanla değişir', () => {
  const gorulen = new Set()
  for (let i = 0; i < 200; i++) gorulen.add(piyasaOlayi('a@g.us', T + i * 6 * SAAT).kod)
  assert.equal(gorulen.size, OLAYLAR.length)
})

test('yatırım sonuçları: ağırlıklar 100, olay yalnızca kârı etkiler', () => {
  for (const r of Object.values(RISKLER)) assert.equal(r.sonuclar.reduce((t, [, a]) => t + a, 0), 100)
  assert.equal(yatirimSonucu('yuksek', 0), 0)
  assert.equal(yatirimSonucu('yuksek', 99), 400)
  assert.equal(yatirimSonucu('dusuk', 0, 80), 90)
  assert.equal(yatirimSonucu('dusuk', 30, 120), 112)
})

test('yatırım: para kilitlenir, vadede ödenir, açıkken iflas ve ikinci yatırım yok', () => {
  const c = yeniGrup()
  addXp({ chatJid: c, userJid: 'a', amount: 10_000, at: T })
  const s = yatirimYap({ chatJid: c, userJid: 'a', miktar: 5000, risk: 'yuksek', rnd: () => 99, now: T })
  assert.equal(s.xp, 5000)
  assert.ok(yatirimYap({ chatJid: c, userJid: 'a', miktar: 1000, risk: 'orta', rnd: () => 0, now: T }).acik)
  assert.ok(yatirimTopla({ chatJid: c, userJid: 'a', now: T + SAAT }).bekle)

  const sonuc = yatirimTopla({ chatJid: c, userJid: 'a', now: T + 6 * SAAT })
  assert.equal(sonuc.miktar, 5000)
  assert.ok(sonuc.odeme >= 5000 * 4)
  assert.equal(xp(c, 'a'), 5000 + sonuc.odeme)
  assert.ok(yatirimTopla({ chatJid: c, userJid: 'a', now: T + 7 * SAAT }).yok)
})

test('tefeci: teklif, kabul, kısmi ödeme, devret açık kalır', () => {
  const c = yeniGrup()
  addXp({ chatJid: c, userJid: 'ali', amount: 10_000, at: T })
  assert.equal(geriOdeme(5000, 20), 6000)

  assert.deepEqual(tefeciTeklif({ chatJid: c, alacakli: 'ali', borclu: 'veli', miktar: 5000, faiz: 20, saat: 2, now: T }), { borc: 6000 })
  assert.ok(tefeciTeklif({ chatJid: c, alacakli: 'ali', borclu: 'veli', miktar: 1000, faiz: 0, saat: 1, now: T }).teklifVar)
  assert.equal(xp(c, 'ali'), 10_000)

  const k = tefeciCevap({ chatJid: c, borclu: 'veli', kabul: true, now: T })
  assert.equal(k.borc, 6000)
  assert.equal(xp(c, 'ali'), 5000)
  assert.equal(xp(c, 'veli'), 5000)

  assert.deepEqual(xpDevret({ chatJid: c, kaynak: 'veli', hedef: 'ali', miktar: 1000 }).hata, undefined)
  const o = tefeciOde({ chatJid: c, borclu: 'veli', miktar: 2000, now: T })
  assert.equal(o.kalan, 4000)
  assert.equal(tefeciDurumu({ chatJid: c, userJid: 'ali', now: T }).alacaklar[0].borc, 4000)
})

test('tefeci: vadede cüzdan ve bankadan alınır, kalan sonraki paradan kesilir', () => {
  const c = yeniGrup()
  addXp({ chatJid: c, userJid: 'ali', amount: 10_000, at: T })
  tefeciTeklif({ chatJid: c, alacakli: 'ali', borclu: 'veli', miktar: 10_000, faiz: 50, saat: 1, now: T })
  tefeciCevap({ chatJid: c, borclu: 'veli', kabul: true, now: T })
  bankaYatir({ chatJid: c, userJid: 'veli', miktar: 4000, now: T })
  xpAyarla({ chatJid: c, userJid: 'veli', miktar: -6000, at: T })

  recordMessage({ chatJid: c, userJid: 'veli', type: 'conversation', at: T + 30 * 60_000 })
  assert.equal(tefeciDurumu({ chatJid: c, userJid: 'veli', now: T + 30 * 60_000 }).borc.borc, 15_000)

  const vade = T + SAAT
  const veliXp = xp(c, 'veli')
  recordMessage({ chatJid: c, userJid: 'veli', type: 'conversation', at: vade })
  const kalan = tefeciDurumu({ chatJid: c, userJid: 'veli', now: vade }).borc.borc
  assert.ok(kalan > 0 && kalan < 15_000)
  assert.equal(xp(c, 'veli'), 0)
  assert.equal(bankaBakiyesi(c, 'veli'), 0)
  assert.equal(xp(c, 'ali'), 15_000 - kalan)

  addXp({ chatJid: c, userJid: 'veli', amount: 50_000, at: vade + 1 })
  recordMessage({ chatJid: c, userJid: 'veli', type: 'conversation', at: vade + 2 * 60_000 })
  assert.equal(tefeciDurumu({ chatJid: c, userJid: 'veli', now: vade + 2 * 60_000 }).borc, null)
  assert.equal(xp(c, 'ali'), 15_000)
  assert.ok(veliXp >= 0)
})

test('tefeci: kredili kişi borç veremez, red teklifi siler', () => {
  const c = yeniGrup()
  addXp({ chatJid: 'kasa', userJid: 'x', amount: 1 })
  addXp({ chatJid: c, userJid: 'ali', amount: 10_000, at: T })
  tefeciTeklif({ chatJid: c, alacakli: 'ali', borclu: 'veli', miktar: 2000, faiz: 10, saat: 1, now: T })
  assert.ok(tefeciCevap({ chatJid: c, borclu: 'veli', kabul: false, now: T }).reddedildi)
  assert.equal(tefeciDurumu({ chatJid: c, userJid: 'veli', now: T }).borc, null)
  assert.ok(iflasEt({ chatJid: c, userJid: 'ali', now: T }).borcYok)
  assert.equal(typeof krediCek, 'function')
})
