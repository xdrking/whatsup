import { randomInt } from 'node:crypto'
import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { CALISMA_DAKIKASI } from '../lib/meslek.js'
import { binlik } from '../lib/sayi.js'
import { calis } from '../lib/stats.js'
import logger from '../lib/logger.js'

export default {
  name: 'çalış',
  aliases: ['calis', 'work', 'mesai'],
  description: 'Mesleğinde çalışıp maaş alır',
  usage: '.çalış',
  details: [`${CALISMA_DAKIKASI} dakikada bir çalışılır. Önce \`.meslek seç <meslek>\`. Hapisteyken çalışılmaz.`],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const s = calis({ chatJid: from, userJid: sender, rnd: randomInt })
      if (!s) return await yaz('💼 Bugün dükkân kapalı, sonra dene.')
      if (s.meslekYok) return await yaz('💼 Önce meslek seç: `.meslek`')
      if (s.hapis) return await yaz(`🚔 Hapistesin, ${sureYaz(s.hapis - Date.now())} kaldı.`)
      if (s.bekle) return await yaz(`💼 Mesain bitmedi, ${sureYaz(s.bekle - Date.now())} sonra gel.`)

      await yaz([
        `${s.meslek.ad}: ${s.meslek.is}.`,
        s.maas ? `💵 Maaş: *+${binlik(s.maas)} XP*` : '💸 Bu sefer para çıkmadı.',
        ...(s.esBonusu ? [`💍 Evlilik bonusu: +${binlik(s.esBonusu)} XP`] : []),
        `💰 XP'n: ${binlik(s.xp)}`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.çalış başarısız')
      await yaz('💼 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.çalış hata mesajı gönderilemedi'),
      )
    }
  },
}
