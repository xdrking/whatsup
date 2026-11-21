// Web Push (Faz 67), yeni paket olmadan. Push gövdesiz gider: şifreli payload (RFC 8291)
// gerekmez, yalnızca VAPID imzası (RFC 8292) atılır. Telefon uyanınca servis işçisi
// bildirimin metnini /s/push-ozet'ten çeker. Anahtarlar ilk kullanımda üretilip `ayar`'a yazılır.
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { getDb } from '../lib/db.js'
import logger from '../lib/logger.js'
import { pushAlicilari, pushSil } from '../lib/sosyal.js'

// Kullanıcı aboneliği kendisi gönderir, sunucu o adrese istek atar: yalnızca bilinen push
// servislerine izin verilir, yoksa iç ağdaki bir adres kaydedilip sunucuya istek attırılırdı.
const IZINLI = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/]
const BEKLEME_MS = 2000
const CIHAZ_ARALIGI_MS = 20_000
const b64 = (b) => Buffer.from(b).toString('base64url')

export function endpointGecerli(adres) {
  try {
    const u = new URL(adres)
    return u.protocol === 'https:' && !u.port && IZINLI.some((d) => d.test(u.hostname)) && adres.length <= 1000
  } catch {
    return false
  }
}

function ayarOku(anahtar) {
  return getDb()?.prepare('SELECT deger FROM ayar WHERE anahtar = ?').get(anahtar)?.deger ?? ''
}
function ayarYaz(anahtar, deger) {
  getDb()?.prepare('INSERT INTO ayar (anahtar, deger) VALUES (?, ?) ON CONFLICT (anahtar) DO UPDATE SET deger = excluded.deger').run(anahtar, deger)
}

let anahtarlar = null
/** @returns {{ acik: string, ozel: import('node:crypto').KeyObject }} acik: tarayıcıya verilen ham açık anahtar */
export function vapid() {
  if (anahtarlar) return anahtarlar
  let jwk = ayarOku('vapid_ozel')
  if (!jwk) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }))
    ayarYaz('vapid_ozel', jwk)
  }
  const ozel = createPrivateKey({ key: JSON.parse(jwk), format: 'jwk' })
  const { x, y } = JSON.parse(jwk)
  anahtarlar = { ozel, acik: b64(Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')])) }
  return anahtarlar
}

/** Push servisinin istediği kısa ömürlü imza. `sub` panelin adresidir (Apple mailto ya da https ister). */
export function vapidBasligi(endpoint, sub, now = Date.now()) {
  const { ozel, acik } = vapid()
  const govde = `${b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub,
  }))}`
  const imza = sign('sha256', Buffer.from(govde), { key: ozel, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${govde}.${b64(imza)}, k=${acik}`
}

export function panelAdresiKaydet(adres) {
  if (/^https:\/\/[^/]+$/.test(adres) && ayarOku('panel_adres') !== adres) ayarYaz('panel_adres', adres)
}

/**
 * Bildirim kancası: aynı kişiye arka arkaya gelen bildirimler BEKLEME_MS içinde birleşir,
 * aynı cihaza CIHAZ_ARALIGI_MS'de bir push gider. Hata kullanıcıya dönmez, loglanır.
 */
export function pushMotoru({ gonder = fetch, zamanlayici = setTimeout } = {}) {
  const bekleyen = new Set()
  const sonGonderim = new Map()

  async function cihazaGonder(endpoint) {
    const simdi = Date.now()
    if (simdi - (sonGonderim.get(endpoint) ?? 0) < CIHAZ_ARALIGI_MS) return
    sonGonderim.set(endpoint, simdi)
    try {
      const yanit = await gonder(endpoint, {
        method: 'POST',
        headers: { TTL: '86400', Urgency: 'high', Authorization: vapidBasligi(endpoint, ayarOku('panel_adres') || 'mailto:panel@example.com') },
        signal: AbortSignal.timeout(10_000),
      })
      // Abonelik ölmüş: cihaz izni kaldırdı ya da uygulama silindi.
      if (yanit.status === 404 || yanit.status === 410) pushSil(endpoint)
      else if (!yanit.ok) logger.warn({ status: yanit.status }, 'Push servisi reddetti')
    } catch (err) {
      logger.warn({ err: err.message }, 'Push gönderilemedi')
    }
  }

  return function kanca(chatJid, userJid) {
    const anahtar = `${chatJid}|${userJid}`
    if (bekleyen.has(anahtar)) return
    bekleyen.add(anahtar)
    zamanlayici(() => {
      bekleyen.delete(anahtar)
      for (const endpoint of pushAlicilari(chatJid, userJid)) cihazaGonder(endpoint)
    }, BEKLEME_MS)
  }
}
