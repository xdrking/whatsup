import { jidNormalizedUser } from '@whiskeysockets/baileys'
import logger from './logger.js'
import { lookupName } from './contacts.js'

// Elle yazılmış numara: "905551112233" ya da "+905551112233".
const TYPED_NUMBER = /^\+?\d{8,15}$/

/** JID'in numara kısmı: "9055...@s.whatsapp.net" ve "9055...:12@lid" ikisi de olur. */
export function digitsOf(jid) {
  return String(jid || '').split('@')[0].split(':')[0]
}

// WhatsApp'ta etiket iki parçadan oluşur: metinde "@<numara>", mesaj nesnesinde
// `mentions` dizisi. Biri eksikse etiket tıklanmaz, düz metin gibi görünür.
export function mentionOf(jid) {
  return `@${digitsOf(jid)}`
}

/** Bilinen ad, yoksa numara. Metinde etiket değil, düz ad göstermek için. */
export function displayName(jid) {
  const known = lookupName(jid)
  if (known) return known

  const digits = digitsOf(jid)
  return digits ? `+${digits}` : 'Bilinmeyen'
}

function normalize(jid) {
  if (!jid) return ''
  try {
    return jidNormalizedUser(jid)
  } catch {
    // Bozuk JID'de jidNormalizedUser hata atar; ham değer yine de iş görür.
    return jid
  }
}

// Grupta yanıtlanan mesajın yazarı `contextInfo.participant`'tır. Birebir
// sohbette bu alan boş gelir; yanıtlanan mesaj ya karşı tarafındır ya bizim.
function quotedAuthor(parsed) {
  if (!parsed.quoted) return ''

  const participant = parsed.quoted.key?.participant
  if (participant) return normalize(participant)

  if (parsed.isGroup) return ''
  return parsed.quoted.key?.fromMe ? '' : normalize(parsed.from)
}

/**
 * Komutun hedef aldığı kullanıcı(lar). Öncelik: etiket → yanıtlanan mesajın
 * sahibi → elle yazılmış numara → (istenirse) komutu yazanın kendisi.
 *
 * @returns {string[]} en fazla `limit` kadar, tekrarsız JID
 */
export function resolveTargets(parsed, { args = [], limit = 1, includeSender = false } = {}) {
  const found = []

  const add = (jid) => {
    const clean = normalize(jid)
    if (clean && !found.includes(clean)) found.push(clean)
  }

  for (const jid of parsed.mentions || []) add(jid)
  add(quotedAuthor(parsed))

  for (const arg of args) {
    if (TYPED_NUMBER.test(arg)) add(`${arg.replace(/\D/g, '')}@s.whatsapp.net`)
  }

  if (includeSender) add(parsed.sender)

  return found.slice(0, limit)
}

/**
 * Profil fotoğrafını indirir. Fotoğraf yoksa ya da gizlilik ayarı kapatıyorsa
 * Baileys hata atar — bu beklenen bir durumdur, `null` dönülür ve çağıran taraf
 * (sticker kartı, `.pp`) kendi geri düşüşünü uygular.
 */
export async function fetchAvatar(sock, jid) {
  if (!jid) return null

  try {
    const url = await sock.profilePictureUrl(jid, 'image')
    if (!url) return null

    const response = await fetch(url)
    if (!response.ok) {
      logger.warn({ status: response.status, jid }, 'Profil fotoğrafı indirilemedi')
      return null
    }

    return Buffer.from(await response.arrayBuffer())
  } catch (err) {
    logger.info({ err: err.message, jid }, 'Profil fotoğrafı yok ya da gizli')
    return null
  }
}
