// Bakanlıklar, hazine aktarımı ve darbe. Veritabanı bellekte açılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { darbeCezasi, darbeOyu, makamBul } = await import('../lib/devlet.js')
const { mulkBul } = await import('../lib/mulk.js')
const {
  adayOl, bakanYetkisi, bankaBakiyesi, bankaYatir, baskanMi, botHesabiniTani, darbeBaslat, darbeBitir, darbeSonuc,
  coinDevret, getStats, hapisDurumu, hazineAktar, hazineDurumu, kayyumAta, kayyumKaldir, makamMi, mulkDevret, oyVer, secimDurumu, xpAyarla, xpDevret,
} = await import('../lib/stats.js')

const SAAT = 3_600_000
const HAFTA = 7 * 24 * SAAT
const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

let sayac = 0
const xp = (chatJid, jid) => getStats(chatJid, jid).xp
function ayarla(uyeler) {
  const chatJid = `m${++sayac}@g.us`
  for (const [jid, miktar] of Object.entries(uyeler)) xpAyarla({ chatJid, userJid: jid, miktar })
  return chatJid
}

test('makam adları ve darbe yanıtları', () => {
  assert.equal(makamBul('İçişleri').kod, 'icisleri')
  assert.equal(makamBul('başkan').kod, 'baskan')
  assert.equal(makamBul('maliye'), null)
  assert.equal(darbeOyu('Destek!'), 'destek')
  assert.equal(darbeOyu('KARŞI'), 'karsi')
  assert.equal(darbeOyu('belki'), null)
  // Toplam 4 mülkün 2'si, en pahalıdan başlanır.
  assert.deepEqual(darbeCezasi({ banka: 1000, cuzdan: -50, coin: 5, mulkler: [{ kod: 'ev', adet: 1, fiyat: 15 }, { kod: 'villa', adet: 3, fiyat: 60 }] }),
    { banka: 600, cuzdan: 0, coin: 3, suly: 0, mulkler: [{ kod: 'villa', adet: 2 }] })
  assert.deepEqual(darbeCezasi({ banka: 0, cuzdan: 0, coin: 0, mulkler: [{ kod: 'ev', adet: 2, fiyat: 15 }, { kod: 'villa', adet: 1, fiyat: 60 }] }).mulkler,
    [{ kod: 'villa', adet: 1 }, { kod: 'ev', adet: 1 }])
})

test('bakan: her bakanlığın ayrı seçimi, yetki günde 5', () => {
  const chatJid = ayarla({ a: 50_000, b: 50_000, c: 1000, k: 10_000 })
  adayOl({ chatJid, userJid: 'a', makam: 'adalet', now: T })
  adayOl({ chatJid, userJid: 'b', makam: 'icisleri', now: T })
  oyVer({ chatJid, secmen: 'c', aday: 'a', makam: 'adalet', now: T })
  oyVer({ chatJid, secmen: 'c', aday: 'b', makam: 'icisleri', now: T })
  assert.deepEqual(oyVer({ chatJid, secmen: 'c', aday: 'a', makam: 'icisleri', now: T }), { adayDegil: true })

  const P = T + HAFTA
  const s = secimDurumu({ chatJid, userJid: 'c', now: P })
  assert.deepEqual(s.yeniler.map((y) => y.makam).sort(), ['adalet', 'icisleri'])
  assert.equal(makamMi(chatJid, 'a', 'adalet', P), true)
  assert.equal(baskanMi(chatJid, 'a', P), false)

  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'b', makam: 'adalet', hedef: 'k', now: P }), { degil: true })
  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'b', makam: 'icisleri', hedef: 'k', now: P }), { hapisteDegil: true })
  const t = bakanYetkisi({ chatJid, userJid: 'a', makam: 'adalet', hedef: 'k', now: P })
  assert.equal(t.tutuklama.bitis, P + SAAT)
  assert.equal(t.kalan, 4)
  assert.ok(hapisDurumu(chatJid, 'k', P + 1))
  // Zaten hapisteki hedef hakkı yakmaz.
  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'a', makam: 'adalet', hedef: 'k', now: P + 1 }), { zatenHapiste: true })
  for (const [i, hedef] of ['x1', 'x2', 'x3', 'x4'].entries()) {
    assert.equal(bakanYetkisi({ chatJid, userJid: 'a', makam: 'adalet', hedef, now: P + 1 }).kalan, 3 - i)
  }
  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'a', makam: 'adalet', hedef: 'c', now: P + 1 }), { bugunVar: true })
  assert.equal(bakanYetkisi({ chatJid, userJid: 'a', makam: 'adalet', hedef: 'c', now: P + 24 * SAAT }).kalan, 4)

  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'b', makam: 'icisleri', hedef: 'k', now: P + 2 }), { af: true, kalan: 4 })
  assert.equal(hapisDurumu(chatJid, 'k', P + 3), null)
})

