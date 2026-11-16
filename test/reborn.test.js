// Reborn: ekonominin sıfırlanması, kalanlar, yıldız ve gizli crash şansı. Veritabanı bellekte açılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { getDb } = await import('../lib/db.js')
const { HAZINE_TOHUMU, REBORN_CRASH_SANSI, REBORN_SANS_MS, rebornKabul, rebornOyu, SILINEN_TABLOLAR } = await import('../lib/reborn.js')
const { CRASH_UZAY, crashUc, sansliCevir } = await import('../lib/kumar.js')
const {
  bankaBakiyesi, bankaYatir, botHesabiniTani, coinAyarla, coinDurumu, ekonomiDurumu, getStats, recordMessage,
  rebornOnizle, rebornSansiVar, rebornYap, rebornYildizi, sonReborn, xpAyarla,
} = await import('../lib/stats.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

test('oy ayrıştırma ve kabul kuralı', () => {
  assert.equal(rebornOyu('Evet!'), 'evet')
  assert.equal(rebornOyu('HAYIR'), 'hayir')
  assert.equal(rebornOyu('belki'), null)
  assert.equal(rebornKabul(2, 1), true)
  assert.equal(rebornKabul(1, 1), false)
  assert.equal(rebornKabul(0, 0), false)
})

test('silinen tabloların hepsi şemada ve chat_jid taşıyor', () => {
  for (const tablo of SILINEN_TABLOLAR) {
    const sutunlar = getDb().pragma(`table_info(${tablo})`).map((s) => s.name)
    assert.ok(sutunlar.includes('chat_jid'), tablo)
  }
})

test('reborn parayı sıfırlar, sayaçları ve öteki grubu korur, zenginlere yıldız verir', () => {
  const chatJid = 'r1@g.us'
  const diger = 'r2@g.us'
  for (const [jid, miktar] of [['a@s', 9_000_000], ['b@s', 5_000_000], ['c@s', 2_000_000], ['d@s', 1_000]]) xpAyarla({ chatJid, userJid: jid, miktar })
  xpAyarla({ chatJid, userJid: BOT, miktar: 50_000_000 })
  xpAyarla({ chatJid: diger, userJid: 'a@s', miktar: 777 })
  recordMessage({ chatJid, userJid: 'a@s', type: 'conversation', at: T })
  bankaYatir({ chatJid, userJid: 'a@s', miktar: 4_000_000, now: T })
  coinAyarla({ chatJid, userJid: 'b@s', adet: 3 })
  getDb().prepare("INSERT INTO meslek (chat_jid, user_jid, kod, secim) VALUES (?, 'c@s', 'kurye', ?)").run(chatJid, T)
  const mesaj = getStats(chatJid, 'a@s').messages
  assert.ok(mesaj > 0)

  assert.equal(rebornOnizle({ chatJid, now: T }).no, 1)
  assert.ok(getStats(chatJid, 'a@s').xp > 0, 'önizleme yazmaz')

  const s = rebornYap({ chatJid, now: T })
  assert.equal(s.no, 1)
  assert.deepEqual(s.zenginler.map((z) => z.user_jid), ['a@s', 'b@s', 'c@s'])

  for (const jid of ['a@s', 'b@s', 'c@s', 'd@s']) assert.equal(getStats(chatJid, jid).xp, 0)
  assert.equal(getStats(chatJid, 'a@s').messages, mesaj)
  assert.equal(bankaBakiyesi(chatJid, 'a@s'), 0)
  assert.equal(coinDurumu(chatJid, 'b@s').bakiye, 0)
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM meslek WHERE chat_jid = ?').get(chatJid).n, 0)
  assert.equal(getStats(chatJid, BOT).xp, 0)
  assert.equal(bankaBakiyesi(chatJid, BOT), HAZINE_TOHUMU)
  assert.equal(getStats(diger, 'a@s').xp, 777)

  assert.equal(rebornYildizi(chatJid, 'a@s'), 1)
  assert.equal(rebornYildizi(chatJid, 'd@s'), 0)
  assert.equal(sonReborn(chatJid).no, 1)
  assert.equal(ekonomiDurumu({ chatJid, now: T + 1000 }).anlik, 0)

  assert.equal(rebornYap({ chatJid, now: T + 5000 }).no, 2)
})

test('gizli şans yalnızca reborn sonrası ilk pencerede açık', () => {
  const chatJid = 'r3@g.us'
  assert.equal(rebornSansiVar(chatJid, T), false)
  rebornYap({ chatJid, now: T })
  assert.equal(rebornSansiVar(chatJid, T + 1), true)
  assert.equal(rebornSansiVar(chatJid, T + REBORN_SANS_MS - 1), true)
  assert.equal(rebornSansiVar(chatJid, T + REBORN_SANS_MS), false)
})

test('şanslı crash: tutma şansı en çok %25 artar, hiçbir hedef garanti değildir', () => {
  for (const hedef of [1.01, 2, 10]) {
    // Çekiliş uzayı örneklenir: p = tek çekilişte tutma olasılığı.
    let tutan = 0
    let toplam = 0
    for (let i = 0; i < CRASH_UZAY; i += 97) {
      toplam++
      if (crashUc(hedef, () => i).carpan) tutan++
    }
    const p = tutan / toplam
    const sansli = p + (1 - p) * REBORN_CRASH_SANSI * p
    assert.ok(sansli < 1, `hedef ${hedef} garanti olmamalı`)
    assert.ok(sansli / p <= 1 + REBORN_CRASH_SANSI)
  }

  // Kaybeden çekiliş, zar tutarsa ikinci kez atılır ve iyisi kalır.
  const sira = [{ carpan: 0 }, { carpan: 2 }]
  assert.equal(sansliCevir(() => sira.shift(), REBORN_CRASH_SANSI, () => 0)().carpan, 2)
  assert.equal(sansliCevir(() => ({ carpan: 0 }), REBORN_CRASH_SANSI, () => 99)().carpan, 0)
})
