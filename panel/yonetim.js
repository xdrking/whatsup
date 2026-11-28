// Yönetim paneli (Faz 90): `/yonetim` yolları. Giriş bot sahibinin `.yonetim kod` ile verdiği tek kullanımlık
// kodladır, oturum ayrı çerezdedir ve oyuncu ya da eski panel oturumuyla karışmaz. Her işlem rolün izniyle denetlenir
// ve kayıt defterine yazılır. Kural kopyalanmaz: işlemler komutların çağırdığı lib/ fonksiyonlarını çağırır.
import { readFileSync } from 'node:fs'
import { ASGARI_FAIZ, AZAMI_FAIZ, faizOranCoz, oranYaz } from '../lib/banka.js'
import { AYARLAR, ayarListesi, ayarYaz } from '../lib/ayarlar.js'
import logger from '../lib/logger.js'
import { kasaBul } from '../lib/sandik.js'
import { binlik, miktarlariCoz } from '../lib/sayi.js'
import { uyeler as grupUyeleri } from '../lib/sosyal.js'
import { coinAyarla, ekonomiDurumu, faizDurumu, faizKarari, sandikVer, tesvikDagit, xpAyarla } from '../lib/stats.js'
import {
  DUYURU_AZAMI, duyuruBekleme, isEkle, isIptal, isler, izinVar, kayitlar, kayitYaz, kodlaGir, NABIZ_ESIGI_MS, nabizOku,
  oturumYoneticisi, ROLLER, yoneticiBul, yoneticiGuncelle, yoneticiListesi,
} from '../lib/yonetim.js'
import { oturumlar } from './guvenlik.js'
import { hazineyiTani } from './kumar.js'
import {
  duyuruSayfasi, ekonomiSayfasi, gostergeSayfasi, kasaSayfasi, kayitSayfasi, YONETIM_SAYFALARI, yasakSayfasi,
  yoneticilerSayfasi, yonetimGiris,
} from './yonetimSayfalari.js'

const CEREZ = '__Host-yonetim'
// Yönetim oturumu kısadır: açık kalan bir tarayıcı ekonomiye günlerce dokunabilmesin.
const OTURUM_MS = 12 * 60 * 60_000
const STIL = readFileSync(new URL('./yonetim.css', import.meta.url))
// İki işlem arası: form iki kez gönderilmesin.
const ISLEM_ARALIK_MS = 700

const cerez = (deger, saniye) => `${CEREZ}=${deger}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${saniye}`
function cerezOku(req) {
  for (const parca of String(req.headers.cookie ?? '').split(';')) {
    const [ad, deger] = parca.trim().split('=')
    if (ad === CEREZ) return deger
  }
  return ''
}

const SAYFA_CIZIMI = {
  gosterge: gostergeSayfasi, duyuru: duyuruSayfasi, ekonomi: ekonomiSayfasi, kasa: kasaSayfasi,
  yoneticiler: yoneticilerSayfasi, kayit: kayitSayfasi,
}

/** Formdaki tutar: "50 milyon", "-5m", "1.000.000". */
function tutarCoz(metin) {
  const ham = String(metin ?? '').trim()
  const eksi = ham.startsWith('-')
  const [n] = miktarlariCoz(ham.replace(/^[-+]\s*/, '').split(/\s+/).filter(Boolean))
  const sayi = /^\d+$/.test(n ?? '') ? Number(n) : NaN
  return Number.isSafeInteger(sayi) && sayi > 0 ? (eksi ? -sayi : sayi) : null
}

/**
 * İşlemler: `izin` rolün yapabileceğidir, `yap` sonucu `{ tamam }` ya da `{ hata }` döner ve kayıt defterine
 * yazılacak `kayit` metnini taşır. Gruplu işlemler yalnızca panelin bildiği gruplara yapılır (`grupVar`).
 */
