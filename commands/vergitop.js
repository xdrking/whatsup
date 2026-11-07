import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { vergiSiralama } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

export default {
  name: 'vergitop',
  aliases: ['vergisıralama', 'vergisiralama'],
  description: 'En çok vergi ödeyenler',
  usage: '.vergitop',
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const liste = vergiSiralama(from)
      if (!liste.length) return await yaz('💸 Henüz kimse vergi ödemedi.')

      await yaz(
        [
          '💸 *En Çok Vergi Ödeyenler*',
          '',
          ...liste.map((r, i) => `${i + 1}. ${mentionOf(r.user_jid)} — ${binlik(r.toplam)} XP`),
        ].join('\n'),
        liste.map((r) => r.user_jid),
      )
    } catch (err) {
      logger.error({ err, from }, '.vergitop başarısız')
      await yaz('💸 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.vergitop hata mesajı gönderilemedi'),
      )
    }
  },
}
