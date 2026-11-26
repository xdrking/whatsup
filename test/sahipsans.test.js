// .şans kişiye bağlıdır: açan sahip şans alır, sahipliği geri alınan kişinin şansı kapanır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'
process.env.OWNER_NUMBER = '905550000001'
process.env.OWNER_LID = '111222@lid'

const { kimlikRakam, sansAc, sansAcikMi, sansKapat, sansKisileri, sansliMi } = await import('../lib/sahipSans.js')
const { sahipSekerSansi, tuzakTasi } = await import('../lib/kumar.js')

const SAHIP = '905550000001@s.whatsapp.net'
const ARKADAS = '905552222222@s.whatsapp.net'

test('kimlik rakamları: numara, LID ve cihaz eki', () => {
  assert.equal(kimlikRakam('905550000001:12@s.whatsapp.net'), '905550000001')
  assert.equal(kimlikRakam('111222@lid'), '111222')
  assert.equal(kimlikRakam('+90 555 000 00 01'), '905550000001')
})

test('kayıt yokken (eski varsayılan) şans şu anki sahibe açıktır', () => {
  assert.ok(sansliMi(SAHIP))
  assert.ok(sansliMi('111222@lid'))
  assert.ok(!sansliMi(ARKADAS))
})

test('sahiplik geri alınan arkadaşın şansı işlemez, sahip .şans aç deyince kapanır', () => {
  // Arkadaşa sahiplik verildi, o da şansını açtı.
  process.env.OWNER_NUMBER = '905552222222'
  process.env.OWNER_LID = ''
  sansAc([ARKADAS])
  assert.ok(sansliMi(ARKADAS))

  // Sahiplik geri alındı: listede kalsa bile artık sahip olmadığı için şans almaz.
  process.env.OWNER_NUMBER = '905550000001'
  process.env.OWNER_LID = '111222@lid'
  assert.ok(sansKisileri().includes('905552222222'))
  assert.ok(!sansliMi(ARKADAS))

  // Asıl sahip şansını açınca arkadaş listeden de silinir.
  const { kapatilan } = sansAc([SAHIP, '111222@lid'])
  assert.deepEqual(kapatilan, ['905552222222'])
  assert.ok(!sansKisileri().includes('905552222222'))
  assert.ok(sansliMi(SAHIP) && sansliMi('111222@lid'))
  assert.ok(!sansliMi(ARKADAS))
})

test('.şans kapat herkesin şansını kapatır', () => {
  sansKapat()
  assert.ok(!sansAcikMi())
  assert.ok(!sansliMi(SAHIP))
  sansAc([SAHIP])
  assert.ok(sansliMi(SAHIP))
})

test('basılan tuzak boş bir kutuya taşınır, sayısı değişmez', () => {
  const mayinlar = new Set([2, 5, 9])
  assert.ok(tuzakTasi(mayinlar, 5, 12, [1, 3], () => 0))
  assert.equal(mayinlar.size, 3)
  assert.ok(!mayinlar.has(5) && !mayinlar.has(1) && !mayinlar.has(3))
  assert.ok(!tuzakTasi(new Set([1, 2]), 1, 3, [3]))
})

test('şekerde kaybeden çevirme iki kez yeniden döner', () => {
  const sirali = (...c) => { let i = 0; return () => ({ carpan: c[i++] }) }
  assert.equal(sahipSekerSansi(sirali(0, 0, 3), () => 0)().carpan, 3)
  assert.equal(sahipSekerSansi(sirali(0, 0, 3), () => 99)().carpan, 0)
})
