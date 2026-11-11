// XP kumar oyunları: miktar ayrıştırma, oyun çarpanları, bakiye kontrolü.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  miktarCoz, argumanlariAyir, yaziTura, slotCarpani, SEMBOLLER, IKILI_CARPAN,
  ruletSecimCoz, ruletCarpani, renk,
} = await import('../lib/kumar.js')
const { addXp, bahisOyna, getStats } = await import('../lib/stats.js')

test('miktar: sayı, hepsi, yarısı; sınırlar', () => {
  assert.deepEqual(miktarCoz('50', 100), { miktar: 50 })
  assert.deepEqual(miktarCoz('HEPSİ', 100), { miktar: 100 })
  assert.deepEqual(miktarCoz('yarısı', 101), { miktar: 50 })
  assert.ok(miktarCoz('5', 100).hata)
  assert.ok(miktarCoz('200', 100).hata)
  assert.ok(miktarCoz('hepsi', 3).hata)
  assert.ok(miktarCoz(undefined, 100).hata)
  assert.ok(miktarCoz('-10', 100).hata)
})

test('argümanlar: sıra serbest, iki sayıda ilki miktar', () => {
  assert.deepEqual(argumanlariAyir(['tura', '100']), { miktar: '100', secim: 'tura' })
  assert.deepEqual(argumanlariAyir(['100', '17']), { miktar: '100', secim: '17' })
  assert.deepEqual(argumanlariAyir(['hepsi']), { miktar: 'hepsi', secim: null })
})

test('yazı tura: bilen 2x, bilemeyen 0', () => {
  assert.equal(yaziTura('Yazı', () => 0).carpan, 2)
  assert.equal(yaziTura('Tura', () => 0).carpan, 0)
})

test('slot: üçlü, ikili, boş; beklenen dönüş %90-100 arası', () => {
  const [kiraz, limon, , , , elmas] = SEMBOLLER
  assert.equal(slotCarpani([elmas, elmas, elmas]), 50)
  assert.equal(slotCarpani([kiraz, limon, kiraz]), IKILI_CARPAN)
  assert.equal(slotCarpani([kiraz, limon, elmas]), 0)

  const toplam = SEMBOLLER.reduce((t, x) => t + x.agirlik, 0)
  let ev = 0
  for (const a of SEMBOLLER) for (const b of SEMBOLLER) for (const c of SEMBOLLER) {
    ev += ((a.agirlik * b.agirlik * c.agirlik) / toplam ** 3) * slotCarpani([a, b, c])
  }
  assert.ok(ev > 0.9 && ev < 1, `beklenen dönüş ${ev}`)
})

test('rulet: renkler, sıfır, sayı bahsi', () => {
  assert.equal(renk(0), 'yeşil')
  assert.equal(renk(1), 'kırmızı')
  assert.equal(renk(2), 'siyah')
  assert.equal(ruletCarpani(ruletSecimCoz('KIRMIZI'), 3), 2)
  assert.equal(ruletCarpani(ruletSecimCoz('siyah'), 3), 0)
  assert.equal(ruletCarpani(ruletSecimCoz('çift'), 0), 0)
  assert.equal(ruletCarpani(ruletSecimCoz('tek'), 7), 2)
  assert.equal(ruletCarpani(ruletSecimCoz('17'), 17), 36)
  assert.equal(ruletSecimCoz('37'), null)
  assert.equal(ruletSecimCoz('mavi'), null)
})

test('bahisOyna: yetersiz XP çekiliş yapmaz, kazanç ve kayıp yazılır', () => {
  const chatJid = 'g@g.us'
  const userJid = 'u@s.whatsapp.net'
  addXp({ chatJid, userJid, amount: 100 })
  // Günlük kumar tavanı piyasanın %50'si: piyasa küçük kalırsa kazanç kırpılırdı.
  addXp({ chatJid, userJid: 'zengin@s.whatsapp.net', amount: 1_000_000 })

  let cekildi = false
  const yok = bahisOyna({ chatJid, userJid, miktar: 150, cevir: () => { cekildi = true; return { carpan: 2 } } })
  assert.equal(yok.yetersiz, true)
  assert.equal(cekildi, false)

  assert.equal(bahisOyna({ chatJid, userJid, miktar: 50, cevir: () => ({ carpan: 2 }) }).xp, 150)
  assert.equal(bahisOyna({ chatJid, userJid, miktar: 30, cevir: () => ({ carpan: 1.5 }) }).fark, 15)
  assert.equal(bahisOyna({ chatJid, userJid, miktar: 165, cevir: () => ({ carpan: 0 }) }).xp, 0)
  assert.equal(getStats(chatJid, userJid).xp, 0)
})
