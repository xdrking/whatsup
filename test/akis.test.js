// Oyun akışları: sahte soketle başlatma, yanıt yönlendirme, kapanış.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { default: acikartirma } = await import('../commands/acikartirma.js')
const { default: blackjack } = await import('../commands/blackjack.js')
const { default: mayin } = await import('../commands/mayin.js')
const { default: vs } = await import('../commands/vs.js')
const { default: oyunbitir } = await import('../commands/oyunbitir.js')
const { endGame, getGame, handleGameReply } = await import('../games/gameManager.js')
const { addXp, getStats } = await import('../lib/stats.js')

const A = '111@lid'
const B = '222@lid'
const C = '333@lid'

let sayac = 0

function kur() {
  const from = `a${++sayac}@g.us`
  const giden = []
  const sock = {
    user: { id: 'bot@s.whatsapp.net' },
    groupMetadata: async () => ({ participants: [{ id: A }, { id: B }, { id: C }] }),
    sendMessage: async (_, icerik) => {
      giden.push(icerik)
      return { key: { id: `m${giden.length}` } }
    },
  }
  const parsed = (sender, extra = {}) => ({ isGroup: true, from, sender, mentions: [], quoted: null, ...extra })
  const komut = (c, sender, args, extra = {}) => c.execute({
    sock, msg: {}, from, sender, args, text: args.join(' '), parsed: parsed(sender, extra), isOwner: false, ...extra,
  })
  const yanitla = (sender, body) => handleGameReply({
    sock, msg: {}, parsed: parsed(sender, { body, quoted: { key: { id: getGame(from).lastMessageId } } }),
  })
  return { from, sock, giden, komut, yanitla, son: () => giden.at(-1).text }
}

test('açık artırma: herkes etiketlenir, en yüksek kazanır, XP aktarılmaz', async () => {
  const t = kur()
  addXp({ chatJid: t.from, userJid: A, amount: 500 })

  await t.komut(acikartirma, A, ['500', '60'])
  assert.deepEqual(t.giden[0].mentions.sort(), [A, B, C])
  const ilkId = getGame(t.from).lastMessageId

  await t.yanitla(B, '100')
  await t.yanitla(C, '90')
  assert.match(t.son(), /En yüksek teklif 100/)
  await t.yanitla(C, '150')
  await t.yanitla(A, '999')
  assert.match(t.son(), /Kendi açık artırmana/)
  await t.yanitla(B, 'selam')
  assert.match(t.son(), /sayıyla/)
  assert.equal(getGame(t.from).lastMessageId, ilkId)

  const state = getGame(t.from)
  await state.onTimeout()
  endGame(t.from)

  assert.match(t.son(), /333 kazandı. Teklif: \*150\*/)
  assert.match(t.son(), /\.devret/)
  assert.equal(getStats(t.from, A).xp, 500)
  assert.equal(getStats(t.from, C).xp, 0)
})

test('açık artırma: sahip olmadığın XP satılmaz, sahip satabilir, süre sınırlı', async () => {
  const t = kur()
  await t.komut(acikartirma, A, ['500', '60'])
  assert.match(t.son(), /O kadar XP'n yok/)
  assert.equal(getGame(t.from), null)

  await t.komut(acikartirma, A, ['500', '5'], { isOwner: true })
  assert.match(t.son(), /Süre/)

  await t.komut(acikartirma, A, ['500', '60'], { isOwner: true })
  assert.ok(getGame(t.from))
  endGame(t.from)
})

test('blackjack: bahis baştan düşer, başkası oynayamaz, .oyunbitir iade etmez', async () => {
  // Doğal 21 çıkarsa oyun hemen biter; oyun yuvası dolu el bulunana dek denenir.
  let t
  do {
    t = kur()
    addXp({ chatJid: t.from, userJid: A, amount: 600 })
    await t.komut(blackjack, A, ['100'])
  } while (!getGame(t.from))

  assert.equal(getStats(t.from, A).xp, 500)

  const gidenSayi = t.giden.length
  await t.yanitla(B, 'dur')
  assert.equal(t.giden.length, gidenSayi)
  assert.ok(getGame(t.from))

  await t.komut(oyunbitir, A, [])
  assert.equal(getGame(t.from), null)
  assert.match(t.son(), /BLACKJACK/)
  assert.ok([500, 600, 700].includes(getStats(t.from, A).xp))
})

test('mayın: güvenli kutu çarpanı artırır, çek öder; mayın bahsi yakar', async () => {
  const t = kur()
  addXp({ chatJid: t.from, userJid: A, amount: 600 })
  await t.komut(mayin, A, ['100'])
  assert.equal(getStats(t.from, A).xp, 500)

  const { mayinlar } = getGame(t.from)
  const guvenli = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((n) => !mayinlar.has(n))
  await t.yanitla(A, String(guvenli))
  await t.yanitla(A, 'çek')
  assert.equal(getGame(t.from), null)
  assert.equal(getStats(t.from, A).xp, 628)

  await t.komut(mayin, A, ['28'])
  const [mayinNo] = getGame(t.from).mayinlar
  await t.yanitla(A, String(mayinNo))
  assert.equal(getGame(t.from), null)
  assert.equal(getStats(t.from, A).xp, 600)
})

test('kumar: cüzdanda 500 XP yoksa oyun başlamaz', async () => {
  const t = kur()
  addXp({ chatJid: t.from, userJid: A, amount: 499 })
  await t.komut(mayin, A, ['100'])
  assert.equal(getGame(t.from), null)
  assert.equal(getStats(t.from, A).xp, 499)
  assert.match(t.son(), /en az 500 XP/)
})

test('vs: yalnızca rakip karar verir, red XP\'ye dokunmaz, kabul aktarır', async () => {
  const t = kur()
  addXp({ chatJid: t.from, userJid: A, amount: 600 })
  addXp({ chatJid: t.from, userJid: B, amount: 600 })

  await t.komut(vs, A, ['@222', '50'], { mentions: [B] })
  await t.yanitla(C, 'kabul')
  assert.ok(getGame(t.from))
  await t.yanitla(B, 'red')
  assert.equal(getGame(t.from), null)
  assert.equal(getStats(t.from, A).xp, 600)

  await t.komut(vs, A, ['@222', '50'], { mentions: [B] })
  await t.yanitla(B, 'kabul')
  assert.deepEqual([getStats(t.from, A).xp, getStats(t.from, B).xp].sort((x, y) => x - y), [550, 650])
})
