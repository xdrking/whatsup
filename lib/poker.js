// .poker: No-limit Texas Hold'em kuralları. Saf: soket, veritabanı ve zamanlayıcı bilmez,
// akış games/poker.js'tedir. Rastgelelik dışarıdan verilir (testte sabit deste).
import { randomInt } from 'node:crypto'
import { binlik } from './sayi.js'

export const MIN_OYUNCU = 2
export const MAX_OYUNCU = 8
export const MIN_GIRIS = 100
// Körler girişin elliden biridir, yani herkes 50 büyük körle oturur.
export const KOR_ORANI = 50
// Masa sonsuza dek sürmesin diye körler her bu kadar elde ikiye katlanır.
export const KOR_ARTIS_EL = 8

const RENKLER = ['♠', '♥', '♦', '♣']
const DEGER_ADI = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }

export const kartYaz = (k) => `${DEGER_ADI[k.d] ?? k.d}${k.r}`
export const kartlarYaz = (kartlar) => kartlar.map(kartYaz).join(' ')

export function desteKar(rnd = randomInt) {
  const deste = []
  for (const r of RENKLER) for (let d = 2; d <= 14; d++) deste.push({ d, r })
  for (let i = deste.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[deste[i], deste[j]] = [deste[j], deste[i]]
  }
  return deste
}

export const EL_ADLARI = ['Yüksek kart', 'Per', 'Döper', 'Üçlü', 'Kent', 'Renk', 'Full ev', 'Kare', 'Floş']

/** 5 kartın değeri: [kategori, eşitlik bozucular…]. Büyük dizi büyük eldir. */
function besKart(kartlar) {
  const sayac = new Map()
  for (const k of kartlar) sayac.set(k.d, (sayac.get(k.d) ?? 0) + 1)
  // Önce adet, sonra değer: full evde üçlü, döperde büyük per öne geçer.
  const gruplar = [...sayac].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const degerler = gruplar.map(([d]) => d)
  const renk = kartlar.every((k) => k.r === kartlar[0].r)

  let kent = 0
  if (gruplar.length === 5) {
    if (degerler[0] - degerler[4] === 4) kent = degerler[0]
    // As küçük kentte 1 sayılır: A-2-3-4-5'in en büyüğü 5'tir.
    else if (degerler.join() === '14,5,4,3,2') kent = 5
  }

  if (kent && renk) return [8, kent]
  if (gruplar[0][1] === 4) return [7, ...degerler]
  if (gruplar[0][1] === 3 && gruplar[1][1] === 2) return [6, ...degerler]
  if (renk) return [5, ...degerler]
  if (kent) return [4, kent]
  if (gruplar[0][1] === 3) return [3, ...degerler]
  if (gruplar[0][1] === 2 && gruplar[1][1] === 2) return [2, ...degerler]
  if (gruplar[0][1] === 2) return [1, ...degerler]
  return [0, ...degerler]
}

export function karsilastir(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const fark = (a[i] ?? 0) - (b[i] ?? 0)
    if (fark) return fark
  }
  return 0
}

/** 5-7 karttan en iyi 5'li: { deger, ad }. */
export function elDegeri(kartlar) {
  let en = null
  const n = kartlar.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = besKart([kartlar[a], kartlar[b], kartlar[c], kartlar[d], kartlar[e]])
            if (!en || karsilastir(v, en) > 0) en = v
          }
  const ad = en[0] === 8 && en[1] === 14 ? 'Royal floş' : EL_ADLARI[en[0]]
  return { deger: en, ad }
}

/**
 * Ana pot ve yan potlar. Herkesin bu eldeki toplam katkısı seviyelere bölünür; bir pota
 * yalnızca o seviyeye kadar koymuş ve çekilmemiş oyuncular hak kazanır.
 * @param {{ katki: number, cekildi: boolean }[]} oyuncular
 * @returns {{ miktar: number, hak: number[] }[]}  hak: oyuncu sıra numaraları
 */
export function potlar(oyuncular) {
  const seviyeler = [...new Set(oyuncular.map((o) => o.katki).filter((k) => k > 0))].sort((a, b) => a - b)
  const sonuc = []
  let onceki = 0
  for (const seviye of seviyeler) {
    const miktar = oyuncular.reduce((t, o) => t + Math.max(0, Math.min(o.katki, seviye) - onceki), 0)
    const hak = oyuncular.flatMap((o, i) => (!o.cekildi && o.katki >= seviye ? [i] : []))
    const son = sonuc.at(-1)
    // Hakkı olan kalmadıysa (çekilenin fazlası) para bir önceki pota eklenir.
    if (son && (!hak.length || son.hak.join() === hak.join())) son.miktar += miktar
    else sonuc.push({ miktar, hak })
    onceki = seviye
  }
  return sonuc
}

const oynuyor = (o) => o.elde && !o.cekildi
const hamleYapabilir = (o) => oynuyor(o) && !o.hepsi

