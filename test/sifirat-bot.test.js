// Bir sıfır atma, bot hariç: üyelerin bütün XP tutarları 10'a bölünür, botun cüzdanı ve
// bankası (hazine) kalır. İki aynı grup kurulur, yalnızca biri bölünür, sonuçlar karşılaştırılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { getDb } = await import('../lib/db.js')
const { sifirAt } = await import('../lib/sifirAt.js')
const { mulkBul } = await import('../lib/mulk.js')
const {
  bankaBakiyesi, bankaDurumu, bankaYatir, botHesabiniTani, coinAyarla, coinDurumu, ekonomiDurumu, getStats,
  hazineAktar, hazineDurumu, krediDurumu, mulkAl, mulkDurumu, recordMessage, servetDurumu, xpAyarla,
} = await import('../lib/stats.js')

const SAAT = 3_600_000
const T = new Date('2026-06-10T00:30:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

function grupKur(chatJid) {
  const db = getDb()
  xpAyarla({ chatJid, userJid: BOT, miktar: 500_000_000_000 })
  bankaYatir({ chatJid, userJid: BOT, miktar: 200_000_000_000, now: T })
  xpAyarla({ chatJid, userJid: 'a', miktar: 1_000_000_000_000 })
  bankaYatir({ chatJid, userJid: 'a', miktar: 400_000_000_000, now: T })
  xpAyarla({ chatJid, userJid: 'b', miktar: 100_000_000_000 })
  // b'nin 5 milyar kredi borcu var, vadesi uzak.
  db.prepare('INSERT INTO kredi (chat_jid, user_jid, borc, faiz_saat, vade) VALUES (?, ?, ?, ?, ?)')
    .run(chatJid, 'b', 5_000_000_000, Math.floor(T / SAAT), T + 100 * SAAT)
  coinAyarla({ chatJid, userJid: 'a', adet: 20 })
  // Günün ilk mesajı ekonomi kaydını (kur) yazar.
  recordMessage({ chatJid, userJid: 'a', type: 'conversation', at: T })
  mulkAl({ chatJid, userJid: 'a', mulk: mulkBul('ev'), now: T })
}

const NORMAL = 'normal@g.us'
const BOLUNEN = 'bolunen@g.us'
grupKur(NORMAL)
grupKur(BOLUNEN)
// Bot kapalıyken, gece yarısından sonra çalıştırılmış gibi.
sifirAt(getDb(), { bolen: 10, chat: BOLUNEN, haric: [BOT] })

const yakin = (bolunen, normal, mesaj) => {
  const oran = normal / bolunen
  assert.ok(Math.abs(oran - 10) < 0.01, `${mesaj}: ${normal} / ${bolunen} = ${oran}`)
}

test('bir sıfır: botun cüzdanı ve bankası değişmez', () => {
  assert.equal(getStats(BOLUNEN, BOT).xp, getStats(NORMAL, BOT).xp)
  assert.equal(bankaBakiyesi(BOLUNEN, BOT), bankaBakiyesi(NORMAL, BOT))
  assert.equal(hazineDurumu({ chatJid: BOLUNEN, now: T }).kasa, hazineDurumu({ chatJid: NORMAL, now: T }).kasa)
})

test('bir sıfır: üyenin cüzdanı, bankası ve kredi borcu 10\'a bölünür, coin adedi kalır', () => {
  assert.equal(getStats(BOLUNEN, 'a').xp, Math.trunc(getStats(NORMAL, 'a').xp / 10))
  assert.equal(bankaBakiyesi(BOLUNEN, 'a'), bankaBakiyesi(NORMAL, 'a') / 10)
  assert.equal(krediDurumu({ chatJid: BOLUNEN, userJid: 'b', now: T }).borc, 500_000_000)
  assert.equal(krediDurumu({ chatJid: NORMAL, userJid: 'b', now: T }).borc, 5_000_000_000)
  assert.equal(coinDurumu(BOLUNEN, 'a').bakiye, coinDurumu(NORMAL, 'a').bakiye)
})

test('bir sıfır: kur, kira, faiz, servet ve hazine sınırı da 10\'a iner', () => {
  const sonra = T + 3 * SAAT
  const n = ekonomiDurumu({ chatJid: NORMAL, now: sonra })
  const b = ekonomiDurumu({ chatJid: BOLUNEN, now: sonra })
  yakin(b.kur, n.kur, 'anlık kur')
  yakin(b.gunKur, n.gunKur, 'günün kuru')
  yakin(bankaDurumu({ chatJid: BOLUNEN, userJid: 'a', now: sonra }).faiz,
    bankaDurumu({ chatJid: NORMAL, userJid: 'a', now: sonra }).faiz, '3 saatlik faiz')
  yakin(hazineDurumu({ chatJid: BOLUNEN, now: sonra }).limit, hazineDurumu({ chatJid: NORMAL, now: sonra }).limit, 'hazine sınırı')
})

test('bir sıfır: bugünkü hazine aktarımı da bölünür, kişi sınırı tutarlı kalır', () => {
  const chatJid = 'aktarim@g.us'
  xpAyarla({ chatJid, userJid: BOT, miktar: 1_000_000_000 })
  xpAyarla({ chatJid, userJid: 'k', miktar: 100_000_000 })
  hazineAktar({ chatJid, userJid: 'o', hedef: 'k', miktar: 20_000_000, sahip: true, now: T })
  sifirAt(getDb(), { bolen: 10, chat: chatJid, haric: [BOT] })
  const d = hazineDurumu({ chatJid, now: T })
  assert.equal(d.kullanilan, 2_000_000)
  // Piyasa 12.000.000, bugün aktarılan 2.000.000 düşülür: sınır 2.000.000, k'ye kalan yok.
  assert.equal(d.limit, 2_000_000)
  assert.deepEqual(hazineAktar({ chatJid, userJid: 'o', hedef: 'k', miktar: 1, sahip: true, now: T }), { limit: 2_000_000, kalan: 0 })
})

test('bir sıfır: aynı grupta kira ve net servet 10\'a iner', () => {
  // Piyasa olayı grup adından çıktığı için kira aynı grupta önce ve sonra ölçülür.
  const chatJid = 'kira@g.us'
  grupKur(chatJid)
  const sonra = T + 3 * SAAT
  const kiraOnce = mulkDurumu({ chatJid, userJid: 'a', now: sonra })[0].kira
  const servetOnce = servetDurumu({ chatJid, userJid: 'a', now: sonra }).net
  sifirAt(getDb(), { bolen: 10, chat: chatJid, haric: [BOT] })
  yakin(mulkDurumu({ chatJid, userJid: 'a', now: sonra })[0].kira, kiraOnce, '3 saatlik kira')
  yakin(servetDurumu({ chatJid, userJid: 'a', now: sonra }).net, servetOnce, 'net servet')
})
