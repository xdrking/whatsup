// Şeker Zinciri: 8x8 tahtada yan yana iki şekerin yeri değişir, 3+ aynı şeker yan yana gelince patlar,
// üsttekiler düşer, zincirleme patlamalar kombo çarpanını büyütür. Saf; rastgelelik dışarıdan verilir.
// Oyuncu hamle seçtiği için beceri parayı etkiler: ödeme, her hamlede en iyi hamleyi bulan bir bot bile
// paket fiyatını geçemesin diye ayarlıdır (test/zincir.test.js). Tahta sunucudadır, tarayıcı yalnızca oynatır.
import { randomInt } from 'node:crypto'

export const BOYUT = 8
export const RENKLER = ['🍓', '🍋', '🍇', '🍏', '🍊', '🍬']
export const RENK_ADI = ['Çilek', 'Limon', 'Üzüm', 'Elma', 'Portakal', 'Akide']
// Özel şekerler kendi renklerini korur (parlak üzüm hâlâ üzümdür), aynı renkle eşleşince patlar (bot sahibinin
// isteği): h satırı, v sütunu, b çevresini (3x3), s (süper parlak) geniş çevresini (5x5) temizler.
export const OZEL_ADI = { h: 'Parlak (yatay)', v: 'Parlak (dikey)', b: 'Parlak bomba', s: 'Süper parlak' }
const YARICAP = { b: 1, s: 2 }
// Paket: hamle sayısı ve bahsin katı. Fazla hamle hamle başına daha pahalıdır (bot sahibinin isteği).
export const PAKETLER = {
  15: { hamle: 15, kat: 1 },
  20: { hamle: 20, kat: 1.4 },
  30: { hamle: 30, kat: 2.2 },
}
// Aynı hamledeki n. patlamanın çarpanı; son basamaktan sonra sabit kalır.
export const KOMBO = [1, 2, 4, 8, 15, 25, 40, 60]
// Patlayan her şeker bahsin bu katını öder (kombo çarpanıyla).
export const HUCRE_DEGERI = 0.0024
// İki özel şeker yer değiştirince ödenen ek ödül (bahsin katı): heyecan nadir büyük anlardan gelsin.
export const BIRLESIM_ODULU = { ss: 6, sb: 3, sc: 2, bb: 1.4, bc: 1, cc: 0.5 }
// Bir elin en çok kazancı, bahsin katı olarak.
export const AZAMI_KAT = 200
// Giriş ücreti: REFERANS_KUR'daki XP, kurla büyür, paketin katıyla çarpılır; hazineye gider.
export const GIRIS_TABAN = 20_000
// Sahibin gizli şansı (`.şans`): yeni şekerin bu olasılıkla son rengi atlaması.
export const SAHIP_SANS = 0.75
// Hamle kalmayınca tahta en çok bu kadar kez dökülüp yenilenir; yine hamle yoksa eşleşmesiz tahta kurulur.
const YENILEME_SINIRI = 5

const N = BOYUT * BOYUT
const satir = (i) => Math.floor(i / BOYUT)
const sutun = (i) => i % BOYUT

export const komsuMu = (i, j) => i >= 0 && j >= 0 && i < N && j < N && ((satir(i) === satir(j) && Math.abs(i - j) === 1) || Math.abs(i - j) === BOYUT)
export const komboCarpani = (n) => KOMBO[Math.min(n, KOMBO.length - 1)]
export const paketCoz = (secim) => (Object.hasOwn(PAKETLER, String(secim ?? '').trim()) ? PAKETLER[String(secim).trim()] : null)

// `sans` (sahibin gizli şansı): yeni şeker bu olasılıkla son rengi atlar, az renk daha çok eşleşme demektir.
const yeniSeker = (rnd, renkSayisi, sans = 0) => ({ r: sans && rnd(1000) < sans * 1000 ? rnd(renkSayisi - 1) : rnd(renkSayisi), o: '' })

