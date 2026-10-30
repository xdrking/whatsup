import { getContentType, jidNormalizedUser } from '@whiskeysockets/baileys'

// WhatsApp bazı mesajları başka bir mesajın içine sarmalar (kaybolan mesajlar,
// "bir kez görüntüle", açıklamalı belge). Asıl içeriğe ulaşmak için soyulur.
function unwrap(message) {
  if (!message) return null
  if (message.ephemeralMessage) return unwrap(message.ephemeralMessage.message)
  if (message.viewOnceMessage) return unwrap(message.viewOnceMessage.message)
  if (message.viewOnceMessageV2) return unwrap(message.viewOnceMessageV2.message)
  if (message.viewOnceMessageV2Extension) return unwrap(message.viewOnceMessageV2Extension.message)
  if (message.documentWithCaptionMessage) return unwrap(message.documentWithCaptionMessage.message)
  return message
}

// Metin, mesaj tipine göre farklı alanda durur: düz sohbette `conversation`,
// yanıtlı mesajda `extendedTextMessage.text`, medyada ise `caption`.
function extractText(content, type) {
  if (type === 'conversation') return content.conversation || ''
  if (type === 'extendedTextMessage') return content.extendedTextMessage?.text || ''
  return content[type]?.caption || ''
}

/**
 * Ham Baileys mesajını komutların kullanacağı düz nesneye çevirir.
 * Baileys'in iç içe yapısı YALNIZCA burada çözülür.
 *
 * @param {object} msg   'messages.upsert' event'inden gelen mesaj
 * @param {string} meJid botun kendi JID'i (jidNormalizedUser ile normalize edilmiş)
 * @returns {object|null} parse edilemeyen mesajlarda null
 */
export function parseMessage(msg, meJid) {
  const content = unwrap(msg.message)
  if (!content) return null

  const type = getContentType(content)
  if (!type) return null

  const from = msg.key.remoteJid
  if (!from) return null

  const isGroup = from.endsWith('@g.us')
  const isFromMe = Boolean(msg.key.fromMe)

  // Grupta gönderen `participant` alanındadır; birebir sohbette karşı taraf
  // remoteJid'dir. Bot kendi yazdıysa gönderen her koşulda botun kendisidir.
  const rawSender = isFromMe ? meJid : (msg.key.participant || from)
  const sender = jidNormalizedUser(rawSender)

  // LID adreslemeli gruplarda `participant` "...@lid" gelir ve telefon numarası
  // taşımaz. WhatsApp numarayı ayrıca verirse (participantPn / senderPn) sahip
  // kontrolü onu kullanır. `sender` bilerek değişmez: istatistik ve etiketler
  // WhatsApp'ın verdiği kimlikle çalışmaya devam eder.
  const senderPn = isFromMe
    ? meJid
    : jidNormalizedUser(msg.key.participantPn || msg.key.senderPn || rawSender)

  const contextInfo = content[type]?.contextInfo
  const quotedContent = contextInfo?.quotedMessage ? unwrap(contextInfo.quotedMessage) : null

  // Etiketlenen kişiler yalnızca contextInfo'da durur. Komutlar buraya elle
  // inmesin diye hedef alan komutlar (.roast, .ship, .pp…) bu diziyi kullanır.
  const mentions = (contextInfo?.mentionedJid || []).map((jid) => {
    try {
      return jidNormalizedUser(jid)
    } catch {
      return jid
    }
  })

  // downloadMediaMessage() `{ key, message }` şeklinde bir nesne bekler, bu
  // yüzden alıntılanan mesaj doğrudan indirilebilir biçimde verilir.
  const quoted = quotedContent
    ? {
        type: getContentType(quotedContent),
        message: quotedContent,
        // Alıntılanan mesajın metni (medyada açıklama). Yanıtlanan mesajı
        // işleyen komutlar (.tts gibi) bunu kullanır.
        body: extractText(quotedContent, getContentType(quotedContent)),
        key: {
          remoteJid: from,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
          fromMe: Boolean(contextInfo.participant) &&
            jidNormalizedUser(contextInfo.participant) === meJid,
        },
      }
    : null

  return {
    from,
    sender,
    senderPn,
    isGroup,
    isFromMe,
    type,
    // Sarmalayıcılarından soyulmuş ham içerik. downloadMediaMessage() bunu
    // ister; msg.message doğrudan verilirse kaybolan mesajlarda medya bulunamaz.
    content,
    body: extractText(content, type),
    pushName: msg.pushName || '',
    mentions,
    quoted,
  }
}