test('kayyum: bakan görevden alınır, seçim askıya girer, kaldırılınca açılır; yeni bakanın hakkı tam', () => {
  const chatJid = ayarla({ ali: 50_000, veli: 50_000, mert: 1000, c: 1000 })
  adayOl({ chatJid, userJid: 'ali', makam: 'disisleri', now: T })
  oyVer({ chatJid, secmen: 'c', aday: 'ali', makam: 'disisleri', now: T })
  const P = T + HAFTA
  secimDurumu({ chatJid, userJid: 'c', now: P })
  assert.equal(makamMi(chatJid, 'ali', 'disisleri', P), true)
  for (const h of ['h1', 'h2', 'h3', 'h4', 'h5']) bakanYetkisi({ chatJid, userJid: 'ali', makam: 'disisleri', hedef: h, now: P })

  adayOl({ chatJid, userJid: 'veli', makam: 'disisleri', now: P })
  assert.deepEqual(kayyumAta({ chatJid, makam: 'disisleri', hedef: 'mert', now: P + 1 }), { onceki: 'ali', iptal: true })
  assert.deepEqual(kayyumAta({ chatJid, makam: 'disisleri', hedef: 'mert', now: P + 1 }), { zaten: true })
  assert.deepEqual(kayyumAta({ chatJid, makam: 'baskan', hedef: 'mert', now: P + 1 }), { degil: true })
  assert.equal(makamMi(chatJid, 'ali', 'disisleri', P + 2), false)
  assert.equal(makamMi(chatJid, 'mert', 'disisleri', P + 2), true)
  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'ali', makam: 'disisleri', hedef: 'x', now: P + 2 }), { degil: true })
  assert.equal(bakanYetkisi({ chatJid, userJid: 'mert', makam: 'disisleri', hedef: 'x', now: P + 2 }).kalan, 4)

  assert.deepEqual(adayOl({ chatJid, userJid: 'veli', makam: 'disisleri', now: P + 3 }), { askida: true })
  assert.equal(secimDurumu({ chatJid, userJid: 'c', now: P + 3 }).makamlar.find((m) => m.kod === 'disisleri').askida, true)

  assert.deepEqual(kayyumKaldir({ chatJid, makam: 'disisleri' }), { sahip: 'mert' })
  assert.deepEqual(kayyumKaldir({ chatJid, makam: 'disisleri' }), { kayyumYok: true })
  assert.equal(adayOl({ chatJid, userJid: 'veli', makam: 'disisleri', now: P + 4 }).basladi, true)
  assert.equal(makamMi(chatJid, 'mert', 'disisleri', P + 5), true)
})

test('ambargo: 24 saat XP, coin ve mülk gönderilemez; sahip devri muaf; darbe bitince kayyum kalkar', () => {
  const chatJid = ayarla({ d: 1000, z: 50_000, y: 0 })
  kayyumAta({ chatJid, makam: 'disisleri', hedef: 'd', now: T })
  const a = bakanYetkisi({ chatJid, userJid: 'd', makam: 'disisleri', hedef: 'z', now: T })
  assert.equal(a.ambargo, T + 24 * SAAT)
  assert.deepEqual(bakanYetkisi({ chatJid, userJid: 'd', makam: 'disisleri', hedef: 'z', now: T + 1 }), { zatenAmbargo: T + 24 * SAAT })

  assert.ok(xpDevret({ chatJid, kaynak: 'z', hedef: 'y', miktar: 10, now: T + 2 }).ambargo)
  assert.equal(xpDevret({ chatJid, kaynak: 'z', hedef: 'y', miktar: 10, sahipDevri: true, now: T + 2 }).yetersiz, false)
  assert.ok(coinDevret({ chatJid, kaynak: 'z', hedef: 'y', adet: 1, now: T + 2 }).ambargo)
  assert.ok(mulkDevret({ chatJid, kaynak: 'z', hedef: 'y', mulk: mulkBul('ev'), now: T + 2 }).ambargo)
  assert.deepEqual(coinDevret({ chatJid, kaynak: 'z', hedef: 'y', adet: 1, now: T + 25 * SAAT }), { yetersiz: true, bakiye: 0 })

  darbeBaslat({ chatJid, userJid: 'o', now: T })
  assert.equal(darbeBitir({ chatJid }), true)
  assert.deepEqual(kayyumKaldir({ chatJid, makam: 'disisleri' }), { kayyumYok: true })
})

