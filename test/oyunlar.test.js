// Oyunların cevap ayrıştırma ve soru üretme mantığı (yerel, ağ yok).
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { secenekIndeksi } = await import('../games/quiz.js')
const { tahminDogruMu } = await import('../games/kimim.js')
const { soruUret } = await import('../games/duello.js')
const { emojiTahminDogruMu, kalip } = await import('../games/emoji.js')
const { tahminEt, maske } = await import('../games/adamasmaca.js')
const { SERI_SINIRI, seriIzinli, seriIlerlet } = await import('../games/kelime.js')

test('kelime: art arda 10 kelime, başkası yazınca sıfırlanır', () => {
  let seri = null
  for (let i = 0; i < SERI_SINIRI; i++) {
    assert.ok(seriIzinli(seri, 'a'))
    seri = seriIlerlet(seri, 'a')
  }
  assert.equal(seriIzinli(seri, 'a'), false)
  assert.ok(seriIzinli(seri, 'b'))
  seri = seriIlerlet(seri, 'b')
  assert.ok(seriIzinli(seri, 'a'))
  assert.deepEqual(seriIlerlet(seri, 'a'), { jid: 'a', adet: 1 })
})

test('quiz: harf, numara ve şık metni kabul edilir', () => {
  const secenekler = ['Ankara', 'İstanbul', '3,14', 'Ağrı Dağı']
  assert.equal(secenekIndeksi('a', secenekler), 0)
  assert.equal(secenekIndeksi('B)', secenekler), 1)
  assert.equal(secenekIndeksi('3', secenekler), 2)
  assert.equal(secenekIndeksi('3.14', secenekler), 2)
  assert.equal(secenekIndeksi('ağrı dağı', secenekler), 3)
  assert.equal(secenekIndeksi('istanbul', secenekler), 1)
})

test('quiz: anlaşılmayan cevap -1', () => {
  assert.equal(secenekIndeksi('selam', ['a', 'b']), -1)
  assert.equal(secenekIndeksi('4', ['a', 'b']), -1)
})

test('kimim: ad, soyad, Türkçe karaktersiz yazım', () => {
  assert.equal(tahminDogruMu('michael c hall', 'Michael C. Hall'), true)
  assert.equal(tahminDogruMu('hall', 'Michael C. Hall'), true)
  assert.equal(tahminDogruMu('sener sen', 'Şener Şen'), true)
  assert.equal(tahminDogruMu('besikcioglu', 'Erdal Beşikçioğlu'), true)
  assert.equal(tahminDogruMu('İYNEMLİ', 'Aras Bulut İynemli'), true)
})

test('kimim: alternatif cevaplar ve yabancı aksanlar', () => {
  assert.equal(tahminDogruMu('ronaldo', 'Ronaldo Nazário', ['Ronaldo', 'R9']), true)
  assert.equal(tahminDogruMu('nazario', 'Ronaldo Nazário'), true)
  assert.equal(tahminDogruMu('timothee chalamet', 'Timothée Chalamet'), true)
  assert.equal(tahminDogruMu('tayyip erdogan', 'Recep Tayyip Erdoğan', ['Tayyip Erdoğan']), true)
  // Alternatif yalnızca tam eşleşir; parçası kabul edilmez.
  assert.equal(tahminDogruMu('tay', 'Recep Tayyip Erdoğan', ['Tayyip']), false)
  assert.equal(tahminDogruMu('ronaldo', 'Ronaldo Nazário'), false)
})

test('kimim: kısaltma ve yalnız ad kabul edilmez', () => {
  assert.equal(tahminDogruMu('penn', 'Penn Badgley'), false)
  assert.equal(tahminDogruMu('şen', 'Şener Şen'), false)
  assert.equal(tahminDogruMu('erdo', 'Recep Tayyip Erdoğan'), false)
})