/** Bu hücreden geçen yatay ya da dikey 3+ dizi var mı? */
function eslesirMi(t, i) {
  const renk = t[i].r
  const r = satir(i)
  const c = sutun(i)
  let sol = c
  while (sol > 0 && t[r * BOYUT + sol - 1].r === renk) sol -= 1
  let sag = c
  while (sag < BOYUT - 1 && t[r * BOYUT + sag + 1].r === renk) sag += 1
  if (sag - sol >= 2) return true
  let ust = r
  while (ust > 0 && t[(ust - 1) * BOYUT + c].r === renk) ust -= 1
  let alt = r
  while (alt < BOYUT - 1 && t[(alt + 1) * BOYUT + c].r === renk) alt += 1
  return alt - ust >= 2
}

/** Takas geçerli mi: eşleşme doğuruyor ya da iki özel şekeri birleştiriyor. */
export function takasGecerli(t, i, j) {
  if (!komsuMu(i, j)) return false
  if (t[i].o && t[j].o) return true
  const k = t.slice()
  ;[k[i], k[j]] = [k[j], k[i]]
  return eslesirMi(k, i) || eslesirMi(k, j)
}

/** Geçerli bütün takaslar `[i, j]` (i < j). */
export function gecerliHamleler(t) {
  const liste = []
  for (let i = 0; i < N; i += 1) {
    if (sutun(i) < BOYUT - 1 && takasGecerli(t, i, i + 1)) liste.push([i, i + 1])
    if (satir(i) < BOYUT - 1 && takasGecerli(t, i, i + BOYUT)) liste.push([i, i + BOYUT])
  }
  return liste
}

export const hamleVar = (t) => {
  for (let i = 0; i < N; i += 1) {
    if (sutun(i) < BOYUT - 1 && takasGecerli(t, i, i + 1)) return true
    if (satir(i) < BOYUT - 1 && takasGecerli(t, i, i + BOYUT)) return true
  }
  return false
}

const eslesmeVar = (t) => t.some((_, i) => eslesirMi(t, i))

/** Eşleşmesiz ve en az bir hamlesi olan tahta. */
export function tahtaKur(rnd = randomInt, renkSayisi = RENKLER.length) {
  for (let deneme = 0; deneme < 50; deneme += 1) {
    const t = []
    for (let i = 0; i < N; i += 1) {
      const yasak = new Set()
      const c = sutun(i)
      if (c >= 2 && t[i - 1].r === t[i - 2].r) yasak.add(t[i - 1].r)
      if (i >= 2 * BOYUT && t[i - BOYUT].r === t[i - 2 * BOYUT].r) yasak.add(t[i - BOYUT].r)
      let r = rnd(renkSayisi)
      while (yasak.has(r)) r = (r + 1) % renkSayisi
      t.push({ r, o: '' })
    }
    if (hamleVar(t)) return t
  }
  // Pratikte buraya gelinmez; gelinirse hamlesiz kalmasın diye köşeye hazır bir eşleşme dizilir.
  const t = Array.from({ length: N }, (_, i) => ({ r: (satir(i) * 2 + sutun(i)) % renkSayisi, o: '' }))
  t[0] = { r: 0, o: '' }
  t[1] = { r: 0, o: '' }
  t[BOYUT + 2] = { r: 0, o: '' }
  return t
}

/** Yatay ve dikey 3+ diziler. */
function kosular(t) {
  const liste = []
  for (const yon of ['h', 'v']) {
    for (let a = 0; a < BOYUT; a += 1) {
      let b = 0
      while (b < BOYUT) {
        const idx = (x) => (yon === 'h' ? a * BOYUT + x : x * BOYUT + a)
        const renk = t[idx(b)].r
        let e = b + 1
        while (e < BOYUT && t[idx(e)].r === renk) e += 1
        if (e - b >= 3) liste.push({ yon, renk, hucreler: Array.from({ length: e - b }, (_, x) => idx(b + x)) })
        b = e
      }
    }
  }
  return liste
}

/**
 * Kesişen diziler bir gruptur. Grubun doğuracağı özel: 5+ süper parlak, L/T parlak bomba, 4'lü parlak (çizgili);
 * 3'lü düz patlar. `tercih`: hamlede yer değiştiren hücreler; özel şeker oraya konur.
 */
