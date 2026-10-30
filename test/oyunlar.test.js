// Oyunların cevap ayrıştırma ve soru üretme mantığı (yerel, ağ yok).
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { secenekIndeksi } = await import('../games/quiz.js')
const { tahminDogruMu } = await import('../games/kimim.js')
const { soruUret } = await import('../games/duello.js')

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
