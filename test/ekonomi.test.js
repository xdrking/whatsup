// .görev, .market ve .soygun.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { GOREVLER, gununGorevleri } = await import('../lib/gorev.js')
const { URUNLER, KALKAN_SURESI_MS } = await import('../lib/market.js')
const { KASALAR, kasaCek } = await import('../lib/kasa.js')
const { KORUNMA_MS, soygunPayi } = await import('../lib/soygun.js')
const {
  addXp, carkDurumu, carkOyna, getStats, gorevTopla, kasaAc, marketAl, marketDurumu, odulKoy, odulListesi, recordMessage, soygunYap,
} = await import('../lib/stats.js')
const { istanbulDay } = await import('../lib/dataset.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const GUN = 86_400_000

let sayac = 0
const yeniGrup = () => `e${++sayac}@g.us`
const urun = (tur, alan = {}) => URUNLER.find((u) => u.tur === tur && Object.entries(alan).every(([k, v]) => u[k] === v))

test('günün görevleri: 3 farklı görev, aynı gün aynı', () => {
  const g = gununGorevleri('2026-06-10')
  assert.equal(new Set(g.map((x) => x.anahtar)).size, 3)
  assert.deepEqual(g, gununGorevleri('2026-06-10'))
})

test('görev: ödül bir kez verilir, ertesi gün sıfırlanır', () => {
  // Bugünün görevleri içinde mesaj görevi olan bir gün bulunur.
  let gun = T
  while (!gununGorevleri(istanbulDay(new Date(gun))).some((g) => g.anahtar === 'mesaj')) gun += GUN
  const mesaj = GOREVLER.find((g) => g.anahtar === 'mesaj')

  const k = { chatJid: yeniGrup(), userJid: 'u@lid' }
  for (let i = 0; i < mesaj.hedef - 1; i += 1) recordMessage({ ...k, type: 'conversation', at: gun })

  const eksik = gorevTopla({ ...k, now: gun })
  assert.equal(eksik.kazanilan, 0)
  assert.equal(eksik.gorevler.find((g) => g.anahtar === 'mesaj').sayac, mesaj.hedef - 1)

  recordMessage({ ...k, type: 'conversation', at: gun })
  const once = getStats(k.chatJid, k.userJid).xp
  assert.equal(gorevTopla({ ...k, now: gun }).kazanilan, mesaj.odul)
  assert.equal(gorevTopla({ ...k, now: gun }).kazanilan, 0)
  assert.equal(getStats(k.chatJid, k.userJid).xp, once + mesaj.odul)

  recordMessage({ ...k, type: 'conversation', at: gun + GUN })
  const sonraki = gorevTopla({ ...k, now: gun + GUN }).gorevler.find((g) => g.anahtar === 'mesaj')
  if (sonraki) assert.equal(sonraki.sayac, 1)
})

test('market: yetersiz XP, kalkan süresi eklenir, unvan iki kez alınmaz', () => {
  const k = { chatJid: yeniGrup(), userJid: 'u@lid' }
  const kalkan = urun('kalkan')
  const unvan = urun('unvan')

  assert.deepEqual(marketAl({ ...k, urun: kalkan, now: T }), { yetersiz: true, xp: 0 })

  addXp({ ...k, amount: kalkan.fiyat * 2 + unvan.fiyat })
  marketAl({ ...k, urun: kalkan, now: T })
  assert.equal(marketAl({ ...k, urun: kalkan, now: T }).kalkan, T + 2 * KALKAN_SURESI_MS)

  marketAl({ ...k, urun: unvan, now: T })
  assert.equal(getStats(k.chatJid, k.userJid).xp, 0)
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).unvan, unvan.unvan)
  assert.deepEqual(marketAl({ ...k, urun: unvan, now: T }), { zatenVar: true })
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).kalkan, T + 2 * KALKAN_SURESI_MS)
})

test('market bonusu oyun XP\'sini katlar, çark hakkına dokunmaz', () => {
  const k = { chatJid: yeniGrup(), userJid: 'u@lid' }
  const bonus = urun('bonus', { bonus: 200 })
  addXp({ ...k, amount: bonus.fiyat })
  marketAl({ ...k, urun: bonus, now: T })

  assert.equal(addXp({ ...k, amount: 5, at: T + 1 }), 15)
  assert.equal(carkDurumu({ ...k, now: T }).kalan, 2)
})

