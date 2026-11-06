// Coin, .coinmarket ve toplu soygun.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { bozdurmaDegeri, COIN_TABAN: COIN_FIYATI, coinKuru, COIN_URUNLERI, hacizPayi } = await import('../lib/coin.js')
const { binlik } = await import('../lib/sayi.js')
const { sonucSatirlari } = await import('../lib/kumar.js')
const { KORUNMA_MS } = await import('../lib/soygun.js')
const {
  addXp, bankaBakiyesi, bankaYatir, botHesabiniTani, carkDurumu, coinAl, coinDurumu, coinMarketAl, coinSat, ekonomiDurumu, getLeaderboard, getStats, hacizEt, iflasEt, kiraTopla, krediCek, mulkAl, mulkDurumu, mulkHaciz, mulkSat, recordMessage, sigortaBitisi, xpDevret, marketAl, marketDurumu, odulKoy, odulListesi, soygunYap, topluHaciz, topluSoygun,
} = await import('../lib/stats.js')
const { URUNLER } = await import('../lib/market.js')
const { kiraHesapla, KIRA_AZAMI_SAAT, mulkBul } = await import('../lib/mulk.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `c${++sayac}@g.us`
const urun = (alan) => COIN_URUNLERI.find((u) => u[alan])
const xpVer = (chatJid, userJid, amount) => addXp({ chatJid, userJid, amount })

test('binlik: tutarlar noktayla ayrılır', () => {
  assert.equal(binlik(2000000), '2.000.000')
  assert.equal(binlik(-2000000), '-2.000.000')
  assert.ok(sonucSatirlari({ once: 1000000, xp: 3000000, fark: 2000000 })[0].includes('+2.000.000 XP'))
})

test('coin ürünleri 1-50 coin arasındadır', () => {
  assert.ok(COIN_URUNLERI.every((u) => u.fiyat >= 1 && u.fiyat <= 50))
  assert.equal(urun('topluHak').fiyat, 2)
})

test('coin alımı: XP yanar, yetmezse hiçbir şey değişmez', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  xpVer(chatJid, userJid, COIN_FIYATI * 2 + 5)

  assert.deepEqual(coinAl({ chatJid, userJid, adet: 3 }), { yetersiz: true, xp: COIN_FIYATI * 2 + 5, ucret: COIN_FIYATI * 3 })
  assert.equal(coinDurumu(chatJid, userJid).bakiye, 0)

  assert.deepEqual(coinAl({ chatJid, userJid, adet: 2 }), { bakiye: 2, xp: 5, ucret: COIN_FIYATI * 2 })
  assert.equal(getStats(chatJid, userJid).xp, 5)
})

test('açık krediyle coin alınamaz', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  xpVer(chatJid, BOT, 10_000)
  xpVer(chatJid, userJid, COIN_FIYATI)
  krediCek({ chatJid, userJid, miktar: 100, now: T })

  assert.deepEqual(coinAl({ chatJid, userJid, adet: 1 }), { kredili: true })
  assert.equal(coinDurumu(chatJid, userJid).bakiye, 0)
})

test('coin market: ürün etkisi yazılır, coin düşer', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  xpVer(chatJid, userJid, COIN_FIYATI * 20)
  coinAl({ chatJid, userJid, adet: 20 })

  assert.deepEqual(coinMarketAl({ chatJid, userJid, urun: urun('kalkanMs'), now: T }), { bakiye: 17 })
  assert.equal(marketDurumu(chatJid, userJid, T).kalkan, T + urun('kalkanMs').kalkanMs)

  coinMarketAl({ chatJid, userJid, urun: urun('bonus'), now: T })
  assert.equal(carkDurumu({ chatJid, userJid, now: T }).bonus.yuzde, 2900)

  const unvan = urun('unvan')
  coinMarketAl({ chatJid, userJid, urun: unvan, now: T })
  assert.equal(marketDurumu(chatJid, userJid, T).unvan, unvan.unvan)
  assert.deepEqual(coinMarketAl({ chatJid, userJid, urun: unvan, now: T }), { zatenVar: true })

  assert.deepEqual(
    coinMarketAl({ chatJid, userJid, urun: COIN_URUNLERI.at(-1), now: T }),
    { yetersiz: true, bakiye: 2 },
  )
})

test('30 kat bonus oyun XP\'sini 30 ile çarpar', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  xpVer(chatJid, userJid, COIN_FIYATI * 5)
  coinAl({ chatJid, userJid, adet: 5 })
  coinMarketAl({ chatJid, userJid, urun: urun('bonus'), now: T })
  assert.equal(addXp({ chatJid, userJid, amount: 50, at: T + 1 }), 1500)
})

