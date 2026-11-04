// .görev, .market ve .soygun.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { GOREVLER, gununGorevleri } = await import('../lib/gorev.js')
const { URUNLER, KALKAN_SURESI_MS } = await import('../lib/market.js')
const { KORUNMA_MS, soygunPayi } = await import('../lib/soygun.js')
const {
  addXp, carkDurumu, getStats, gorevTopla, marketAl, marketDurumu, recordMessage, soygunYap,
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