test('soygun payı %10, en çok 500', () => {
  assert.equal(soygunPayi(100), 10)
  assert.equal(soygunPayi(99_999), 500)
})

function soygunKur(hirsizXp = 200, kurbanXp = 1000) {
  const chatJid = yeniGrup()
  addXp({ chatJid, userJid: 'h', amount: hirsizXp })
  addXp({ chatJid, userJid: 'k', amount: kurbanXp })
  return { chatJid, hirsiz: 'h', kurban: 'k' }
}

test('soygun başarılı: XP geçer, kurban korunur, toplam değişmez', () => {
  const s = soygunKur()
  assert.deepEqual(soygunYap({ ...s, sans: () => true, now: T }), {
    basarili: true, miktar: 100, hirsizXp: 300, kurbanXp: 900,
  })
  assert.deepEqual(soygunYap({ ...s, sans: () => true, now: T + 1 }), { engel: 'korunma', bitis: T + KORUNMA_MS })
  assert.equal(soygunYap({ ...s, sans: () => true, now: T + KORUNMA_MS }).basarili, true)
})

test('soygun yakalanma: hırsız kendi payını kurbana öder', () => {
  const s = soygunKur()
  assert.deepEqual(soygunYap({ ...s, sans: () => false, now: T }), {
    basarili: false, miktar: 20, hirsizXp: 180, kurbanXp: 1020,
  })
})

test('soygun: günde 2 deneme, engeller hak yakmaz, ertesi gün yenilenir', () => {
  const s = soygunKur()
  let cekildi = false
  const sans = () => { cekildi = true; return false }

  assert.deepEqual(soygunYap({ ...s, kurban: 'yok', sans, now: T }), { engel: 'kurban-fakir' })
  assert.equal(cekildi, false)

  soygunYap({ ...s, sans, now: T })
  soygunYap({ ...s, sans, now: T })
  assert.deepEqual(soygunYap({ ...s, sans, now: T }), { engel: 'hak' })
  assert.equal(soygunYap({ ...s, sans, now: T + GUN }).basarili, false)
})

test('soygun: kalkan ve hırsızın bakiyesi engeller', () => {
  const s = soygunKur(10, 1000)
  assert.deepEqual(soygunYap({ ...s, sans: () => true, now: T }), { engel: 'hirsiz-fakir' })

  const kalkan = urun('kalkan')
  marketAl({ chatJid: s.chatJid, userJid: 'k', urun: kalkan, now: T })
  assert.equal(soygunYap({ ...s, sans: () => true, now: T }).engel, 'kalkan')
})

const kisi = (xp) => {
  const k = { chatJid: yeniGrup(), userJid: 'a' }
  if (xp) addXp({ ...k, amount: xp, at: T })
  return k
}
const ac = (k, odul, kasa = KASALAR[0]) => kasaAc({ ...k, kasa, cek: () => odul, now: T })

test('key tabloları: fiyatlar, toplam 100, beklenen XP fiyatın altında', () => {
  assert.deepEqual(KASALAR.map((k) => k.fiyat), [50, 100, 250, 500, 750, 1000])
  for (const kasa of KASALAR) {
    assert.equal(kasa.oduller.reduce((t, o) => t + o.agirlik, 0), 100, kasa.ad)
    const ev = kasa.oduller.reduce((t, o) => t + (o.agirlik / 100) * ((o.xp || 0) + (o.yedekXp || 0)), 0)
    assert.ok(ev < kasa.fiyat, `${kasa.ad} beklenen XP ${ev}`)

    const gorulen = new Set()
    for (let r = 0; r < 100; r++) gorulen.add(kasaCek(kasa, () => r))
    assert.equal(gorulen.size, kasa.oduller.length, kasa.ad)
  }
})

test('key: XP yetmezse ödül çekilmez, yeterse ücret düşer ve ödül eklenir', () => {
  const k = kisi(49)
  let cekildi = false
  const s = kasaAc({ ...k, kasa: KASALAR[0], cek: () => { cekildi = true; return {} }, now: T })
  assert.deepEqual(s, { yetersiz: true, xp: 49 })
  assert.equal(cekildi, false)

  addXp({ ...k, amount: 51, at: T })
  assert.equal(ac(k, { xp: 20 }).xp, 70)
  assert.equal(ac(k, {}).xp, 20)
  assert.equal(getStats(k.chatJid, k.userJid).xp, 20)
})