test('toplu haciz: banka %45, cüzdan %50 alıcıya geçer, kalkan korumaz', () => {
  const chatJid = yeniGrup()
  const alici = 'h@s'
  const haciz = urun('topluHaciz')
  const uygula = (kurbanlar) => topluHaciz({ chatJid, userJid: alici, kurbanlar, urun: haciz, now: T })

  assert.equal(haciz.fiyat, 30)
  assert.deepEqual(uygula(['a@s']), { yetersiz: true, bakiye: 0 })

  xpVer(chatJid, alici, COIN_FIYATI * 30)
  coinAl({ chatJid, userJid: alici, adet: 30 })

  assert.deepEqual(uygula(['bos@s']), { hedefYok: true })
  assert.equal(coinDurumu(chatJid, alici).bakiye, 30)

  xpVer(chatJid, 'a@s', 3000)
  bankaYatir({ chatJid, userJid: 'a@s', miktar: 1000, now: T })
  xpVer(chatJid, 'kalkanli@s', 1000)
  marketAl({ chatJid, userJid: 'kalkanli@s', urun: URUNLER.find((u) => u.tur === 'kalkan'), now: T })

  const s = uygula(['a@s', 'kalkanli@s'])

  assert.deepEqual(s.kurbanlar, [{ jid: 'a@s', miktar: 1450 }, { jid: 'kalkanli@s', miktar: 350 }])
  assert.equal(s.toplam, 1800)
  assert.equal(getStats(chatJid, alici).xp, 1800)
  assert.equal(getStats(chatJid, 'a@s').xp, 1000)
  assert.equal(bankaBakiyesi(chatJid, 'a@s'), 550)
  assert.equal(coinDurumu(chatJid, alici).bakiye, 0)
  assert.deepEqual(hacizPayi(1000, -500), { banka: 450, cuzdan: 0 })
})

test('fazladan soygun hakkı günlük sınırı aşar', () => {
  const chatJid = yeniGrup()
  const hirsiz = 'h@s'
  xpVer(chatJid, hirsiz, COIN_FIYATI)
  coinAl({ chatJid, userJid: hirsiz, adet: 1 })
  xpVer(chatJid, hirsiz, 1000)
  coinMarketAl({ chatJid, userJid: hirsiz, urun: urun('soygunHakki'), now: T })

  for (let i = 0; i < 5; i += 1) {
    const kurban = `k${i}@s`
    xpVer(chatJid, kurban, 1000)
    assert.equal(soygunYap({ chatJid, hirsiz, kurban, sans: () => false, now: T }).engel, undefined)
  }
  xpVer(chatJid, 'son@s', 1000)
  assert.equal(soygunYap({ chatJid, hirsiz, kurban: 'son@s', sans: () => false, now: T }).engel, 'hak')
})

test('toplu soygun: hak ister, kalkanlıyı atlar, kaçan ceza ödetmez', () => {
  const chatJid = yeniGrup()
  const hirsiz = 'h@s'
  const toplu = (sans, kurbanlar) => topluSoygun({ chatJid, hirsiz, kurbanlar, sans, now: T })

  assert.deepEqual(toplu(() => true, ['a@s']), { hakYok: true })

  xpVer(chatJid, hirsiz, COIN_FIYATI * 2)
  coinAl({ chatJid, userJid: hirsiz, adet: 2 })
  coinMarketAl({ chatJid, userJid: hirsiz, urun: urun('topluHak'), now: T })
  assert.equal(coinDurumu(chatJid, hirsiz).topluHak, 1)

  xpVer(chatJid, 'a@s', 10_000)
  xpVer(chatJid, 'b@s', 10_000)
  xpVer(chatJid, 'kalkanli@s', 10_000)
  xpVer(chatJid, 'fakir@s', 50)
  marketAl({ chatJid, userJid: 'kalkanli@s', urun: URUNLER.find((u) => u.tur === 'kalkan'), now: T })
  odulKoy({ chatJid, koyan: 'kalkanli@s', hedef: 'a@s', miktar: 1000 })

  assert.deepEqual(toplu(() => true, ['fakir@s', 'kalkanli@s']), { hedefYok: true })
  assert.equal(coinDurumu(chatJid, hirsiz).topluHak, 1)

  const zarlar = [true, false]
  const s = toplu(() => zarlar.shift(), ['a@s', 'b@s', 'kalkanli@s', 'fakir@s'])

  assert.deepEqual(s.soyulanlar, [{ jid: 'a@s', miktar: 1000, odul: 900 }])
  assert.deepEqual(s.kacanlar, ['b@s'])
  assert.equal(s.toplam, 1900)
  assert.equal(getStats(chatJid, hirsiz).xp, 1900)
  assert.equal(getStats(chatJid, 'a@s').xp, 9000)
  assert.equal(getStats(chatJid, 'b@s').xp, 10_000)
  assert.equal(odulListesi(chatJid).length, 0)
  assert.equal(coinDurumu(chatJid, hirsiz).topluHak, 0)

  // Soyulan kişi normal soygundan da korunur.
  const korunan = soygunYap({ chatJid, hirsiz, kurban: 'a@s', sans: () => true, now: T + 1 })
  assert.equal(korunan.engel, 'korunma')
  assert.equal(korunan.bitis, T + KORUNMA_MS)
})

