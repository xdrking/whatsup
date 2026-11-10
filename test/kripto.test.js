// .kripto: Suly, ondalıklı miktar, arza katılım, haciz ve iflas.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { BIRIM, sulyCoz, sulyDegeri, sulyFiyati, sulyYaz } = await import('../lib/kripto.js')
const { REFERANS_KUR } = await import('../lib/coin.js')
const { miktarMetni } = await import('../commands/kripto.js')
const {
  addXp, bankaDurumu, botHesabiniTani, darbeSonuc, ekonomiDurumu, getStats, iflasEt, kriptoAl, kriptoDurumu, kriptoHaciz, kriptoSat,
  servetDurumu,
} = await import('../lib/stats.js')
const { getDb } = await import('../lib/db.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
const USD = 74_912.36
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `k${++sayac}@g.us`
const xpVer = (chatJid, userJid, amount) => addXp({ chatJid, userJid, amount })

test('miktar: virgül ve nokta ondalıktır, en çok 8 basamak', () => {
  assert.equal(sulyCoz('12,46'), 12.46 * BIRIM)
  assert.equal(sulyCoz('0.001'), 100_000)
  assert.equal(sulyCoz('5'), 5 * BIRIM)
  assert.equal(sulyCoz('0,00000001'), 1)
  assert.equal(sulyCoz('0,000000001'), null)
  assert.equal(sulyCoz('0'), null)
  assert.equal(sulyCoz('-1'), null)
  assert.equal(sulyCoz('abc'), null)
  assert.equal(sulyYaz(1_246_000_000), '12,46')
  assert.equal(sulyYaz(100_000), '0,001')
  assert.equal(sulyYaz(1_000 * BIRIM), '1.000')
  assert.equal(miktarMetni('al suly 0.001'), '0.001')
  assert.equal(miktarMetni('sat Suly hepsi'), 'hepsi')
  assert.equal(miktarMetni('al 2,5'), '2,5')
})

test('fiyat dolar fiyatıdır, kurla doğrusal büyür', () => {
  assert.equal(sulyFiyati(USD, REFERANS_KUR), USD)
  assert.equal(sulyDegeri(2 * BIRIM, USD, REFERANS_KUR * 2), Math.floor(USD * 4))
})

test('al ve sat: XP yanar, satışta %1 hazineye, piyasa değişmez', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a@s', 1_000_000_000)

  const once = ekonomiDurumu({ chatJid, now: T })
  const al = kriptoAl({ chatJid, userJid: 'a@s', birim: sulyCoz('0,5'), usd: USD, now: T })
  assert.equal(al.birim, BIRIM / 2)
  assert.equal(al.ucret, Math.ceil(0.5 * sulyFiyati(USD, al.kur)))
  // Suly arzda sayıldığı için almak piyasayı (yuvarlama dışında) değiştirmez.
  assert.ok(Math.abs(ekonomiDurumu({ chatJid, now: T }).anlik - once.anlik) <= 1)

  const kasa = bankaDurumu({ chatJid, userJid: BOT, now: T }).bakiye
  const sat = kriptoSat({ chatJid, userJid: 'a@s', birim: null, usd: USD, now: T })
  assert.equal(sat.birim, 0)
  assert.equal(sat.kazanc + sat.kesinti, sulyDegeri(BIRIM / 2, USD, al.kur))
  assert.ok(sat.kesinti > 0)
  assert.equal(bankaDurumu({ chatJid, userJid: BOT, now: T }).bakiye, kasa + sat.kesinti)
  assert.equal(kriptoDurumu({ chatJid, userJid: 'a@s', now: T }).birim, 0)
})

test('yetmeyen XP, fazla satış ve borçlu alım reddedilir', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a@s', 1000)
  assert.ok(kriptoAl({ chatJid, userJid: 'a@s', birim: BIRIM, usd: USD, now: T }).yetersiz)
  assert.equal(getStats(chatJid, 'a@s').xp, 1000)
  assert.ok(kriptoSat({ chatJid, userJid: 'a@s', birim: 1, usd: USD, now: T }).yetersiz)

  eksiyeIndir(chatJid, 'b@s')
  assert.ok(kriptoAl({ chatJid, userJid: 'b@s', birim: 1, usd: USD, now: T }).borclu)
})

test('haciz değeri kasaya geçirir, iflas Suly varken reddedilir, servet sayar', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a@s', 1_000_000_000)
  kriptoAl({ chatJid, userJid: 'a@s', birim: 2 * BIRIM, usd: USD, now: T })

  const servet = servetDurumu({ chatJid, userJid: 'a@s', now: T })
  assert.equal(servet.kriptoBirim, 2 * BIRIM)
  assert.ok(servet.kripto > 0)

  eksiyeIndir(chatJid, 'a@s')
  assert.ok(iflasEt({ chatJid, userJid: 'a@s', now: T }).kripto)

  const h = kriptoHaciz({ chatJid, userJid: 'a@s', birim: BIRIM, usd: USD, now: T })
  assert.equal(h.kalan, BIRIM)
  assert.equal(h.kasaya, sulyDegeri(BIRIM, USD, kriptoDurumu({ chatJid, userJid: 'a@s', now: T }).kur))
  assert.equal(kriptoHaciz({ chatJid, userJid: 'a@s', birim: 5 * BIRIM, usd: USD, now: T }).alinan, BIRIM)
  assert.ok(kriptoHaciz({ chatJid, userJid: 'a@s', usd: USD, now: T }).yok)
})

test('darbe destek vermeyenin bütün Suly\'sine el koyar, değeri hazineye girer', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a@s', 1_000_000_000)
  kriptoAl({ chatJid, userJid: 'a@s', birim: BIRIM, usd: USD, now: T })
  const cuzdan = getStats(chatJid, 'a@s').xp
  const kasa = ekonomiDurumu({ chatJid, now: T }).kasa
  const deger = sulyDegeri(BIRIM, USD, kriptoDurumu({ chatJid, userJid: 'a@s', now: T }).kur)
  const s = darbeSonuc({ chatJid, destekciler: [], muhalifler: ['a@s'], odul: 0, now: T })
  assert.equal(s.ceza[0].suly, BIRIM)
  assert.equal(s.ceza[0].kasaya, cuzdan + deger)
  assert.equal(kriptoDurumu({ chatJid, userJid: 'a@s', now: T }).birim, 0)
  assert.equal(ekonomiDurumu({ chatJid, now: T }).kasa, kasa + cuzdan + deger)
})

// Cüzdanı eksiye indirir: xpAyarla sıfırın altına inmediği için doğrudan yazılır.
function eksiyeIndir(chatJid, userJid) {
  addXp({ chatJid, userJid, amount: 1 })
  getDb().prepare('UPDATE stats SET xp = -100 WHERE chat_jid = ? AND user_jid = ?').run(chatJid, userJid)
}
