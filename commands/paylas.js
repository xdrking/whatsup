import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys'
import { getDb } from '../lib/db.js'
import { requireGroup } from '../lib/group.js'
import logger, { baileysLogger } from '../lib/logger.js'
import { gonderiYaz, medyaKaydet, medyaSil } from '../lib/sosyal.js'

// Yalnızca açıkça paylaşılan mesaj saklanır: bot WhatsApp içeriğini kendiliğinden tutmaz (Faz 69).
const MEDYA_TURLERI = new Set(['imageMessage', 'stickerMessage'])

export default {
  name: 'paylaş',
  aliases: ['paylas'],
  description: 'Yanıtlanan fotoğrafı, sticker\'ı ya da metni paneldeki grup akışına gönderir',
  usage: '.paylaş [not] (bir mesajı yanıtlayarak) ya da .paylaş <metin>',
  details: [
    'Bir fotoğrafa, sticker\'a ya da mesaja yanıt verip `.paylaş` yaz → panelde akışa senin adınla düşer.',
    '`.paylaş efsane kare #halısaha` → yazdığın not gönderinin metni olur.',
    'Yanıtsız `.paylaş merhaba` → yalnızca metin paylaşır.',
    'Başkasının mesajıysa gönderide kimin mesajı olduğu yazar. Video paylaşılmaz.',
  ],
  category: 'grup',
  cooldown: 20,

  async execute({ sock, msg, text, from, sender, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return
    const yanit = (metin) => sock.sendMessage(from, { text: metin }, { quoted: msg })
    const q = parsed.quoted
    const not = text.trim()
    const medyaVar = q && MEDYA_TURLERI.has(q.type) && !q.message.stickerMessage?.isAnimated
    const metin = [not, q?.body ?? ''].filter(Boolean).join('\n\n')
    if (!medyaVar && !metin) {
      await yanit('Bir fotoğrafa ya da mesaja yanıt verip `.paylaş` yaz, ya da `.paylaş <metin>`.')
      return
    }

    let medya = ''
    try {
      if (medyaVar) {
        const tampon = await downloadMediaMessage(q, 'buffer', {}, { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage })
        medya = await medyaKaydet(tampon)
      }
      const kaynak = q?.key?.participant ? jidNormalizedUser(q.key.participant) : sender
      const s = gonderiYaz({ chatJid: from, userJid: sender, metin, medya, kaynak })
      if (s.hata) {
        if (medya) medyaSil(medya)
        await yanit(`❌ ${s.hata}`)
        return
      }
      const adres = getDb()?.prepare("SELECT deger FROM ayar WHERE anahtar = 'panel_adres'").get()?.deger
      await yanit(adres
        ? `✅ Akışa düştü: ${adres}/s/gonderi?grup=${encodeURIComponent(from)}&id=${s.id}`
        : '✅ Akışa düştü.')
    } catch (err) {
      if (medya) medyaSil(medya)
      logger.error({ err }, 'Mesaj akışa paylaşılamadı')
      await yanit('❌ Paylaşılamadı, biraz sonra yeniden dene.')
    }
  },
}
