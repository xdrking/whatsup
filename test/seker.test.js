// Şeker Fırtınası: patlama, düşme, kombo, bedava dönüş ve beklenen dönüş.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  AZAMI_KAT, BONUS_FIYATI, DAGINIK, donus, dusur, EN_AZ, KOMBO, komboCarpani, odemeKati, patlayanlar, SATIR, sekerCevir, SEKERLER, SUTUN,
} = await import('../lib/seker.js')

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

const tahtaDoldur = (s) => Array.from({ length: SUTUN }, () => Array(SATIR).fill(s))

test('8 ve üstü aynı şeker öder ve patlar, dağınık patlamaz', () => {
  const [a, b] = SEKERLER
  const tahta = tahtaDoldur(b.s)
  for (let i = 0; i < EN_AZ; i += 1) tahta[Math.floor(i / SATIR)][i % SATIR] = a.s
  tahta[5][4] = DAGINIK
  const p = patlayanlar(tahta)
  assert.equal(p.odemeler.length, 2)
  assert.equal(p.odemeler.find((o) => o.s === a.s).kat, a.odeme[0])
  assert.equal(p.hucreler.length, SUTUN * SATIR - 1)
  assert.equal(odemeKati(a.s, 7), 0)
  assert.equal(odemeKati(a.s, 10), a.odeme[1])
  assert.equal(odemeKati(a.s, 13), a.odeme[2])
})

test('düşme: kalanlar sırasını korur, yeni şeker üstten gelir', () => {
  const tahta = Array.from({ length: SUTUN }, (_, c) => Array.from({ length: SATIR }, (_, r) => `${c}${r}`))
  const sonra = dusur(tahta, [0 * SATIR + 1, 0 * SATIR + 3], () => 0)
  assert.deepEqual(sonra[0].slice(2), ['00', '02', '04'])
  assert.equal(sonra[0].length, SATIR)
  assert.deepEqual(sonra[1], tahta[1])
})

test('kombo her patlamada büyür, son basamakta durur', () => {
  assert.equal(komboCarpani(0), 1)
  assert.equal(komboCarpani(2), KOMBO[2])
  assert.equal(komboCarpani(99), KOMBO.at(-1))
  const d = donus(tohumlu(7))
  d.adimlar.slice(0, -1).forEach((a, i) => assert.equal(a.carpan, komboCarpani(i)))
  assert.equal(d.adimlar.at(-1).patlayan.length, 0)
})

test('beklenen dönüş %90-100, bonus satın alma da öyle', () => {
  const rnd = tohumlu(42)
  const N = 120_000
  let toplam = 0
  for (let i = 0; i < N; i += 1) toplam += sekerCevir(rnd).carpan
  const rtp = toplam / N
  assert.ok(rtp > 0.9 && rtp < 1, `rtp ${rtp}`)

  let bonus = 0
  const B = 6000
  for (let i = 0; i < B; i += 1) {
    const s = sekerCevir(rnd, { bonus: true })
    assert.ok(s.bedava)
    bonus += s.carpan
  }
  assert.ok(bonus / B > 0.88 && bonus / B < 1.02, `bonus rtp ${bonus / B}`)
})

test('kazanç tavanı ve bonusun çarpanı fiyata bölünür', () => {
  const rnd = tohumlu(3)
  for (let i = 0; i < 300; i += 1) {
    const s = sekerCevir(rnd, { bonus: true })
    assert.ok(s.kat <= AZAMI_KAT)
    assert.ok(Math.abs(s.carpan - s.kat / BONUS_FIYATI) < 0.02)
  }
})
