// `.pet`: zamanla azalan değerler, kaçma, besleme, oyun ve hediye akışı.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  adTemizle, durum, HEDIYE_BEKLEME_MS, kactiMi, KACMA_MS, OYUN_BEKLEME_MS, SAAT_MS, seviye, turBul, AZAMI_SEVIYE,
} = await import('../lib/pet.js')
const { getStats, petBesle, petBirak, petHediye, petOku, petOyna, petSahiplen, xpAyarla } = await import('../lib/stats.js')

test('pet: tür ve ad', () => {
  assert.equal(turBul('Köpek'), 'kopek')
  assert.equal(turBul('EJDERHA'), 'ejderha')
  assert.equal(turBul('zürafa'), null)
  assert.equal(adTemizle('  *Pa\nmuk*  '), 'Pa muk')
  assert.equal(adTemizle('a'.repeat(50)).length, 20)
})

test('pet: değerler saatle azalır, sıfırda durur; seviye tavanlı', () => {
  const pet = { tokluk: 80, mutluluk: 60, guncelleme: 0 }
  assert.deepEqual(durum(pet, 10 * SAAT_MS), { tokluk: 40, mutluluk: 30 })
  assert.deepEqual(durum(pet, 100 * SAAT_MS), { tokluk: 0, mutluluk: 0 })
  assert.equal(seviye(0), 0)
  assert.equal(seviye(10 ** 9), AZAMI_SEVIYE)
})

test('pet: tokluk bittikten 48 saat sonra kaçar', () => {
  const pet = { tokluk: 40, mutluluk: 50, guncelleme: 0 }
  const acKaldigi = 10 * SAAT_MS
  assert.equal(kactiMi(pet, acKaldigi + KACMA_MS - 1), false)
  assert.equal(kactiMi(pet, acKaldigi + KACMA_MS), true)
})

test('pet: sahiplen, besle, oyna, hediye, kaçma', () => {
  const ortak = { chatJid: 'g@g.us', userJid: 'u@s.whatsapp.net' }
  let now = 1_000_000

  assert.ok(petOku({ ...ortak, now }).yok)
  assert.ok(petSahiplen({ ...ortak, tur: 'kedi', ad: 'Pamuk', now }).yetersiz)

  xpAyarla({ ...ortak, miktar: 100_000_000 })
  const al = petSahiplen({ ...ortak, tur: 'kedi', ad: 'Pamuk', now })
  assert.ok(al.pet)
  assert.equal(getStats(ortak.chatJid, ortak.userJid).xp, 100_000_000 - al.fiyat)
  assert.ok(petSahiplen({ ...ortak, tur: 'kopek', ad: 'Karabaş', now }).zatenVar)

  // 80 tokluk: tok sayılır, mama alınmaz.
  assert.ok(petBesle({ ...ortak, now }).tok)
  now += 10 * SAAT_MS
  const besle = petBesle({ ...ortak, now })
  assert.equal(besle.pet.tokluk, 80)
  assert.equal(besle.pet.pet_xp, 10)

  assert.ok(petOyna({ ...ortak, now }).pet)
  assert.ok(petOyna({ ...ortak, now: now + OYUN_BEKLEME_MS - 1 }).bekle)

  const xpOnce = getStats(ortak.chatJid, ortak.userJid).xp
  const hediye = petHediye({ ...ortak, now })
  assert.ok(hediye.xp > 0)
  assert.equal(getStats(ortak.chatJid, ortak.userJid).xp, xpOnce + hediye.xp)
  assert.ok(petHediye({ ...ortak, now: now + HEDIYE_BEKLEME_MS - 1 }).bekle)

  // 80 tokluk 20 saatte biter, 48 saat sonra kaçar ve satır silinir.
  now += 20 * SAAT_MS + KACMA_MS
  assert.ok(petOku({ ...ortak, now }).kacti)
  assert.ok(petOku({ ...ortak, now }).yok)

  petSahiplen({ ...ortak, tur: 'kus', ad: 'Maviş', now })
  assert.ok(petBirak({ ...ortak, now }).pet)
  assert.ok(petOku({ ...ortak, now }).yok)
})
