// Botun kendi gönderdiği mesajlar 'messages.upsert' olayına `append` tipiyle
// geri düşer. Ayırt edilmezse bot kendi yanıtlarını bot sahibinin mesajı gibi
// sayar: `.son` hep botu gösterir, istatistikler şişer.
//
// Gönderilen mesajın id'si sendMessage'ın dönüşünde gelir; tek kayıt noktası
// burasıdır.
const MAX_ID = 300

const ids = new Set()
const sira = []

export function rememberSent(id) {
  if (!id || ids.has(id)) return

  ids.add(id)
  sira.push(id)

  if (sira.length > MAX_ID) ids.delete(sira.shift())
}

export function sentByBot(id) {
  return Boolean(id) && ids.has(id)
}

/** `sock.sendMessage`'ı sarar; index.js soket kurulduktan sonra bir kez çağırır. */
export function trackOutgoing(sock) {
  const original = sock.sendMessage.bind(sock)

  sock.sendMessage = async (...args) => {
    const result = await original(...args)
    rememberSent(result?.key?.id)
    return result
  }

  return sock
}
