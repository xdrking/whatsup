import { AZAMI_FAIZ } from '../lib/banka.js'
import { requireGroup } from '../lib/group.js'
import { baskanMi, faizDurumu, faizKarari } from '../lib/stats.js'
import logger from '../lib/logger.js'

export default {
  name: 'faizkararı',
  aliases: ['faizkarari'],
  description: 'Bot sahibi ve seçilmiş başkan: grubun banka ve kredi faizini belirler',
  usage: '.faizkararı <oran>',
  details: [
    `Saatlik banka faizi 0-${AZAMI_FAIZ} arasında olabilir, kredi faizi 4 puan üstünde kalır.`,
    'Birikmiş faiz eski orandan işlenir, yeni oran bundan sonraki saatlere uygulanır.',
    'Başkan (`.seçim`) günde bir karar verebilir, başkası yazarsa bot cevap vermez.',
  ],
  category: 'oyun',
  // Başkan da kullandığı için yetki aşağıdadır; yetkisiz kişi yine sessizce düşer.
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed, isOwner }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      if (!isOwner && !baskanMi(from, sender)) {
        logger.warn({ sender }, 'Yetkisiz komut denemesi: .faizkararı')
        return
      }

      if (!args[0]) {
        const f = faizDurumu(from)
        return await yaz(`🏦 Banka: %${f.banka}  •  Kredi: %${f.kredi}\nDeğiştirmek için \`.faizkararı <oran>\``)
      }

      const oran = Number(args[0].replace('%', ''))
      if (!Number.isInteger(oran) || oran < 0 || oran > AZAMI_FAIZ) {
        return await yaz(`🏦 Oran 0-${AZAMI_FAIZ} arasında tam sayı olmalı.`)
      }

      const s = faizKarari({ chatJid: from, oran, baskan: !isOwner })
      if (!s) return await yaz('🏦 Kurul toplanamadı, sonra dene.')
      if (s.bugunVar) return await yaz('🏛️ Bugünkü kararını verdin, yarın yine toplan.')

      await yaz([
        '🏛️ *MERKEZ BANKASI FAİZ KARARI*',
        '',
        `🏦 Banka faizi: %${s.once} → *%${s.banka}*`,
        `💳 Kredi faizi: *%${s.kredi}*`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.faizkararı başarısız')
      await yaz('🏦 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.faizkararı hata mesajı gönderilemedi'),
      )
    }
  },
}
