// .devret: XP aktarımı ve sahibin başkasının XP'sini taşıma yetkisi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { default: devret, etiketSirasi } = await import('../commands/devret.js')
const { addXp, getStats, xpDevret } = await import('../lib/stats.js')

const A = '111@lid'
const B = '222@lid'
const C = '333@lid'

let grupSayaci = 0

/** Komutu sahte soketle çalıştırır; yanıt metnini ve grubun id'sini döner. */
async function calistir({ gonderen = A, mentions = [], quoted = null, text, isOwner = false, xp = {} }) {
  const from = `${++grupSayaci}@g.us`
  for (const [userJid, amount] of Object.entries(xp)) addXp({ chatJid: from, userJid, amount })

  const yanitlar = []
  const sock = {
    groupMetadata: async () => ({ participants: [{ id: A }, { id: B }, { id: C }] }),
    sendMessage: async (_, icerik) => yanitlar.push(icerik.text),
  }

  await devret.execute({
    sock, msg: {}, from, text, isOwner,
    args: text.split(/\s+/),
    sender: gonderen,
    parsed: { isGroup: true, sender: gonderen, mentions, quoted },
  })

  return { yanit: yanitlar.join('\n'), xp: (jid) => getStats(from, jid).xp }
}

test('xpDevret: aktarır, bakiyeden fazlasını reddeder, toplam değişmez', () => {
  const k = { chatJid: 'd@g.us', kaynak: A, hedef: B }
  addXp({ chatJid: k.chatJid, userJid: A, amount: 150 })

  assert.deepEqual(xpDevret({ ...k, miktar: 100 }), { yetersiz: false, kaynakXp: 50, hedefXp: 100 })
  assert.deepEqual(xpDevret({ ...k, miktar: 51 }), { yetersiz: true, xp: 50 })
  assert.equal(getStats(k.chatJid, A).xp + getStats(k.chatJid, B).xp, 150)
})

test('xpDevret: alıcının son görülmesi değişmez', () => {
  const chatJid = 'd2@g.us'
  addXp({ chatJid, userJid: A, amount: 10, at: 1000 })
  addXp({ chatJid, userJid: B, amount: 10, at: 2000 })
  xpDevret({ chatJid, kaynak: A, hedef: B, miktar: 5 })
  assert.equal(getStats(chatJid, B).last_seen, 2000)
})

test('etiketler metindeki sıraya dizilir', () => {
  assert.deepEqual(etiketSirasi('@222 @111 50', [A, B]), [B, A])
})

test('kullanıcı etiketlediği kişiye kendi XP\'sini devreder', async () => {
  const r = await calistir({ mentions: [B], text: '@222 100', xp: { [A]: 150 } })
  assert.equal(r.xp(A), 50)
  assert.equal(r.xp(B), 100)
})

test('kullanıcı yanıtladığı kişiye devreder', async () => {
  const r = await calistir({ quoted: { key: { participant: B } }, text: '40', xp: { [A]: 50 } })
  assert.equal(r.xp(B), 40)
})

test('8+ haneli miktar numara sanılmaz, yetersiz bakiye XP\'ye dokunmaz', async () => {
  const r = await calistir({ mentions: [B], text: '@222 100000000', xp: { [A]: 150 } })
  assert.match(r.yanit, /O kadar XP'n yok/)
  assert.equal(r.xp(A), 150)
})

test('sıradan kullanıcı başkasından başkasına devredemez', async () => {
  const r = await calistir({ gonderen: C, mentions: [A, B], text: '@111 @222 50', xp: { [A]: 100, [C]: 100 } })
  assert.match(r.yanit, /kendi XP/)
  assert.equal(r.xp(A), 100)
  assert.equal(r.xp(B), 0)
  assert.equal(r.xp(C), 100)
})

test('sahip başkasından başkasına devreder, kendi XP\'si değişmez', async () => {
  const r = await calistir({
    gonderen: C, isOwner: true, mentions: [B, A], text: '@111 @222 50', xp: { [A]: 100, [C]: 10 },
  })
  assert.equal(r.xp(A), 50)
  assert.equal(r.xp(B), 50)
  assert.equal(r.xp(C), 10)
})

test('sahip de kaynağın bakiyesini aşamaz', async () => {
  const r = await calistir({ gonderen: C, isOwner: true, mentions: [A, B], text: '@111 @222 50', xp: { [A]: 20 } })
  assert.match(r.yanit, /o kadar XP yok/)
  assert.equal(r.xp(A), 20)
})

test('kendine, gruptan olmayana ve geçersiz miktara devir yok', async () => {
  const kendine = await calistir({ mentions: [A], text: '@111 10', xp: { [A]: 100 } })
  assert.equal(kendine.xp(A), 100)
  assert.match(kendine.yanit, /Aynı kişiye/)

  const yabanci = await calistir({ mentions: ['999@lid'], text: '@999 10', xp: { [A]: 100 } })
  assert.equal(yabanci.xp(A), 100)
  assert.match(yabanci.yanit, /bulunamadı/)

  for (const text of ['@222 0', '@222 -5', '@222']) {
    const r = await calistir({ mentions: [B], text, xp: { [A]: 100 } })
    assert.equal(r.xp(A), 100)
    assert.match(r.yanit, /Kullanım/)
  }
})
