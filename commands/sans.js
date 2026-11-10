import { sansAcikMi, sansAyarla } from '../lib/sahipSans.js'
import { SAHIP_CRASH_ARALIK, SAHIP_CRASH_TABAN, SAHIP_SANSI } from '../lib/kumar.js'
import logger from '../lib/logger.js'

export default {
  name: 'şans',
  aliases: ['sans'],
  description: 'Bot sahibi: gizli kumar şansını açar/kapatır',
  usage: '.şans [aç|kapat]',
  category: 'kumar',
  // .help'te hiç görünmez; şansın varlığı gruba sezdirilmez.
  hidden: true,
  ownerOnly: true,
  cooldown: 0,

  async execute({ sock, msg, args, from, parsed }) {
    // Grupta yazılırsa iz bırakmadan düşer (.xpver gibi).
    if (parsed.isGroup) {
      logger.info({ from }, '.şans grupta yazıldı, yok sayıldı')
      return
    }

    try {
      const a = String(args[0] || '').toLocaleLowerCase('tr')
      if (['aç', 'ac', 'açık', 'acik', 'on'].includes(a)) sansAyarla(true)
      else if (['kapat', 'kapa', 'kapalı', 'kapali', 'off'].includes(a)) sansAyarla(false)
      else if (a) {
        await sock.sendMessage(from, { text: '🍀 `.şans aç` ya da `.şans kapat` yaz.' }, { quoted: msg })
        return
      }

      const lines = sansAcikMi()
        ? [
            '🍀 Şans *açık*.',
            `Kaybeden el %${SAHIP_SANSI * 100} ihtimalle yeniden atılır, her ${SAHIP_CRASH_ARALIK}. crash en az ${SAHIP_CRASH_TABAN}x.`,
            'Kapatmak için `.şans kapat`.',
          ]
        : ['🍀 Şans *kapalı*, normal oyuncu gibi oynuyorsun.', 'Açmak için `.şans aç`.']
      await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
    } catch (err) {
      logger.error({ err, from }, '.şans başarısız')
      await sock.sendMessage(from, { text: '🍀 Bir şeyler ters gitti.' }, { quoted: msg }).catch((e) =>
        logger.error({ err: e }, '.şans hata mesajı gönderilemedi'),
      )
    }
  },
}
