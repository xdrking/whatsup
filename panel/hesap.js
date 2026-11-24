// Panelin hesap bölümü: WhatsApp'ta komutla yapılan para işleri (banka, kredi, coin, günlük,
// çalış, kira) buradan da yapılır. Kurallar kopyalanmaz, komutların çağırdığı `lib/stats.js`
// fonksiyonları çağrılır; iki taraf aynı veritabanına yazar.
import { randomInt } from 'node:crypto'
import { MIN_KREDI } from '../lib/kredi.js'
import { sulyCoz, sulyYaz } from '../lib/kripto.js'
import { miktarCoz } from '../lib/kumar.js'
import { nftBul } from '../lib/nft.js'
import {
  bankaCek, bankaDurumu, bankaYatir, calis, claimDaily, coinAl, coinDurumu, coinPiyasasi, coinSat, ekonomiDurumu, faizDurumu, getStats,
  fidyeDurumu, fidyeOde, firarEt, hapisDurumu, karaborsaAl, karaborsaDurumu, kiraTopla, kriptoAl, kriptoDurumu, kriptoSat,
  krediCek, krediDurumu, krediOde, maskeBitisi, maskeTak, meslekDurumu, mulkDurumu, nftAl, nftBoz, nftListesi, pasaportKullan, rusvetVer, servetDurumu, sulyPiyasasi,
} from '../lib/stats.js'
import { botGonderisi } from '../lib/sosyal.js'
import { displayName } from '../lib/target.js'
import { AZAMI_ADET, kutuMetni, urunKoduyla } from '../lib/sulymarket.js'
import { HAZINE_YOK, hazineyiTani, miktarMetni } from './kumar.js'

const sayi = new Intl.NumberFormat('tr-TR')
const ARALIK_MS = 700
const KAPALI = 'Banka şu an kapalı, sonra dene.'
const dakika = (ms) => `${Math.max(1, Math.ceil(ms / 60_000))} dk`