export function gruplar(t, tercih = []) {
  const kos = kosular(t)
  const ait = new Map()
  const kume = kos.map((_, i) => i)
  const kok = (x) => (kume[x] === x ? x : (kume[x] = kok(kume[x])))
  kos.forEach((k, i) => k.hucreler.forEach((h) => {
    if (ait.has(h)) kume[kok(i)] = kok(ait.get(h))
    else ait.set(h, i)
  }))
  const birlik = new Map()
  kos.forEach((k, i) => {
    const r = kok(i)
    if (!birlik.has(r)) birlik.set(r, [])
    birlik.get(r).push(k)
  })
  return [...birlik.values()].map((liste) => {
    const hucreler = [...new Set(liste.flatMap((k) => k.hucreler))]
    const enUzun = liste.reduce((a, b) => (b.hucreler.length > a.hucreler.length ? b : a))
    const yatay = liste.some((k) => k.yon === 'h')
    const dikey = liste.some((k) => k.yon === 'v')
    const ozel = enUzun.hucreler.length >= 5 ? 's' : yatay && dikey ? 'b' : enUzun.hucreler.length === 4 ? enUzun.yon : ''
    let pivot = tercih.find((x) => hucreler.includes(x))
    if (pivot === undefined && ozel === 'b') {
      const sayim = new Map()
      liste.forEach((k) => k.hucreler.forEach((h) => sayim.set(h, (sayim.get(h) ?? 0) + 1)))
      pivot = [...sayim].find(([, n]) => n > 1)?.[0]
    }
    if (pivot === undefined) pivot = enUzun.hucreler[Math.floor(enUzun.hucreler.length / 2)]
    return { renk: enUzun.renk, hucreler, ozel, pivot }
  })
}

const kare = (i, yaricap) => {
  const liste = []
  for (let dr = -yaricap; dr <= yaricap; dr += 1) {
    for (let dc = -yaricap; dc <= yaricap; dc += 1) {
      const r = satir(i) + dr
      const c = sutun(i) + dc
      if (r >= 0 && r < BOYUT && c >= 0 && c < BOYUT) liste.push(r * BOYUT + c)
    }
  }
  return liste
}
const satirHucreleri = (r) => (r >= 0 && r < BOYUT ? Array.from({ length: BOYUT }, (_, c) => r * BOYUT + c) : [])
const sutunHucreleri = (c) => (c >= 0 && c < BOYUT ? Array.from({ length: BOYUT }, (_, r) => r * BOYUT + c) : [])

/** Özel şekerin vurduğu hücreler. */
function vurulanlar(i, o) {
  if (o === 'h') return satirHucreleri(satir(i))
  if (o === 'v') return sutunHucreleri(sutun(i))
  return kare(i, YARICAP[o] ?? 0)
}

/**
 * Temizlenecek kümeye düşen özel şekerler tetiklenir, onların vurduğu özeller de. `tuketilen`: takasta
 * birleşip zaten kullanılmış özeller, yeniden tetiklenmez. @returns {{ sil: Set, etkin: [idx, tur][] }}
 */
function yay(t, temiz, tuketilen) {
  const sil = new Set(temiz)
  const etkin = []
  const islenen = new Set(tuketilen)
  const kuyruk = [...temiz]
  while (kuyruk.length) {
    const i = kuyruk.shift()
    const h = t[i]
    if (!h.o || islenen.has(i)) continue
    islenen.add(i)
    etkin.push([i, h.o])
    for (const j of vurulanlar(i, h.o)) {
      if (sil.has(j)) continue
      sil.add(j)
      kuyruk.push(j)
    }
  }
  return { sil, etkin }
}

/**
 * İki özel şeker yer değiştirince olan büyük patlama, `j`'den (takasın vardığı hücre) yayılır. Bomba ve
 * süper parlak yarıçaplarını toplar; çizgiliyle birleşen bomba o genişlikte satır ve sütun temizler. Özel yoksa `null`.
 */
