// Botun gönderdiği mesajlar: kendi mesajını tanıma ve yeniden gönderim için gövde.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { KAYIP_MESAJ, gonderilenMesaj, sentByBot, trackOutgoing } = await import('../lib/outgoing.js')

test('gönderilen mesaj tanınır, gövdesi yeniden gönderim için durur, 300\'den eskisi düşer', async () => {
  let n = 0
  const sock = trackOutgoing({
    sendMessage: async (jid, icerik) => ({ key: { id: `id${++n}` }, message: { conversation: icerik.text } }),
  })

  await sock.sendMessage('a@s.whatsapp.net', { text: 'rolün: vampir' })
  assert.equal(sentByBot('id1'), true)
  assert.deepEqual(gonderilenMesaj('id1'), { conversation: 'rolün: vampir' })
  assert.deepEqual(gonderilenMesaj('yok'), KAYIP_MESAJ)

  for (let i = 0; i < 300; i++) await sock.sendMessage('a@s.whatsapp.net', { text: String(i) })
  assert.equal(sentByBot('id1'), false)
  assert.deepEqual(gonderilenMesaj('id1'), KAYIP_MESAJ)
  assert.equal(sentByBot('id301'), true)
})
