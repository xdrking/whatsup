// Şeker Zinciri: 8x8 tahtada yan yana iki şekerin yeri değişir, 3+ aynı şeker yan yana gelince patlar,
// üsttekiler düşer, zincirleme patlamalar kombo çarpanını büyütür. Saf; rastgelelik dışarıdan verilir.
// Oyuncu hamle seçtiği için beceri parayı etkiler: ödeme, her hamlede en iyi hamleyi bulan bir bot bile
// paket fiyatını geçemesin diye ayarlıdır (test/zincir.test.js). Tahta sunucudadır, tarayıcı yalnızca oynatır.
import { randomInt } from 'node:crypto'

export const BOYUT = 8
export const RENKLER = ['🍓', '🍋', '🍇', '🍏', '🍊', '🍬']
export const RENK_ADI = ['Çilek', 'Limon', 'Üzüm', 'Elma', 'Portakal', 'Akide']
// Özel şekerler: h satırı, v sütunu, b çevresini (3x3) temizler, r (gökkuşağı) bir rengin hepsini.
export const OZEL_ADI = { h: 'Yatay çizgili', v: 'Dikey çizgili', b: 'Bomba', r: 'Gökkuşağı' }
// Paket: hamle sayısı ve bahsin katı. Fazla hamle hamle başına daha pahalıdır (bot sahibinin isteği).
export const PAKETLER = {
  15: { hamle: 15, kat: 1 },
  20: { hamle: 20, kat: 1.4 },
  30: { hamle: 30, kat: 2.1 },
}
// Aynı hamledeki n. patlamanın çarpanı; son basamaktan sonra sabit kalır.
export const KOMBO = [1, 2, 4, 8, 15, 25, 40, 60]
// Patlayan her şeker bahsin bu katını öder (kombo çarpanıyla).
export const HUCRE_DEGERI = 0.0022
// İki özel şeker birleşince ödenen ek ödül (bahsin katı): heyecan nadir büyük anlardan gelsin.
export const BIRLESIM_ODULU = { rr: 11, rb: 4.5, rh: 3, rv: 3, bb: 1.4, bc: 1, cc: 0.5, r: 0.25 }
// Bir elin en çok kazancı, bahsin katı olarak.
export const AZAMI_KAT = 200
// Giriş ücreti: REFERANS_KUR'daki XP, kurla büyür, paketin katıyla çarpılır; hazineye gider.
export const GIRIS_TABAN = 20_000
// Sahibin gizli şansı (`.şans`): yeni şekerin bu olasılıkla son rengi atlaması.
export const SAHIP_SANS = 0.75

const N = BOYUT * BOYUT
const satir = (i) => Math.floor(i / BOYUT)
const sutun = (i) => i % BOYUT
const renkOf = (h) => (h.o === 'r' ? -1 : h.r)

export const komsuMu = (i, j) => i >= 0 && j >= 0 && i < N && j < N && ((satir(i) === satir(j) && Math.abs(i - j) === 1) || Math.abs(i - j) === BOYUT)
export const komboCarpani = (n) => KOMBO[Math.min(n, KOMBO.length - 1)]
export const paketCoz = (secim) => (Object.hasOwn(PAKETLER, String(secim ?? '').trim()) ? PAKETLER[String(secim).trim()] : null)

// `sans` (sahibin gizli şansı): yeni şeker bu olasılıkla son rengi atlar, az renk daha çok eşleşme demektir.
const yeniSeker = (rnd, renkSayisi, sans = 0) => ({ r: sans && rnd(1000) < sans * 1000 ? rnd(renkSayisi - 1) : rnd(renkSayisi), o: '' })

/** Bu hücreden geçen yatay ya da dikey 3+ dizi var mı? */
function eslesirMi(t, i) {
  const renk = renkOf(t[i])
  if (renk < 0) return false
  const r = satir(i)
  const c = sutun(i)
  let sol = c
  while (sol > 0 && renkOf(t[r * BOYUT + sol - 1]) === renk) sol -= 1
  let sag = c
  while (sag < BOYUT - 1 && renkOf(t[r * BOYUT + sag + 1]) === renk) sag += 1
  if (sag - sol >= 2) return true
  let ust = r
  while (ust > 0 && renkOf(t[(ust - 1) * BOYUT + c]) === renk) ust -= 1
  let alt = r
  while (alt < BOYUT - 1 && renkOf(t[(alt + 1) * BOYUT + c]) === renk) alt += 1
  return alt - ust >= 2
}

