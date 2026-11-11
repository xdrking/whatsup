// .istifa ve .coindevret.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { meslekBul } = await import('../lib/meslek.js')
const { addXp, botHesabiniTani, calis, coinAl, coinDevret, coinDurumu, krediCek, meslekDurumu, meslekIstifa, meslekSec } = await import('../lib/stats.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const SAAT = 3_600_000
const rnd = (a) => a
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

test('istifa: meslek gider, çalış maaş vermez, değişim beklemesi kısalmaz', () => {
  const chatJid = 'istifa@g.us'
  meslekSec({ chatJid, userJid: 'a', meslek: meslekBul('garson'), now: T })
  assert.deepEqual(meslekIstifa({ chatJid, userJid: 'a', now: T + SAAT }), { meslek: meslekBul('garson'), sonraki: T + 24 * SAAT })
  assert.equal(meslekDurumu(chatJid, 'a', T + SAAT), null)
  assert.deepEqual(calis({ chatJid, userJid: 'a', rnd, now: T + SAAT }), { meslekYok: true })
  assert.equal(meslekIstifa({ chatJid, userJid: 'a', now: T + SAAT }).yok, true)

  assert.equal(meslekSec({ chatJid, userJid: 'a', meslek: meslekBul('kurye'), now: T + 2 * SAAT }).bekle, true)
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: meslekBul('kurye'), now: T + 24 * SAAT }), { tamam: true })
})

test('istifa: futbolcu kariyeri biter, dönülemez, yeni meslek hemen seçilir', () => {
  const chatJid = 'futbol@g.us'
  const futbolcu = meslekBul('futbolcu')
  meslekSec({ chatJid, userJid: 'a', meslek: futbolcu, now: T })
  assert.deepEqual(meslekIstifa({ chatJid, userJid: 'a', now: T + SAAT }), { meslek: futbolcu, sonraki: T + SAAT })
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: futbolcu, now: T + 2 * SAAT }), { hakBitti: true })
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: meslekBul('kurye'), now: T + 2 * SAAT }), { tamam: true })
})

test('coindevret: toplam coin değişmez, fazlası ve borçlu reddedilir', () => {
  const chatJid = 'coin@g.us'
  addXp({ chatJid, userJid: 'a', amount: 1_000_000_000 })
  assert.ok(coinAl({ chatJid, userJid: 'a', adet: 3, now: T }).bakiye === 3)

  assert.deepEqual(coinDevret({ chatJid, kaynak: 'a', hedef: 'b', adet: 2, now: T }), { kaynakBakiye: 1, hedefBakiye: 2 })
  assert.equal(coinDurumu(chatJid, 'b').bakiye, 2)
  assert.deepEqual(coinDevret({ chatJid, kaynak: 'a', hedef: 'b', adet: 5, now: T }), { yetersiz: true, bakiye: 1 })

  addXp({ chatJid, userJid: BOT, amount: 10_000 })
  assert.ok(krediCek({ chatJid, userJid: 'b', miktar: 1000, now: T }))
  assert.deepEqual(coinDevret({ chatJid, kaynak: 'b', hedef: 'a', adet: 1, now: T }), { borclu: true })
  assert.equal(coinDurumu(chatJid, 'b').bakiye, 2)

  // Sahibin başkası adına devri borç engeline takılmaz, bot da alabilir.
  assert.deepEqual(coinDevret({ chatJid, kaynak: 'b', hedef: BOT, adet: 1, sahipDevri: true, now: T }), { kaynakBakiye: 1, hedefBakiye: 1 })
  assert.equal(coinDurumu(chatJid, BOT).bakiye, 1)
})
