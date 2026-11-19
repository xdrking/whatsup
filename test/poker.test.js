// .poker: el değerlendirme, yan potlar, bahis akışı ve çip korunumu. Soket gerekmez.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  elBaslat, elDegeri, eliIadeEt, gorme, hamle, karsilastir, masaKur, masadakiler, potlar, toplamCip,
} = await import('../lib/poker.js')
const { getStats, pokerKalk, xpAyarla, xpCek } = await import('../lib/stats.js')

const k = (s) => {
  const r = s.at(-1)
  const d = { J: 11, Q: 12, K: 13, A: 14 }[s.slice(0, -1)] ?? Number(s.slice(0, -1))
  return { d, r }
}
const el = (s) => elDegeri(s.split(' ').map(k))

test('el kategorileri doğru sıralanır', () => {
  const sira = [
    '2♠ 7♥ 9♦ J♣ K♠ 3♦ 4♣',
    '2♠ 2♥ 9♦ J♣ K♠ 3♦ 4♣',
    '2♠ 2♥ 9♦ 9♣ K♠ 3♦ 4♣',
    '2♠ 2♥ 2♦ 9♣ K♠ 3♦ 4♣',
    'A♠ 2♥ 3♦ 4♣ 5♠ 9♦ J♣',
    '2♥ 7♥ 9♥ J♥ K♥ 3♦ 4♣',
    '2♠ 2♥ 2♦ 9♣ 9♠ 3♦ 4♣',
    '2♠ 2♥ 2♦ 2♣ 9♠ 3♦ 4♣',
    '5♥ 6♥ 7♥ 8♥ 9♥ 2♦ 2♣',
  ]
  const adlar = ['Yüksek kart', 'Per', 'Döper', 'Üçlü', 'Kent', 'Renk', 'Full ev', 'Kare', 'Floş']
  for (let i = 0; i < adlar.length; i++) assert.equal(el(sira[i]).ad, adlar[i], sira[i])
  for (let i = 1; i < adlar.length; i++) assert.ok(karsilastir(el(sira[i]).deger, el(sira[i - 1]).deger) > 0)
  assert.equal(el('10♠ J♠ Q♠ K♠ A♠ 2♦ 3♣').ad, 'Royal floş')
})

test('eşitlik bozucular: kicker, as küçük kent, büyük kent', () => {
  assert.ok(karsilastir(el('A♠ A♥ K♦ 7♣ 5♠').deger, el('A♦ A♣ Q♦ J♣ 9♠').deger) > 0)
  assert.ok(karsilastir(el('2♠ 3♥ 4♦ 5♣ 6♠').deger, el('A♠ 2♥ 3♦ 4♣ 5♠').deger) > 0)
  assert.equal(karsilastir(el('A♠ K♥ Q♦ J♣ 10♠').deger, el('A♦ K♣ Q♥ J♠ 10♦').deger), 0)
  assert.ok(karsilastir(el('K♠ K♥ K♦ 2♣ 2♠').deger, el('Q♠ Q♥ Q♦ A♣ A♠').deger) > 0)
})

test('yan potlar katkı seviyelerine bölünür, çekilenin parası pota kalır', () => {
  const p = potlar([
    { katki: 100, cekildi: false },
    { katki: 300, cekildi: false },
    { katki: 300, cekildi: false },
    { katki: 50, cekildi: true },
  ])
  assert.deepEqual(p, [{ miktar: 350, hak: [0, 1, 2] }, { miktar: 400, hak: [1, 2] }])
  assert.deepEqual(potlar([{ katki: 500, cekildi: false }, { katki: 200, cekildi: false }]), [
    { miktar: 400, hak: [0, 1] }, { miktar: 300, hak: [0] },
  ])
})

const oyuncular = (n) => Array.from({ length: n }, (_, i) => ({ jid: `p${i}@s`, pn: `p${i}@s` }))