/** Takas geçerli mi: eşleşme doğuruyor ya da iki özel şeker / gökkuşağı içeriyor. */
export function takasGecerli(t, i, j) {
  if (!komsuMu(i, j)) return false
  const a = t[i]
  const b = t[j]
  if (a.o === 'r' || b.o === 'r' || (a.o && b.o)) return true
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

/** Hamle kalmayınca şekerler (özeller dahil) yerinde karılır; eşleşmesiz ve hamleli olana kadar. */
export function karistir(t, rnd = randomInt, renkSayisi = RENKLER.length) {
  for (let deneme = 0; deneme < 100; deneme += 1) {
    const k = t.slice()
    for (let i = k.length - 1; i > 0; i -= 1) {
      const j = rnd(i + 1)
      ;[k[i], k[j]] = [k[j], k[i]]
    }
    if (!eslesmeVar(k) && hamleVar(k)) return k
  }
  return tahtaKur(rnd, renkSayisi)
}

/** Yatay ve dikey 3+ diziler. */
function kosular(t) {
  const liste = []
  for (const yon of ['h', 'v']) {
    for (let a = 0; a < BOYUT; a += 1) {
      let b = 0
      while (b < BOYUT) {
        const idx = (x) => (yon === 'h' ? a * BOYUT + x : x * BOYUT + a)
        const renk = renkOf(t[idx(b)])
        let e = b + 1
        if (renk >= 0) while (e < BOYUT && renkOf(t[idx(e)]) === renk) e += 1
        if (renk >= 0 && e - b >= 3) liste.push({ yon, renk, hucreler: Array.from({ length: e - b }, (_, x) => idx(b + x)) })
        b = renk >= 0 ? e : b + 1
      }
    }
  }
  return liste
}

/**
 * Kesişen diziler bir gruptur. Grubun doğuracağı özel: 5'li gökkuşağı, L/T bomba, 4'lü çizgili.
 * `tercih`: hamlede yer değiştiren hücreler; özel şeker oraya konur.
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
    const ozel = enUzun.hucreler.length >= 5 ? 'r' : yatay && dikey ? 'b' : enUzun.hucreler.length === 4 ? enUzun.yon : ''
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
const satirHucreleri = (r) => Array.from({ length: BOYUT }, (_, c) => r * BOYUT + c)
const sutunHucreleri = (c) => Array.from({ length: BOYUT }, (_, r) => r * BOYUT + c)

/** Tahtada en çok bulunan renk (gökkuşağı başka bir şeyle patlayınca onu temizler). */
function enCokRenk(t) {
  const sayim = Array(RENKLER.length).fill(0)
  for (const h of t) if (renkOf(h) >= 0) sayim[h.r] += 1
  return sayim.indexOf(Math.max(...sayim))
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
    const vurulan = h.o === 'h' ? satirHucreleri(satir(i))
      : h.o === 'v' ? sutunHucreleri(sutun(i))
        : h.o === 'b' ? kare(i, 1)
          : ((renk) => t.flatMap((x, j) => (renkOf(x) === renk ? [j] : [])))(enCokRenk(t))
    for (const j of vurulan) {
      if (sil.has(j)) continue
      sil.add(j)
      kuyruk.push(j)
    }
  }
  return { sil, etkin }
}

