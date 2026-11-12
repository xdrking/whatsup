// Panelde oynanan kumar. Kurallar ve XP yazımı WhatsApp'takiyle aynı yoldan geçer
// (`bahisOyna`, `xpCek`, `kumarOde`): tavan, 500 XP şartı, yasaklar, karne ve hazine ortaktır.
// Çok adımlı oyunların eli yalnızca panelin belleğindedir: panel yeniden başlarsa yarım
// eldeki bahis yanar (WhatsApp'taki gibi). Gruptaki oyun yuvasını tutmaz.
import logger from '../lib/logger.js'
import {
  crashHedefCoz, crashUc, CRASH_EN_AZ, CRASH_EN_COK, kaziCevir, kumarEngeli, miktarCoz, plinkoAt,
  plinkoRiskCoz, ruletCevir, ruletSecimCoz, slotCevir, yaziTura, yuzCoz,
} from '../lib/kumar.js'
import { miktarlariCoz } from '../lib/sayi.js'
import { getDb } from '../lib/db.js'
import { bahisOyna, botHesabiMi, botHesabiniTani, getStats, kumarOde, kumarYasagi, xpCek } from '../lib/stats.js'
import { desteKur, elDegeri, odemeCarpani } from '../games/blackjack.js'
import { KUTU, mayinCarpani, mayinKur } from '../games/mayin.js'
import { KAT, kuleCarpani, kuleKur, ZORLUK, zorlukCoz } from '../games/kule.js'
import { HILO_TAVAN, hiloCarpani, hiloTuttu, kartCek, kartYaz } from '../games/hilo.js'

export const SURE_MS = 3 * 60_000
// Form iki kez gönderilirse ya da tuşa basılı tutulursa aynı el iki kez oynanmasın.
const ARALIK_MS = 700

const dogalMi = (el) => el.length === 2 && elDegeri(el) === 21
const kartMetni = (k) => `${k.deger}${k.renk}`

/** Tek adımlı oyunlar: `secim` formdan gelir, `cevir` bahisOyna'ya verilir. */
export const TEK_OYUNLAR = {
  bahis: {
    ad: 'Yazı-tura', ikon: '🪙',
    hazirla: (secim) => {
      const yuz = yuzCoz(secim)
      return yuz ? { cevir: () => ({ ...yaziTura(yuz), secim: yuz }) } : { hata: 'Yazı ya da tura seç.' }
    },
  },
  slot: { ad: 'Slot', ikon: '🎰', hazirla: () => ({ cevir: () => slotCevir() }) },
  rulet: {
    ad: 'Rulet', ikon: '🎡',
    hazirla: (secim) => {
      const s = ruletSecimCoz(secim)
      return s ? { cevir: () => ({ ...ruletCevir(s), secim: s }) } : { hata: 'Renk, tek/çift ya da 0-36 arası sayı seç.' }
    },
  },
  kazı: { ad: 'Kazı kazan', ikon: '🎟️', hazirla: () => ({ cevir: () => kaziCevir() }) },
  plinko: {
    ad: 'Plinko', ikon: '🔻',
    hazirla: (secim) => {
      const risk = plinkoRiskCoz(secim)
      return risk ? { cevir: () => ({ ...plinkoAt(risk), risk }) } : { hata: 'Risk: düşük, orta ya da yüksek.' }
    },
  },
  crash: {
    ad: 'Crash', ikon: '🚀',
    hazirla: (secim) => {
      const hedef = crashHedefCoz(secim)
      return hedef ? { cevir: () => crashUc(hedef) } : { hata: `Hedef çarpan ${CRASH_EN_AZ}-${CRASH_EN_COK} arası olmalı.` }
    },
  },
}

export const COK_OYUNLAR = {
  blackjack: { ad: 'Blackjack', ikon: '🃏' },
  mayın: { ad: 'Mayın', ikon: '💣' },
  kule: { ad: 'Kule', ikon: '🐉' },
  hilo: { ad: 'Hi-lo', ikon: '🂠' },
}

/**
 * Kayıp ve kazanç hazineye (bot hesabına) yazılır; panel WhatsApp'a bağlanmadığı için
 * bot kimliğini botun yazdığı `ayar` kaydından öğrenir. Kayıt yoksa kumar kapalıdır.
 */
function hazineyiTani() {
  const jid = getDb()?.prepare("SELECT deger FROM ayar WHERE anahtar = 'bot_jid'").get()?.deger
  if (jid && !botHesabiMi(jid)) botHesabiniTani({ id: jid })
  return Boolean(jid)
}
const HAZINE_YOK = 'Kumarhane kapalı: bot henüz hiç bağlanmadı.'