const MARKET_KAPALI = 'SulyMarket şu an kapalı, sonra dene.'
const FIYAT_YOK = 'Suly fiyatı şu an alınamıyor, alım satım kapalı. Birazdan dene.'

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
    if (s.kilitli) return hata(`Bankan fidye yazılımıyla kilitli, ${dakika(s.kilitli - Date.now())} kaldı. SulyMarket sayfasından fidyeyi ödeyebilirsin.`)
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

  // XP bütçesiyle: o paranın aldığı en çok tam coin, artan XP cüzdanda kalır.
  'coin-al-xp': ({ chat, user }, { miktar }) => {
    const c = miktarCoz(miktarMetni(miktar), getStats(chat, user).xp)
    if (c.hata) return hata(c.hata.replace('basıyorsun', 'harcıyorsun').replace('basabilirsin', 'harcayabilirsin'))
    const s = coinAl({ chatJid: chat, userJid: user, xpButce: c.miktar })
    if (!s) return hata('Coin market şu an kapalı, sonra dene.')
    if (s.kredili) return hata('Açık kredin varken coin alamazsın, önce krediyi öde.')
    if (s.azXp) return hata(`O para 1 coine yetmiyor. 1 coin = ${sayi.format(s.kur)} XP`)
    if (s.yetersiz) return hata(`${sayi.format(s.ucret)} XP gerekiyor. Cüzdanın: ${sayi.format(s.xp)} XP`)
    return tamam(`${sayi.format(s.adet)} coin aldın, ${sayi.format(s.ucret)} XP ödedin.`)
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

  // `usd` sunucudan gelir (taze fiyat), formdan değil: kişi kendi fiyatını yazamasın.
  'suly-al': ({ chat, user }, { miktar, usd }) => {
    if (!usd) return hata(FIYAT_YOK)
    const birim = sulyCoz(miktar)
    if (!birim) return hata('Kaç Suly alacağını yaz: 1 ya da 0,25')
    const s = kriptoAl({ chatJid: chat, userJid: user, birim, usd })
    if (!s) return hata(FIYAT_YOK)
    if (s.borclu) return hata('Borçluyken Suly alamazsın, önce borcunu kapat.')
    if (s.yetersiz) return hata(`${sayi.format(s.ucret)} XP gerekiyor. Cüzdanın: ${sayi.format(s.xp)} XP`)
    return tamam(`${sulyYaz(birim)} Suly aldın, ${sayi.format(s.ucret)} XP ödedin.`)
  },

  'suly-al-xp': ({ chat, user }, { miktar, usd }) => {
    if (!usd) return hata(FIYAT_YOK)
    const c = miktarCoz(miktarMetni(miktar), getStats(chat, user).xp)
    if (c.hata) return hata(c.hata.replace('basıyorsun', 'harcıyorsun').replace('basabilirsin', 'harcayabilirsin'))
    const s = kriptoAl({ chatJid: chat, userJid: user, xpButce: c.miktar, usd })
    if (!s) return hata(FIYAT_YOK)
    if (s.borclu) return hata('Borçluyken Suly alamazsın, önce borcunu kapat.')
    if (s.azXp) return hata('O para Suly\'nin en küçük biriminin bile altında.')
    if (s.yetersiz) return hata(`${sayi.format(s.ucret)} XP gerekiyor. Cüzdanın: ${sayi.format(s.xp)} XP`)
    return tamam(`${sulyYaz(s.alinan)} Suly aldın, ${sayi.format(s.ucret)} XP ödedin.`)
  },

  'suly-sat': ({ chat, user }, { miktar, usd }) => {
    if (!usd) return hata(FIYAT_YOK)
    const hepsi = /^(hepsi|tümü)$/i.test(String(miktar).trim())
    const birim = hepsi ? null : sulyCoz(miktar)
    if (!hepsi && !birim) return hata('Kaç Suly satacağını yaz: 1, 0,25 ya da hepsi')
    const s = kriptoSat({ chatJid: chat, userJid: user, birim, usd })
    if (!s) return hata(FIYAT_YOK)
    if (s.yetersiz) return hata(`O kadar Suly yok. Sende: ${sulyYaz(s.birim)}`)
    return tamam(`${sulyYaz(s.satilan)} Suly sattın: +${sayi.format(s.kazanc)} XP (kesinti ${sayi.format(s.kesinti)} XP)`)
  },

  'market-al': ({ chat, user }, { miktar, urun: kod }) => {
    const urun = urunKoduyla(kod)
    if (!urun) return hata('Böyle bir ürün yok.')
    const adet = miktar ? tamSayi(miktar) : 1
    if (!adet || adet > AZAMI_ADET) return hata(`Adet 1 ile ${AZAMI_ADET} arası olmalı.`)
    if (urun.tur === 'kutu' && adet > 1) return hata('Kutular tek tek açılır.')
    if (['duvar', 'zar'].includes(urun.tur) && adet > 1) return hata(`${urun.ad} tek tek alınır.`)
    const s = karaborsaAl({ chatJid: chat, userJid: user, urun, adet })
    if (!s) return hata(MARKET_KAPALI)
    if (s.ceteYok) return hata('Silah için çeten olmalı. WhatsApp\'tan .çete kur')
    if (s.suruyor) return hata(`${urun.ad} hâlâ sürüyor, ${dakika(s.suruyor - Date.now())} kaldı.`)
    if (s.yetersiz) return hata(`${sulyYaz(s.ucret)} Suly gerekiyor, sende ${sulyYaz(s.birim)} var.`)
    if (s.kutu) return tamam(kutuMetni(s.kutu))
    return tamam(`${urun.ad}${adet > 1 ? ` x${sayi.format(adet)}` : ''} alındı${s.cete ? `, ${s.cete} cephaneliğine girdi` : ''}. Kalan ${sulyYaz(s.birim)} Suly`)
  },

  'market-firar': ({ chat, user }) => {
    const s = firarEt({ chatJid: chat, userJid: user })
    if (!s) return hata(MARKET_KAPALI)
    if (s.hapisteDegil) return hata('Hapiste değilsin.')
    if (s.yok) return hata('Firar planın yok.')
    return tamam('🪪 Hapisten kaçtın.')
  },

  'market-kimlik': ({ chat, user }, _alanlar, simdi) => {
    const s = maskeTak({ chatJid: chat, userJid: user })
    if (!s) return hata(MARKET_KAPALI)
    if (s.yok) return hata('Sahte kimliğin yok.')
    return tamam(`🎭 Maske takıldı, ${dakika(s.bitis - simdi)} sürer. Bota özelden .soygun yaz.`)
  },

  'market-rusvet': ({ chat, user }) => {
    const s = rusvetVer({ chatJid: chat, userJid: user })
    if (!s) return hata(MARKET_KAPALI)
    if (s.dosyaYok) return hata('Hakkında açık dosya yok, rüşvet harcanmadı.')
    if (s.yok) return hata('Rüşvet çantan yok.')
    return tamam(`💼 ${s.silinen} dosya kayboldu.`)
  },

  'market-pasaport': ({ chat, user }) => {
    const s = pasaportKullan({ chatJid: chat, userJid: user })
    if (!s) return hata(MARKET_KAPALI)
    if (s.ambargoYok) return hata('Ambargon yok, pasaport harcanmadı.')
    if (s.yok) return hata('Sahte pasaportun yok.')
    return tamam('🛂 Ambargo kalktı.')
  },

  'fidye-ode': ({ chat, user }) => {
    const s = fidyeOde({ chatJid: chat, userJid: user })
    if (!s) return hata(MARKET_KAPALI)
    if (s.yok) return hata('Bankan kilitli değil.')
    return tamam(`🔓 ${sayi.format(s.odenen)} XP fidye ödendi, bankan açıldı.`)
  },

  'nft-al': ({ chat, user }, { urun }) => {
    const nft = nftBul(urun)
    if (!nft) return hata('Böyle bir NFT yok.')
    const s = nftAl({ chatJid: chat, userJid: user, no: nft.no })
    if (!s) return hata(MARKET_KAPALI)
    if (s.senin) return hata('Bu NFT zaten senin.')
    if (s.satilikDegil) return hata('Sahibi bunu satmıyor.')
    if (s.borclu) return hata('Borçluyken üyeden NFT alamazsın.')
    if (s.ambargo) return hata(`Ambargodasın, ${dakika(s.ambargo - Date.now())} kaldı.`)
    if (s.saticiEngelli) return hata('Satıcı borçlu ya da ambargoda, satış yapılamıyor.')
    if (s.yetersiz) return hata(`${sulyYaz(s.fiyat)} Suly gerekiyor, sende ${sulyYaz(s.birim)} var.`)
    if (nft.sinif !== 'siradan') botGonderisi(chat, `🖼️ ${displayName(user)}, ${nft.ad} (#${nft.no}) NFT'sini ${sulyYaz(s.fiyat)} Suly'ye aldı.`)
    return tamam(`🖼️ ${nft.ad} #${nft.no} artık senin. Kalan ${sulyYaz(s.birim)} Suly`)
  },

  'nft-boz': ({ chat, user }, { urun }) => {
    const nft = nftBul(urun)
    const s = nft && nftBoz({ chatJid: chat, userJid: user, no: nft.no })
    if (!s) return hata(MARKET_KAPALI)
    if (s.senDegil) return hata('Bu NFT senin değil.')
    return tamam(`♻️ ${nft.ad} markete döndü: +${sulyYaz(s.odeme)} Suly`)
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

  /** Suly sayfasının kişisel ve grup verisi; fiyatı sunucu ekler. Bildirimi tüketmez, canlı yenileme de okur. */
  function suly(h) {
    hazineyiTani()
    const k = kriptoDurumu({ chatJid: h.chat, userJid: h.user })
    return k && { birim: k.birim, kur: k.kur, sonFiyat: k.fiyat, ...sulyPiyasasi({ chatJid: h.chat }), ekonomi: ekonomiDurumu({ chatJid: h.chat }) }
  }

  /** Coin borsasının grup verisi; bildirimi tüketmez, canlı yenileme de okur. */
  function coinBorsa(h) {
    return { ekonomi: ekonomiDurumu({ chatJid: h.chat }), ...coinPiyasasi({ chatJid: h.chat }), coin: coinDurumu(h.chat, h.user), simdi: saat() }
  }

  function market(h) {
    const kim = { chatJid: h.chat, userJid: h.user }
    return {
      durum: karaborsaDurumu(kim),
      nftler: nftListesi(h.chat),
      fidye: fidyeDurumu(h.chat, h.user),
      hapis: hapisDurumu(h.chat, h.user)?.bitis ?? 0,
      maske: maskeBitisi(h.chat, h.user),
    }
  }

  return { islem, durum, suly, coinBorsa, market }
}