const SAAT = 3_600_000
const GUN = 24 * SAAT
const coinVer = (chatJid, userJid, adet, now = T) => {
  xpVer(chatJid, userJid, COIN_FIYATI * adet)
  return coinAl({ chatJid, userJid, adet, now })
}

test('coin kuru parayla artar, tabanın altına inmez', () => {
  assert.equal(coinKuru(0), 1_000_000)
  assert.equal(coinKuru(100_000_000), 1_000_000)
  assert.equal(coinKuru(250_000_000), 2_500_000)
  assert.equal(coinKuru(250_000_001), 2_600_000)
  assert.equal(bozdurmaDegeri(2, 1_000_000), 1_800_000)
})

test('kur gün içinde sabit, ertesi gün paraya göre yenilenir; bot sayılmaz', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, BOT, 900_000_000)
  xpVer(chatJid, 'a@s', 200_000_000)
  assert.equal(ekonomiDurumu({ chatJid, now: T }).kur, 2_000_000)

  xpVer(chatJid, 'a@s', 200_000_000)
  assert.equal(ekonomiDurumu({ chatJid, now: T + SAAT }).kur, 2_000_000)

  const yarin = ekonomiDurumu({ chatJid, now: T + GUN })
  assert.equal(yarin.kur, 4_000_000)
  assert.equal(yarin.dun.arz, 200_000_000)
  assert.equal(coinAl({ chatJid, userJid: 'a@s', adet: 1, now: T + GUN }).ucret, 4_000_000)
})

test('işlenmemiş banka faizi kura yazılır: .banka yazmak kuru sıçratmaz', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a@s', 200_000_000)
  bankaYatir({ chatJid, userJid: 'a@s', miktar: 200_000_000, now: T })

  const onceden = ekonomiDurumu({ chatJid, now: T + 3 * GUN })
  assert.ok(onceden.arz > 200_000_000 * 1.15 ** 70)
})

test('coin bozdurma %90 öder, fazlası reddedilir', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  coinVer(chatJid, userJid, 3)

  assert.deepEqual(coinSat({ chatJid, userJid, adet: 4, now: T }), { yetersiz: true, bakiye: 3 })
  assert.deepEqual(coinSat({ chatJid, userJid, adet: 2, now: T }), { bakiye: 1, xp: 1_800_000, kazanc: 1_800_000 })
})

test('haciz sigortası .hacizall\'ı durdurur, sahibin .haciz\'ini durdurmaz', () => {
  const chatJid = yeniGrup()
  const alici = 'h@s'
  coinVer(chatJid, alici, 30)
  coinVer(chatJid, 's@s', 10)
  coinMarketAl({ chatJid, userJid: 's@s', urun: urun('sigortaMs'), now: T })
  assert.equal(sigortaBitisi(chatJid, 's@s', T), T + urun('sigortaMs').sigortaMs)

  xpVer(chatJid, 's@s', 1000)
  xpVer(chatJid, 'a@s', 1000)
  const haciz = urun('topluHaciz')
  const s = topluHaciz({ chatJid, userJid: alici, kurbanlar: ['s@s', 'a@s'], urun: haciz, now: T })

  assert.deepEqual(s.sigortalilar, ['s@s'])
  assert.deepEqual(s.kurbanlar, [{ jid: 'a@s', miktar: 500 }])
  assert.equal(getStats(chatJid, 's@s').xp, 1000)
  assert.equal(hacizEt({ chatJid, userJid: 's@s', miktar: 100, now: T }).xp, 900)

  // Süresi biten sigorta korumaz.
  coinVer(chatJid, alici, 30, T)
  const sonra = topluHaciz({ chatJid, userJid: alici, kurbanlar: ['s@s'], urun: haciz, now: T + 4 * GUN })
  assert.equal(sonra.kurbanlar.length, 1)
})

