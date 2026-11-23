import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { fidyeDurumu, fidyeOde } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { FIDYE_MS } from '../lib/yeralti.js'
import logger from '../lib/logger.js'

const KAPALI = '🔒 Bağlantı yok, sonra dene.'

export default {
  name: 'fidye',
  aliases: ['ransom'],
  description: 'Bankanı kilitleyen fidye yazılımını gösterir, fidyeyi öder',
  usage: '.fidye  —  .fidye öde',
  details: [
    `Fidye yazılımı \`.sulymarket\`'te satılır, bota özelden \`.hack fidye <kimlik>\` ile kullanılır. Kurban ${FIDYE_MS / 3_600_000} saat bankasından çekemez.`,
    '`.fidye öde` fidyeyi bankandan saldırgana aktarır ve kilidi açar. Ödemezsen süre dolunca kendiliğinden açılır.',
    'İçişleri Bakanı saldırganı bulursa (`.izsür`) kilit kalkar.',
  ],
  category: 'toplum',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      if (['öde', 'ode'].includes(trLower(args[0] || ''))) {
        const s = fidyeOde({ chatJid: from, userJid: sender })
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz('🔓 Bankan kilitli değil.')
        return await yaz(`🔓 ${binlik(s.odenen)} XP fidye ödendi, bankan açıldı.\n🏦 Hesap: ${binlik(s.bakiye)} XP`)
      }

      const d = fidyeDurumu(from, sender)
      await yaz(d
        ? `🔒 Bankan kilitli: ${sureYaz(d.bitis - Date.now())} kaldı.\nHemen açmak için \`.fidye öde\` (${binlik(d.tutar)} XP)`
        : '🔓 Bankan kilitli değil.')
    } catch (err) {
      logger.error({ err, from }, '.fidye başarısız')
      await yaz('🔒 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.fidye hata mesajı gönderilemedi'))
    }
  },
}