function birlesim(t, i, j) {
  const a = t[i].o
  const b = t[j].o
  if (!a || !b) return null
  const yari = (YARICAP[a] ?? 0) + (YARICAP[b] ?? 0)
  const cizgili = (o) => o === 'h' || o === 'v'
  let hucreler
  if (!cizgili(a) && !cizgili(b)) hucreler = kare(j, yari)
  else {
    const genis = cizgili(a) && cizgili(b) ? 0 : yari
    hucreler = []
    for (let d = -genis; d <= genis; d += 1) hucreler.push(...satirHucreleri(satir(j) + d), ...sutunHucreleri(sutun(j) + d))
  }
  const ad = (o) => (cizgili(o) ? 'c' : o)
  const tur = [ad(a), ad(b)].sort((x, y) => 'sbc'.indexOf(x) - 'sbc'.indexOf(y)).join('')
  return { temiz: new Set([i, j, ...hucreler]), tuketilen: new Set([i, j]), tur }
}

/** Silinenler çıkar, üsttekiler düşer, boşluğa yenileri yağar. Yerinde değiştirir. */
function dusur(t, sil, rnd, renkSayisi, sans) {
  for (let c = 0; c < BOYUT; c += 1) {
    const kalan = []
    for (let r = 0; r < BOYUT; r += 1) if (!sil.has(r * BOYUT + c)) kalan.push(t[r * BOYUT + c])
    const yeni = Array.from({ length: BOYUT - kalan.length }, () => yeniSeker(rnd, renkSayisi, sans))
    ;[...yeni, ...kalan].forEach((h, r) => { t[r * BOYUT + c] = h })
  }
}

/**
 * Eşleşme kalmayana kadar patlat ve düşür; `ilk` takastaki özel birleşimidir. Yerinde değiştirir.
 * @returns {{ adimlar: object[], kazanc: number }}
 */
function zincirle(t, { tercih = [], ilk = null, rnd, renkSayisi, sans }) {
  const adimlar = []
  let kazanc = 0
  for (let kombo = 0; kombo < 60; kombo += 1) {
    let temiz
    let tuketilen = new Set()
    const olusan = []
    if (ilk) {
      ;({ temiz, tuketilen } = ilk)
      ilk = null
    } else {
      const g = gruplar(t, tercih)
      if (!g.length) break
      temiz = new Set()
      for (const grup of g) {
        grup.hucreler.forEach((h) => temiz.add(h))
        if (grup.ozel) olusan.push([grup.pivot, grup.ozel, grup.renk])
      }
    }
    const { sil, etkin } = yay(t, temiz, tuketilen)
    const adet = sil.size
    for (const [p, o, renk] of olusan) {
      sil.delete(p)
      t[p] = { r: renk, o }
    }
    const carpan = komboCarpani(kombo)
    const adimKazanci = adet * HUCRE_DEGERI * carpan
    dusur(t, sil, rnd, renkSayisi, sans)
    adimlar.push({ sil: [...sil].sort((a, b) => a - b), olusan, etkin, adet, carpan, kazanc: adimKazanci, tahta: t.slice() })
    kazanc += adimKazanci
    tercih = []
  }
  return { adimlar, kazanc }
}

/**
 * Hamle kalmayınca bütün şekerler dökülür, yerine tamamen yeni bir tahta yağar (bot sahibinin isteği); yağarken
 * eşleşenler kendiliğinden patlar ve öder. Yine hamle yoksa yeniden dökülür, sınırda eşleşmesiz tahta kurulur.
 * @returns {{ tahta, yagmurlar: { ilk, adimlar }[], kazanc: number }}
 */
export function yenile(rnd = randomInt, renkSayisi = RENKLER.length, sans = 0) {
  const yagmurlar = []
  let kazanc = 0
  for (let n = 0; n < YENILEME_SINIRI; n += 1) {
    const t = Array.from({ length: N }, () => yeniSeker(rnd, renkSayisi, sans))
    const ilk = t.slice()
    const z = zincirle(t, { rnd, renkSayisi, sans })
    yagmurlar.push({ ilk, adimlar: z.adimlar })
    kazanc += z.kazanc
    if (hamleVar(t)) return { tahta: t, yagmurlar, kazanc }
  }
  const t = tahtaKur(rnd, renkSayisi)
  yagmurlar.push({ ilk: t.slice(), adimlar: [] })
  return { tahta: t, yagmurlar, kazanc }
}

