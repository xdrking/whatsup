// Faz 42 kumar oyunları: plinko, crash, hi-lo, ejderha kulesi, at yarışı.
// Her birinin beklenen dönüşü %90-100 arasında kalmalı: üstündeyse XP basılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  PLINKO_RISK, PLINKO_SIRA, plinkoAt, plinkoRiskCoz,
  CRASH_UZAY, crashHedefCoz, crashNoktasi, crashUc,
} = await import('../lib/kumar.js')
const { hiloCarpani, hiloSans, hiloTuttu, kartCek } = await import('../games/hilo.js')
const { KAT, kuleCarpani, kuleKur, ZORLUK, zorlukCoz } = await import('../games/kule.js')
const { ATLAR, atOrani, kazananSec } = await import('../games/yaris.js')

const aralikta = (ev, ad) => assert.ok(ev > 0.9 && ev < 1, `${ad}: beklenen dönüş ${ev}`)

test('plinko: her risk tablosu simetrik, beklenen dönüş %90-100', () => {
  const binom = [1]
  for (let i = 0; i < PLINKO_SIRA; i += 1) binom.push((binom[i] * (PLINKO_SIRA - i)) / (i + 1))
  for (const [risk, tablo] of Object.entries(PLINKO_RISK)) {
    assert.equal(tablo.length, PLINKO_SIRA + 1, risk)
    assert.deepEqual(tablo, [...tablo].reverse(), risk)
    aralikta(tablo.reduce((t, c, k) => t + (c * binom[k]) / 2 ** PLINKO_SIRA, 0), `plinko ${risk}`)
  }
  assert.equal(plinkoAt('yüksek', () => 1).carpan, 29)
  assert.equal(plinkoAt('düşük', (n) => 0 * n).kutu, 0)
  assert.equal(plinkoRiskCoz(undefined), 'orta')
  assert.equal(plinkoRiskCoz('YÜKSEK'), 'yüksek')
  assert.equal(plinkoRiskCoz('mavi'), null)
})

test('crash: hedef ayrıştırma ve her hedefte beklenen dönüş', () => {
  assert.equal(crashHedefCoz('2'), 2)
  assert.equal(crashHedefCoz('2,5x'), 2.5)
  assert.equal(crashHedefCoz('1'), null)
  assert.equal(crashHedefCoz('1001'), null)
  assert.equal(crashHedefCoz('abc'), null)

  // Patlama noktası r'nin azalan fonksiyonu: tutan r'ler 0'dan başlayan bir aralıktır, ikili arama yeter.
  for (const hedef of [1.01, 1.5, 2, 10, 100, 1000]) {
    let alt = 0
    let ust = CRASH_UZAY
    while (alt < ust) {
      const orta = Math.floor((alt + ust) / 2)
      if (crashNoktasi(() => orta) >= hedef) alt = orta + 1
      else ust = orta
    }
    aralikta((alt / CRASH_UZAY) * hedef, `crash ${hedef}x`)
  }
  assert.equal(crashUc(2, () => 0).carpan, 2)
  assert.equal(crashUc(2, () => CRASH_UZAY - 1).carpan, 0)
})

test('hi-lo: olasılıklar, uç kartlar ve her tahminin beklenen dönüşü', () => {
  assert.equal(hiloSans(1, 'yüksek'), 1)
  assert.equal(hiloCarpani(1, 'yüksek'), null)
  assert.equal(hiloCarpani(13, 'düşük'), null)
  assert.ok(hiloTuttu(7, 7, 'yüksek') && hiloTuttu(7, 7, 'düşük'))
  assert.ok(!hiloTuttu(7, 6, 'yüksek'))
  for (let s = 1; s <= 13; s += 1) {
    for (const yon of ['yüksek', 'düşük']) {
      const c = hiloCarpani(s, yon)
      if (c) aralikta(c * hiloSans(s, yon), `hi-lo ${s} ${yon}`)
    }
  }
  const k = kartCek(() => 12)
  assert.equal(k.sira, 13)
})

test('kule: her kat ve zorlukta beklenen dönüş, kat başına doğru sayıda ejderha', () => {
  assert.equal(zorlukCoz(undefined), 'orta')
  assert.equal(zorlukCoz('ZOR'), 'zor')
  assert.equal(zorlukCoz('uzman'), null)
  for (const [ad, z] of Object.entries(ZORLUK)) {
    assert.equal(kuleCarpani(ad, 0), 1)
    for (let kat = 1; kat <= KAT; kat += 1) {
      aralikta(kuleCarpani(ad, kat) * (z.yumurta / z.kutu) ** kat, `kule ${ad} ${kat}`)
    }
    const kule = kuleKur(ad)
    assert.equal(kule.length, KAT)
    assert.ok(kule.every((e) => e.size === z.kutu - z.yumurta && [...e].every((n) => n >= 1 && n <= z.kutu)))
  }
})

test('yarış: şanslar toplamı 100, her atın beklenen dönüşü aynı', () => {
  assert.equal(ATLAR.reduce((t, a) => t + a.sans, 0), 100)
  for (const at of ATLAR) aralikta((at.sans / 100) * atOrani(at), `yarış ${at.ad}`)
  assert.equal(kazananSec(() => 0), 0)
  assert.equal(kazananSec(() => 99), ATLAR.length - 1)
})

test('sahip şansı: kaybeden çekiliş yeniden atılır, kazanan dokunulmaz', async () => {
  const { sahipSansi, SAHIP_SANSI, SAHIP_CRASH_TABAN } = await import('../lib/kumar.js')
  const sirali = (...c) => { let i = 0; return () => ({ carpan: c[i++] }) }
  assert.equal(sahipSansi(sirali(2, 0), () => 0)().carpan, 2)
  assert.equal(sahipSansi(sirali(0, 2), () => 0)().carpan, 2)
  assert.equal(sahipSansi(sirali(0, 2), () => SAHIP_SANSI * 100)().carpan, 0)
  assert.equal(crashNoktasi(() => CRASH_UZAY - 1, SAHIP_CRASH_TABAN), SAHIP_CRASH_TABAN)
  assert.ok(crashNoktasi(() => 0, SAHIP_CRASH_TABAN) > SAHIP_CRASH_TABAN)
})
