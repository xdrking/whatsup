import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { meslekIstifa } from '../lib/stats.js'
import { MESLEK_DEGISIM_SAATI } from '../lib/meslek.js'
import logger from '../lib/logger.js'

export default {
  name: 'istifa',
  aliases: ['istifaet', 'işibırak', 'isibirak'],
  description: 'Mesleğinden istifa eder',
  usage: '.istifa',
  details: [
    'Mesleğin silinir, `.çalış` maaş vermez.',
    `Yeni meslek, son meslek seçiminden ${MESLEK_DEGISIM_SAATI} saat geçince seçilir: istifa beklemeyi kısaltmaz.`,
    'Futbolcu istifa ederse kariyeri o an biter, bir daha futbolcu olamaz ama hemen yeni meslek seçebilir.',
  ],
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const s = meslekIstifa({ chatJid: from, userJid: sender })
      if (!s) return await yaz('💼 İŞKUR şu an kapalı, sonra dene.')
      if (s.yok) return await yaz('💼 Zaten bir mesleğin yok. Seçmek için `.meslek`')

      const kalan = s.sonraki - Date.now()
      await yaz([
        `📄 *${s.meslek.ad}* mesleğinden istifa ettin.`,
        ...(s.meslek.kariyerSaati ? ['Kariyerin bitti, bu mesleğe bir daha dönemezsin.'] : []),
        kalan > 0 ? `Yeni meslek için ${sureYaz(kalan)} beklemelisin.` : 'Yeni meslek seçebilirsin: `.meslek`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.istifa başarısız')
      await yaz('💼 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.istifa hata mesajı gönderilemedi'),
      )
    }
  },
}
