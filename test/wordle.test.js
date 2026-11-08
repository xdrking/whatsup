// .wordle: renk kuralı, günün kelimesi ve hak sayacı.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { degerlendir, gununKelimesi, HAK } = await import('../games/wordle.js')
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

test('hak: 6 yanlıştan sonra kabul edilmez, çözülen gün kapanır, yeni gün sıfırlanır', () => {
  const chatJid = 'g@g.us'
  const userJid = 'w@s.whatsapp.net'
  for (let i = 1; i <= HAK; i += 1) {
    assert.deepEqual(wordleKaydet({ chatJid, userJid, gun: '2026-11-08', dogru: false, hak: HAK }), { kabul: true, deneme: i, cozuldu: false })
  }
  assert.equal(wordleKaydet({ chatJid, userJid, gun: '2026-11-08', dogru: true, hak: HAK }).kabul, false)

  assert.equal(wordleDurumu(chatJid, userJid, '2026-11-09').deneme, 0)
  assert.equal(wordleKaydet({ chatJid, userJid, gun: '2026-11-09', dogru: true, hak: HAK }).cozuldu, true)
  assert.equal(wordleKaydet({ chatJid, userJid, gun: '2026-11-09', dogru: false, hak: HAK }).kabul, false)
  assert.deepEqual(wordleDurumu(chatJid, userJid, '2026-11-09'), { deneme: 1, cozuldu: true, cozenler: 1 })
})