test('herkes çekilince pot kalan kişiye gider, körler doğru alınır', () => {
  const masa = masaKur({ oyuncular: oyuncular(3), giris: 1000 })
  assert.equal(masa.kucuk, 10)
  elBaslat(masa, () => 0)
  assert.equal(masa.dealer, 0)
  assert.equal(masa.oyuncular[1].tur, 10)
  assert.equal(masa.oyuncular[2].tur, 20)
  assert.equal(masa.sira, 0, 'üç kişide ilk konuşan büyük körden sonraki')
  assert.equal(gorme(masa), 20)
  assert.match(hamle(masa, 'pas').hata, /Pas geçemezsin/)
  assert.match(hamle(masa, 'artir', 5).hata, /En az 20/)
  hamle(masa, 'artir', 100)
  assert.equal(masa.enYuksek, 120)
  hamle(masa, 'cekil')
  hamle(masa, 'cekil')
  assert.equal(masa.faz, 'bitti')
  assert.equal(masa.sonuc.showdown, false)
  assert.deepEqual(masa.oyuncular.map((o) => o.stack), [1030, 990, 980])
})

test('iki kişide dealer küçük kördür, büyük kör preflop son konuşur, flopta önce konuşur', () => {
  const masa = masaKur({ oyuncular: oyuncular(2), giris: 1000 })
  elBaslat(masa, () => 0)
  assert.equal(masa.kucukKor, masa.dealer)
  assert.equal(masa.sira, masa.dealer)
  hamle(masa, 'gor')
  assert.equal(masa.faz, 'preflop', 'büyük körün hakkı var')
  assert.equal(masa.sira, masa.buyukKor)
  hamle(masa, 'pas')
  assert.equal(masa.faz, 'flop')
  assert.equal(masa.board.length, 3)
  assert.equal(masa.sira, masa.buyukKor)
})

test('hepsi ve görme: kartlar sona kadar açılır, showdown olur', () => {
  const masa = masaKur({ oyuncular: oyuncular(2), giris: 1000 })
  elBaslat(masa, () => 0)
  hamle(masa, 'hepsi')
  hamle(masa, 'gor')
  assert.equal(masa.faz, 'bitti')
  assert.equal(masa.board.length, 5)
  assert.equal(masa.sonuc.showdown, true)
  assert.equal(toplamCip(masa), 2000)
})

test('elin ortasında iade toplam çipi korur', () => {
  const masa = masaKur({ oyuncular: oyuncular(4), giris: 500 })
  elBaslat(masa, () => 0)
  hamle(masa, 'artir', 100)
  eliIadeEt(masa)
  assert.deepEqual(masa.oyuncular.map((o) => o.stack), [500, 500, 500, 500])
})

test('binlerce rastgele elde çip korunur, eksiye düşen olmaz, el hep biter', () => {
  let tohum = 12345
  const rnd = (n) => {
    tohum = (tohum * 1103515245 + 12345) % 2 ** 31
    return tohum % n
  }
  for (let masaNo = 0; masaNo < 150; masaNo++) {
    const n = 2 + rnd(7)
    const masa = masaKur({ oyuncular: oyuncular(n), giris: 100 + rnd(5000) })
    const toplam = toplamCip(masa)
    for (let e = 0; e < 40 && elBaslat(masa, rnd); e++) {
      for (let adim = 0; masa.faz !== 'bitti'; adim++) {
        assert.ok(adim < 500, 'el bitmedi')
        const o = masa.oyuncular[masa.sira]
        const secim = rnd(10)
        let sonuc
        if (secim < 2) sonuc = hamle(masa, 'cekil')
        else if (secim < 6) sonuc = hamle(masa, 'gor')
        else if (secim < 7) sonuc = hamle(masa, 'hepsi')
        else sonuc = hamle(masa, 'artir', masa.sonArtis + rnd(Math.max(1, o.stack)))
        if (sonuc.hata) hamle(masa, 'gor')
        assert.equal(toplamCip(masa), toplam)
      }
      assert.ok(masa.oyuncular.every((o) => o.stack >= 0))
      const kazanc = [...masa.sonuc.kazanc.values()].reduce((t, x) => t + x, 0)
      assert.equal(kazanc, masa.sonuc.potlar.reduce((t, p) => t + p.miktar, 0))
    }
    assert.ok(masadakiler(masa).length >= 1)
  }
})

test('pokerKalk çipi cüzdana yazar, karneye neti işler', () => {
  const chatJid = 'pk@g.us'
  xpAyarla({ chatJid, userJid: 'a@s', miktar: 5000 })
  xpCek({ chatJid, userJid: 'a@s', miktar: 1000 })
  assert.equal(getStats(chatJid, 'a@s').xp, 4000)
  const r = pokerKalk({ chatJid, userJid: 'a@s', giris: 1000, kalan: 2500 })
  assert.equal(r.fark, 1500)
  assert.equal(getStats(chatJid, 'a@s').xp, 6500)
})
