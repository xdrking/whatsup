import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { binlik } from '../lib/sayi.js'
import { hapistekiler } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

export default {
  name: 'hapis',
  aliases: ['hapishane', 'cezaevi'],
  description: 'Hapistekileri ve kefaletlerini gösterir',
  usage: '.hapis',
  details: [
    `\`.soygun\`'da yakalanan ${HAPIS_SAATI} saat hapse girer. Hapisteyken soygun, kumar ve \`.çalış\` kapalıdır.`,
    'Süre dolunca kendiliğinden çıkılır, erken çıkmak için `.kefalet`.',
  ],
  category: 'toplum',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const liste = hapistekiler(from)
      if (!liste.length) return await yaz('🚔 Hapishane boş.')

      await yaz(
        [
          '🚔 *Hapishane*',
          '',
          ...liste.map((h) => `⛓️ ${mentionOf(h.user_jid)} — ${sureYaz(h.bitis - Date.now())}, kefalet ${binlik(h.kefalet)} XP`),
        ].join('\n'),
        liste.map((h) => h.user_jid),
      )
    } catch (err) {
      logger.error({ err, from }, '.hapis başarısız')
      await yaz('🚔 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.hapis hata mesajı gönderilemedi'),
      )
    }
  },
}