test('key: unvan boşsa yazılır, varsa korunur ve yerine XP gelir', () => {
  const k = kisi(100)
  const odul = { unvan: '🍀 Şanslı', yedekXp: 500 }
  assert.equal(ac(k, odul).yedekXp, 0)
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).unvan, odul.unvan)

  const s = ac(k, { unvan: '🐉 Efsane', yedekXp: 1000 })
  assert.equal(s.yedekXp, 1000)
  assert.equal(s.xp, 1000)
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).unvan, odul.unvan)
})

test('key: kalkan eklenir, unvana dokunmaz; bonus çark hakkına dokunmaz', () => {
  const k = kisi(200)
  ac(k, { unvan: '🍀 Şanslı', yedekXp: 500 })
  ac(k, { kalkanMs: 1000 })
  ac(k, { kalkanMs: 1000 })
  assert.deepEqual(marketDurumu(k.chatJid, k.userJid, T), { unvan: '🍀 Şanslı', kalkan: T + 2000 })

  ac(k, { bonus: 200 })
  const d = carkDurumu({ ...k, now: T })
  assert.equal(d.kalan, 2)
  assert.equal(d.bonus.yuzde, 200)
})

test('key: çark hakkı açık da kapalı pencerede de fazladan çevirme verir', () => {
  const bos = () => ({})
  const kapali = kisi(50)
  ac(kapali, { carkHakki: 1 })
  assert.equal(carkDurumu({ ...kapali, now: T }).kalan, 3)
  for (const kalan of [2, 1, 0]) assert.equal(carkOyna({ ...kapali, cevir: bos, now: T }).kalan, kalan)
  assert.ok(carkOyna({ ...kapali, cevir: bos, now: T }).hakYok)

  const acik = kisi(50)
  carkOyna({ ...acik, cevir: () => ({ bonus: 200 }), now: T })
  carkOyna({ ...acik, cevir: bos, now: T })
  ac(acik, { carkHakki: 1 })
  const d = carkDurumu({ ...acik, now: T })
  assert.equal(d.kalan, 1)
  assert.equal(d.bonus.yuzde, 200)
})

test('key: soygun hakkı o gün üçüncü denemeyi açar, ertesi gün sıfırlanır', () => {
  const k = kisi(5000)
  const kurban = (i) => { addXp({ chatJid: k.chatJid, userJid: `v${i}`, amount: 5000, at: T }); return `v${i}` }
  const soy = (i, now = T) => soygunYap({ chatJid: k.chatJid, hirsiz: 'a', kurban: kurban(i), sans: () => false, now })

  ac(k, { soygunHakki: 1 })
  for (let i = 0; i < 3; i++) assert.equal(soy(i).basarili, false)
  assert.equal(soy(3).engel, 'hak')
  assert.equal(soy(4, T + GUN).basarili, false)
})

test('ödül: kesinti yanar, birikir, başarılı soygunda alınır', () => {
  const k = kisi(1000)
  const s = { chatJid: k.chatJid, koyan: 'a', hedef: 'b', miktar: 100 }
  assert.deepEqual(odulKoy({ ...s, miktar: 1001 }), { yetersiz: true, xp: 1000 })
  assert.deepEqual(odulKoy(s), { havuz: 90, kesinti: 10, xp: 900 })
  assert.equal(odulKoy(s).havuz, 180)

  // Hedefin XP'si yok: ödül varken yine de soyulabilmeli.
  const soy = (sans, hirsiz = 'c') => soygunYap({ chatJid: k.chatJid, hirsiz, kurban: 'b', sans: () => sans, now: T })
  addXp({ chatJid: k.chatJid, userJid: 'c', amount: 100, at: T })
  assert.equal(soy(false).odul, 0)
  assert.deepEqual(odulListesi(k.chatJid), [{ user_jid: 'b', xp: 180 }])

  const basarili = soy(true)
  assert.equal(basarili.odul, 180)
  assert.equal(getStats(k.chatJid, 'c').xp, basarili.hirsizXp)
  assert.deepEqual(odulListesi(k.chatJid), [])
})
