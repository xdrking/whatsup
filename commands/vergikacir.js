import { KACIS_CEZA_KATI, KACIS_YUZDESI } from '../lib/banka.js'
import { requireGroup } from '../lib/group.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { binlik } from '../lib/sayi.js'
import { vergiKacirPlani } from '../lib/stats.js'
import logger from '../lib/logger.js'

function sonDeneme(sonuc, tutar) {
  if (sonuc === 'kacti') return [`🕶️ Son denemede ${binlik(tutar)} XP vergiden kaçtın.`]
  if (sonuc === 'yakalandi') return [`🚔 Son denemede yakalandın, ${binlik(tutar)} XP ceza ödedin.`]
  return []
}

export default {
  name: 'vergikaçır',
  aliases: ['vergikacir', 'vergikaçak', 'vergikacak'],
  description: 'Bir sonraki vergini kaçırmayı dener',
  usage: '.vergikaçır',
  details: [
    'Bugünkü vergi ilk mesajında kesildiği için plan bir sonraki vergine işler.',
    `%${KACIS_YUZDESI} şansla hiç ödemezsin. Yakalanırsan verginin ${KACIS_CEZA_KATI} katını öder, ${HAPIS_SAATI} saat hapse girersin.`,
    'Plan iptal edilmez. Sonucu `.vergikaçır` yazınca görürsün.',
  ],
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const s = vergiKacirPlani({ chatJid: from, userJid: sender })
      if (!s) return await yaz('🕶️ Muhasebeci şu an yok, sonra dene.')

      await yaz([
        ...sonDeneme(s.sonuc, s.tutar),
        s.zatenVar
          ? '🕶️ Planın zaten hazır, bir sonraki vergide işleyecek.'
          : `🕶️ Plan hazır. Bir sonraki vergide %${KACIS_YUZDESI} şansla kaçarsın, yakalanırsan ${KACIS_CEZA_KATI} kat ceza ve ${HAPIS_SAATI} saat hapis.`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.vergikaçır başarısız')
      await yaz('🕶️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.vergikaçır hata mesajı gönderilemedi'),
      )
    }
  },
}