/** Tarayıcıya giden tahta: hücre başına iki harf (renk a-f, özel . h v b s). */
export const kodla = (t) => t.map((h) => `${'abcdef'[h.r]}${h.o || '.'}`).join('')
export const coz = (metin) => Array.from({ length: metin.length / 2 }, (_, i) => {
  const o = metin[i * 2 + 1]
  return { r: 'abcdef'.indexOf(metin[i * 2]), o: o === '.' ? '' : o }
})

/**
 * Tek hamle. Geçersiz takasta `null` (hamle harcanmaz). `kazanc` bahsin katıdır. `yenilensin`: hamle hakkı
 * kaldıysa tahta tıkanınca dökülüp yenilenir (son hamlede gerekmez, el zaten kapanır).
 * @returns {{ tahta, adimlar: object[], kazanc: number, yagmurlar: object[] | null, birlesim: string } | null}
 *   `adimlar[i]`: { sil, olusan: [idx, özel, renk][], etkin: [idx, tür][], adet, carpan, kazanc, tahta }.
 */
export function hamleYap(tahta, i, j, { rnd = randomInt, renkSayisi = RENKLER.length, sans = 0, yenilensin = true } = {}) {
  if (!takasGecerli(tahta, i, j)) return null
  const t = tahta.slice()
  ;[t[i], t[j]] = [t[j], t[i]]
  const ilk = birlesim(t, i, j)
  const tur = ilk?.tur ?? ''
  const z = zincirle(t, { tercih: [i, j], ilk, rnd, renkSayisi, sans })
  let kazanc = (BIRLESIM_ODULU[tur] ?? 0) + z.kazanc
  let son = t
  let yagmurlar = null
  if (yenilensin && !hamleVar(t)) {
    const y = yenile(rnd, renkSayisi, sans)
    son = y.tahta
    yagmurlar = y.yagmurlar
    kazanc += y.kazanc
  }
  return { tahta: son, adimlar: z.adimlar, kazanc, yagmurlar, birlesim: tur }
}

/**
 * İpucu: geçerli bir takas ve onun eşleştireceği hücreler (Saga oyunlarındaki parlayan kenar). Rastgele seçilir,
 * en iyisi söylenmez. Hamle yoksa boş.
 */
export function ipucu(t, rnd = randomInt) {
  const liste = gecerliHamleler(t)
  if (!liste.length) return []
  const [i, j] = liste[rnd(liste.length)]
  if (t[i].o && t[j].o) return [i, j]
  const k = t.slice()
  ;[k[i], k[j]] = [k[j], k[i]]
  const grup = gruplar(k, [i, j]).filter((g) => g.hucreler.includes(i) || g.hucreler.includes(j))
  // Takastan sonraki konumlar: i'ye gelen j'deki şekerdir, ipucu şekerin bugünkü yerini gösterir.
  const yer = (h) => (h === i ? j : h === j ? i : h)
  // Yalnızca eşleşecek şekerler parlar; eşleşmeye katılmayan takas eşi parlamaz (Saga'daki gibi).
  return [...new Set(grup.flatMap((g) => g.hucreler.map(yer)))].sort((a, b) => a - b)
}

/** Testteki "usta oyuncu": her hamlede görünen tahtada en çok kazandıran takası seçer. */
export function enIyiHamle(t, deneme = randomInt) {
  let enIyi = null
  for (const [i, j] of gecerliHamleler(t)) {
    const s = hamleYap(t, i, j, { rnd: deneme, yenilensin: false })
    if (!enIyi || s.kazanc > enIyi.kazanc) enIyi = { i, j, kazanc: s.kazanc }
  }
  return enIyi
}
