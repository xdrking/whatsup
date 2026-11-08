// .wordle: renk kuralı, günün kelimesi, ortak tahta ve hak sayacı.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { degerlendir, gununKelimesi, HAK, ODULLER, oduluHesapla } = await import('../games/wordle.js')
const { wordleDurumu, wordleKaydet } = await import('../lib/stats.js')

test('renkler: yerinde yeşil, yeri yanlış sarı, fazla tekrar siyah', () => {
  assert.equal(degerlendir('kalem', 'kalem'), '🟩🟩🟩🟩🟩')
  assert.equal(degerlendir('melak', 'kalem'), '🟨🟨🟩🟨🟨')
  // Hedefte bir "a" var: ilk "a" yerinde yeşil, ikinci "a" sarı olmaz.
  assert.equal(degerlendir('kaana', 'kalem'), '🟩🟩⬛⬛⬛')
  assert.equal(degerlendir('çiçek', 'çorba'), '🟩⬛⬛⬛⬛')
})

test('günün kelimesi: aynı gün aynı, gün değişince seçim değişebilir', () => {
  const liste = ['kalem', 'kitap', 'deniz', 'orman', 'nehir']
  assert.equal(gununKelimesi(liste, '2026-11-08'), gununKelimesi(liste, '2026-11-08'))
  const gunler = Array.from({ length: 30 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`)
  assert.ok(new Set(gunler.map((g) => gununKelimesi(liste, g))).size > 1)
})

test('hak: kişi başı sınırlı, ilk bilen günü kapatır, yeni gün sıfırlanır', () => {
  const chatJid = 'g@g.us'
  const gun = '2026-11-08'
  for (let i = 1; i <= HAK; i += 1) {
    assert.deepEqual(wordleKaydet({ chatJid, userJid: 'a', gun, dogru: false, hak: HAK }), { kabul: true, deneme: i, toplam: i })
  }
  assert.deepEqual(wordleKaydet({ chatJid, userJid: 'a', gun, dogru: true, hak: HAK }), { hakYok: true })

  assert.deepEqual(wordleKaydet({ chatJid, userJid: 'b', gun, dogru: true, hak: HAK }), { kabul: true, deneme: 1, toplam: HAK + 1 })
  // Bilenin mesajını kopyalayan kazanamaz: gün kapandı.
  assert.deepEqual(wordleKaydet({ chatJid, userJid: 'c', gun, dogru: true, hak: HAK }), { kapandi: 'b' })
  assert.deepEqual(wordleDurumu(chatJid, 'c', gun), { deneme: 0, toplam: HAK + 1, cozen: 'b' })

  assert.deepEqual(wordleDurumu(chatJid, 'a', '2026-11-09'), { deneme: 0, toplam: 0, cozen: null })
  assert.equal(wordleKaydet({ chatJid, userJid: 'c', gun: '2026-11-09', dogru: true, hak: HAK }).kabul, true)
  assert.equal(wordleKaydet({ chatJid: 'baska@g.us', userJid: 'c', gun: '2026-11-09', dogru: true, hak: HAK }).kabul, true)
})

test('ödül: toplam tahmin arttıkça azalır, tabanda durur', () => {
  assert.equal(oduluHesapla(1), ODULLER[0])
  assert.equal(oduluHesapla(50), ODULLER.at(-1))
})
