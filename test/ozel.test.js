// Özelden yazılan komutların üyelik bulması: bot kendi numarasından yazınca ana hesabı almalı.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.STATS_DB = ':memory:'
process.env.LOG_LEVEL = 'silent'
const { uyelikleriBul } = await import('../lib/ozel.js')
const { botHesabiniTani } = await import('../lib/stats.js')

test('bot panel kaydında LID değil parasının durduğu ana hesabı alır', async () => {
  botHesabiniTani({ id: '905550000000@s.whatsapp.net', lid: '7777@lid' })
  const sock = {
    groupFetchAllParticipating: async () => ({
      'g@g.us': { participants: [{ id: '7777@lid', jid: '905550000000@s.whatsapp.net' }, { id: '8888@lid' }] },
    }),
  }
  const bot = await uyelikleriBul(sock, new Set(['905550000000@s.whatsapp.net']))
  assert.deepEqual(bot.uyelikler, [{ chatJid: 'g@g.us', userJid: '905550000000@s.whatsapp.net' }])
  const uye = await uyelikleriBul(sock, new Set(['8888@lid']))
  assert.deepEqual(uye.uyelikler, [{ chatJid: 'g@g.us', userJid: '8888@lid' }], 'üyenin kimliği değişmez')
})
