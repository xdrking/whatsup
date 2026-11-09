// Sıfır atma: XP tutarları bölünür, coin ve sayaçlar bölünmez, grup süzgeci çalışır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { getDb } = await import('../lib/db.js')
const { sifirAt, SIFIR_AT_SUTUNLARI } = await import('../lib/sifirAt.js')

test('sıfır atma: XP bölünür, coin ve mesaj sayısı kalır', () => {
  const db = getDb()
  db.prepare('INSERT INTO stats (chat_jid, user_jid, messages, xp) VALUES (?, ?, ?, ?)').run('g1', 'a', 42, 671_812_827_401)
  db.prepare('INSERT INTO stats (chat_jid, user_jid, messages, xp) VALUES (?, ?, ?, ?)').run('g1', 'b', 5, -1_500)
  db.prepare('INSERT INTO stats (chat_jid, user_jid, messages, xp) VALUES (?, ?, ?, ?)').run('g2', 'a', 1, 5_000)
  db.prepare('INSERT INTO banka (chat_jid, user_jid, bakiye, faiz_artik) VALUES (?, ?, ?, ?)').run('g1', 'a', 2_000_000, 0.5)
  db.prepare('INSERT INTO coin (chat_jid, user_jid, bakiye) VALUES (?, ?, ?)').run('g1', 'a', 7)
  db.prepare('INSERT INTO portfoy (chat_jid, user_jid, hisse, adet, maliyet) VALUES (?, ?, ?, ?, ?)').run('g1', 'a', 'muz', 3, 300)

  sifirAt(db, { chat: 'g1' })

  const xp = (c, u) => db.prepare('SELECT xp, messages FROM stats WHERE chat_jid = ? AND user_jid = ?').get(c, u)
  assert.deepEqual({ ...xp('g1', 'a') }, { xp: 671_812_827, messages: 42 })
  assert.equal(xp('g1', 'b').xp, -1)
  assert.equal(xp('g2', 'a').xp, 5_000, 'başka grup değişmez')
  const banka = db.prepare('SELECT bakiye, faiz_artik FROM banka').get()
  assert.equal(banka.bakiye, 2_000)
  assert.equal(banka.faiz_artik, 0.0005)
  assert.equal(db.prepare('SELECT bakiye FROM coin').get().bakiye, 7)
  assert.deepEqual({ ...db.prepare('SELECT adet, maliyet FROM portfoy').get() }, { adet: 0.003, maliyet: 0 })
})

test('sıfır atma: listedeki her tablo ve sütun şemada var', () => {
  const db = getDb()
  for (const [tablo, sutunlar] of SIFIR_AT_SUTUNLARI) {
    const var_ = db.pragma(`table_info(${tablo})`).map((s) => s.name)
    for (const s of sutunlar) assert.ok(var_.includes(s), `${tablo}.${s}`)
  }
  assert.throws(() => sifirAt(db, { bolen: 1 }))
})