/** "50 milyon", "50m", "hepsi" → miktarCoz'un okuyacağı tek kelime. */
function miktarMetni(ham) {
  const kelimeler = String(ham ?? '').trim().split(/\s+/).filter(Boolean)
  return kelimeler.length ? miktarlariCoz(kelimeler).join('') : ''
}

export function kumarMotoru({ saat = Date.now, zamanlayici = setTimeout, temizle = clearTimeout } = {}) {
  const eller = new Map() // anahtar → çok adımlı oyunun durumu
  const sonuclar = new Map() // anahtar → son sonuç, bir kez gösterilir
  const sonIslem = new Map()

  const anahtar = (h) => `${h.chat}|${h.user}`
  const sonucYaz = (k, sonuc) => sonuclar.set(k, sonuc)

  function hizKontrol(k) {
    const simdi = saat()
    if (simdi - (sonIslem.get(k) ?? 0) < ARALIK_MS) return false
    sonIslem.set(k, simdi)
    return true
  }

  /** Bakiye, yasak ve miktar; oynanamıyorsa `hata`. */
  function giris(h, miktarHam) {
    if (!hazineyiTani()) return { hata: HAZINE_YOK }
    const { xp } = getStats(h.chat, h.user)
    const engel = kumarEngeli(xp, kumarYasagi(h.chat, h.user))
    if (engel) return { hata: engel }
    const cozum = miktarCoz(miktarMetni(miktarHam), xp)
    if (cozum.hata) return { hata: cozum.hata.replace(/`/g, '') }
    return { miktar: cozum.miktar }
  }

  function tekOyna(h, { oyun, miktar, secim }) {
    const k = anahtar(h)
    const tanim = Object.hasOwn(TEK_OYUNLAR, oyun) ? TEK_OYUNLAR[oyun] : null
    if (!tanim) return sonucYaz(k, { hata: 'Böyle bir oyun yok.' })
    if (!hizKontrol(k)) return
    if (eller.has(k)) return sonucYaz(k, { oyun, hata: 'Önce açık elini bitir.' })

    const hazir = tanim.hazirla(secim)
    if (hazir.hata) return sonucYaz(k, { oyun, hata: hazir.hata })
    const g = giris(h, miktar)
    if (g.hata) return sonucYaz(k, { oyun, hata: g.hata })

    const s = bahisOyna({ chatJid: h.chat, userJid: h.user, miktar: g.miktar, cevir: hazir.cevir, oyun })
    if (!s) return sonucYaz(k, { oyun, hata: 'Kumarhane şu an kapalı, sonra dene.' })
    if (s.yetersiz) return sonucYaz(k, { oyun, hata: 'O kadar XP\'n yok.' })
    sonucYaz(k, { oyun, bahis: g.miktar, sonuc: s.sonuc, once: s.once, xp: s.xp, fark: s.fark, kesilen: s.kesilen })
  }

  /** Eli kapatır, ödemeyi yazar, sonucu bırakır. */
  function kapat(k, el, odeme, sebep = '') {
    if (el.bitti) return
    el.bitti = true
    temizle(el.zaman)
    eller.delete(k)
    const s = kumarOde({ oyun: el.oyun, chatJid: el.chat, userJid: el.user, bahis: el.bahis, odeme })
    if (!s) {
      logger.error({ chat: el.chat, oyun: el.oyun }, 'Panel kumar ödemesi yazılamadı')
      return sonucYaz(k, { oyun: el.oyun, hata: 'Sonuç yazılamadı.', el: gorunum(el, true) })
    }
    sonucYaz(k, { oyun: el.oyun, bahis: el.bahis, sebep, el: gorunum(el, true), once: s.xp - s.fark, xp: s.xp, fark: s.fark, kesilen: s.kesilen })
  }

  function nakitCek(k, el, sebep) {
    const c = el.oyun === 'mayın' ? mayinCarpani(el.acilanlar.length)
      : el.oyun === 'kule' ? kuleCarpani(el.zorluk, el.secimler.length)
        : Math.floor(el.carpan * 100) / 100
    kapat(k, el, Math.floor(el.bahis * c), `${sebep} (${c}x)`)
  }

  function blackjackBitir(k, el, sebep) {
    if (elDegeri(el.oyuncu) <= 21 && !dogalMi(el.oyuncu)) {
      while (elDegeri(el.krupiye) < 17) el.krupiye.push(el.deste.pop())
    }
    kapat(k, el, Math.floor(el.bahis * odemeCarpani(el.oyuncu, el.krupiye)), sebep)
  }

  // Süre dolunca el WhatsApp'taki gibi kapanır: blackjack `dur`, ötekiler `çek` sayılır.
  function sureDoldu(k, el) {
    if (el.bitti) return
    if (el.oyun === 'blackjack') blackjackBitir(k, el, '⏱️ Süre doldu, el "dur" sayıldı.')
    else nakitCek(k, el, '⏱️ Süre doldu, kazanç çekildi')
  }

  function sureKur(k, el) {
    temizle(el.zaman)
    el.zaman = zamanlayici(() => sureDoldu(k, el), SURE_MS)
    el.zaman?.unref?.()
    el.bitis = saat() + SURE_MS
  }

  function basla(h, { oyun, miktar, secim }) {
    const k = anahtar(h)
    if (!Object.hasOwn(COK_OYUNLAR, oyun)) return sonucYaz(k, { hata: 'Böyle bir oyun yok.' })
    if (!hizKontrol(k)) return
    if (eller.has(k)) return sonucYaz(k, { oyun, hata: 'Önce açık elini bitir.' })

    const zorluk = oyun === 'kule' ? zorlukCoz(secim) : null
    if (oyun === 'kule' && !zorluk) return sonucYaz(k, { oyun, hata: 'Zorluk: kolay, orta ya da zor.' })
    const g = giris(h, miktar)
    if (g.hata) return sonucYaz(k, { oyun, hata: g.hata })

    const cekim = xpCek({ chatJid: h.chat, userJid: h.user, miktar: g.miktar })
    if (!cekim) return sonucYaz(k, { oyun, hata: 'Masa şu an kapalı, sonra dene.' })
    if (cekim.yetersiz) return sonucYaz(k, { oyun, hata: 'O kadar XP\'n yok.' })

    const el = { oyun, chat: h.chat, user: h.user, bahis: g.miktar, bitti: false, uyari: '' }
    if (oyun === 'blackjack') {
      el.deste = desteKur()
      el.oyuncu = [el.deste.pop(), el.deste.pop()]
      el.krupiye = [el.deste.pop(), el.deste.pop()]
    } else if (oyun === 'mayın') {
      el.mayinlar = mayinKur()
      el.acilanlar = []
    } else if (oyun === 'kule') {
      el.zorluk = zorluk
      el.ejderhalar = kuleKur(zorluk)
      el.secimler = []
    } else {
      el.kart = kartCek()
      el.carpan = 1
      el.gecmis = [kartYaz(el.kart)]
    }
    eller.set(k, el)
    sureKur(k, el)
    if (oyun === 'blackjack' && dogalMi(el.oyuncu)) blackjackBitir(k, el, '🎉 Blackjack!')
  }

  function hamle(h, { hamle: ham }) {
    const k = anahtar(h)
    const el = eller.get(k)
    if (!el) return sonucYaz(k, { hata: 'Açık elin yok, süresi dolmuş olabilir.' })
    if (!hizKontrol(k)) return
    const secim = String(ham ?? '')
    el.uyari = ''
    const uyar = (metin) => {
      el.uyari = metin
    }

    if (el.oyun === 'blackjack') {
      if (secim === 'dur') return blackjackBitir(k, el)
      if (secim !== 'kart') return uyar('Kart çek ya da dur.')
      el.oyuncu.push(el.deste.pop())
      if (elDegeri(el.oyuncu) >= 21) return blackjackBitir(k, el, elDegeri(el.oyuncu) > 21 ? '💥 21\'i geçtin!' : '')
      return sureKur(k, el)
    }

    if (secim === 'çek') return nakitCek(k, el, '💰 Parayı çektin')

    if (el.oyun === 'mayın') {
      const n = /^\d{1,2}$/.test(secim) ? Number(secim) : 0
      if (n < 1 || n > KUTU || el.acilanlar.includes(n)) return uyar('Açılmamış bir kutu seç.')
      el.acilanlar.push(n)
      if (el.mayinlar.has(n)) return kapat(k, el, 0, `💥 ${n} numara mayındı!`)
      if (el.acilanlar.length === KUTU - el.mayinlar.size) return nakitCek(k, el, '🏆 Bütün güvenli kutuları açtın')
      return sureKur(k, el)
    }

    if (el.oyun === 'kule') {
      const n = /^\d$/.test(secim) ? Number(secim) : 0
      if (n < 1 || n > ZORLUK[el.zorluk].kutu) return uyar('Bir kutu seç.')
      const kat = el.secimler.length
      el.secimler.push(n)
      if (el.ejderhalar[kat].has(n)) return kapat(k, el, 0, `🔥 ${kat + 1}. katta ${n} numarada ejderha vardı!`)
      if (el.secimler.length === KAT) return nakitCek(k, el, '🏆 Kulenin tepesine çıktın')
      return sureKur(k, el)
    }

    if (!['yüksek', 'düşük', 'geç'].includes(secim)) return uyar('Yüksek, düşük, geç ya da çek.')
    if (secim !== 'geç' && !hiloCarpani(el.kart.sira, secim)) return uyar(`${kartYaz(el.kart)} üstünde ${secim} her zaman tutar, oynanmaz.`)
    const yeni = kartCek()
    el.gecmis.push(kartYaz(yeni))
    if (secim === 'geç') {
      el.kart = yeni
      return sureKur(k, el)
    }
    const c = hiloCarpani(el.kart.sira, secim)
    const tuttu = hiloTuttu(el.kart.sira, yeni.sira, secim)
    el.kart = yeni
    if (!tuttu) return kapat(k, el, 0, `💥 ${kartYaz(yeni)} geldi, ${secim} tutmadı!`)
    el.carpan *= c
    if (el.carpan >= HILO_TAVAN) return nakitCek(k, el, `🏆 ${HILO_TAVAN}x tavanına ulaştın`)
    return sureKur(k, el)
  }

  /** Sayfanın çizeceği görünüm; el sürerken gizli bilgi (mayınlar, krupiyenin kartı) çıkmaz. */
  function gorunum(el, acik = false) {
    const g = { oyun: el.oyun, bahis: el.bahis, kalanMs: Math.max(0, (el.bitis ?? 0) - saat()), uyari: el.uyari }
    if (el.oyun === 'blackjack') {
      return {
        ...g,
        oyuncu: el.oyuncu.map(kartMetni),
        oyuncuDeger: elDegeri(el.oyuncu),
        krupiye: acik ? el.krupiye.map(kartMetni) : [kartMetni(el.krupiye[0]), '🂠'],
        krupiyeDeger: acik ? elDegeri(el.krupiye) : null,
      }
    }
    if (el.oyun === 'mayın') {
      const kalan = KUTU - el.mayinlar.size - el.acilanlar.length
      return {
        ...g,
        kutular: Array.from({ length: KUTU }, (_, i) => {
          const n = i + 1
          if (el.acilanlar.includes(n)) return el.mayinlar.has(n) ? 'patlayan' : 'acik'
          return acik && el.mayinlar.has(n) ? 'mayin' : 'kapali'
        }),
        carpan: mayinCarpani(el.acilanlar.length),
        sonraki: kalan > 0 ? mayinCarpani(el.acilanlar.length + 1) : null,
      }
    }
    if (el.oyun === 'kule') {
      const { kutu } = ZORLUK[el.zorluk]
      return {
        ...g,
        zorluk: el.zorluk,
        katlar: Array.from({ length: KAT }, (_, kat) => ({
          no: kat + 1,
          carpan: kuleCarpani(el.zorluk, kat + 1),
          aktif: !acik && kat === el.secimler.length,
          kutular: Array.from({ length: kutu }, (_, i) => {
            const n = i + 1
            const ejder = el.ejderhalar[kat].has(n)
            if (el.secimler[kat] === n) return ejder ? 'patlayan' : 'acik'
            return acik && ejder ? 'mayin' : 'kapali'
          }),
        })).reverse(),
        carpan: kuleCarpani(el.zorluk, el.secimler.length),
      }
    }
    const yuksek = hiloCarpani(el.kart.sira, 'yüksek')
    const dusuk = hiloCarpani(el.kart.sira, 'düşük')
    return {
      ...g,
      kart: kartYaz(el.kart),
      gecmis: el.gecmis.slice(-8),
      carpan: Math.floor(el.carpan * 100) / 100,
      yuksek: yuksek && Math.floor(el.carpan * yuksek * 100) / 100,
      dusuk: dusuk && Math.floor(el.carpan * dusuk * 100) / 100,
    }
  }

  /** Sayfa için bakiye, açık el ve (bir kez) son sonuç. */
  function durum(h) {
    const k = anahtar(h)
    const { xp } = getStats(h.chat, h.user)
    const yasak = kumarYasagi(h.chat, h.user)
    const el = eller.get(k)
    const sonuc = sonuclar.get(k) ?? null
    sonuclar.delete(k)
    return { xp, yasakBitis: yasak > saat() ? yasak : 0, el: el ? gorunum(el) : null, sonuc }
  }

  return { tekOyna, basla, hamle, durum }
}
