// Panelin HTTP tarafı. Yalnızca 127.0.0.1'i dinler, dışarıya Caddy açar.
import { createReadStream, readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { denemeSiniri, OTURUM_SANIYE, oturumlar, sifreDogru } from './guvenlik.js'
import { girisSayfasi, grupListesi, grupSayfasi, hataSayfasi, kisiSayfasi } from './sayfalar.js'
import { sonYedek } from './yedek.js'

const CEREZ = '__Host-panel'
const AZAMI_GOVDE = 1024
const STIL = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stil.css'))

const GUVENLIK_BASLIKLARI = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
}

// Caddy gerçek adresi X-Forwarded-For'un sonuna yazar; öndeki değerleri istemci
// uydurabilir. Panel 127.0.0.1'i dinlediği için bu başlığı Caddy'den başkası veremez.
function istemciIp(req) {
  const zincir = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return zincir.at(-1) ?? req.socket.remoteAddress ?? ''
}

function cerezOku(req) {
  for (const parca of String(req.headers.cookie ?? '').split(';')) {
    const [ad, deger] = parca.trim().split('=')
    if (ad === CEREZ) return deger
  }
  return ''
}

const cerez = (deger, saniye) => `${CEREZ}=${deger}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${saniye}`

async function govdeOku(req) {
  let govde = ''
  for await (const parca of req) {
    govde += parca
    if (govde.length > AZAMI_GOVDE) return null
  }
  return new URLSearchParams(govde)
}

function bekleMetni(ms) {
  const dakika = Math.ceil(ms / 60_000)
  return `Çok fazla deneme. ${dakika} dakika sonra tekrar dene.`
}

/** @param {{ sifreHash: string, veri: object, yedekKlasoru: string }} ayar */
export function sunucuKur({ sifreHash, veri, yedekKlasoru }) {
  const sinir = denemeSiniri()
  const oturum = oturumlar()

  const gonder = (res, kod, govde, basliklar = {}) => {
    res.writeHead(kod, {
      ...GUVENLIK_BASLIKLARI,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...basliklar,
    })
    res.end(govde)
  }
  const yonlendir = (res, yer, basliklar = {}) => {
    res.writeHead(303, { ...GUVENLIK_BASLIKLARI, Location: yer, 'Cache-Control': 'no-store', ...basliklar })
    res.end()
  }

  async function girisYap(req, res) {
    const form = await govdeOku(req)
    if (!form) return gonder(res, 413, girisSayfasi('İstek çok büyük.'))

    const ip = istemciIp(req)
    const { izin, bekleMs } = sinir.dene(ip)
    if (!izin) {
      logger.warn({ ip }, 'Panel girişi sınıra takıldı')
      return gonder(res, 429, girisSayfasi(bekleMetni(bekleMs)), { 'Retry-After': String(Math.ceil(bekleMs / 1000)) })
    }

    if (!(await sifreDogru(form.get('sifre') ?? '', sifreHash))) {
      logger.warn({ ip }, 'Panelde yanlış şifre')
      return gonder(res, 401, girisSayfasi('Şifre yanlış.'))
    }

    sinir.basarili(ip)
    logger.info({ ip }, 'Panele giriş yapıldı')
    return yonlendir(res, '/', { 'Set-Cookie': cerez(oturum.ac(), OTURUM_SANIYE) })
  }

  function yedekGonder(res) {
    const dosya = sonYedek(yedekKlasoru)
    if (!dosya) return gonder(res, 404, hataSayfasi('Henüz yedek yok.'))

    res.writeHead(200, {
      ...GUVENLIK_BASLIKLARI,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(dosya)}"`,
      'Cache-Control': 'no-store',
    })
    createReadStream(dosya)
      .on('error', (err) => {
        logger.error({ err }, 'Yedek gönderilemedi')
        res.destroy()
      })
      .pipe(res)
  }

  function sayfa(res, url) {
    if (url.pathname === '/') {
      const gruplar = veri.gruplar()
      if (gruplar.length === 1) return yonlendir(res, `/grup?id=${encodeURIComponent(gruplar[0].chat_jid)}`)
      return gonder(res, 200, grupListesi(gruplar))
    }

    if (url.pathname === '/grup') {
      const chat = url.searchParams.get('id') ?? ''
      const g = veri.grup(chat, url.searchParams.get('sirala'))
      if (!g) return gonder(res, 404, hataSayfasi('Böyle bir grup yok.'))
      return gonder(res, 200, grupSayfasi(chat, g, {
        tekGrup: veri.gruplar().length === 1,
        yedekVar: Boolean(sonYedek(yedekKlasoru)),
      }))
    }

    if (url.pathname === '/kisi') {
      const chat = url.searchParams.get('grup') ?? ''
      const k = veri.kisi(chat, url.searchParams.get('id') ?? '')
      if (!k) return gonder(res, 404, hataSayfasi('Böyle bir kişi yok.'))
      return gonder(res, 200, kisiSayfasi(chat, k))
    }

    if (url.pathname === '/yedek') return yedekGonder(res)

    return gonder(res, 404, hataSayfasi('Sayfa bulunamadı.'))
  }

  async function isle(req, res) {
    const url = new URL(req.url, 'http://panel')
    const yol = `${req.method} ${url.pathname}`

    if (yol === 'GET /stil.css') {
      return gonder(res, 200, STIL, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }

    const jeton = cerezOku(req)
    const girisli = oturum.gecerli(jeton)

    if (yol === 'POST /giris') return girisYap(req, res)
    if (yol === 'GET /giris') return girisli ? yonlendir(res, '/') : gonder(res, 200, girisSayfasi())

    if (!girisli) return yonlendir(res, '/giris')

    if (yol === 'POST /cikis') {
      oturum.kapat(jeton)
      return yonlendir(res, '/giris', { 'Set-Cookie': cerez('', 0) })
    }
    if (req.method !== 'GET') return gonder(res, 405, hataSayfasi('Bu işlem yapılamaz.'))

    return sayfa(res, url)
  }

  const sunucu = http.createServer((req, res) => {
    isle(req, res).catch((err) => {
      logger.error({ err, url: req.url }, 'Panel isteği başarısız')
      if (!res.headersSent) gonder(res, 500, hataSayfasi('Bir şeyler ters gitti.'))
      else res.destroy()
    })
  })
  sunucu.requestTimeout = 10_000
  sunucu.headersTimeout = 5_000
  return sunucu
}
