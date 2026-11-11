// Susturulduğu halde yazmaya devam edenin uyarılması ve varlığının yarısına el konması.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { spamCezasi } = await import('../lib/devlet.js')
const { CEZA_ARALIGI, UYARI_ESIGI, ihlalAsamasi, susturmaIhlali } = await import('../lib/spamCeza.js')
const { addXp, botHesabiniTani, coinAl, coinDurumu, getStats, spamElKoy } = await import('../lib/stats.js')
const { uyeSustur, uyeSerbest } = await import('../lib/uyeSustur.js')

const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

test('ihlal aşaması: üçüncü mesajda uyarı, üç mesaj sonra ceza', () => {
  assert.equal(ihlalAsamasi(UYARI_ESIGI - 1), null)
  assert.equal(ihlalAsamasi(UYARI_ESIGI), 'uyari')
  assert.equal(ihlalAsamasi(UYARI_ESIGI + 1), null)
  assert.equal(ihlalAsamasi(UYARI_ESIGI + CEZA_ARALIGI), 'ceza')
})

test('spam cezası her şeyin yarısıdır, mülk aşağı yuvarlanır, en pahalıdan başlanır', () => {
  const c = spamCezasi({
    banka: 101, cuzdan: 50, coin: 3, suly: 10,
    mulkler: [{ kod: 'ev', adet: 2, fiyat: 15 }, { kod: 'otel', adet: 1, fiyat: 250 }],
  })
  assert.deepEqual(c, { banka: 50, cuzdan: 25, coin: 1, suly: 5, mulkler: [{ kod: 'otel', adet: 1 }] })
})

test('spamElKoy: cüzdanın yarısı hazineye, coinin yarısı bota geçer', () => {
  const chatJid = 'spam@g.us'
  const u = 'spamci@lid'
  addXp({ chatJid, userJid: u, amount: 10_000_000_000 })
  assert.ok(coinAl({ chatJid, userJid: u, adet: 4 }).bakiye === 4)
  const xp = getStats(chatJid, u).xp

  const c = spamElKoy({ chatJid, userJid: u })
  assert.equal(c.coin, 2)
  assert.equal(c.cuzdan, Math.floor(xp / 2))
  assert.equal(getStats(chatJid, u).xp, xp - Math.floor(xp / 2))
  assert.equal(coinDurumu(chatJid, u).bakiye, 2)
  assert.equal(coinDurumu(chatJid, BOT).bakiye, 2)
  assert.equal(spamElKoy({ chatJid, userJid: BOT }), null)
})

test('susturmaIhlali: uyarı özelden gider, üç mesaj sonra el konur, sayım yeniden başlar', async () => {
  const chatJid = 'spam2@g.us'
  const u = 'yazan@lid'
  const pn = '905551112233@s.whatsapp.net'
  addXp({ chatJid, userJid: u, amount: 1000 })
  uyeSustur(chatJid, u)

  const giden = []
  const sock = { sendMessage: async (jid, icerik) => giden.push({ jid, text: icerik.text }) }
  const parsed = { from: chatJid, sender: u, senderPn: pn }
  const yaz = () => susturmaIhlali({ sock, parsed, kimlik: u })

  for (let i = 0; i < UYARI_ESIGI; i++) await yaz()
  assert.equal(giden.length, 1)
  assert.equal(giden[0].jid, pn)
  assert.match(giden[0].text, /yarısına el koyarım/)

  for (let i = 0; i < CEZA_ARALIGI; i++) await yaz()
  assert.equal(giden.length, 2)
  assert.match(giden[1].text, /el konuldu/)
  assert.equal(getStats(chatJid, u).xp, 500)

  // Sayım sıfırlandı: bir sonraki uyarı yine UYARI_ESIGI mesaj sonra.
  for (let i = 0; i < UYARI_ESIGI - 1; i++) await yaz()
  assert.equal(giden.length, 2)

  // Susturma kaldırılınca sayım da gider.
  uyeSerbest(chatJid, u)
  uyeSustur(chatJid, u)
  await yaz()
  assert.equal(giden.length, 2)
})