const ISLEMLER = {
  duyuru: {
    izin: 'duyuru', grup: true,
    yap({ y, f, chat }) {
      const metin = String(f.get('metin') ?? '').replace(/\r\n/g, '\n').trim()
      if (!metin) return { hata: 'Metin boş.' }
      if (metin.length > DUYURU_AZAMI) return { hata: `Metin en çok ${DUYURU_AZAMI} karakter.` }
      const etiket = f.get('etiket') === '1'
      const s = isEkle({ chatJid: chat, tur: 'duyuru', veri: { metin, etiket }, yoneticiId: y.id })
      if (!s) return { hata: 'Sıraya konamadı.' }
      if (s.bekle) return { hata: `Bu gruba son duyurudan beri 10 dakika geçmedi. Saat ${new Date(s.bekle).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })} sonrası tekrar dene.` }
      return { tamam: 'Duyuru sıraya kondu, bot birkaç saniyede gönderir.', kayit: `${etiket ? 'etiketli' : 'etiketsiz'} · ${metin.slice(0, 120)}` }
    },
  },
  'is-iptal': {
    izin: 'duyuru',
    yap({ f }) {
      const id = Number(f.get('id'))
      return isIptal(id) ? { tamam: 'İş iptal edildi.', kayit: `#${id}` } : { hata: 'İş çoktan işlendi ya da yok.' }
    },
  },
  faiz: {
    izin: 'ekonomi', grup: true,
    yap({ f, chat }) {
      const oran = faizOranCoz(f.get('oran'))
      if (oran === null) return { hata: `Oran ${ASGARI_FAIZ} ile ${AZAMI_FAIZ} arasında, en çok 2 ondalık olmalı.` }
      const s = faizKarari({ chatJid: chat, oran })
      if (!s) return { hata: 'Faiz kararı yazılamadı.' }
      return { tamam: `Banka faizi %${oranYaz(s.once)} → %${oranYaz(s.banka)}, kredi %${oranYaz(s.kredi)}.`, kayit: `%${oranYaz(s.once)} → %${oranYaz(s.banka)}` }
    },
  },
  tesvik: {
    izin: 'ekonomi', grup: true, onay: true,
    yap({ f, chat }) {
      const miktar = tutarCoz(f.get('miktar'))
      if (!miktar || miktar < 0) return { hata: 'Geçerli bir XP tutarı yaz.' }
      const s = tesvikDagit({ chatJid: chat, uyeler: grupUyeleri(chat).map((u) => u.jid), miktar })
      if (!s || s.kapali) return { hata: 'Hazine kapalı: bot henüz tanınmadı.' }
      if (s.yetersiz) return { hata: `Hazinede ${binlik(s.kasa)} XP var.` }
      if (s.kimseYok) return { hata: 'Son 7 günde yazan üye yok ya da pay 1 XP\'yi bulmuyor.' }
      return { tamam: `${s.kisi} kişiye ${binlik(s.pay)} XP verildi. Hazinede ${binlik(s.kasa)} XP kaldı.`, kayit: `${binlik(s.toplam)} XP, ${s.kisi} kişi` }
    },
  },
  xp: {
    izin: 'ekonomi', grup: true, onay: true, kisi: true,
    yap({ f, chat, kisi }) {
      const miktar = tutarCoz(f.get('miktar'))
      if (!miktar) return { hata: 'Geçerli bir tutar yaz (eksi alır).' }
      const s = xpAyarla({ chatJid: chat, userJid: kisi.jid, miktar })
      if (!s) return { hata: 'XP yazılamadı.' }
      return { tamam: `${kisi.ad}: ${binlik(s.once)} → ${binlik(s.xp)} XP.`, kayit: `${kisi.ad} · ${miktar > 0 ? '+' : ''}${binlik(miktar)} XP (${binlik(s.once)} → ${binlik(s.xp)})` }
    },
  },
  coin: {
    izin: 'ekonomi', grup: true, onay: true, kisi: true,
    yap({ f, chat, kisi }) {
      const adet = /^[+-]?\d{1,9}$/.test(String(f.get('miktar') ?? '').trim()) ? Number(f.get('miktar')) : 0
      if (!adet) return { hata: 'Geçerli bir coin adedi yaz (eksi alır).' }
      const s = coinAyarla({ chatJid: chat, userJid: kisi.jid, adet })
      if (!s) return { hata: 'Coin yazılamadı.' }
      return { tamam: `${kisi.ad}: ${binlik(s.once)} → ${binlik(s.bakiye)} coin.`, kayit: `${kisi.ad} · ${adet > 0 ? '+' : ''}${adet} coin (${s.once} → ${s.bakiye})` }
    },
  },
  ayar: {
    izin: 'ekonomi',
    yap({ f }) {
      const anahtar = String(f.get('anahtar') ?? '')
      const tanim = Object.hasOwn(AYARLAR, anahtar) ? AYARLAR[anahtar] : null
      // Kasa ayarları kasa iznine, öbürleri ekonomi iznine bağlıdır; ikisi de şimdilik aynı rollerde.
      const s = ayarYaz(anahtar, f.get('deger'))
      if (s.hata) return s
      return { tamam: `${tanim.ad}: ${s.once} → ${s.deger}`, kayit: `${tanim.ad}: ${s.once} → ${s.deger}` }
    },
  },
  'kasa-ver': {
    izin: 'kasa', grup: true, kisi: true,
    yap({ f, chat, kisi }) {
      const tur = f.get('tur') === 'anahtar' ? 'anahtar' : 'kasa'
      const kasa = kasaBul(f.get('tier'))
      const adet = /^-?\d{1,3}$/.test(String(f.get('miktar') ?? '').trim()) ? Number(f.get('miktar')) : 0
      if (!kasa || !adet) return { hata: 'Tier ve adet geçerli olmalı.' }
      const s = sandikVer({ chatJid: chat, userJid: kisi.jid, tur, tier: kasa.tier, adet })
      if (!s || s.yok) return { hata: 'Yazılamadı.' }
      const ad = `T${kasa.tier} ${tur === 'kasa' ? 'kasa' : 'anahtar'}`
      return { tamam: `${kisi.ad}: ${ad} ${s.once} → ${s.adet}.`, kayit: `${kisi.ad} · ${adet > 0 ? '+' : ''}${adet} ${ad}` }
    },
  },
  'kasa-dagit': {
    izin: 'kasa', grup: true, onay: true,
    yap({ y, chat }) {
      const s = isEkle({ chatJid: chat, tur: 'kasa_dagit', veri: {}, yoneticiId: y.id })
      return s ? { tamam: 'Kasa yağmuru sıraya kondu, bot birkaç saniyede dağıtır.', kayit: 'herkese 1 kasa' } : { hata: 'Sıraya konamadı.' }
    },
  },
  'yonetici-rol': {
    izin: 'yoneticiler',
    yap({ f }) {
      const hedef = yoneticiBul(Number(f.get('id')))
      const rol = f.get('rol')
      if (!hedef || hedef.rol === 'sahip' || !['yonetici', 'moderator'].includes(rol)) return { hata: 'Bu kişinin rolü değiştirilemez.' }
      if (hedef.rol === rol) return { hata: 'Rol zaten bu.' }
      yoneticiGuncelle({ id: hedef.id, rol })
      return { tamam: `${hedef.ad} artık ${ROLLER[rol].ad}. Oturumu düştü, yeniden girmesi için yeni kod ver.`, kayit: `${hedef.ad}: ${ROLLER[hedef.rol].ad} → ${ROLLER[rol].ad}` }
    },
  },
  'yonetici-kapat': {
    izin: 'yoneticiler',
    yap({ f }) {
      const hedef = yoneticiBul(Number(f.get('id')))
      if (!hedef || hedef.rol === 'sahip') return { hata: 'Sahibin erişimi kapatılamaz.' }
      yoneticiGuncelle({ id: hedef.id, aktif: false })
      return { tamam: `${hedef.ad}'nin erişimi kapandı.`, kayit: hedef.ad }
    },
  },
}

