import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { CALISMA_DAKIKASI, MESLEK_DEGISIM_SAATI, MESLEKLER, meslekBul } from '../lib/meslek.js'
import { meslekDurumu, meslekSec } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const yuzde = (binde) => String(binde / 100).replace('.', ',')

export default {
  name: 'meslek',
  aliases: ['iş', 'is', 'job'],
  description: 'Meslek seçer, maaş için `.çalış`',
  usage: '.meslek  —  .meslek seç <meslek>',
  details: [
    `Maaş coin kuruna bağlıdır, ${CALISMA_DAKIKASI} dakikada bir \`.çalış\` yazılır.`,
    `Meslek ${MESLEK_DEGISIM_SAATI} saatte bir değiştirilebilir. Maaşlar gerçek hayata göredir, riskli mesleklerde daha çok oynar.`,
  ],
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const ilk = trLower(args[0] || '')
      const ad = ['seç', 'sec'].includes(ilk) ? args[1] : args[0]

      if (ad) {
        const meslek = meslekBul(ad)
        if (!meslek) return await yaz(`💼 Hangi meslek? ${MESLEKLER.map((m) => `\`${m.adlar[0]}\``).join(', ')}`)

        const s = meslekSec({ chatJid: from, userJid: sender, meslek })
        if (!s) return await yaz('💼 İŞKUR şu an kapalı, sonra dene.')
        if (s.ayni) return await yaz(`💼 Zaten ${meslek.ad} olarak çalışıyorsun.`)
        if (s.bekle) return await yaz(`💼 Meslek değiştirmek için ${sureYaz(s.bitis - Date.now())} beklemelisin.`)
        return await yaz(`💼 Hayırlı olsun: *${meslek.ad}*\nMaaş için \`.çalış\``)
      }

      const durum = meslekDurumu(from, sender)
      await yaz([
        '💼 *Meslekler*',
        '',
        ...MESLEKLER.map((m) => `${m.ad} — kurun %${yuzde(m.min)}-%${yuzde(m.max)}'i`),
        '',
        durum ? `Mesleğin: ${durum.meslek.ad}` : 'Seçmek için: `.meslek seç kurye`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.meslek başarısız')
      await yaz('💼 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.meslek hata mesajı gönderilemedi'),
      )
    }
  },
}
