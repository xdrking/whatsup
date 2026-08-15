// "Son kim yazdı" bilgisi. Baileys'te bir grubun anlık online listesi güvenilir
// biçimde alınamaz, bu yüzden .kimvar ve .son presence taklidi yapmaz: yalnızca
// bu bottan geçen mesajların zamanına bakar.
//
// Bilerek yalnızca bellekte: mesaj içeriği tutulmaz, yalnızca "kim, ne zaman".
// Süreç yeniden başlarsa liste boşalır — komutlar bunu açıkça söyler.
const MAX_PER_CHAT = 50

const chats = new Map()

/** Her gelen mesajda çağrılır (lib/handler.js). */
export function recordActivity(chatJid, jid, at = Date.now()) {
  if (!chatJid || !jid) return

  const entries = chats.get(chatJid) || []

  // Kişi başına tek kayıt: eski girdi silinip en sona taşınır, böylece dizinin
  // sonu her zaman en son yazandır.
  const index = entries.findIndex((entry) => entry.jid === jid)
  if (index !== -1) entries.splice(index, 1)

  entries.push({ jid, at })
  while (entries.length > MAX_PER_CHAT) entries.shift()

  chats.set(chatJid, entries)
}

/** Sohbette en son yazan kişi; kayıt yoksa null. */
export function lastSender(chatJid) {
  const entries = chats.get(chatJid)
  if (!entries?.length) return null
  return entries[entries.length - 1]
}

/** Son `windowMs` içinde yazanlar, en yeniden eskiye. */
export function activeSince(chatJid, windowMs) {
  const entries = chats.get(chatJid) || []
  const limit = Date.now() - windowMs

  return entries.filter((entry) => entry.at >= limit).reverse()
}

/** "3 dk önce" gibi kısa süre metni. */
export function formatAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))

  if (seconds < 60) return `${seconds} sn önce`
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk önce`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} saat önce`
  return `${Math.round(seconds / 86400)} gün önce`
}
