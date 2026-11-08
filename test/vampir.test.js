// `.vampir` kuralları: rol dağılımı, oylama, gece sonucu, kazanan.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { geceSonucu, gunduzKarari, kazanan, MAX_OYUNCU, MIN_OYUNCU, rolDagit, rolSayilari } =
  await import('../lib/vampir.js')

test('vampir: her oyuncu sayısında roller toplamı tutar, köylü eksiye düşmez', () => {
  for (let n = MIN_OYUNCU; n <= MAX_OYUNCU; n++) {
    const s = rolSayilari(n)
    assert.equal(s.vampir + s.doktor + s.kahin + s.koylu, n)
    assert.ok(s.koylu >= 1, `${n} kişide köylü yok`)
    // İlk gece vampirler hemen kazanmasın.
    assert.ok(s.vampir * 2 < n - 1, `${n} kişide vampir çok`)
    const roller = rolDagit(n)
    assert.equal(roller.length, n)
    assert.equal(roller.filter((r) => r === 'vampir').length, s.vampir)
  }
})

test('vampir: gündüz tek başına en çok oyu alan asılır, beraberlik ve pas çoğunluğu asmaz', () => {
  assert.equal(gunduzKarari(new Map([[1, 3], [2, 3], [3, 1]])), 3)
  assert.equal(gunduzKarari(new Map([[1, 3], [2, 4]])), null)
  assert.equal(gunduzKarari(new Map([[1, 3], [2, null], [4, null]])), null)
  assert.equal(gunduzKarari(new Map([[1, 3], [2, null]])), null)
  assert.equal(gunduzKarari(new Map()), null)
})

test('vampir: doktor kurbanı kurtarır, oy yoksa kimse ölmez, bölünmede berabere kalanlardan çekilir', () => {
  assert.deepEqual(geceSonucu({ vampirOylari: new Map([[1, 4]]), korunan: 4 }), { hedef: null, kurtarildi: true })
  assert.deepEqual(geceSonucu({ vampirOylari: new Map([[1, 4]]), korunan: 2 }), { hedef: 4, kurtarildi: false })
  assert.deepEqual(geceSonucu({ vampirOylari: new Map(), korunan: null }), { hedef: null, kurtarildi: false })
  const bolunmus = new Map([[1, 4], [2, 5]])
  assert.equal(geceSonucu({ vampirOylari: bolunmus, korunan: null }, () => 1).hedef, 5)
})

test('vampir: kazanan', () => {
  const o = (rol, canli = true) => ({ rol, canli })
  assert.equal(kazanan([o('vampir', false), o('koylu'), o('kahin')]), 'koy')
  assert.equal(kazanan([o('vampir'), o('koylu'), o('kahin', false)]), 'vampir')
  assert.equal(kazanan([o('vampir'), o('koylu'), o('kahin'), o('doktor')]), null)
})
