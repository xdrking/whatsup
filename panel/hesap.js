// Panelin hesap bölümü: WhatsApp'ta komutla yapılan para işleri (banka, kredi, coin, günlük,
// çalış, kira) buradan da yapılır. Kurallar kopyalanmaz, komutların çağırdığı `lib/stats.js`
// fonksiyonları çağrılır; iki taraf aynı veritabanına yazar.
import { randomInt } from 'node:crypto'
import { MIN_KREDI } from '../lib/kredi.js'
import { miktarCoz } from '../lib/kumar.js'
import {
  bankaCek, bankaDurumu, bankaYatir, calis, claimDaily, coinAl, coinDurumu, coinSat, ekonomiDurumu, faizDurumu,
  kiraTopla, krediCek, krediDurumu, krediOde, meslekDurumu, mulkDurumu, servetDurumu,
} from '../lib/stats.js'
import { HAZINE_YOK, hazineyiTani, miktarMetni } from './kumar.js'

const sayi = new Intl.NumberFormat('tr-TR')
const ARALIK_MS = 700
const KAPALI = 'Banka şu an kapalı, sonra dene.'
const dakika = (ms) => `${Math.max(1, Math.ceil(ms / 60_000))} dk`

const tamam = (metin) => ({ tamam: metin })
const hata = (metin) => ({ hata: metin })