export function yonetimMotoru({ depo = null, saat = Date.now, veri } = {}) {
  const oturum = oturumlar({ depo, sure: OTURUM_MS, saat })
  const bildirimler = new Map()
  const sonIslem = new Map()

  const gruplar = () => veri.gruplar()
  const nabiz = () => {
    const son = nabizOku()
    return { son, cevrimici: Boolean(son) && saat() - son < NABIZ_ESIGI_MS }
  }

  function grupBilgisi(g) {
    return { ...g, ekonomi: ekonomiDurumu({ chatJid: g.chat_jid }), faiz: faizDurumu(g.chat_jid), duyuruBekleme: duyuruBekleme(g.chat_jid, saat()) }
  }

  function sayfaVerisi(y, ad, url) {
    const liste = gruplar()
    const istenen = url.searchParams.get('grup')
    const chat = liste.some((g) => g.chat_jid === istenen) ? istenen : liste[0]?.chat_jid ?? ''
    const b = bildirimler.get(y.id) ?? null
    bildirimler.delete(y.id)
    const v = { yonetici: y, nabiz: nabiz(), gruplar: liste, chat, bildirim: b }
    if (ad === 'gosterge') {
      return { ...v, gruplar: liste.map(grupBilgisi), isler: isler({ adet: 50 }), kayitlar: izinVar(y.rol, 'kayit') ? kayitlar(8) : [], yoneticiSayisi: yoneticiListesi().filter((x) => x.aktif).length }
    }
    if (ad === 'duyuru') return { ...v, isler: isler({ adet: 40 }), duyuruBekleme: chat ? duyuruBekleme(chat, saat()) : 0 }
    if (ad === 'ekonomi' || ad === 'kasa') {
      const g = liste.find((x) => x.chat_jid === chat)
      return {
        ...v, grup: g ? grupBilgisi(g) : null, uyeler: chat ? grupUyeleri(chat) : [],
        ayarlar: { ekonomi: ayarListesi('ekonomi'), kasa: ayarListesi('kasa') },
      }
    }
    if (ad === 'yoneticiler') return { ...v, yoneticiler: yoneticiListesi() }
    if (ad === 'kayit') return { ...v, kayitlar: kayitlar(200) }
    return v
  }

  /** Bir işlem; sonucu bir kez gösterilecek bildirime yazar. */
  function islem(y, f) {
    const ad = String(f.get('islem') ?? '')
    const t = Object.hasOwn(ISLEMLER, ad) ? ISLEMLER[ad] : null
    const sonuc = (() => {
      if (!t) return { hata: 'Bilinmeyen işlem.' }
      if (!izinVar(y.rol, t.izin)) return { hata: 'Bu işlem için rolün yetmiyor.' }
      const simdi = saat()
      if (simdi - (sonIslem.get(y.id) ?? 0) < ISLEM_ARALIK_MS) return { hata: 'Çok hızlı, bir saniye bekle.' }
      sonIslem.set(y.id, simdi)
      if (t.onay && f.get('onay') !== '1') return { hata: 'Onay kutusunu işaretle.' }
      const chat = String(f.get('grup') ?? '')
      if (t.grup && !gruplar().some((g) => g.chat_jid === chat)) return { hata: 'Grup bulunamadı.' }
      let kisi = null
      if (t.kisi) {
        kisi = grupUyeleri(chat).find((u) => u.jid === f.get('kisi'))
        if (!kisi) return { hata: 'Üye bulunamadı.' }
        kisi = { jid: kisi.jid, ad: kisi.ad || kisi.jid.split('@')[0] }
      }
      // Tesvik ve kasa dağıtımı hazineyi bilmeli: bot kimliği her işlemde tanınır.
      hazineyiTani()
      return t.yap({ y, f, chat, kisi })
    })()
    bildirimler.set(y.id, sonuc.hata ? { hata: sonuc.hata } : { tamam: sonuc.tamam })
    if (!sonuc.hata) {
      const grup = gruplar().find((g) => g.chat_jid === f.get('grup'))
      kayitYaz(y, ad, `${grup ? `[${grup.ad || grup.chat_jid}] ` : ''}${sonuc.kayit ?? ''}`, saat())
      logger.info({ yonetici: y.id, islem: ad }, 'Yönetim işlemi')
    }
    return sonuc
  }

  return { oturum, sayfaVerisi, islem, nabiz }
}

