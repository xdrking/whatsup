// Foto yükleyen formlar için küçük multipart/form-data ayrıştırıcısı. Yeni paket
// eklenmesin diye elle yazıldı: yalnızca metin alanları ve en çok bir dosya okunur.

export const AZAMI_YUKLEME = 12 * 1024 * 1024

/** @returns {Promise<Buffer | null>} sınırı aşarsa null */
export async function hamGovde(req, azami = AZAMI_YUKLEME) {
  const parcalar = []
  let boy = 0
  for await (const parca of req) {
    boy += parca.length
    if (boy > azami) return null
    parcalar.push(parca)
  }
  return Buffer.concat(parcalar)
}

/**
 * @returns {{ alanlar: Map<string, string>, dosya: Buffer | null } | null}
 * Biçim bozuksa null. Dosya alanının adı ne olursa olsun ilk boş olmayan dosya alınır.
 */
export function multipartCoz(govde, icerikTuru) {
  const sinir = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(icerikTuru))
  if (!sinir) return null
  const ayrac = Buffer.from(`--${sinir[1] ?? sinir[2]}`)
  const alanlar = new Map()
  let dosya = null

  let bas = govde.indexOf(ayrac)
  if (bas < 0) return null
  for (;;) {
    bas += ayrac.length
    if (govde.subarray(bas, bas + 2).toString() === '--') break
    bas += 2 // \r\n
    const baslikSonu = govde.indexOf('\r\n\r\n', bas)
    if (baslikSonu < 0) return null
    const basliklar = govde.subarray(bas, baslikSonu).toString('utf8')
    const sonraki = govde.indexOf(ayrac, baslikSonu)
    if (sonraki < 0) return null
    const icerik = govde.subarray(baslikSonu + 4, sonraki - 2)

    const ad = /name="([^"]*)"/i.exec(basliklar)?.[1]
    if (ad !== undefined) {
      if (/filename="/i.test(basliklar)) {
        if (!dosya && icerik.length) dosya = icerik
      } else if (!alanlar.has(ad)) {
        alanlar.set(ad, icerik.toString('utf8'))
      }
    }
    bas = sonraki
  }
  return { alanlar, dosya }
}
