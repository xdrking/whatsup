import { downloadMediaMessage } from '@whiskeysockets/baileys'
import logger, { baileysLogger } from '../lib/logger.js'
import { stickerToImage, stickerToVideo } from '../lib/sticker.js'

export default {
  name: 'al',
  aliases: ['toimg', 'gorsel', 'görsel'],
  description: 'Yanıtlanan sticker\'ı görsele (animasyonluysa videoya) çevirir',
  usage: '.al (bir sticker\'ı yanıtlayarak)',
  ownerOnly: false,
  // Medya dönüşümü (sharp/ffmpeg) ağır: arka arkaya tetiklenmesin.
  cooldown: 10,

  async execute({ sock, msg, from, parsed }) {
    const quoted = parsed.quoted

    if (quoted?.type !== 'stickerMessage') {
      await sock.sendMessage(
        from,
        { text: 'Bir sticker\'a yanıt vererek `.al` yaz.' },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

    try {
      const buffer = await downloadMediaMessage(
        quoted,
        'buffer',
        {},
        { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage },
      )

      const isAnimated = Boolean(quoted.message.stickerMessage?.isAnimated)

      if (isAnimated) {
        const video = await stickerToVideo(buffer)
        // gifPlayback: WhatsApp'ta sessiz, döngüsel GIF gibi oynar.
        await sock.sendMessage(from, { video, gifPlayback: true }, { quoted: msg })
      } else {
        const image = await stickerToImage(buffer)
        await sock.sendMessage(from, { image }, { quoted: msg })
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
    } catch (err) {
      // Tepki temizlenmezse mesajda kalıcı olarak ⏳ görünür.
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
      logger.error({ err }, 'Sticker geri çevrilemedi')
      throw err
    }
  },
}
