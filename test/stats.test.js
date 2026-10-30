// XP, seviye ve günlük seri. Veritabanı bellekte açılır, data/stats.db'ye dokunulmaz.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { seviye, gunlukOdul, claimDaily, getDailyStreak, addXp, getStats, recordMessage } =
  await import('../lib/stats.js')

// Türkiye öğlen saati: gün sınırına yakın olmasın.
const gun = (tarih) => new Date(`${tarih}T12:00:00+03:00`)

test('seviye eğrisi', () => {
  assert.equal(seviye(0), 1)
  assert.equal(seviye(49), 1)
  assert.equal(seviye(50), 2)
  assert.equal(seviye(200), 3)
})

test('günlük ödül serisi 20 → 50 arasında', () => {
  assert.equal(gunlukOdul(1), 20)
  assert.equal(gunlukOdul(2), 25)
  assert.equal(gunlukOdul(7), 50)
  assert.equal(gunlukOdul(30), 50)
})

test('günlük: aynı gün ikinci kez verilmez, seri artar ve bozulur', () => {
  const kim = { chatJid: 'g', userJid: 'u1' }

  assert.deepEqual(claimDaily({ ...kim, now: gun('2026-01-01') }), { alindi: true, seri: 1, miktar: 20 })
  assert.equal(claimDaily({ ...kim, now: gun('2026-01-01') }).alindi, false)
  assert.deepEqual(claimDaily({ ...kim, now: gun('2026-01-02') }), { alindi: true, seri: 2, miktar: 25 })
  // Bir gün atlandı: seri baştan.
  assert.deepEqual(claimDaily({ ...kim, now: gun('2026-01-04') }), { alindi: true, seri: 1, miktar: 20 })

  assert.equal(getStats('g', 'u1').xp, 65)
})

test('getDailyStreak: dün alındıysa sürer, daha eskiyse 0', () => {
  const kim = { chatJid: 'g', userJid: 'u2' }
  claimDaily({ ...kim, now: gun('2026-03-10') })
  claimDaily({ ...kim, now: gun('2026-03-11') })

  assert.equal(getDailyStreak('g', 'u2', gun('2026-03-11')), 2)
  assert.equal(getDailyStreak('g', 'u2', gun('2026-03-12')), 2)
  assert.equal(getDailyStreak('g', 'u2', gun('2026-03-13')), 0)
})

test('mesaj XP cooldown: 30 sn içinde ikinci mesaj sayılır ama XP vermez', () => {
  const at = 5_000_000
  recordMessage({ chatJid: 'g', userJid: 'u3', type: 'conversation', at })
  recordMessage({ chatJid: 'g', userJid: 'u3', type: 'conversation', at: at + 1000 })
  recordMessage({ chatJid: 'g', userJid: 'u3', type: 'stickerMessage', at: at + 31_000 })

  const s = getStats('g', 'u3')
  assert.equal(s.messages, 2)
  assert.equal(s.stickers, 1)
  assert.equal(s.xp, 3)

  addXp({ chatJid: 'g', userJid: 'u3', amount: 10 })
  assert.equal(getStats('g', 'u3').xp, 13)
})
