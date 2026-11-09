// Botun kendi gönderdiği mesajlar 'messages.upsert' olayına `append` tipiyle
// geri düşer. Ayırt edilmezse bot kendi yanıtlarını bot sahibinin mesajı gibi
// sayar: `.son` hep botu gösterir, istatistikler şişer.
//
// Gönderilen mesajın id'si sendMessage'ın dönüşünde gelir; tek kayıt noktası
// burasıdır.
//
// Gönderilen mesajın gövdesi de aynı süre bellekte tutulur: alıcının telefonu mesajı çözemezse
// (botla daha önce özel yazışmamış kişi) "yeniden gönder" ister, Baileys bunu index.js'teki
// `getMessage` ile karşılar. Gövde yoksa mesaj alıcıda kalıcı olarak "Bu mesaj bekleniyor" der
// (`.vampir` ve `.tabu` rolleri böyle kayboluyordu). Yalnızca botun kendi mesajlarıdır, diske yazılmaz.
const MAX_ID = 300

const mesajlar = new Map()

export function rememberSent(id, message = null) {
  if (!id || mesajlar.has(id)) return

  mesajlar.set(id, message)
  // Map ekleme sırasını korur: ilk anahtar en eskisidir.
  if (mesajlar.size > MAX_ID) mesajlar.delete(mesajlar.keys().next().value)
}

export function sentByBot(id) {
  return Boolean(id) && mesajlar.has(id)
}

/** Yeniden gönderim için mesaj gövdesi; bilinmiyorsa undefined (Baileys böyle bekler). */
export function gonderilenMesaj(id) {
  return mesajlar.get(id) ?? undefined
}

/** `sock.sendMessage`'ı sarar; index.js soket kurulduktan sonra bir kez çağırır. */
export function trackOutgoing(sock) {
  const original = sock.sendMessage.bind(sock)

  sock.sendMessage = async (...args) => {
    const result = await original(...args)
    rememberSent(result?.key?.id, result?.message ?? null)
    return result
  }

  return sock
}