function sonraki(masa, i, kosul) {
  const n = masa.oyuncular.length
  for (let k = 1; k <= n; k++) {
    const j = (((i + k) % n) + n) % n
    if (kosul(masa.oyuncular[j])) return j
  }
  return -1
}

function koy(o, miktar) {
  const tutar = Math.min(miktar, o.stack)
  o.stack -= tutar
  o.tur += tutar
  o.katki += tutar
  if (o.stack === 0) o.hepsi = true
  return tutar
}

/** @param {{ oyuncular: object[], giris: number }} p  oyuncular: { jid, pn } */
export function masaKur({ oyuncular, giris }) {
  const kucuk = Math.max(1, Math.floor(giris / KOR_ORANI / 2))
  return {
    oyuncular: oyuncular.map((o) => ({
      ...o, stack: giris, elde: false, cekildi: false, hepsi: false, tur: 0, katki: 0, konustu: false, kartlar: [],
    })),
    giris,
    temelKucuk: kucuk,
    kucuk,
    buyuk: kucuk * 2,
    dealer: -1,
    el: 0,
    faz: 'bekliyor',
    board: [],
    deste: [],
    enYuksek: 0,
    sonArtis: 0,
    sira: -1,
    sonuc: null,
  }
}

/** Masada çipi olan ve kalkmamış oyuncular. */
export const masadakiler = (masa) => masa.oyuncular.filter((o) => o.stack > 0 && !o.kalkti)

/** Yeni el. @returns {boolean} el başladıysa true; iki kişi kalmadıysa false */
export function elBaslat(masa, rnd = randomInt) {
  if (masadakiler(masa).length < MIN_OYUNCU) return false

  masa.el += 1
  masa.kucuk = masa.temelKucuk * 2 ** Math.floor((masa.el - 1) / KOR_ARTIS_EL)
  masa.buyuk = masa.kucuk * 2

  for (const o of masa.oyuncular) {
    Object.assign(o, { elde: o.stack > 0 && !o.kalkti, cekildi: false, hepsi: false, tur: 0, katki: 0, konustu: false, kartlar: [] })
  }
  masa.deste = desteKar(rnd)
  masa.board = []
  masa.sonuc = null
  masa.faz = 'preflop'

  masa.dealer = sonraki(masa, masa.dealer, (o) => o.elde)
  // İki kişide dealer küçük kördür ve preflop ilk o konuşur.
  const kucukKor = masadakiler(masa).length === 2 ? masa.dealer : sonraki(masa, masa.dealer, (o) => o.elde)
  const buyukKor = sonraki(masa, kucukKor, (o) => o.elde)
  koy(masa.oyuncular[kucukKor], masa.kucuk)
  koy(masa.oyuncular[buyukKor], masa.buyuk)
  masa.kucukKor = kucukKor
  masa.buyukKor = buyukKor

  for (let tur = 0; tur < 2; tur++) for (const o of masa.oyuncular) if (o.elde) o.kartlar.push(masa.deste.pop())

  masa.enYuksek = masa.buyuk
  masa.sonArtis = masa.buyuk
  masa.sira = sonraki(masa, buyukKor, hamleYapabilir)
  ilerle(masa)
  return true
}

/** Sıradaki oyuncunun görmek için koyması gereken tutar. */
export function gorme(masa, o = masa.oyuncular[masa.sira]) {
  return Math.min(Math.max(0, masa.enYuksek - o.tur), o.stack)
}

/**
 * Sıradaki oyuncunun hamlesi.
 * @param {'pas'|'gor'|'artir'|'hepsi'|'cekil'} tip
 * @param {number} miktar  artırmada görmenin üstüne konan
 * @returns {{ hata: string } | { aciklama: string }}
 */
export function hamle(masa, tip, miktar = 0) {
  if (!['preflop', 'flop', 'turn', 'river'].includes(masa.faz)) return { hata: 'El bitti.' }
  const o = masa.oyuncular[masa.sira]
  const borc = masa.enYuksek - o.tur
  let aciklama

  if (tip === 'cekil') {
    o.cekildi = true
    aciklama = 'çekildi'
  } else if (tip === 'pas') {
    if (borc > 0) return { hata: `Pas geçemezsin, görmek için ${binlik(borc)} gerekiyor.` }
    aciklama = 'pas'
  } else if (tip === 'gor') {
    aciklama = borc > 0 ? `gördü (${binlik(koy(o, borc))})` : 'pas'
  } else if (tip === 'artir' || tip === 'hepsi') {
    if (tip === 'artir') {
      if (!Number.isInteger(miktar) || miktar <= 0) return { hata: 'Artırma miktarını yaz: `artır 500`' }
      if (borc + miktar > o.stack) return { hata: `Önünde ${binlik(o.stack)} var. Hepsini koymak için \`hepsi\` yaz.` }
      if (miktar < masa.sonArtis && borc + miktar < o.stack) return { hata: `En az ${binlik(masa.sonArtis)} artırabilirsin.` }
    }
    const eski = masa.enYuksek
    koy(o, tip === 'hepsi' ? o.stack : borc + miktar)
    if (o.tur > eski) {
      // Kısa hepsi de artırma sayılır ve masayı yeniden açar: kural sade kalsın diye bilerek.
      masa.sonArtis = Math.max(masa.sonArtis, o.tur - eski)
      masa.enYuksek = o.tur
      for (const x of masa.oyuncular) if (x !== o) x.konustu = false
    }
    aciklama = o.hepsi ? `HEPSİ! (${binlik(o.tur)})` : `artırdı → ${binlik(o.tur)}`
  } else {
    return { hata: 'Bilinmeyen hamle.' }
  }

  o.konustu = true
  ilerle(masa)
  return { aciklama }
}