test('hazine: başkan günde 10 kişiye, kişi başı anlık piyasanın %20\'si, kendine yok', () => {
  const uyeler = { a: 50_000, b: 25_000, c: 25_000, [BOT]: 10_000_000 }
  for (let i = 0; i < 10; i++) uyeler[`k${i}`] = 1
  const chatJid = ayarla(uyeler)
  // Piyasa 100.010 XP: kişi başı sınır 20.002.
  assert.deepEqual(hazineAktar({ chatJid, userJid: 'b', hedef: 'c', miktar: 10, now: T }), { degil: true })
  assert.deepEqual(hazineAktar({ chatJid, userJid: 'o', hedef: 'o', miktar: 10, sahip: true, now: T }), { kendine: true })

  assert.deepEqual(hazineAktar({ chatJid, userJid: 'o', hedef: 'b', miktar: 15_000, sahip: true, now: T }), { miktar: 15_000, kalan: 5002, kisi: 1 })
  assert.equal(xp(chatJid, 'b'), 40_000)
  // Piyasa 115.010'a çıktı ama bugünkü aktarım düşülür: sınır yine 20.002, b'ye kalan 5.002.
  assert.deepEqual(hazineAktar({ chatJid, userJid: 'o', hedef: 'b', miktar: 9000, sahip: true, now: T }), { limit: 20_002, kalan: 5002 })
  assert.equal(hazineAktar({ chatJid, userJid: 'o', hedef: 'c', miktar: 20_000, sahip: true, now: T }).kisi, 2)

  for (let i = 0; i < 8; i++) hazineAktar({ chatJid, userJid: 'o', hedef: `k${i}`, miktar: 1, sahip: true, now: T })
  assert.deepEqual(hazineAktar({ chatJid, userJid: 'o', hedef: 'k9', miktar: 1, sahip: true, now: T }), { kisiSiniri: true })
  const d = hazineDurumu({ chatJid, now: T })
  assert.equal(d.kullanilan, 35_008)
  assert.equal(d.kisiler.length, 10)
  assert.equal(xp(chatJid, BOT), 10_000_000 - 35_008)

  // Ertesi gün sayaç sıfırlanır.
  assert.equal(hazineAktar({ chatJid, userJid: 'o', hedef: 'k9', miktar: 1, sahip: true, now: T + 24 * SAAT }).kisi, 1)
})

test('hazine: aktarım sınırı kendi aktarımıyla büyümez, 10 alıcıyla piyasa en çok 3 katına çıkar', () => {
  const uyeler = { [BOT]: 1_000_000_000 }
  for (let i = 0; i < 10; i++) uyeler[`k${i}`] = 10_000
  const chatJid = ayarla(uyeler)
  // Eskiden sınır her aktarımla büyüdüğü için tur tur verilerek 5+ alıcıyla kasa bir günde boşalıyordu.
  for (let tur = 0; tur < 20; tur++) {
    for (let i = 0; i < 10; i++) {
      const s = hazineAktar({ chatJid, userJid: 'o', hedef: `k${i}`, miktar: 1, sahip: true, now: T })
      if (s?.kalan) hazineAktar({ chatJid, userJid: 'o', hedef: `k${i}`, miktar: s.kalan, sahip: true, now: T })
    }
  }
  assert.ok(hazineDurumu({ chatJid, now: T }).kullanilan <= 2 * 100_000)
})