test('mülk: coinle alınır, kira birikir, 24 saatte durur, satınca %90 döner', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  const ev = mulkBul('ev')
  assert.equal(mulkBul('Dükkan').kod, 'dukkan')
  assert.equal(kiraHesapla(ev, 1, 1, 1_000_000), 100_000)
  assert.equal(kiraHesapla(ev, 2, 100, 1_000_000), 200_000 * KIRA_AZAMI_SAAT)

  assert.deepEqual(mulkAl({ chatJid, userJid, mulk: ev, now: T }), { yetersiz: true, bakiye: 0 })
  coinVer(chatJid, userJid, 5)
  assert.deepEqual(mulkAl({ chatJid, userJid, mulk: ev, now: T }), { bakiye: 0, adet: 1 })

  assert.equal(mulkDurumu({ chatJid, userJid, now: T + 3 * SAAT })[0].kira, 300_000)
  assert.deepEqual(kiraTopla({ chatJid, userJid, now: T + 3 * SAAT }), { kira: 300_000, xp: 300_000 })
  assert.equal(kiraTopla({ chatJid, userJid, now: T + 3 * SAAT }).kira, 0)

  const s = mulkSat({ chatJid, userJid, mulk: ev, now: T + 4 * SAAT })
  assert.deepEqual(s, { kazanc: 4_500_000, kira: 100_000, xp: 4_900_000 })
  assert.equal(mulkDurumu({ chatJid, userJid, now: T }).length, 0)
  assert.deepEqual(mulkSat({ chatJid, userJid, mulk: ev, now: T }), { yok: true })
})

test('sahip mülke haciz koyar: değer kasaya girer, kira sahibinde kalır', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  const ev = mulkBul('ev')
  coinVer(chatJid, userJid, 5)
  mulkAl({ chatJid, userJid, mulk: ev, now: T })

  assert.deepEqual(mulkHaciz({ chatJid, userJid, mulk: ev, now: T + SAAT }), { kasaya: 4_500_000, kalan: 0 })
  assert.equal(bankaBakiyesi(chatJid, BOT), 4_500_000)
  assert.equal(getStats(chatJid, userJid).xp, 100_000)
  assert.deepEqual(mulkHaciz({ chatJid, userJid, mulk: ev, now: T }), { yok: true })
})

test('coin ya da mülk varken iflas edilemez', () => {
  const chatJid = yeniGrup()
  const userJid = 'a@s'
  coinVer(chatJid, userJid, 5)
  hacizEt({ chatJid, userJid, miktar: 100, now: T })
  assert.deepEqual(iflasEt({ chatJid, userJid, now: T }), { coin: true })

  mulkAl({ chatJid, userJid, mulk: mulkBul('ev'), now: T })
  assert.deepEqual(iflasEt({ chatJid, userJid, now: T }), { mulk: true })

  mulkHaciz({ chatJid, userJid, mulk: mulkBul('ev'), now: T })
  assert.equal(iflasEt({ chatJid, userJid, now: T }).silinen, 100)
})

test('günün ilk mesajı ekonomi kaydını yazar', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a@s', 299_999_000)
  recordMessage({ chatJid, userJid: 'a@s', at: T })
  xpVer(chatJid, 'a@s', 300_000_000)
  assert.equal(ekonomiDurumu({ chatJid, now: T }).kur, 3_000_000)
})

test('botun LID satırı ana hesaba taşınır, devir de oraya gider', () => {
  const chatJid = yeniGrup()
  const lid = '222222222222222@lid'
  xpVer(chatJid, BOT, 1000)
  xpVer(chatJid, lid, 150_000)
  xpVer(chatJid, 'a@s', 500)

  botHesabiniTani({ id: BOT, lid })

  assert.deepEqual(getLeaderboard(chatJid, 10).map((r) => [r.user_jid, r.xp]), [[BOT, 151_000], ['a@s', 500]])
  assert.equal(getStats(chatJid, lid).xp, 151_000)

  xpDevret({ chatJid, kaynak: 'a@s', hedef: lid, miktar: 100 })
  assert.equal(getStats(chatJid, BOT).xp, 151_100)
  xpDevret({ chatJid, kaynak: lid, hedef: 'a@s', miktar: 100, sahipDevri: true })
  assert.equal(getStats(chatJid, BOT).xp, 151_000)
  assert.equal(getLeaderboard(chatJid, 10).length, 2)

  botHesabiniTani({ id: BOT })
})