test('düello: soru metni ve cevap tutarlı, cevap pozitif tam sayı', () => {
  for (let i = 0; i < 200; i++) {
    const { metin, cevap } = soruUret()
    const [a, op, b] = metin.split(' ')
    const beklenen = { '+': (x, y) => x + y, '−': (x, y) => x - y, '×': (x, y) => x * y }[op](Number(a), Number(b))
    assert.equal(cevap, beklenen, metin)
    assert.ok(Number.isInteger(cevap) && cevap > 0, metin)
  }
})

test('emoji: adın tamamı, alternatifler ve Türkçe karaktersiz yazım', () => {
  assert.equal(emojiTahminDogruMu('kurtlar vadisi', 'Kurtlar Vadisi'), true)
  assert.equal(emojiTahminDogruMu('gora', 'G.O.R.A.', ['Gora']), true)
  assert.equal(emojiTahminDogruMu('lion king', 'Aslan Kral', ['Lion King']), true)
  assert.equal(emojiTahminDogruMu('vadisi', 'Kurtlar Vadisi'), false)
})

test('emoji: harf kalıbı noktalamayı korur, baş harf ipucu ilk harfi açar', () => {
  assert.equal(kalip('Kara Sevda'), '_ _ _ _   _ _ _ _ _')
  assert.equal(kalip('Kara Sevda', true), 'K _ _ _   S _ _ _ _')
  assert.equal(kalip('E.T.'), '_ . _ .')
})

test('adam asmaca: harf, tekrar, yanlış ve kelime tahmini', () => {
  const s = { kelime: 'kalem', tahminler: new Set(), yanlis: 0 }
  assert.equal(tahminEt(s, 'A'), 'dogru')
  assert.equal(tahminEt(s, 'a'), 'tekrar')
  assert.equal(tahminEt(s, 'z'), 'yanlis')
  assert.equal(s.yanlis, 1)
  assert.equal(maske(s.kelime, s.tahminler), '_ A _ _ _')
  assert.equal(tahminEt(s, 'iki kelime'), 'gecersiz')
  assert.equal(tahminEt(s, 'kalem'), 'kazandi')
})

test('adam asmaca: Türkçe büyük İ küçük i sayılır, 6 yanlışta oyun biter', () => {
  const s = { kelime: 'işçi', tahminler: new Set(), yanlis: 0 }
  assert.equal(tahminEt(s, 'İ'), 'dogru')
  for (const h of ['a', 'b', 'd', 'e', 'f']) assert.equal(tahminEt(s, h), 'yanlis')
  assert.equal(tahminEt(s, 'g'), 'kaybetti')
})

test('karışık: harfler korunur, kelimenin kendisi çıkmaz', async () => {
  const { harfleriKaristir } = await import('../games/karisik.js')
  for (let i = 0; i < 50; i += 1) {
    const k = harfleriKaristir('kalem')
    assert.notEqual(k, 'kalem')
    assert.equal([...k].sort().join(''), [...'kalem'].sort().join(''))
  }
})

test('sayı oyunu: hedef aralıkta, verilmeyen ya da fazla sayı reddedilir', async () => {
  const { bulmacaUret, islemDenetle } = await import('../games/sayioyunu.js')

  for (let i = 0; i < 200; i += 1) {
    const { sayilar, hedef } = bulmacaUret()
    assert.equal(sayilar.length, 5)
    assert.ok(hedef >= 50 && hedef <= 999)
  }

  const sayilar = [25, 5, 3, 3, 1]
  assert.deepEqual(islemDenetle('(25 + 5) * 3', sayilar), { gecerli: true, sonuc: 90 })
  assert.deepEqual(islemDenetle('3 x 3 + 1', sayilar), { gecerli: true, sonuc: 10 })
  assert.equal(islemDenetle('25 * 5 * 5', sayilar).gecerli, false)
  assert.equal(islemDenetle('7 + 1', sayilar).gecerli, false)
  assert.equal(islemDenetle('25', sayilar).gecerli, false)
  assert.equal(islemDenetle('5 ^ 3', sayilar).gecerli, false)
  assert.equal(islemDenetle('5 / (3 - 3)', sayilar).gecerli, false)
  assert.equal(islemDenetle('merhaba', sayilar).gecerli, false)
})
