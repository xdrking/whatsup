// .sustur: susturulan üye listesi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { susturulanUyeler, uyeSerbest, uyeSustur, uyeSusturuldu } = await import('../lib/uyeSustur.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()

test('süresiz susturma kaldırılana kadar sürer, kimliklerden biri tutması yeter', () => {
  uyeSustur('g1@g.us', '111@lid', 0, T)
  assert.equal(uyeSusturuldu('g1@g.us', ['905@s.whatsapp.net', '111@lid'], T + 1e10), true)
  assert.equal(uyeSusturuldu('g2@g.us', ['111@lid'], T), false)
  assert.equal(uyeSerbest('g1@g.us', '111@lid'), true)
  assert.equal(uyeSusturuldu('g1@g.us', ['111@lid'], T), false)
  assert.equal(uyeSerbest('g1@g.us', '111@lid'), false)
})

test('süreli susturma süresi dolunca kendiliğinden düşer', () => {
  uyeSustur('g3@g.us', 'a@s', 30, T)
  assert.equal(uyeSusturuldu('g3@g.us', ['a@s'], T + 29 * 60_000), true)
  assert.equal(susturulanUyeler('g3@g.us', T).length, 1)
  assert.equal(uyeSusturuldu('g3@g.us', ['a@s'], T + 30 * 60_000), false)
  assert.equal(susturulanUyeler('g3@g.us', T).length, 0)
})
