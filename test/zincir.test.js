// Şeker Zinciri: eşleşme, özel şekerler, takas, beklenen dönüş ve panelde giriş ücreti.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  AZAMI_KAT, BOYUT, coz, enIyiHamle, gecerliHamleler, gruplar, hamleYap, kodla, PAKETLER, tahtaKur,
} = await import('../lib/zincir.js')
const { getDb } = await import('../lib/db.js')
const { bankaDurumu, getStats, xpAyarla } = await import('../lib/stats.js')
const { kumarMotoru, zincirGirisi } = await import('../panel/kumar.js')

/** Tohumlu rastgele (mulberry32): sonuç her çalıştırmada aynı. */
function tohumlu(tohum) {
  let a = tohum >>> 0
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

// Eşleşmesiz dolgu: yatayda renk bir, dikeyde iki artar, yan yana iki aynı renk hiç gelmez.
const dolgu = () => Array.from({ length: BOYUT * BOYUT }, (_, i) => ({ r: (i % BOYUT + 2 * Math.floor(i / BOYUT)) % 6, o: '' }))
const yer = (satir, sutun) => satir * BOYUT + sutun
// 9 dolguda olmayan bir renktir: dizi tam istenen uzunlukta kalır.
const X = 9

test('dolgu eşleşmesizdir, tahtaKur eşleşmesiz ve hamleli kurar', () => {
  assert.equal(gruplar(dolgu()).length, 0)
  for (let s = 1; s <= 40; s += 1) {
    const t = tahtaKur(tohumlu(s))
    assert.equal(gruplar(t).length, 0, `tohum ${s}`)
    assert.ok(gecerliHamleler(t).length > 0, `tohum ${s}`)
  }
})

test('4\'lü çizgili, L bomba, 5\'li gökkuşağı doğurur', () => {
  const yatay = dolgu()
  for (let c = 0; c < 4; c += 1) yatay[yer(7, c)] = { r: X, o: '' }
  assert.equal(gruplar(yatay)[0].ozel, 'h')

  const dikey = dolgu()
  for (let r = 2; r < 6; r += 1) dikey[yer(r, 3)] = { r: X, o: '' }
  assert.equal(gruplar(dikey)[0].ozel, 'v')

  const l = dolgu()
  for (const i of [yer(5, 0), yer(6, 0), yer(7, 0), yer(7, 1), yer(7, 2)]) l[i] = { r: X, o: '' }
  const g = gruplar(l)
  assert.equal(g.length, 1)
  assert.equal(g[0].ozel, 'b')
  assert.equal(g[0].pivot, yer(7, 0))

  const bes = dolgu()
  for (let c = 1; c < 6; c += 1) bes[yer(4, c)] = { r: X, o: '' }
  assert.equal(gruplar(bes)[0].ozel, 'r')
})

test('takas: patlatmayan takas geçersizdir, eşleşen takas özel şekeri yerinde bırakır', () => {
  const t = dolgu()
  assert.equal(hamleYap(t, 0, 1, { rnd: tohumlu(1) }), null)
  assert.equal(hamleYap(t, 0, 9, { rnd: tohumlu(1) }), null, 'çapraz komşu değildir')
  assert.equal(hamleYap(t, 7, 8, { rnd: tohumlu(1) }), null, 'satır sonu ile sonraki satır başı komşu değildir')

  for (const i of [yer(7, 0), yer(7, 1), yer(6, 2), yer(7, 3)]) t[i] = { r: X, o: '' }
  const s = hamleYap(t, yer(6, 2), yer(7, 2), { rnd: tohumlu(2) })
  assert.ok(s)
  assert.deepEqual(s.adimlar[0].olusan, [[yer(7, 2), 'h', X]])
  assert.equal(s.adimlar[0].adet, 4)
  assert.ok(Math.abs(s.adimlar[0].kazanc - 4 * 0.0022) < 1e-9)
  // Özel şeker yerinde kalır (son tahta, hamle kalmadıysa karılmış olabilir).
  assert.deepEqual(s.adimlar[0].tahta[yer(7, 2)], { r: X, o: 'h' })
  assert.equal(s.tahta.length, BOYUT * BOYUT)
  assert.equal(t[yer(6, 2)].r, X, 'asıl tahta değişmez')
})

test('gökkuşağı takas edildiği rengin hepsini, çizgili satırı temizler', () => {
  const t = dolgu()
  t[0] = { r: -1, o: 'r' }
  for (const i of [1, 20, 45]) t[i] = { r: X, o: '' }
  const s = hamleYap(t, 0, 1, { rnd: tohumlu(3) })
  assert.equal(s.birlesim, 'r')
  for (const i of [0, 1, 20, 45]) assert.ok(s.adimlar[0].sil.includes(i), `${i} silinmeli`)

  const c = dolgu()
  c[yer(3, 5)] = { r: c[yer(3, 5)].r, o: 'h' }
  c[yer(3, 6)] = { r: c[yer(3, 6)].r, o: 'v' }
  const s2 = hamleYap(c, yer(3, 5), yer(3, 6), { rnd: tohumlu(4) })
  assert.equal(s2.birlesim, 'cc')
  const sil = new Set(s2.adimlar[0].sil)
  // Patlama çizgili şekerin gittiği hücreden yayılır: 3. satır ve 6. sütun.
  for (let k = 0; k < BOYUT; k += 1) {
    assert.ok(sil.has(yer(3, k)), 'satır')
    assert.ok(sil.has(yer(k, 6)), 'sütun')
  }
})

test('tarayıcı kodu gidip gelir', () => {
  const t = tahtaKur(tohumlu(5))
  t[3] = { r: -1, o: 'r' }
  t[4] = { r: 2, o: 'b' }
  assert.deepEqual(coz(kodla(t)), t)
  assert.equal(kodla(t).length, BOYUT * BOYUT * 2)
})

/** `usta`: her hamlede görünen tahtada en çok kazandıran takas; değilse rastgele geçerli takas. */
function oyna(paket, usta, adet, tohum) {
  const gercek = tohumlu(tohum)
  const deneme = tohumlu(tohum + 1000)
  let toplam = 0
  for (let g = 0; g < adet; g += 1) {
    let t = tahtaKur(gercek)
    let kazanc = 0
    for (let m = 0; m < PAKETLER[paket].hamle; m += 1) {
      let i
      let j
      if (usta) ({ i, j } = enIyiHamle(t, deneme))
      else {
        const l = gecerliHamleler(t)
        ;[i, j] = l[gercek(l.length)]
      }
      const s = hamleYap(t, i, j, { rnd: gercek })
      t = s.tahta
      kazanc += s.kazanc
    }
    toplam += Math.min(kazanc, AZAMI_KAT)
  }
  return toplam / adet / PAKETLER[paket].kat
}

test('beklenen dönüş: en iyi hamleyi bulan bot bile paket fiyatını geçemez', () => {
  const usta = oyna(15, true, 400, 7)
  assert.ok(usta > 0.85 && usta < 1, `usta 15 hamle: ${usta}`)
  const rastgele = oyna(15, false, 1000, 8)
  assert.ok(rastgele > 0.25 && rastgele < usta, `rastgele: ${rastgele}`)
  // Fazla hamle hamle başına daha pahalıdır: büyük paketin dönüşü 15'likten yüksek olmaz.
  for (const paket of [20, 30]) {
    const r = oyna(paket, true, 200, 9)
    assert.ok(r < 1 && r <= usta + 0.03, `usta ${paket} hamle: ${r}`)
  }
})

test('panel: paket bahsin katı, giriş ücreti hazineye, erken bitirme o ana kadarkini öder', () => {
  const GRUP = 'z@g.us'
  const UYE = 'zuye@lid'
  const BOT = 'bot@s.whatsapp.net'
  getDb().prepare("INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES ('bot_jid', ?)").run(BOT)
  xpAyarla({ chatJid: GRUP, userJid: UYE, miktar: 1_000_000 })
  let zaman = 1_000_000
  const m = kumarMotoru({ saat: () => zaman })
  const kim = { chat: GRUP, user: UYE }
  const giris = zincirGirisi(GRUP, PAKETLER[30])
  assert.ok(giris >= 1000)

  m.basla(kim, { oyun: 'zincir', miktar: '1000', secim: '25' })
  assert.match(m.durum(kim).sonuc.hata, /Paket seç/)

  zaman += 1000
  const kasa = bankaDurumu({ chatJid: GRUP, userJid: BOT, now: zaman })?.bakiye ?? 0
  m.basla(kim, { oyun: 'zincir', miktar: '10000', secim: '30' })
  const d = m.durum(kim)
  assert.equal(d.el.oyun, 'zincir')
  assert.equal(d.el.bahis, 21_000)
  assert.equal(d.el.kalan, 30)
  assert.equal(getStats(GRUP, UYE).xp, 1_000_000 - 21_000 - giris)
  assert.equal((bankaDurumu({ chatJid: GRUP, userJid: BOT, now: zaman })?.bakiye ?? 0) - kasa, giris)

  // Geçersiz takas hamle harcamaz.
  zaman += 1000
  const t = coz(d.el.tahta)
  let gecersiz = null
  for (let i = 0; i < BOYUT * BOYUT - 1 && !gecersiz; i += 1) if ((i + 1) % BOYUT && !gecerliHamleler(t).some(([a, b]) => a === i && b === i + 1)) gecersiz = `${i}-${i + 1}`
  assert.equal(m.hamle(kim, { hamle: gecersiz, oyun: 'zincir' }).gecersiz, true)
  assert.equal(m.durum(kim).el.kalan, 30)

  zaman += 1000
  const [i, j] = gecerliHamleler(t)[0]
  const r = m.hamle(kim, { hamle: `${i}-${j}`, oyun: 'zincir' })
  assert.equal(r.kalan, 29)
  assert.ok(r.adimlar.length >= 1 && r.xp > 0)

  zaman += 100
  assert.equal(m.hamle(kim, { hamle: '0-1', oyun: 'zincir' }).bekle, true, 'çok hızlı hamle beklenir')
  assert.equal(m.hamle(kim, { hamle: 'bitir', oyun: 'mayın' }).hata, 'Açık başka bir elin var.')

  zaman += 1000
  const once = getStats(GRUP, UYE).xp
  m.hamle(kim, { hamle: 'bitir', oyun: 'zincir' })
  const s = m.durum(kim).sonuc
  assert.equal(s.el.kalan, 29)
  assert.equal(getStats(GRUP, UYE).xp - once, r.xp)
  assert.equal(s.fark, r.xp - 21_000)
})

test('sahip şansı: yeni şekerler son rengi atlar', () => {
  const t = dolgu()
  for (const i of [yer(7, 0), yer(7, 1), yer(6, 2), yer(7, 3)]) t[i] = { r: X, o: '' }
  const s = hamleYap(t, yer(6, 2), yer(7, 2), { rnd: tohumlu(11), sans: 1 })
  // Patlayan dört hücrenin yerine üstten gelenler: dolgudaki sütunların tepesi yenidir.
  const yeniler = [yer(0, 0), yer(0, 1), yer(0, 3)].map((i) => s.adimlar[0].tahta[i].r)
  assert.ok(yeniler.every((r) => r !== 5), String(yeniler))
})
