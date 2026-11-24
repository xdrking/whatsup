// Panelin HTTP tarafı. Yalnızca 127.0.0.1'i dinler, dışarıya nginx açar.
import { createReadStream, readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { getStats } from '../lib/stats.js'
import { girisHesaplari, oturumDeposu, panelHesaplari } from '../lib/panelHesap.js'
import { denemeSiniri, OTURUM_SANIYE, oturumlar, sifreDogru, sifreHashle } from './guvenlik.js'
import { buyukVurgunlar, hazineyiTani, kumarMotoru, TEK_OYUNLAR as TEK } from './kumar.js'
import { hesapMotoru } from './hesap.js'
import { btcFiyati, btcGecmisi, GRAFIK_ARALIKLARI } from '../lib/kripto.js'
import { nftBul } from '../lib/nft.js'
import { nftGorseli } from '../lib/nftResim.js'
import { coinCanli, coinSayfasi, sulyCanli, sulyMarketSayfasi, sulySayfasi } from './sulySayfalari.js'
import { bankaSayfasi, HESAP_SAYFALARI, hesapSayfasi } from './hesapSayfalari.js'
import { grupSecimi, hesapLink, lobi, oyunLink, oyunSayfasi, oyunVar } from './oyunSayfalari.js'
import { girisSayfasi, grupListesi, grupSayfasi, hataSayfasi, hisseSayfasi, kisiSayfasi } from './sayfalar.js'
import { sonYedek } from './yedek.js'
import { sosyalIsle, sosyalMotoru } from './sosyal.js'
import { ikonlar, MANIFEST } from './pwa.js'
import { pushMotoru } from './push.js'
import { bildirimKancasiKur } from '../lib/sosyal.js'

const CEREZ = '__Host-panel'
const AZAMI_GOVDE = 1024
const KLASOR = path.dirname(fileURLToPath(import.meta.url))
const STIL = readFileSync(path.join(KLASOR, 'stil.css'))
const KUMARHANE_STIL = readFileSync(path.join(KLASOR, 'kumarhane.css'))
const OYUN_BETIGI = readFileSync(path.join(KLASOR, 'oyun.js'))
const SOSYAL_STIL = readFileSync(path.join(KLASOR, 'sosyal.css'))
const SOSYAL_BETIGI = readFileSync(path.join(KLASOR, 'sosyal-istemci.js'))
const SERVIS_ISCISI = readFileSync(path.join(KLASOR, 'sw.js'))

const GUVENLIK_BASLIKLARI = {
  // Betik yalnızca panelin kendi oyun.js dosyasıdır: satır içi betik yasak kalır, ad alanına
  // yazılan <script> çalışmaz. connect-src oyun.js'in formu sayfa yenilemeden göndermesi içindir.
  // img-src blob: seçilen fotoğrafın önizlemesi içindir; manifest ve worker PWA içindir (Faz 66).
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' blob:; manifest-src 'self'; worker-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
}

// nginx gerçek adresi X-Forwarded-For'a yazar; zincir olursa öndeki değerleri istemci
// uydurabilir. Panel 127.0.0.1'i dinlediği için bu başlığı nginx'ten başkası veremez.
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

async function govdeOku(req, azami = AZAMI_GOVDE) {
  let govde = ''
  for await (const parca of req) {
    govde += parca
    if (govde.length > azami) return null
  }
  return new URLSearchParams(govde)
}

function bekleMetni(ms) {
  const dakika = Math.ceil(ms / 60_000)
  return `Çok fazla deneme. ${dakika} dakika sonra tekrar dene.`
}

/** @param {{ sifreHash: string, veri: object, yedekKlasoru: string }} ayar */
export function sunucuKur({ sifreHash, veri, yedekKlasoru, kumar = kumarMotoru(), hesap: hesapIsleri = hesapMotoru(), sosyal = sosyalMotoru(), push = pushMotoru(), depo = oturumDeposu(), fiyat = btcFiyati, gecmis = btcGecmisi }) {
  bildirimKancasiKur(push)
  const sinir = denemeSiniri()
  const oturum = oturumlar({ depo })
  // Kimliği bulunmayan girişte de scrypt çalışır: yanıt süresinden hesabın varlığı anlaşılmasın.
  const sahteHash = sifreHashle('panel-sahte-sifre')

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

  const nftGorselleri = new Map()
  async function nftGonder(res, no) {
    const nft = nftBul(no)
    if (!nft) return gonder(res, 404, hataSayfasi('Böyle bir NFT yok.'))
    // Görsel `no`'dan türer, değişmez; ilk istekte çizilir.
    if (!nftGorselleri.has(nft.no)) nftGorselleri.set(nft.no, await nftGorseli(nft))
    return gonder(res, 200, nftGorselleri.get(nft.no), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' })
  }

  /** Suly sayfasının verisi; fiyat ve grafikler aynı anda sorulur. */
  async function sulyVerisi(kim, url) {
    const istenen = url.searchParams.get('aralik') ?? ''
    const aralik = Object.hasOwn(GRAFIK_ARALIKLARI, istenen) ? istenen : '24s'
    const simdi = Date.now()
    const [anlik, noktalar, gunler] = await Promise.all([fiyat(), gecmis(aralik), gecmis('30g')])
    return { chat: kim.chat, aralik, anlik, noktalar, gunler, simdi, ...hesapIsleri.suly(kim) }
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

    const kimlik = (form.get('kimlik') ?? '').trim().slice(0, 40)
    const sifre = form.get('sifre') ?? ''

    // Kimlik boşsa yönetici girişidir (eski panel şifresi), doluysa oyuncu.
    if (!kimlik) {
      if (!(await sifreDogru(sifre, sifreHash))) {
        logger.warn({ ip }, 'Panelde yanlış şifre')
        return gonder(res, 401, girisSayfasi('Şifre yanlış.'))
      }
      sinir.basarili(ip)
      logger.info({ ip }, 'Panele yönetici girişi yapıldı')
      return yonlendir(res, '/', { 'Set-Cookie': cerez(oturum.ac({ tur: 'yonetici' }), OTURUM_SANIYE) })
    }

    const hesaplar = girisHesaplari(kimlik)
    const hesap = hesaplar[0]
    if (!(await sifreDogru(sifre, hesap?.sifre ?? (await sahteHash))) || !hesap) {
      logger.warn({ ip }, 'Panelde yanlış oyuncu girişi')
      return gonder(res, 401, girisSayfasi('Numara, LID ya da şifre yanlış.', kimlik))
    }

    sinir.basarili(ip)
    logger.info({ ip }, 'Panele oyuncu girişi yapıldı')
    const veriler = { tur: 'oyuncu', numara: hesap.numara, lid: hesap.lid, surum: hesap.surum }
    return yonlendir(res, '/s', { 'Set-Cookie': cerez(oturum.ac(veriler), OTURUM_SANIYE) })
  }

  /** Oyuncunun hâlâ geçerli grup satırları: gruptan çıkan ya da şifresini değiştiren düşer. */
  function oyuncuHesaplari(o) {
    return panelHesaplari({ numara: o.numara, lid: o.lid }).filter((r) => r.surum === o.surum)
  }

  const grupAdlari = () => new Map(veri.gruplar().map((g) => [g.chat_jid, g.ad]))

  const ortak = { gonder, yonlendir, govdeOku, grupAdlari: () => grupAdlari(), guvenlik: GUVENLIK_BASLIKLARI, vurgunAl: (kim) => kumar.vurgunAl(kim) }

  async function oyuncuIsle(req, res, url, yontem, hesaplar) {
    // Bot (hazine) kimliği her istekte tanınır: tanınmadan açılan sayfada hazine en zenginler ortalamasına girip
    // SulyMarket fiyatını şişiriyor, WhatsApp'takinden pahalı satıyordu.
    hazineyiTani()
    if (url.pathname === '/') return yonlendir(res, '/s')
    if (await sosyalIsle({ req, res, url, yontem, hesaplar, ortak, motor: sosyal })) return
    const yol = `${yontem} ${url.pathname}`
    const hesapBul = (chat) => hesaplar.find((r) => r.chat_jid === chat)

    if (yol === 'GET /oyun/suly-canli') {
      const hesap = hesapBul(url.searchParams.get('grup') ?? '')
      if (!hesap) return gonder(res, 404, '')
      return gonder(res, 200, sulyCanli(await sulyVerisi({ chat: hesap.chat_jid, user: hesap.user_jid }, url)).metin)
    }

    if (yol === 'GET /oyun/coin-canli') {
      const hesap = hesapBul(url.searchParams.get('grup') ?? '')
      if (!hesap) return gonder(res, 404, '')
      return gonder(res, 200, coinCanli({ chat: hesap.chat_jid, ...hesapIsleri.coinBorsa({ chat: hesap.chat_jid, user: hesap.user_jid }) }).metin)
    }

    const HESAP_CIZIMI = { hesap: hesapSayfasi, banka: bankaSayfasi, coin: coinSayfasi, suly: sulySayfasi, sulymarket: sulyMarketSayfasi }
    const hesapSayfa = yontem === 'GET' ? HESAP_SAYFALARI.find((ad) => url.pathname === `/oyun/${ad}`) : null

    if (yol === 'GET /oyun' || hesapSayfa) {
      const chat = url.searchParams.get('grup') ?? (hesaplar.length === 1 ? hesaplar[0].chat_jid : '')
      const hesap = hesapBul(chat)
      if (!hesap) {
        if (hesapSayfa) return yonlendir(res, '/oyun')
        const adlar = grupAdlari()
        return gonder(res, 200, grupSecimi(hesaplar.map((r) => ({
          chat: r.chat_jid, ad: adlar.get(r.chat_jid) ?? '', xp: getStats(r.chat_jid, r.user_jid).xp,
        }))))
      }
      const kim = { chat, user: hesap.user_jid }
      const cokGrup = hesaplar.length > 1
      if (hesapSayfa) {
        const ek = hesapSayfa === 'suly' ? { suly: await sulyVerisi(kim, url) }
          : hesapSayfa === 'coin' ? { borsa: { chat, ...hesapIsleri.coinBorsa(kim) } }
          : hesapSayfa === 'sulymarket' ? { market: hesapIsleri.market(kim), ben: hesap.user_jid } : {}
        return gonder(res, 200, HESAP_CIZIMI[hesapSayfa]({ chat, cokGrup, durum: hesapIsleri.durum(kim), ...ek }))
      }

      const oyun = url.searchParams.get('oyun') ?? ''
      const durum = kumar.durum(kim)
      if (oyunVar(oyun)) return gonder(res, 200, oyunSayfasi({ chat, oyun, cokGrup, durum }))
      return gonder(res, 200, lobi({ chat, grupAdi: grupAdlari().get(chat) ?? '', cokGrup, durum, vurgunlar: buyukVurgunlar(chat) }))
    }

    if (yol === 'POST /oyun/oyna' || yol === 'POST /oyun/hamle' || yol === 'POST /oyun/islem') {
      const form = await govdeOku(req)
      if (!form) return gonder(res, 413, hataSayfasi('İstek çok büyük.'))
      const chat = form.get('grup') ?? ''
      const hesap = hesapBul(chat)
      if (!hesap) return yonlendir(res, '/oyun')
      const kim = { chat, user: hesap.user_jid }

      if (yol === 'POST /oyun/islem') {
        const islem = form.get('islem') ?? ''
        const usd = islem.startsWith('suly-') ? (await fiyat())?.usd : null
        hesapIsleri.islem(kim, { islem, miktar: form.get('tutar') ?? '', urun: form.get('urun') ?? '', usd })
        const donus = HESAP_SAYFALARI.find((ad) => ad === form.get('sayfa')) ?? 'hesap'
        return yonlendir(res, hesapLink(chat, donus))
      }

      const alanlar = { oyun: form.get('oyun') ?? '', miktar: form.get('miktar') ?? '', secim: form.get('secim') ?? '', hamle: form.get('hamle') ?? '' }
      if (yol === 'POST /oyun/hamle') kumar.hamle(kim, alanlar)
      else if (Object.hasOwn(TEK, alanlar.oyun)) kumar.tekOyna(kim, alanlar)
      else kumar.basla(kim, alanlar)
      // Yanıt oyunun kendi sayfasına döner; bilinmeyen oyun adı lobiye düşer.
      return yonlendir(res, oyunLink(chat, oyunVar(alanlar.oyun) ? alanlar.oyun : ''))
    }

    return yonlendir(res, '/s')
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

    if (url.pathname === '/hisse') {
      const chat = url.searchParams.get('grup') ?? ''
      const v = veri.hisse(chat, url.searchParams.get('kod') ?? '', url.searchParams.get('aralik'))
      if (!v) return gonder(res, 404, hataSayfasi('Böyle bir hisse yok.'))
      return gonder(res, 200, hisseSayfasi(chat, v, url.searchParams.get('tur')))
    }

    if (url.pathname === '/yedek') return yedekGonder(res)

    return gonder(res, 404, hataSayfasi('Sayfa bulunamadı.'))
  }

  async function isle(req, res) {
    const url = new URL(req.url, 'http://panel')
    // HEAD, GET'in gövdesiz halidir; gövdeyi Node kendisi atar.
    const yontem = req.method === 'HEAD' ? 'GET' : req.method
    const yol = `${yontem} ${url.pathname}`

    if (yol === 'GET /stil.css') {
      return gonder(res, 200, STIL, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }
    if (yol === 'GET /kumarhane.css') {
      return gonder(res, 200, KUMARHANE_STIL, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }
    if (yol === 'GET /oyun.js') {
      return gonder(res, 200, OYUN_BETIGI, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }
    if (yol === 'GET /sosyal.css') {
      return gonder(res, 200, SOSYAL_STIL, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }
    if (yol === 'GET /sosyal.js') {
      return gonder(res, 200, SOSYAL_BETIGI, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }
    // Servis işçisi önbelleklenmez: yeni sürüm hemen kurulsun.
    if (yol === 'GET /sw.js') return gonder(res, 200, SERVIS_ISCISI, { 'Content-Type': 'text/javascript; charset=utf-8' })
    if (yol === 'GET /manifest.webmanifest') {
      return gonder(res, 200, MANIFEST, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    }
    if (yol === 'GET /ikon-192.png' || yol === 'GET /ikon-512.png') {
      const ikon = (await ikonlar())[url.pathname]
      return gonder(res, 200, ikon, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' })
    }

    const nftYolu = yontem === 'GET' && /^\/nft\/(\d{1,3})\.png$/.exec(url.pathname)
    if (nftYolu) return nftGonder(res, nftYolu[1])

    const jeton = cerezOku(req)
    const kim = oturum.veri(jeton)
    const girisli = Boolean(kim)

    if (yol === 'POST /giris') return girisYap(req, res)
    if (yol === 'GET /giris') return girisli ? yonlendir(res, kim.tur === 'oyuncu' ? '/s' : '/') : gonder(res, 200, girisSayfasi())

    if (!girisli) return yonlendir(res, '/giris')

    if (yol === 'POST /cikis') {
      oturum.kapat(jeton)
      return yonlendir(res, '/giris', { 'Set-Cookie': cerez('', 0) })
    }

    // Oyuncu yalnızca kumarhaneyi görür; grup istatistikleri yöneticinindir.
    if (kim.tur === 'oyuncu') {
      const hesaplar = oyuncuHesaplari(kim)
      if (!hesaplar.length) {
        oturum.kapat(jeton)
        return yonlendir(res, '/giris', { 'Set-Cookie': cerez('', 0) })
      }
      return oyuncuIsle(req, res, url, yontem, hesaplar)
    }
    if (url.pathname.startsWith('/oyun') || url.pathname === '/s' || url.pathname.startsWith('/s/')) return yonlendir(res, '/')
    if (yontem !== 'GET') return gonder(res, 405, hataSayfasi('Bu işlem yapılamaz.'))

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
