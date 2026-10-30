// Ağ, soket ve veritabanı gerektirmeyen saf fonksiyonların testleri.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'

const { calculate, CalcError } = await import('../lib/calc.js')
const { checkCooldown } = await import('../lib/cooldown.js')
const { lastLetter, trLower } = await import('../lib/turkishWords.js')
const { fnv1a } = await import('../lib/hash.js')

test('hesap: işlem önceliği, üs ve parantez', () => {
  assert.equal(calculate('2 + 3 * 4'), 14)
  assert.equal(calculate('(2 + 3) * 4'), 20)
  assert.equal(calculate('2^3^2'), 512)
  assert.equal(calculate('-(2+3)'), -5)
  assert.equal(calculate('17 % 5'), 2)
})

test('hesap: Türkçe yazımlar', () => {
  assert.equal(calculate('3,5 x 2'), 7)
  assert.equal(calculate('10 : 4'), 2.5)
  assert.equal(calculate('6 × 7'), 42)
  assert.equal(calculate('9 ÷ 3'), 3)
})

test('hesap: hatalı ve tehlikeli girdi kod olarak çalışmaz', () => {
  for (const girdi of ['1/0', '2+', '(1+2', 'alert(1)', 'process.exit()', '1.2.3', '']) {
    assert.throws(() => calculate(girdi), CalcError, girdi)
  }
})

test('bekleme süresi: ikinci deneme reddedilir, tek uyarı verilir', () => {
  const command = { name: 'deneme', cooldown: 5 }
  const now = 1_000_000

  assert.equal(checkCooldown({ userJid: 'a', command, now }).ok, true)

  const ikinci = checkCooldown({ userJid: 'a', command, now: now + 1000 })
  assert.equal(ikinci.ok, false)
  assert.equal(ikinci.uyar, true)
  assert.equal(ikinci.kalanSn, 4)

  assert.equal(checkCooldown({ userJid: 'a', command, now: now + 2000 }).uyar, false)
  // Başka kullanıcı etkilenmez, süre dolunca tekrar açılır.
  assert.equal(checkCooldown({ userJid: 'b', command, now: now + 2000 }).ok, true)
  assert.equal(checkCooldown({ userJid: 'a', command, now: now + 5000 }).ok, true)
})

test('bekleme süresi: cooldown 0 sınırsızdır', () => {
  const command = { name: 'sinirsiz', cooldown: 0 }
  assert.equal(checkCooldown({ userJid: 'a', command }).ok, true)
  assert.equal(checkCooldown({ userJid: 'a', command }).ok, true)
})

test('kelime zinciri: ğ ile biten kelimede bir önceki harf', () => {
  assert.equal(lastLetter('dağ'), 'a')
  assert.equal(lastLetter('kalem'), 'm')
  assert.equal(trLower('İSTANBUL'), 'istanbul')
  assert.equal(trLower('IŞIK'), 'ışık')
})

test('hash: deterministik (.ship ve .burç buna dayanır)', () => {
  assert.equal(fnv1a('akrep|2026-10-31'), fnv1a('akrep|2026-10-31'))
  assert.notEqual(fnv1a('akrep|2026-10-31'), fnv1a('akrep|2026-11-01'))
})
