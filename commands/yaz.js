import logger from '../lib/logger.js'
import { imageToSticker } from '../lib/sticker.js'
import { renderTextSticker } from '../lib/quote.js'

const MAX_UZUNLUK = 200

export default {
  name: 'yaz',
  aliases: ['yazı', 'yazi', 'metinsticker', 'ttp'],
  description: 'Yazdığın metni kenarlıklı yazı sticker\'ı yapar',
  usage: '.yaz merhaba dünya',
  details: [
    '`.yaz günaydın` → beyaz, siyah kenarlıklı yazı sticker\'ı.',
    'Bir mesajı yanıtlayıp `.yaz` dersen o mesajın metni kullanılır.',
    `En fazla ${MAX_UZUNLUK} karakter; uzun metinde yazı küçülür.`,
    'Yazanın adı ve fotoğrafıyla sohbet balonu istersen: mesajı yanıtlayıp `.sticker`.',
  ],
  category: 'medya',
  ownerOnly: false,
  // Pango çizimi + WebP dönüşümü: arka arkaya tetiklenmesin.
  cooldown: 10,

  async execute({ sock, msg, from, text, parsed }) {
    const metin = text.trim() || parsed.quoted?.body?.trim() || ''

    if (!metin || metin.length > MAX_UZUNLUK) {
      await sock.sendMessage(
        from,
        { text: `✍️ Kullanım: \`.yaz metin\` ya da bir mesajı yanıtlayıp \`.yaz\` (en fazla ${MAX_UZUNLUK} karakter)` },
        { quoted: msg },
      )
      return
    }

    try {
      const png = await renderTextSticker(metin)
      const sticker = await imageToSticker(png, {
        pack: process.env.BOT_NAME || 'wp-bot',
        author: parsed.pushName || 'wp-bot',
      })
      await sock.sendMessage(from, { sticker }, { quoted: msg })
    } catch (err) {
      logger.error({ err }, 'Yazı sticker\'ı üretilemedi')
      throw err
    }
  },
}
