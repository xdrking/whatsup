import { downloadMediaMessage } from '@whiskeysockets/baileys'
import logger, { baileysLogger } from '../lib/logger.js'
import { imageToSticker, videoToSticker } from '../lib/sticker.js'
import { renderQuoteCard } from '../lib/quote.js'
import { lookupName } from '../lib/contacts.js'
import { fetchAvatar } from '../lib/target.js'

const SUPPORTED = new Set(['imageMessage', 'videoMessage'])

// Uzun videoyu indirmek boşuna trafik: nasılsa ilk 6 saniyesi alınacak.
const MAX_VIDEO_SECONDS = 30

// Medya ya yanıtlanan mesajdadır ya da komutun kendi mesajının açıklamasındadır
// (görseli ".sticker" yazarak göndermek).
function findMedia(msg, parsed) {
  if (SUPPORTED.has(parsed.quoted?.type)) return parsed.quoted
  if (SUPPORTED.has(parsed.type)) {
    return { type: parsed.type, key: msg.key, message: parsed.content }
  }
  return null
}

function stickerMeta(parsed) {
  return {
    pack: process.env.BOT_NAME || 'wp-bot',
    author: parsed.pushName || 'wp-bot',
  }
}

// Grupta yazar `contextInfo.participant`'tır. Birebir sohbette bu alan boş
// gelebilir; o durumda yanıtlanan mesaj karşı tarafındır, yani sohbetin JID'i.
function quotedAuthorJid(parsed) {
  const participant = parsed.quoted?.key?.participant
  if (participant) return participant
  return parsed.isGroup ? '' : parsed.from
}

function quotedAuthorName(sock, parsed, jid) {
  if (parsed.quoted?.key?.fromMe) {
    return sock.user?.name || process.env.BOT_NAME || 'wp-bot'
  }

  const known = lookupName(jid)
  if (known) return known

  // Kişi bot açıldığından beri hiç yazmadıysa adı bilinmez. Numara, "Bilinmeyen"
  // yazmaktan iyidir; en azından kimin mesajı olduğu ayırt edilir.
  const digits = String(jid || '').split('@')[0].split(':')[0]
  return digits ? `+${digits}` : 'Bilinmeyen'
}

async function sendMediaSticker({ sock, msg, from, parsed, media }) {
  const buffer = await downloadMediaMessage(
    media,
    'buffer',
    {},
    { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage },
  )

  const sticker = media.type === 'videoMessage'
    ? await videoToSticker(buffer, stickerMeta(parsed))
    : await imageToSticker(buffer, stickerMeta(parsed))

  await sock.sendMessage(from, { sticker }, { quoted: msg })
}

async function sendQuoteSticker({ sock, msg, from, parsed, text }) {
  const jid = quotedAuthorJid(parsed)
  const name = quotedAuthorName(sock, parsed, jid)
  const avatar = await fetchAvatar(sock, jid)

  const card = await renderQuoteCard({ name, text, avatar, jid })
  const sticker = await imageToSticker(card, stickerMeta(parsed))

  await sock.sendMessage(from, { sticker }, { quoted: msg })
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Yanıtlanan görseli, videoyu, GIF\'i veya metin mesajını sticker\'a çevirir',
  usage: '.sticker (bir medyayı ya da bir mesajı yanıtlayarak)',
  ownerOnly: false,
  // Medya dönüşümü (sharp/ffmpeg) ağır: arka arkaya tetiklenmesin.
  cooldown: 10,

  async execute({ sock, msg, from, parsed }) {
    const media = findMedia(msg, parsed)
    const quotedText = (parsed.quoted?.body || '').trim()

    if (!media && !quotedText) {
      await sock.sendMessage(
        from,
        {
          text: 'Bir görsele, videoya, GIF\'e ya da düz metin mesajına yanıt vererek ' +
            '`.sticker` yaz.',
        },
        { quoted: msg },
      )
      return
    }

    const seconds = media?.message?.videoMessage?.seconds ?? 0
    if (seconds > MAX_VIDEO_SECONDS) {
      await sock.sendMessage(
        from,
        { text: `Video çok uzun (${seconds} sn). En fazla ${MAX_VIDEO_SECONDS} sn olmalı.` },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

    try {
      // Medya varsa o öncelikli: açıklamalı bir görsele yanıt verildiğinde
      // beklenen çıktı görselin kendisidir, açıklamasının kartı değil.
      if (media) {
        await sendMediaSticker({ sock, msg, from, parsed, media })
      } else {
        await sendQuoteSticker({ sock, msg, from, parsed, text: quotedText })
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
    } catch (err) {
      // Tepki temizlenmezse mesajda kalıcı olarak ⏳ görünür.
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
      logger.error({ err, type: media?.type ?? 'quote' }, 'Sticker üretilemedi')
      throw err
    }
  },
}
