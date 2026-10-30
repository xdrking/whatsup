// Dış servis komutlarının (.hava, .deprem, .döviz, .namaz) ortak isteği.
// Zaman aşımı şart: yanıt vermeyen bir servis komutu sonsuza kadar bekletmesin.
const VARSAYILAN_MS = 6000

export class HttpError extends Error {
  constructor(status, url) {
    super(`${new URL(url).host} ${status} döndü`)
    this.status = status
  }
}

/** JSON döner; 2xx dışı yanıtta HttpError, zaman aşımında AbortError atar. */
export async function getJson(url, { timeoutMs = VARSAYILAN_MS } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new HttpError(response.status, url)
  return response.json()
}
