// Aynı mesaj ikinci kez gelirse komut yeniden çalışmaz (Faz 94).
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.STATS_DB = ':memory:'
process.env.LOG_LEVEL = 'silent'
const { ilkKezMi } = await import('../lib/islenenMesaj.js')
const { handleMessage } = await import('../lib/handler.js')

const T = Date.now()

test('aynı kimlik ikinci kez reddedilir, farklı sohbet ya da yazan ayrı sayılır', () => {
  const key = { remoteJid: 'g@g.us', participant: 'a@lid', id: 'ABC1', fromMe: true }
  assert.equal(ilkKezMi(key, T), true)
  assert.equal(ilkKezMi(key, T + 30 * 60_000), false, 'yarım saat sonra yeniden gelen')
  assert.equal(ilkKezMi({ ...key, remoteJid: 'h@g.us' }, T), true)
  assert.equal(ilkKezMi({ ...key, participant: 'b@lid' }, T), true)
  assert.equal(ilkKezMi({ remoteJid: 'g@g.us' }, T), true, 'kimliksiz mesaj engellenmez')
  assert.equal(ilkKezMi({ remoteJid: 'g@g.us' }, T), true)
})

test('8 gün sonra eski kimlik temizlenir', () => {
  const key = { remoteJid: 'x@s.whatsapp.net', id: 'ESKI' }
  assert.equal(ilkKezMi(key, T), true)
  assert.equal(ilkKezMi({ remoteJid: 'y', id: 'TETIK' }, T + 8 * 86_400_000), true)
  assert.equal(ilkKezMi(key, T + 8 * 86_400_000), true)
})

test('handler: yeniden gelen komut bir kez çalışır', async () => {
  let calisma = 0
  const komut = { name: 'deneme', category: 'araç', cooldown: 0, execute: async () => { calisma += 1 } }
  const commands = new Map([['deneme', komut]])
  const sock = { user: { id: 'bot@s.whatsapp.net' }, sendMessage: async () => ({ key: { id: 'cevap' } }) }
  const msg = () => ({
    key: { remoteJid: '905551112233@s.whatsapp.net', fromMe: true, id: 'TEKRAR-1' },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: '.deneme' },
  })
  await handleMessage({ sock, msg: msg(), commands })
  await handleMessage({ sock, msg: msg(), commands })
  assert.equal(calisma, 1)
})