/**
 * `/yonetim` ve altındaki yolları işler; işlemediyse false döner. `ortak` sunucunun yardımcılarıdır
 * (gonder, yonlendir, govdeOku, sinir, istemciIp, bekleMetni).
 */
export async function yonetimIsle({ req, res, url, yontem, motor, ortak }) {
  const yol = url.pathname
  if (yol !== '/yonetim' && !yol.startsWith('/yonetim/') && yol !== '/yonetim.css') return false
  const { gonder, yonlendir, govdeOku } = ortak

  if (yol === '/yonetim.css') {
    gonder(res, 200, STIL, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    return true
  }

  const jeton = cerezOku(req)
  const y = oturumYoneticisi(motor.oturum.veri(jeton))

  if (yol === '/yonetim/giris') {
    if (yontem === 'GET') {
      if (y) yonlendir(res, '/yonetim')
      else gonder(res, 200, yonetimGiris())
      return true
    }
    if (yontem !== 'POST') return false
    const form = await govdeOku(req)
    if (!form) {
      gonder(res, 413, yonetimGiris('İstek çok büyük.'))
      return true
    }
    const ip = ortak.istemciIp(req)
    const { izin, bekleMs } = ortak.sinir.dene(ip)
    if (!izin) {
      logger.warn({ ip }, 'Yönetim girişi sınıra takıldı')
      gonder(res, 429, yonetimGiris(ortak.bekleMetni(bekleMs)), { 'Retry-After': String(Math.ceil(bekleMs / 1000)) })
      return true
    }
    const giren = kodlaGir(form.get('kod'))
    if (!giren) {
      logger.warn({ ip }, 'Yönetimde yanlış ya da süresi dolmuş kod')
      gonder(res, 401, yonetimGiris('Kod yanlış, kullanılmış ya da süresi dolmuş. Yeni kod iste.'))
      return true
    }
    ortak.sinir.basarili(ip)
    logger.info({ ip, yonetici: giren.id, rol: giren.rol }, 'Yönetim paneline giriş')
    kayitYaz(giren, 'giriş', ip)
    const yeni = motor.oturum.ac({ tur: 'yonetim', id: giren.id, surum: giren.surum })
    yonlendir(res, '/yonetim', { 'Set-Cookie': cerez(yeni, OTURUM_MS / 1000) })
    return true
  }

  if (!y) {
    if (jeton) motor.oturum.kapat(jeton)
    yonlendir(res, '/yonetim/giris', jeton ? { 'Set-Cookie': cerez('', 0) } : {})
    return true
  }

  if (yontem === 'POST' && yol === '/yonetim/cikis') {
    motor.oturum.kapat(jeton)
    yonlendir(res, '/yonetim/giris', { 'Set-Cookie': cerez('', 0) })
    return true
  }

  if (yontem === 'POST' && yol === '/yonetim/islem') {
    const form = await govdeOku(req, 8 * 1024)
    if (!form) {
      gonder(res, 413, 'İstek çok büyük.')
      return true
    }
    motor.islem(y, form)
    const donus = Object.values(YONETIM_SAYFALARI).find((s) => s.ad === form.get('donus'))?.yol ?? '/yonetim'
    const grup = form.get('grup')
    yonlendir(res, grup ? `${donus}?grup=${encodeURIComponent(grup)}` : donus)
    return true
  }

  const sayfa = yontem === 'GET' ? YONETIM_SAYFALARI[yol] : null
  if (!sayfa) {
    yonlendir(res, '/yonetim')
    return true
  }
  const v = motor.sayfaVerisi(y, sayfa.ad, url)
  gonder(res, izinVar(y.rol, sayfa.izin) ? 200 : 403, izinVar(y.rol, sayfa.izin) ? SAYFA_CIZIMI[sayfa.ad](v) : yasakSayfasi(v))
  return true
}