/** İki özel şeker (ya da gökkuşağı) yer değiştirince olan büyük patlama. Özel yoksa `null`. */
function birlesim(t, i, j, rnd) {
  const a = t[i]
  const b = t[j]
  const tuketilen = new Set([i, j])
  if (a.o === 'r' && b.o === 'r') return { temiz: new Set(t.map((_, x) => x)), tuketilen, tur: 'rr' }
  if (a.o === 'r' || b.o === 'r') {
    const [gok, diger] = a.o === 'r' ? [i, j] : [j, i]
    const renk = t[diger].r
    const hedefler = t.flatMap((x, x2) => (renkOf(x) === renk ? [x2] : []))
    const o = t[diger].o
    if (o) {
      // Gökkuşağı özelle birleşirse o renkteki bütün şekerler aynı özele döner ve patlar.
      for (const x of hedefler) if (x !== diger) t[x] = { r: renk, o: o === 'b' ? 'b' : rnd(2) ? 'h' : 'v' }
      return { temiz: new Set([gok, ...hedefler]), tuketilen: new Set([gok]), tur: `r${o}` }
    }
    return { temiz: new Set([gok, ...hedefler]), tuketilen, tur: 'r' }
  }
  if (!a.o || !b.o) return null
  const bomba = (a.o === 'b') + (b.o === 'b')
  const hucreler = bomba === 2 ? kare(j, 2)
    : bomba === 1 ? [-1, 0, 1].flatMap((d) => [...(satir(j) + d >= 0 && satir(j) + d < BOYUT ? satirHucreleri(satir(j) + d) : []), ...(sutun(j) + d >= 0 && sutun(j) + d < BOYUT ? sutunHucreleri(sutun(j) + d) : [])])
      : [...satirHucreleri(satir(j)), ...sutunHucreleri(sutun(j))]
  return { temiz: new Set([i, j, ...hucreler]), tuketilen, tur: bomba === 2 ? 'bb' : bomba ? 'bc' : 'cc' }
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

/** Tarayıcıya giden tahta: hücre başına iki harf (renk a-f ya da x, özel . h v b r). */
export const kodla = (t) => t.map((h) => (h.o === 'r' ? 'xr' : `${'abcdef'[h.r]}${h.o || '.'}`)).join('')
export const coz = (metin) => Array.from({ length: metin.length / 2 }, (_, i) => {
  const r = metin[i * 2]
  const o = metin[i * 2 + 1]
  return { r: r === 'x' ? -1 : 'abcdef'.indexOf(r), o: o === '.' ? '' : o }
})

/**
 * Tek hamle. Geçersiz takasta `null` (hamle harcanmaz). `kazanc` bahsin katıdır.
 * @returns {{ tahta, adimlar: object[], kazanc: number, karistirildi: boolean, birlesim: string } | null}
 *   `adimlar[i]`: { sil, olusan: [idx, özel, renk][], etkin: [idx, tür][], adet, carpan, kazanc, tahta }.
 */
export function hamleYap(tahta, i, j, { rnd = randomInt, renkSayisi = RENKLER.length, sans = 0 } = {}) {
  if (!takasGecerli(tahta, i, j)) return null
  const t = tahta.slice()
  ;[t[i], t[j]] = [t[j], t[i]]
  let ilk = birlesim(t, i, j, rnd)
  const tur = ilk?.tur ?? ''
  const adimlar = []
  let kazanc = BIRLESIM_ODULU[tur] ?? 0
  let tercih = [i, j]
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
      t[p] = { r: o === 'r' ? -1 : renk, o }
    }
    const carpan = komboCarpani(kombo)
    const adimKazanci = adet * HUCRE_DEGERI * carpan
    dusur(t, sil, rnd, renkSayisi, sans)
    adimlar.push({ sil: [...sil].sort((a, b) => a - b), olusan, etkin, adet, carpan, kazanc: adimKazanci, tahta: t.slice() })
    kazanc += adimKazanci
    tercih = []
  }
  let son = t
  const karistirildi = !hamleVar(t)
  if (karistirildi) son = karistir(t, rnd, renkSayisi)
  return { tahta: son, adimlar, kazanc, karistirildi, birlesim: tur }
}

/** Testteki "usta oyuncu": her hamlede görünen tahtada en çok kazandıran takası seçer. */
export function enIyiHamle(t, deneme = randomInt) {
  let enIyi = null
  for (const [i, j] of gecerliHamleler(t)) {
    const s = hamleYap(t, i, j, { rnd: deneme })
    if (!enIyi || s.kazanc > enIyi.kazanc) enIyi = { i, j, kazanc: s.kazanc }
  }
  return enIyi
}
