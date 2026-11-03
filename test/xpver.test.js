// .xpver: numara/grup ayrıştırma, LID'li grupta üye bulma, XP'nin sıfırın altına inmemesi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { numaraCoz, grupIdCoz } = await import('../commands/xpver.js')
const { uyeKimligiBul } = await import('../lib/group.js')
const { xpAyarla, getStats } = await import('../lib/stats.js')

test('numara ve grup id ayrıştırma', () => {
  assert.equal(numaraCoz('+90 555 123 45 67'), '905551234567')
  assert.equal(numaraCoz('05551234567'), '905551234567')
  assert.equal(numaraCoz('abc'), null)
  assert.equal(numaraCoz('`277983940071628@lid`'), '277983940071628@lid')
  assert.equal(grupIdCoz('120363012345678901@g.us'), '120363012345678901@g.us')
  assert.equal(grupIdCoz('120363012345678901'), '120363012345678901@g.us')
  assert.equal(grupIdCoz('selam'), null)
})

test('üye bulma: numaralı ve LID\'li katılımcı', () => {
  const metadata = {
    participants: [
      { id: '905550000001@s.whatsapp.net' },
      { id: '123456789@lid', jid: '905550000002@s.whatsapp.net' },
      { id: '987654321@lid' },
    ],
  }
  assert.equal(uyeKimligiBul(metadata, '905550000001'), '905550000001@s.whatsapp.net')
  assert.equal(uyeKimligiBul(metadata, '905550000002'), '123456789@lid')
  assert.equal(uyeKimligiBul(metadata, '905550000003'), null)
  assert.equal(uyeKimligiBul(metadata, '987654321@lid'), '987654321@lid')
  assert.equal(uyeKimligiBul(metadata, '555@lid'), null)
})

test('xpAyarla: ekler, eksi miktar sıfırda durur', () => {
  const k = { chatJid: 'g2@g.us', userJid: 'x@lid' }
  assert.deepEqual(xpAyarla({ ...k, miktar: 100 }), { once: 0, xp: 100 })
  assert.deepEqual(xpAyarla({ ...k, miktar: -30 }), { once: 100, xp: 70 })
  assert.deepEqual(xpAyarla({ ...k, miktar: -500 }), { once: 70, xp: 0 })
  assert.equal(getStats(k.chatJid, k.userJid).xp, 0)
})
