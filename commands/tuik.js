import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { ekonomiDurumu } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

const yuzde = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

function enflasyon(simdi, onceki) {
  return onceki?.arz ? ((simdi - onceki.arz) / onceki.arz) * 100 : null
}

function satir(etiket, oran) {
  if (oran === null) return `${etiket}: veri birikiyor`
  return `${etiket}: %${yuzde.format(oran)} (resmi: %${yuzde.format(oran / 2)})`
}

export default {
  name: 'tüik',
  aliases: ['tuik', 'enflasyon'],
  description: 'Gruptaki para, enflasyon, coin kuru ve en zenginler',
  usage: '.tüik',
  details: [
    'Para, üyelerin cüzdan ve bankasıdır, bot hariçtir. Enflasyon günlük kayıtlardan hesaplanır.',
    '"Resmi" oran şakadır, gerçeğin yarısıdır.',
  ],
  category: 'ekonomi',
  cooldown: 10,
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const e = ekonomiDurumu({ chatJid: from })
      if (!e) return await yaz('📊 Kurum şu an kapalı, sonra dene.')

      await yaz(
        [
          '📊 *TÜİK Ekonomi Bülteni*',
          '',
          `💰 Piyasadaki para: ${binlik(e.anlik)} XP`,
          `🪙 Bugünkü coin kuru: ${binlik(e.kur)} XP`,
          satir('📈 Günlük enflasyon', enflasyon(e.arz, e.dun)),
          satir('📅 Haftalık enflasyon', enflasyon(e.arz, e.hafta)),
          '',
          '🏆 *En zenginler*',
          ...e.zenginler.map((z, i) => `${i + 1}. ${mentionOf(z.user_jid)} — ${binlik(z.servet)} XP`),
        ].join('\n'),
        e.zenginler.map((z) => z.user_jid),
      )
    } catch (err) {
      logger.error({ err, from }, '.tüik başarısız')
      await yaz('📊 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.tüik hata mesajı gönderilemedi'),
      )
    }
  },
}
