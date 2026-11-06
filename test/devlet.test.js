// .faizkararı, .teşvik ve artan oranlı vergi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { SAAT_MS } = await import('../lib/borsa.js')
const { borcIslet } = await import('../lib/kredi.js')
const {
  addXp, bankaBakiyesi, bankaDurumu, bankaYatir, botHesabiniTani, faizDurumu, faizKarari, getStats, krediCek, krediDurumu, recordMessage, tesvikDagit,
} = await import('../lib/stats.js')

const BOT = '905550000000@s.whatsapp.net'
const T = Math.floor(new Date('2026-06-10T12:00:00+03:00').getTime() / SAAT_MS) * SAAT_MS
const GUN = 24 * SAAT_MS
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `d${++sayac}@g.us`
const xpVer = (chatJid, userJid, amount, at = T) => addXp({ chatJid, userJid, amount, at })

test('faiz kararı: varsayılan 15/19, kredi hep 4 puan üstte', () => {
  const chatJid = yeniGrup()
  assert.deepEqual(faizDurumu(chatJid), { banka: 15, kredi: 19 })
  assert.deepEqual(faizKarari({ chatJid, oran: 25, now: T }), { once: 15, banka: 25, kredi: 29 })
  assert.deepEqual(faizDurumu(chatJid), { banka: 25, kredi: 29 })
  assert.deepEqual(faizDurumu(yeniGrup()), { banka: 15, kredi: 19 })
})

test('faiz kararı geçmiş saatlere uygulanmaz, sonraki saatlere uygulanır', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  xpVer(chatJid, userJid, 10_000)
  bankaYatir({ chatJid, userJid, miktar: 10_000, now: T })

  // T+1'de bekleyen para faiz almaz, T+2'de eski oranla %15 alır.
  faizKarari({ chatJid, oran: 0, now: T + 2 * SAAT_MS })
  assert.equal(bankaBakiyesi(chatJid, userJid), 11_500)

  assert.equal(bankaDurumu({ chatJid, userJid, now: T + 5 * SAAT_MS }).bakiye, 11_500)

  faizKarari({ chatJid, oran: 10, now: T + 5 * SAAT_MS })
  assert.equal(bankaDurumu({ chatJid, userJid, now: T + 6 * SAAT_MS }).bakiye, 12_650)
})

test('faiz kararı krediye de işler', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  xpVer(chatJid, BOT, 100_000)
  krediCek({ chatJid, userJid, miktar: 1000, now: T })

  faizKarari({ chatJid, oran: 31, now: T + SAAT_MS })
  const eski = borcIslet(1000, 1)
  assert.equal(krediDurumu({ chatJid, userJid, now: T + 2 * SAAT_MS }).borc, borcIslet(eski, 1, 35))
})

test('teşvik: aktif üyelere eşit, artık kasada kalır, bot ve eskiler alamaz', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, BOT, 1000)
  recordMessage({ chatJid, userJid: 'a@s', type: 'conversation', at: T })
  recordMessage({ chatJid, userJid: 'b@s', type: 'conversation', at: T })
  recordMessage({ chatJid, userJid: 'eski@s', type: 'conversation', at: T - 8 * GUN })
  const once = getStats(chatJid, 'a@s').xp
  const uyeler = ['a@s', 'b@s', 'eski@s', BOT, 'yeni@s']

  assert.deepEqual(tesvikDagit({ chatJid, uyeler, miktar: 5000, now: T }), { yetersiz: true, kasa: 1000 })

  assert.deepEqual(tesvikDagit({ chatJid, uyeler, miktar: 501, now: T }), { kisi: 2, pay: 250, toplam: 500, kasa: 500 })
  assert.equal(getStats(chatJid, 'a@s').xp, once + 250)
  assert.equal(getStats(chatJid, BOT).xp, 500)

  assert.deepEqual(tesvikDagit({ chatJid, uyeler: ['eski@s'], miktar: 10, now: T }), { kimseYok: true })
})

test('teşvik önce botun bankasından çıkar', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, BOT, 1000)
  bankaYatir({ chatJid, userJid: BOT, miktar: 600, now: T })
  recordMessage({ chatJid, userJid: 'a@s', type: 'conversation', at: T })

  tesvikDagit({ chatJid, uyeler: ['a@s'], miktar: 800, now: T })
  assert.equal(bankaBakiyesi(chatJid, BOT), 0)
  assert.equal(getStats(chatJid, BOT).xp, 200)
})

test('bot servet vergisinden muaftır', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, BOT, 50_000_000)
  recordMessage({ chatJid, userJid: BOT, type: 'conversation', at: T })
  assert.ok(getStats(chatJid, BOT).xp >= 50_000_000)
})
