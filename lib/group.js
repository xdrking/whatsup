import { jidNormalizedUser } from '@whiskeysockets/baileys'
import logger from './logger.js'

// Grup meta verisi her komutta yeniden sorulursa WhatsApp hız sınırına takılır
// (art arda .etiket + .admin + .say yazmak bunu kolayca tetikler).
const CACHE_MS = 60_000

const cache = new Map()

/** Grup bilgisi; 60 sn içinde tekrar istenirse önbellekten döner. */
export async function groupMetadata(sock, jid) {
  const hit = cache.get(jid)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.metadata

  const metadata = await sock.groupMetadata(jid)
  cache.set(jid, { at: Date.now(), metadata })
  logger.debug({ jid, uye: metadata.participants?.length }, 'Grup bilgisi tazelendi')

  return metadata
}

export function isAdmin(participant) {
  return participant.admin === 'admin' || participant.admin === 'superadmin'
}

/**
 * Kişi grupta admin mi? Katılımcı LID ya da numara JID'iyle gelebildiği için
 * `id`, `lid` ve `jid` alanlarının hepsine bakılır; ham `===` güvenilmez.
 */
export function isGroupAdmin(metadata, jid) {
  const hedef = jidNormalizedUser(jid)

  return (metadata.participants || []).some(
    (uye) =>
      isAdmin(uye) &&
      [uye.id, uye.lid, uye.jid].some((j) => j && jidNormalizedUser(j) === hedef),
  )
}

/**
 * `isGroupAdmin`'in soket alan hali: grup bilgisi alınamazsa kişi admin
 * sayılmaz, çünkü yetkiyi bilmeden yetkili iş yapılmamalı.
 */
export async function senderIsAdmin(sock, chatJid, jid) {
  try {
    return isGroupAdmin(await groupMetadata(sock, chatJid), jid)
  } catch (err) {
    logger.error({ err, chatJid }, 'Grup bilgisi alınamadı, admin kontrolü yapılamadı')
    return false
  }
}

/**
 * Grup komutlarının tek kapısı: özel sohbette komut çalışmaz, kısa bir mesajla
 * döner. Komutlar `if (!(await requireGroup(...))) return` ile başlar.
 */
export async function requireGroup({ sock, msg, from, parsed }) {
  if (parsed.isGroup) return true

  await sock.sendMessage(
    from,
    { text: 'Bu komut yalnızca grup içinde çalışır.' },
    { quoted: msg },
  )
  return false
}

/**
 * Grup komutlarının ortak girişi: özel sohbeti eler, meta veriyi getirir,
 * hatayı kullanıcıya kısa bir mesajla bildirir. `null` dönerse komut susar.
 */
export async function requireGroupMetadata({ sock, msg, from, parsed }) {
  if (!(await requireGroup({ sock, msg, from, parsed }))) return null

  try {
    return await groupMetadata(sock, from)
  } catch (err) {
    logger.error({ err, from }, 'Grup bilgisi alınamadı')
    await sock.sendMessage(
      from,
      { text: 'Grup bilgisi alınamadı. WhatsApp cevap vermedi, biraz sonra tekrar dene.' },
      { quoted: msg },
    )
    return null
  }
}