function sokakAc(masa) {
  const adet = masa.faz === 'preflop' ? 3 : 1
  masa.faz = { preflop: 'flop', flop: 'turn', turn: 'river' }[masa.faz]
  for (let i = 0; i < adet; i++) masa.board.push(masa.deste.pop())
  for (const o of masa.oyuncular) Object.assign(o, { tur: 0, konustu: false })
  masa.enYuksek = 0
  masa.sonArtis = masa.buyuk
}

/** Bahis turu bittiyse sokağı açar, el bittiyse dağıtır; yoksa sırayı bekleyene geçirir. */
function ilerle(masa) {
  for (;;) {
    const kalanlar = masa.oyuncular.filter(oynuyor)
    if (kalanlar.length === 1) return elKapat(masa)

    const hareketli = kalanlar.filter((o) => !o.hepsi)
    const bekleyen = hareketli.filter((o) => !o.konustu || o.tur < masa.enYuksek)
    // Tek kişi hamle yapabiliyor ve borcu yoksa karşısında bahis yapacak kimse kalmamıştır.
    const turBitti = !bekleyen.length || (hareketli.length === 1 && hareketli[0].tur >= masa.enYuksek)

    if (!turBitti) {
      if (!bekleyen.includes(masa.oyuncular[masa.sira])) masa.sira = sonraki(masa, masa.sira, (o) => bekleyen.includes(o))
      return
    }
    if (masa.faz === 'river') return elKapat(masa)

    sokakAc(masa)
    masa.sira = sonraki(masa, masa.dealer, hamleYapabilir)
    // Hamle yapabilecek tek kişi kaldıysa kartlar sona kadar açılır.
    if (hareketli.length > 1) return
  }
}

const dealerdenSira = (masa, o) =>
  (masa.oyuncular.indexOf(o) - masa.dealer - 1 + masa.oyuncular.length) % masa.oyuncular.length

function elKapat(masa) {
  const kalanlar = masa.oyuncular.filter(oynuyor)
  const showdown = kalanlar.length > 1
  if (showdown) while (masa.board.length < 5) masa.board.push(masa.deste.pop())

  const degerler = new Map(showdown ? kalanlar.map((o) => [o, elDegeri([...o.kartlar, ...masa.board])]) : [])
  const kazanc = new Map()
  const dagitim = potlar(masa.oyuncular.map((o) => ({ katki: o.katki, cekildi: !oynuyor(o) }))).map((pot) => {
    let kazananlar = pot.hak.map((i) => masa.oyuncular[i])
    if (showdown && kazananlar.length > 1) {
      const en = kazananlar.reduce((a, b) => (karsilastir(degerler.get(b).deger, degerler.get(a).deger) > 0 ? b : a))
      kazananlar = kazananlar.filter((o) => karsilastir(degerler.get(o).deger, degerler.get(en).deger) === 0)
    }
    // Bölünmeyen artık dealer'dan sonraki ilk kazanandan başlayarak birer birer verilir.
    const pay = Math.floor(pot.miktar / kazananlar.length)
    let artik = pot.miktar - pay * kazananlar.length
    for (const o of [...kazananlar].sort((a, b) => dealerdenSira(masa, a) - dealerdenSira(masa, b))) {
      const tutar = pay + (artik-- > 0 ? 1 : 0)
      o.stack += tutar
      kazanc.set(o, (kazanc.get(o) ?? 0) + tutar)
    }
    return { miktar: pot.miktar, kazananlar }
  })

  masa.faz = 'bitti'
  masa.sira = -1
  masa.sonuc = {
    showdown,
    eller: showdown ? kalanlar.map((o) => ({ oyuncu: o, ad: degerler.get(o).ad })) : [],
    potlar: dagitim,
    kazanc,
  }
}

/** Masa elin ortasında kapanırsa bu eldeki katkılar sahiplerine döner. Toplam çip korunur. */
export function eliIadeEt(masa) {
  if (masa.faz === 'bitti' || masa.faz === 'bekliyor') return
  for (const o of masa.oyuncular) {
    o.stack += o.katki
    Object.assign(o, { katki: 0, tur: 0 })
  }
  masa.faz = 'bitti'
  masa.sira = -1
}

/** Masadaki toplam çip (önündekiler + ortadaki pot); testler korunumu bununla denetler. */
export const toplamCip = (masa) =>
  masa.oyuncular.reduce((t, o) => t + o.stack + (masa.faz === 'bitti' ? 0 : o.katki), 0)
