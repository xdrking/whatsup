import { jidNormalizedUser } from '@whiskeysockets/baileys'
import logger from './logger.js'
import { parseMessage } from './messageParser.js'
import { rememberName } from './contacts.js'
import { recordActivity } from './activity.js'
import { sentByBot } from './outgoing.js'
import { recordMessage } from './stats.js'
import { checkCooldown } from './cooldown.js'
import { handleGameReply } from '../games/gameManager.js'

const PREFIX = process.env.PREFIX || '.'

// JID'ler "905551112233@s.whatsapp.net", "905551112233:12@s.whatsapp.net" veya
// yeni sürümlerde LID ("...@lid") biçiminde gelebilir. Karşılaştırma için
// yalnızca rakamlar alınır.
function toDigits(jid) {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '')
}

function isOwner(sender) {
  const owner = (process.env.OWNER_NUMBER || '').replace(/\D/g, '')
  if (!owner) return false
  return toDigits(sender) === owner
}

export async function handleMessage({ sock, msg, commands }) {
  if (!msg.message) return

  const meJid = jidNormalizedUser(sock.user?.id || '')
  const parsed = parseMessage(msg, meJid)
  if (!parsed) return

  // Prefix kontrolünden ÖNCE: yanıtlanan mesajın yazarının adını öğrenmenin tek
  // yolu, o mesaj geçerken pushName'i not etmektir. Komut olmayan mesajlar da
  // buraya düşer ve `.sticker` alıntı kartı adı oradan bulur.
  rememberName(parsed.sender, parsed.pushName)

  // Botun kendi yanıtları da bu olaya düşer; sayılırsa `.son` hep botu gösterir
  // ve bot sahibinin istatistiği şişer.
  if (!sentByBot(msg.key?.id)) {
    // .son ve .kimvar bunun üzerinden çalışır: komut olmayan mesajlar da
    // sayılır, yoksa "son yazan" hep bot komutu yazanlar olurdu.
    recordActivity(parsed.from, parsed.sender)

    recordMessage({ chatJid: parsed.from, userJid: parsed.sender, type: parsed.type })
  }

  if (!parsed.body) return

  // Oyun cevapları prefix taşımaz, bu yüzden prefix kontrolünden önce bakılır.
  // Kanca yalnızca aktif oyunun *son* mesajına gelen yanıtları tüketir; başka
  // her mesaj olduğu gibi akışa devam eder. sentByBot şart: botun kendi oyun
  // mesajları da `append` olarak geri düşer ve alıntı taşır.
  if (!sentByBot(msg.key?.id) && (await handleGameReply({ sock, msg, parsed }))) return

  const body = parsed.body.trim()
  if (!body.startsWith(PREFIX)) return

  const withoutPrefix = body.slice(PREFIX.length).trim()
  const name = withoutPrefix.split(/\s+/)[0]?.toLowerCase()
  if (!name) return

  const command = commands.get(name)
  // Bilinmeyen komutta sessiz kalınır: grup içinde her yanlış yazımda bot
  // konuşursa rahatsız edici olur.
  if (!command) return

  const senderIsOwner = isOwner(parsed.sender)

  if (command.ownerOnly && !senderIsOwner) {
    logger.warn({ sender: parsed.sender, command: name }, 'Yetkisiz komut denemesi')
    return
  }

  // Bot sahibi sınırsız: komutları denerken kendini bekletmesin.
  if (!senderIsOwner) {
    const bekleme = checkCooldown({ userJid: parsed.sender, command })
    if (!bekleme.ok) {
      logger.debug({ sender: parsed.sender, command: name }, 'Komut bekleme süresinde')
      if (bekleme.uyar) {
        await sock.sendMessage(
          parsed.from,
          { text: `⏳ Biraz yavaş, ${bekleme.kalanSn} sn sonra tekrar dene.` },
          { quoted: msg },
        )
      }
      return
    }
  }

  const text = withoutPrefix.slice(name.length).trim()
  const args = text ? text.split(/\s+/) : []

  logger.info({ command: name, from: parsed.from, sender: parsed.sender }, 'Komut çalıştırılıyor')

  try {
    await command.execute({
      sock,
      msg,
      args,
      text,
      from: parsed.from,
      sender: parsed.sender,
      parsed,
      // .help gibi komutlar kayıt defterine ve yetki durumuna ihtiyaç duyar.
      commands,
      isOwner: senderIsOwner,
    })
  } catch (err) {
    logger.error({ err, command: name }, 'Komut çalışırken hata')
    try {
      await sock.sendMessage(
        parsed.from,
        { text: `\`${PREFIX}${name}\` çalışırken bir hata oldu.` },
        { quoted: msg },
      )
    } catch (sendErr) {
      logger.error({ err: sendErr }, 'Hata mesajı gönderilemedi')
    }
  }
}
