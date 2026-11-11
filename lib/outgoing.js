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

// Baileys 6.7.24 yeniden gönderim isteğinde önce oturumu zorla yeniler, sayacı ise ancak gövde
// bulunursa artırır. Gövde yoksa (bot yeniden başladı ya da 300'den eski) her istek sınırsızca yeni
// oturum açtırıyordu: Signal oturumları bozuldu, bot `Bad MAC` ile hiçbir mesajı okuyamadı.
// Yer tutucu sayacı işletir, beşinci istekten sonra Baileys durur. getMessage yalnızca bu yolda çağrılır.
export const KAYIP_MESAJ = { conversation: '⌛ Bu mesaj artık gönderilemiyor.' }

/** Yeniden gönderim için mesaj gövdesi; bilinmiyorsa yer tutucu. */
export function gonderilenMesaj(id) {
  return mesajlar.get(id) ?? KAYIP_MESAJ
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