/** "50 milyon", "50m" → tam sayı; okunamazsa 0. */
function tamSayi(ham) {
  const n = Number(miktarMetni(ham))
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

/** Her işlem `(kim, form alanları, şimdi)` alır, `{ tamam }` ya da `{ hata }` döner. */
const ISLEMLER = {
  'banka-yatir': ({ chat, user }, { miktar }) => {
    const durum = bankaDurumu({ chatJid: chat, userJid: user })
    if (!durum) return hata(KAPALI)
    const c = miktarCoz(miktarMetni(miktar), durum.xp)
    if (c.hata) return hata(c.hata)
    const s = bankaYatir({ chatJid: chat, userJid: user, miktar: c.miktar })
    if (!s) return hata(KAPALI)
    if (s.yetersiz) return hata(`O kadar XP'n yok. Cüzdanın: ${sayi.format(s.xp)} XP`)
    return tamam([
      ...(s.krediOdeme ? [`${sayi.format(s.krediOdeme)} XP kredi borcuna kesildi.`] : []),
      ...(c.miktar > s.krediOdeme ? [`${sayi.format(c.miktar - s.krediOdeme)} XP bankaya yatırıldı.`] : []),
    ].join(' '))
  },

  'banka-cek': ({ chat, user }, { miktar }) => {
    const durum = bankaDurumu({ chatJid: chat, userJid: user })
    if (!durum) return hata(KAPALI)
    const c = miktarCoz(miktarMetni(miktar), durum.bakiye)
    if (c.hata) return hata(c.hata.replace('Senin XP\'n', 'Hesabın'))
    const s = bankaCek({ chatJid: chat, userJid: user, miktar: c.miktar })
    if (!s) return hata(KAPALI)
    if (s.yetersiz) return hata(`Hesabında o kadar yok: ${sayi.format(s.bakiye)} XP`)
    return tamam(`${sayi.format(c.miktar)} XP çekildi, kesinti ${sayi.format(s.kesinti)} XP.`)
  },

  'kredi-cek': ({ chat, user }, { miktar }, simdi) => {
    const tutar = tamSayi(miktar)
    if (tutar < MIN_KREDI) return hata(`En az ${MIN_KREDI} XP kredi çekilir.`)
    const s = krediCek({ chatJid: chat, userJid: user, miktar: tutar })
    if (!s || s.kapali) return hata('Kredi servisi şu an kapalı, sonra dene.')
    if (s.acik) return hata(`Önce mevcut borcunu kapat: ${sayi.format(s.borc)} XP`)
    if (s.eksi) return hata('Cüzdanın ekside, kredi verilmez.')
    if (s.limit) return hata(`Limitin ${sayi.format(s.limit)} XP.`)
    if (s.yasak) return hata(`İflas ettiğin için kredi yasağın var, ${dakika(s.yasak - simdi)} kaldı.`)
    if (s.kasaLimit !== undefined) {
      return hata(s.kasaLimit < MIN_KREDI ? 'Kasada kredi verecek kadar XP yok.' : `Kasa az, en çok ${sayi.format(s.kasaLimit)} XP çekebilirsin.`)
    }
    return tamam(`${sayi.format(tutar)} XP kredi çekildi.`)
  },

  'kredi-ode': ({ chat, user }, { miktar }) => {
    const durum = krediDurumu({ chatJid: chat, userJid: user })
    if (!durum) return hata('Kredi servisi şu an kapalı, sonra dene.')
    if (!durum.borc) return hata('Borcun yok.')
    const metin = miktarMetni(miktar)
    const c = metin === 'hepsi' ? { miktar: durum.xp } : miktarCoz(metin, durum.xp)
    if (c.hata) return hata(c.hata)
    const s = krediOde({ chatJid: chat, userJid: user, miktar: c.miktar })
    if (!s) return hata('Kredi servisi şu an kapalı, sonra dene.')
    if (s.yetersiz) return hata('Ödeyecek XP\'n yok.')
    return tamam(`${sayi.format(s.odenen)} XP ödendi. ${s.borc ? `Kalan borç ${sayi.format(s.borc)} XP.` : 'Borcun bitti.'}`)
  },

  'coin-al': ({ chat, user }, { miktar }) => {
    const adet = tamSayi(miktar)
    if (!adet) return hata('Kaç coin alacağını yaz.')
    const s = coinAl({ chatJid: chat, userJid: user, adet })
    if (!s) return hata('Coin market şu an kapalı, sonra dene.')
    if (s.kredili) return hata('Açık kredin varken coin alamazsın, önce krediyi öde.')
    if (s.yetersiz) return hata(`${sayi.format(s.ucret)} XP gerekiyor. Cüzdanın: ${sayi.format(s.xp)} XP`)
    return tamam(`${sayi.format(adet)} coin aldın, ${sayi.format(s.ucret)} XP ödedin.`)
  },

  'coin-sat': ({ chat, user }, { miktar }) => {
    const adet = tamSayi(miktar)
    if (!adet) return hata('Kaç coin bozduracağını yaz.')
    const s = coinSat({ chatJid: chat, userJid: user, adet })
    if (!s) return hata('Coin market şu an kapalı, sonra dene.')
    if (s.yetersiz) return hata(`O kadar coinin yok: ${sayi.format(s.bakiye)}`)
    return tamam(`${sayi.format(adet)} coin bozdurdun: +${sayi.format(s.kazanc)} XP`)
  },

  gunluk: ({ chat, user }) => {
    const s = claimDaily({ chatJid: chat, userJid: user })
    if (!s) return hata('Günlük ödül şu an kullanılamıyor.')
    if (!s.alindi) return hata(`Bugünkü ödülünü zaten aldın. Seri: ${s.seri} gün`)
    return tamam(`Günlük ödül: +${sayi.format(s.miktar)} XP. Seri: ${s.seri} gün`)
  },

  calis: ({ chat, user }, _alanlar, simdi) => {
    const s = calis({ chatJid: chat, userJid: user, rnd: randomInt })
    if (!s) return hata('Bugün dükkân kapalı, sonra dene.')
    if (s.kariyerBitti) return hata(`${s.kariyerBitti.ad} kariyerin bitti. Yeni mesleği WhatsApp'tan .meslek ile seç.`)
    if (s.meslekYok) return hata('Önce WhatsApp\'tan meslek seç: .meslek')
    if (s.hapis) return hata(`Hapistesin, ${dakika(s.hapis - simdi)} kaldı.`)
    if (s.bekle) return hata(`Mesain bitmedi, ${dakika(s.bekle - simdi)} sonra gel.`)
    const bonus = s.esBonusu ? ` Evlilik bonusu +${sayi.format(s.esBonusu)} XP.` : ''
    return tamam(s.maas ? `${s.meslek.ad}: maaş +${sayi.format(s.maas)} XP.${bonus}` : `${s.meslek.ad}: bu sefer para çıkmadı.`)
  },

  kira: ({ chat, user }) => {
    const s = kiraTopla({ chatJid: chat, userJid: user })
    if (!s) return hata('Tapu şu an kapalı, sonra dene.')
    if (!s.kira) return hata('Toplanacak kira yok.')
    return tamam(`Kira toplandı: +${sayi.format(s.kira)} XP`)
  },
}

export function hesapMotoru({ saat = Date.now } = {}) {
  const bildirimler = new Map() // anahtar → son işlemin sonucu, bir kez gösterilir
  const sonIslem = new Map()
  const anahtar = (h) => `${h.chat}|${h.user}`

  function islem(h, alanlar) {
    const k = anahtar(h)
    const simdi = saat()
    // Form iki kez gönderilirse aynı işlem iki kez yapılmasın.
    if (simdi - (sonIslem.get(k) ?? 0) < ARALIK_MS) return
    sonIslem.set(k, simdi)

    const calistir = Object.hasOwn(ISLEMLER, alanlar.islem) ? ISLEMLER[alanlar.islem] : null
    if (!calistir) return bildirimler.set(k, hata('Böyle bir işlem yok.'))
    // Maaş, kira ve kredi hazineden çıkar; bot kimliği bilinmeden hazine bulunamaz.
    if (!hazineyiTani()) return bildirimler.set(k, hata(HAZINE_YOK))
    const sonuc = calistir(h, alanlar, simdi)
    bildirimler.set(k, sonuc.hata ? hata(sonuc.hata.replace(/`/g, '')) : sonuc)
  }

  /** Hesap sayfalarının verisi. Faiz ve kira okunurken işlenir (`.banka`, `.mülk` gibi). */
  function durum(h) {
    const k = anahtar(h)
    const kim = { chatJid: h.chat, userJid: h.user }
    const bildirim = bildirimler.get(k) ?? null
    bildirimler.delete(k)
    const banka = bankaDurumu(kim)
    const mulkler = mulkDurumu(kim)
    return {
      bildirim,
      banka,
      mulkler,
      faiz: faizDurumu(h.chat),
      kredi: krediDurumu(kim),
      coin: coinDurumu(h.chat, h.user),
      ekonomi: ekonomiDurumu({ chatJid: h.chat }),
      meslek: meslekDurumu(h.chat, h.user),
      servet: servetDurumu(kim),
      simdi: saat(),
    }
  }

  return { islem, durum }
}