test('darbe: yönetim hemen geçer, seçim askıda, muhalife el konur, destekçi ödül alır', () => {
  const chatJid = ayarla({ o: 1, m: 10_000, d: 100, [BOT]: 1_000_000 })
  bankaYatir({ chatJid, userJid: 'm', miktar: 5000, now: T })
  adayOl({ chatJid, userJid: 'm', now: T })

  const { odul } = darbeBaslat({ chatJid, userJid: 'o', now: T })
  assert.equal(odul, 1_000_000)
  assert.equal(baskanMi(chatJid, 'o', T), true)
  assert.deepEqual(adayOl({ chatJid, userJid: 'd', now: T }), { askida: true })

  const cuzdan = xp(chatJid, 'm')
  const s = darbeSonuc({ chatJid, destekciler: ['d'], muhalifler: ['m', BOT], odul: 1000, now: T })
  assert.equal(s.ceza.length, 1)
  assert.equal(s.ceza[0].banka, 3000)
  assert.equal(xp(chatJid, 'm'), cuzdan - Math.floor(cuzdan * 0.6))
  assert.equal(bankaBakiyesi(chatJid, 'm'), 2000)
  assert.equal(s.borsa.every((h) => h.dusus >= 45 && h.dusus <= 55), true)
  assert.equal(xp(chatJid, 'd'), 1100)

  // Geçen haftanın adayı oy almış olsa da başkanlık darbede değişmez.
  oyVer({ chatJid, secmen: 'd', aday: 'm', now: T })
  assert.equal(baskanMi(chatJid, 'o', T + HAFTA), true)

  assert.equal(darbeBitir({ chatJid }), true)
  assert.ok(adayOl({ chatJid, userJid: 'm', now: T + HAFTA }).ucret >= 0)
  assert.equal(baskanMi(chatJid, 'o', T + HAFTA), true)
})

test('darbe akışı: duyuru, özel mesaj, yanıtla oy, süre sonunda sonuç', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { darbeDuyur, darbeYaniti, darbeSuruyor } = await import('../games/darbe.js')
  const { DARBE_SURE_MS } = await import('../lib/devlet.js')

  const chatJid = ayarla({ 'o@lid': 1, 'a@lid': 10_000, 'b@lid': 10_000, [BOT]: 1_000_000 })
  const gidenler = []
  const sock = {
    sendMessage: async (jid, icerik) => {
      gidenler.push({ jid, icerik })
      return { key: { id: `m${gidenler.length}` } }
    },
  }
  const metadata = {
    subject: 'Test',
    participants: [{ id: 'o@lid' }, { id: 'a@lid', jid: '90555@s.whatsapp.net' }, { id: 'b@lid' }, { id: BOT }],
  }

  darbeBaslat({ chatJid, userJid: 'o@lid', now: Date.now() })
  assert.equal(await darbeDuyur({ sock, chatJid, metadata, sahip: 'o@lid', odul: 500 }), true)
  assert.equal(await darbeDuyur({ sock, chatJid, metadata, sahip: 'o@lid', odul: 500 }), false)
  const duyuru = gidenler[0]
  assert.deepEqual(duyuru.icerik.mentions, ['o@lid', 'a@lid', 'b@lid'])

  const yanit = (sender, body, id = 'm1') => darbeYaniti({
    sock, msg: { key: { id: 'x' } }, parsed: { isGroup: true, from: chatJid, sender, body, quoted: { key: { id } } },
  })
  assert.equal(await yanit('a@lid', 'destek'), true)
  assert.equal(await yanit('b@lid', 'merhaba', 'baska'), false)

  await new Promise((r) => setImmediate(r))
  t.mock.timers.tick(3000)
  await new Promise((r) => setImmediate(r))
  const dmler = gidenler.filter((g) => !g.jid.endsWith('@g.us')).map((g) => g.jid)
  assert.deepEqual(dmler, ['90555@s.whatsapp.net', 'b@lid'])

  t.mock.timers.tick(DARBE_SURE_MS)
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
  assert.equal(darbeSuruyor(chatJid), false)
  const sonuc = gidenler.at(-1).icerik.text
  assert.match(sonuc, /DARBE TAMAMLANDI/)
  assert.equal(xp(chatJid, 'a@lid'), 10_500)
  assert.equal(xp(chatJid, 'b@lid'), 4000)
  assert.match(sonuc, /Borsa çöktü/)
})

test('makamRehberi: her makamın görevi, makamlar listesi, bilinmeyen null', async () => {
  const { makamRehberi, MAKAMLAR } = await import('../lib/devlet.js')
  for (const m of MAKAMLAR) {
    for (const ad of m.adlar) assert.ok(makamRehberi(ad).includes(m.ad), ad)
  }
  assert.ok(makamRehberi('Başkan').includes('.faizkararı'))
  assert.ok(makamRehberi('adalet').includes('%20'))
  assert.ok(makamRehberi('savunma').includes('24 saat'))
  const hepsi = makamRehberi('makamlar')
  for (const m of MAKAMLAR) assert.ok(hepsi.includes(m.ad))
  assert.equal(makamRehberi('sticker'), null)
  assert.equal(makamRehberi(''), null)
})
