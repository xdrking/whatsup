// .sulymarket, .hack, .çete baskın ve .nft. Veritabanı bellekte açılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { getDb } = await import('../lib/db.js')
const { BIRIM, sulyYaz } = await import('../lib/kripto.js')
const { NFTLER, nftBul, nftKomisyonu } = await import('../lib/nft.js')
const { nftGalerisi, nftKarti } = await import('../lib/nftResim.js')
const { baskinSansi, HACK_KORUNMA_MS, HACKERLAR, hackPayi, katliFiyat, marketKati, SERVET_REFERANS, silahKaybi, soygunBonusu, URUNLER, urunKoduyla } = await import('../lib/sulymarket.js')
const {
  bankaBakiyesi, bankaYatir, botHesabiniTani, ceteAyril, ceteBaskin, ceteDurumu, ceteKatil, ceteKur, ceteSoygunBonusu, ceteYatir,
  coinAyarla, coinDurumu, firarEt, getStats, hackYap, hapisDurumu, iflasEt, kalkanKir, karaborsaAl, karaborsaDurumu, mulkAl, mulkDurumu,
  nftAl, nftBoz, nftIlan, nftListesi, nftVer, rebornYap, servetDurumu, sulyMarketKati, xpAyarla,
} = await import('../lib/stats.js')
const { MULKLER } = await import('../lib/mulk.js')
const hackKomutu = (await import('../commands/hack.js')).default
const marketKomutu = (await import('../commands/sulymarket.js')).default
const nftKomutu = (await import('../commands/nft.js')).default
const ceteKomutu = (await import('../commands/cete.js')).default

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `12036300000${++sayac}@g.us`
const sulyVer = (chat, user, adet) =>
  getDb().prepare('INSERT INTO kripto (chat_jid, user_jid, birim) VALUES (?, ?, ?) ON CONFLICT (chat_jid, user_jid) DO UPDATE SET birim = excluded.birim').run(chat, user, adet * BIRIM)
const urun = urunKoduyla
const tutar = () => true
const tutmaz = () => false

test('katalog: kodlar benzersiz, her hacker satılıyor', () => {
  assert.equal(new Set(URUNLER.map((u) => u.kod)).size, URUNLER.length)
  for (const h of HACKERLAR) assert.equal(urun(h.kod)?.tur, 'hacker')
  assert.equal(new Set(NFTLER.map((n) => n.ad)).size, NFTLER.length)
  assert.ok(NFTLER.every((n, i) => n.no === i + 1 && nftBul(n.no) === n))
})

test('saf kurallar: baskın şansı, silah kaybı, soygun bonusu, hack payı', () => {
  assert.equal(baskinSansi(50, 50), 50)
  assert.equal(baskinSansi(1, 10_000), 10)
  assert.equal(baskinSansi(10_000, 1), 90)
  assert.equal(silahKaybi(4, 25, () => 99), 1)
  assert.equal(silahKaybi(1, 25, () => 24), 1)
  assert.equal(silahKaybi(1, 25, () => 25), 0)
  assert.equal(soygunBonusu(0), 0)
  assert.equal(soygunBonusu(1e6), 10)

  const varlik = { banka: 1000, cuzdan: -500, coin: 10, mulkler: [{ kod: 'ev', adet: 4, fiyat: 15 }, { kod: 'otel', adet: 2, fiyat: 250 }] }
  const [caylak, usta, kara] = HACKERLAR
  assert.deepEqual(hackPayi(caylak, varlik), { banka: 100, cuzdan: 0, coin: 0, mulkler: [] })
  assert.deepEqual(hackPayi(usta, varlik), { banka: 200, cuzdan: 0, coin: 0, mulkler: [{ kod: 'otel', adet: 1 }] })
  assert.deepEqual(hackPayi(kara, varlik), { banka: 300, cuzdan: 0, coin: 2, mulkler: [{ kod: 'otel', adet: 2 }] })
  for (let n = 1; n < 60; n++) {
    const p = hackPayi(usta, { banka: 0, cuzdan: 0, coin: 0, mulkler: [{ kod: 'ev', adet: n, fiyat: 1 }] })
    assert.deepEqual(p.mulkler, [{ kod: 'ev', adet: 1 }], `adet ${n}`)
  }
})

test('satın alma: Suly yanar, silah için çete gerekir, duvar süresi uzar', () => {
  const chatJid = yeniGrup()
  assert.equal(karaborsaAl({ chatJid, userJid: 'a', urun: urun('vpn'), now: T }).yetersiz, true)
  sulyVer(chatJid, 'a', 200)
  assert.equal(karaborsaAl({ chatJid, userJid: 'a', urun: urun('tabanca'), now: T }).ceteYok, true)
  assert.equal(karaborsaAl({ chatJid, userJid: 'a', urun: urun('vpn'), adet: 2, now: T }).birim, 170 * BIRIM)
  const bir = karaborsaAl({ chatJid, userJid: 'a', urun: urun('duvar'), now: T })
  const iki = karaborsaAl({ chatJid, userJid: 'a', urun: urun('duvar'), now: T })
  assert.equal(iki.duvar - bir.duvar, bir.duvar - T)
  assert.deepEqual(karaborsaDurumu({ chatJid, userJid: 'a', now: T }).envanter, [{ kod: 'vpn', adet: 2 }])
})

test('hack: para hackleyenin bankasına geçer, toplam değişmez, kurban korunur', () => {
  const chatJid = yeniGrup()
  sulyVer(chatJid, 'h', 5000)
  xpAyarla({ chatJid, userJid: 'k', miktar: 2_000_000 })
  bankaYatir({ chatJid, userJid: 'k', miktar: 1_000_000, now: T })
  coinAyarla({ chatJid, userJid: 'k', adet: 60 })
  for (let i = 0; i < 3; i++) mulkAl({ chatJid, userJid: 'k', mulk: MULKLER.find((m) => m.kod === 'ev'), now: T })
  sulyVer(chatJid, 'k', 20)
  nftAl({ chatJid, userJid: 'k', no: 11, now: T })

  const dene = (ek = {}) => hackYap({ chatJid, hacker: 'h', kurban: 'k', kod: 'karasapka', sans: tutar, rnd: () => 0, now: T, ...ek })
  assert.equal(dene().engel, 'hacker-yok')
  karaborsaAl({ chatJid, userJid: 'h', urun: urun('karasapka'), adet: 5, now: T })
  assert.equal(dene({ kurban: BOT }).engel, 'bot')
  assert.equal(dene({ kurban: 'h' }).engel, 'kendin')
  assert.equal(dene({ kurban: 'bos' }).engel, 'bos')

  const s = dene()
  assert.equal(s.basarili, true)
  assert.equal(s.para, 300_000 + 200_000)
  assert.equal(s.coin, 3)
  assert.equal(s.nft, 11)
  assert.deepEqual(s.mulkler, [{ kod: 'ev', adet: 1 }])
  assert.equal(bankaBakiyesi(chatJid, 'h'), 500_000)
  assert.equal(bankaBakiyesi(chatJid, 'k'), 700_000)
  assert.equal(getStats(chatJid, 'k').xp, 800_000)
  assert.equal(coinDurumu(chatJid, 'h').bakiye + coinDurumu(chatJid, 'k').bakiye, 15)
  assert.equal(mulkDurumu({ chatJid, userJid: 'h', now: T })[0].adet, 1)
  assert.equal(mulkDurumu({ chatJid, userJid: 'k', now: T })[0].adet, 2)
  assert.equal(nftListesi(chatJid, 'h')[0].no, 11)
  assert.equal(karaborsaDurumu({ chatJid, userJid: 'h', now: T }).envanter[0].adet, 4)

  assert.equal(dene().engel, 'korunma')
  const sonra = T + HACK_KORUNMA_MS - 60_000 * 60 * 2 // aynı gün, hâlâ korumada
  assert.equal(dene({ now: sonra }).engel, 'korunma')
})

test('hack: başarısızlıkta hapis, VPN varsa gizli; duvar engeli hacker yakmaz; günde 2 hak', () => {
  const chatJid = yeniGrup()
  sulyVer(chatJid, 'h', 5000)
  sulyVer(chatJid, 'k', 100)
  xpAyarla({ chatJid, userJid: 'k', miktar: 1_000_000 })
  bankaYatir({ chatJid, userJid: 'k', miktar: 500_000, now: T })
  karaborsaAl({ chatJid, userJid: 'h', urun: urun('caylak'), adet: 5, now: T })
  karaborsaAl({ chatJid, userJid: 'h', urun: urun('vpn'), now: T })
  const dene = (now = T, kurban = 'k') => hackYap({ chatJid, hacker: 'h', kurban, kod: 'caylak', sans: tutmaz, now })

  assert.deepEqual(dene(), { basarili: false, gizli: true })
  const yakalandi = dene()
  assert.equal(yakalandi.gizli, false)
  assert.equal(hapisDurumu(chatJid, 'h', T).bitis, yakalandi.hapis.bitis)
  assert.equal(dene().engel, 'hapis')
  assert.equal(firarEt({ chatJid, userJid: 'h', now: T }).yok, true)
  karaborsaAl({ chatJid, userJid: 'h', urun: urun('firar'), adet: 2, now: T })
  assert.equal(firarEt({ chatJid, userJid: 'h', now: T }).kacti, true)
  assert.equal(firarEt({ chatJid, userJid: 'h', now: T }).hapisteDegil, true)
  assert.equal(dene().engel, 'hak')

  const yarin = T + 24 * 3_600_000
  karaborsaAl({ chatJid, userJid: 'k', urun: urun('duvar'), now: yarin })
  assert.equal(dene(yarin).engel, 'duvar')
  assert.equal(karaborsaDurumu({ chatJid, userJid: 'h', now: yarin }).envanter.find((e) => e.kod === 'caylak').adet, 3)
  assert.equal(bankaBakiyesi(chatJid, 'k'), 500_000)
})

test('çilingir kalkanı kırar, unvan kalır, kalkan yoksa harcanmaz', () => {
  const chatJid = yeniGrup()
  sulyVer(chatJid, 'a', 100)
  karaborsaAl({ chatJid, userJid: 'a', urun: urun('cilingir'), now: T })
  assert.equal(kalkanKir({ chatJid, userJid: 'a', hedef: 'b', now: T }).kalkanYok, true)
  getDb().prepare("INSERT INTO market (chat_jid, user_jid, unvan, kalkan_until) VALUES (?, 'b', 'Kral', ?)").run(chatJid, T + 1000)
  assert.equal(kalkanKir({ chatJid, userJid: 'a', hedef: 'b', now: T }).kirildi, true)
  assert.deepEqual(getDb().prepare("SELECT unvan, kalkan_until FROM market WHERE chat_jid = ? AND user_jid = 'b'").get(chatJid), { unvan: 'Kral', kalkan_until: 0 })
  assert.deepEqual(karaborsaDurumu({ chatJid, userJid: 'a', now: T }).envanter, [])
})

test('çete: cephanelik, baskın, kasalar toplamı korunur, çete kapanınca silah silinir', () => {
  const chatJid = yeniGrup()
  for (const u of ['l', 'r']) {
    xpAyarla({ chatJid, userJid: u, miktar: 10_000_000 })
    sulyVer(chatJid, u, 2000)
  }
  ceteKur({ chatJid, userJid: 'l', ad: 'Aslan', anahtar: 'aslan', now: T })
  ceteKur({ chatJid, userJid: 'r', ad: 'Rakip', anahtar: 'rakip', now: T })
  ceteKatil({ chatJid, userJid: 'm', anahtar: 'aslan', now: T })
  ceteYatir({ chatJid, userJid: 'r', miktar: 1_000_000, now: T })
  const bas = (ek = {}) => ceteBaskin({ chatJid, userJid: 'l', anahtar: 'rakip', rnd: () => 0, now: T, ...ek })

  assert.equal(bas().engel, 'silahsiz')
  karaborsaAl({ chatJid, userJid: 'm', urun: urun('tabanca'), now: T })
  sulyVer(chatJid, 'm', 600)
  karaborsaAl({ chatJid, userJid: 'm', urun: urun('tabanca'), adet: 20, now: T })
  karaborsaAl({ chatJid, userJid: 'm', urun: urun('bomba'), adet: 2, now: T })
  karaborsaAl({ chatJid, userJid: 'r', urun: urun('zirhli'), adet: 4, now: T })
  assert.equal(ceteSoygunBonusu(chatJid, 'm'), 4)
  assert.equal(ceteSoygunBonusu(chatJid, 'yabanci'), 0)

  assert.equal(bas({ userJid: 'm' }).engel, 'lider-degil')
  assert.equal(bas({ anahtar: 'yok' }).engel, 'rakip-yok')
  assert.equal(bas({ anahtar: 'aslan' }).engel, 'kendi')
  assert.equal(bas({ bomba: 3 }).engel, 'bomba-yok')

  const s = bas({ bomba: 2 })
  assert.equal(s.kazandi, true)
  assert.equal(s.guc, 10 + 160 + 120)
  assert.equal(s.rakipGuc, 5 + 320)
  assert.equal(s.ganimet, 190_000)
  assert.deepEqual(s.rakipKayip, [{ kod: 'zirhli', adet: 1 }])
  const d = ceteDurumu({ chatJid, userJid: 'l', now: T })
  assert.equal(d.cete.kasa, 190_000)
  assert.equal(ceteDurumu({ chatJid, userJid: 'r', now: T }).cete.kasa, 760_000)
  assert.ok(!d.silahlar.some((x) => x.kod === 'bomba'))
  assert.ok(d.siralama.every((c) => c.guc > 0))

  assert.equal(bas().engel, 'bekle')
  assert.equal(bas({ now: T + 7 * 3_600_000 }).engel, 'korunma')
  const kayip = bas({ now: T + 13 * 3_600_000, rnd: () => 99 })
  assert.equal(kayip.kazandi, false)
  assert.equal(kayip.ganimet, 0)

  ceteAyril({ chatJid, userJid: 'r' })
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM cete_silah WHERE chat_jid = ? AND anahtar = 'rakip'").get(chatJid).n, 0)
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM cete_baskin WHERE chat_jid = ? AND anahtar = 'rakip'").get(chatJid).n, 0)
})

test('nft: tek sahip, ilan, komisyon, geri alım, borçlu engeli, iflas', () => {
  const chatJid = yeniGrup()
  const al = (userJid, no = 11) => nftAl({ chatJid, userJid, no, now: T })
  const suly = (u) => karaborsaDurumu({ chatJid, userJid: u, now: T }).birim

  assert.equal(al('a').yetersiz, true)
  sulyVer(chatJid, 'a', 100)
  sulyVer(chatJid, 'b', 100)
  assert.equal(al('a').satici, null)
  assert.equal(suly('a'), 80 * BIRIM)
  assert.equal(al('a').senin, true)
  assert.equal(al('b').satilikDegil, 'a')
  assert.equal(nftIlan({ chatJid, userJid: 'b', no: 11, fiyat: 1, now: T }).senDegil, true)
  nftIlan({ chatJid, userJid: 'a', no: 11, fiyat: 50 * BIRIM, now: T })
  assert.equal(al('b').satici, 'a')
  assert.equal(suly('b'), 50 * BIRIM)
  assert.equal(suly('a'), 80 * BIRIM + 50 * BIRIM - nftKomisyonu(50 * BIRIM))
  assert.equal(nftListesi(chatJid)[0].fiyat, 0, 'satılınca ilan düşer')

  xpAyarla({ chatJid, userJid: 'b', miktar: 0 })
  getDb().prepare("INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, 'b', 0, 0, 0, -50, 0) ON CONFLICT (chat_jid, user_jid) DO UPDATE SET xp = -50").run(chatJid)
  assert.equal(nftVer({ chatJid, userJid: 'b', hedef: 'a', no: 11, now: T }).borclu, true)
  assert.equal(nftIlan({ chatJid, userJid: 'b', no: 11, fiyat: 1, now: T }).borclu, true)
  getDb().prepare("DELETE FROM kripto WHERE chat_jid = ? AND user_jid = 'b'").run(chatJid)
  assert.equal(iflasEt({ chatJid, userJid: 'b', now: T }).nft, true)
  assert.equal(nftBoz({ chatJid, userJid: 'b', no: 11 }).odeme, 10 * BIRIM)
  assert.deepEqual(nftListesi(chatJid), [])
})

test('nft servete girer, reborn kara borsayı siler', () => {
  const chatJid = yeniGrup()
  sulyVer(chatJid, 'a', 500)
  nftAl({ chatJid, userJid: 'a', no: 1, now: T })
  karaborsaAl({ chatJid, userJid: 'a', urun: urun('vpn'), now: T })
  getDb().prepare("INSERT OR REPLACE INTO kripto_fiyat (sembol, usd, zaman) VALUES ('BTC', 100000, ?)").run(T)
  const s = servetDurumu({ chatJid, userJid: 'a', now: T })
  assert.ok(s.nft > 0)
  assert.equal(s.nftAdet, 1)
  rebornYap({ chatJid, now: T })
  assert.deepEqual(nftListesi(chatJid), [])
  assert.deepEqual(karaborsaDurumu({ chatJid, userJid: 'a', now: T }).envanter, [])
})

test('anlık fiyat: servet büyüdükçe artar, tabanın altına inmez, NFT bozmak Suly basmaz', () => {
  assert.equal(marketKati({ ortalama: 0, sulyXp: 1 }), 1)
  assert.equal(marketKati({ ortalama: 10, sulyXp: 1 }), 1)
  assert.equal(marketKati({ ortalama: SERVET_REFERANS * 4 * 50, sulyXp: 50 }), 4)
  assert.equal(marketKati({ ortalama: 5, sulyXp: 0 }), 1)
  assert.equal(katliFiyat(5, 1.1), 6)
  assert.equal(katliFiyat(15, 2), 30)

  const chatJid = yeniGrup()
  sulyVer(chatJid, 'a', 1_000_000)
  xpAyarla({ chatJid, userJid: 'b', miktar: 1000 })
  const kat = () => sulyMarketKati({ chatJid, now: T })
  getDb().prepare("INSERT OR REPLACE INTO kripto_fiyat (sembol, usd, zaman) VALUES ('BTC', 100000, ?)").run(T)
  sulyMarketKati({ chatJid, now: T }) // günün ekonomi kaydı açılsın
  const ilk = kat()
  xpAyarla({ chatJid, userJid: BOT, miktar: 900_000_000_000 })
  assert.equal(kat(), ilk, 'hazine sayılmaz')

  const ucuz = nftAl({ chatJid, userJid: 'a', no: 11, now: T })
  assert.equal(ucuz.fiyat, katliFiyat(20, ilk) * BIRIM)
  xpAyarla({ chatJid, userJid: 'b', miktar: 300_000_000_000_000 })
  assert.ok(kat() > ilk * 10)
  const pahali = nftAl({ chatJid, userJid: 'a', no: 12, now: T })
  assert.ok(!pahali.yetersiz && pahali.fiyat > ucuz.fiyat * 10)
  assert.equal(nftBoz({ chatJid, userJid: 'a', no: 11 }).odeme, ucuz.fiyat / 2, 'ucuzken alıp pahalıyken bozan kâr etmez')
  nftVer({ chatJid, userJid: 'a', hedef: 'b', no: 12, now: T })
  assert.equal(nftBoz({ chatJid, userJid: 'b', no: 12 }).odeme, pahali.fiyat / 2, 'el değiştirince alış fiyatı kalır')
  const s = karaborsaAl({ chatJid, userJid: 'a', urun: urun('karasapka'), now: T })
  assert.ok(s.yetersiz && s.ucret > 3000 * BIRIM)
})

test('nft görselleri çizilir', async () => {
  for (const no of [1, 4, 11]) assert.equal((await nftKarti(nftBul(no))).subarray(1, 4).toString(), 'PNG')
  assert.equal((await nftGalerisi(new Set([1]))).subarray(1, 4).toString(), 'PNG')
})

// --- Komutlar, sahte soketle ---

function sahteSoket(chatJid, uyeler) {
  const giden = []
  const metadata = { id: chatJid, subject: 'Deneme', participants: uyeler.map((id) => ({ id })) }
  return {
    giden,
    sendMessage: async (kime, icerik) => giden.push({ kime, metin: icerik.text ?? icerik.caption, ...icerik }),
    groupMetadata: async () => metadata,
    groupFetchAllParticipating: async () => ({ [chatJid]: metadata }),
  }
}
const H = '905551110001@s.whatsapp.net'
const K = '222000111222333@lid'

test('.hack: grupta reddedilir, özelden listeler, id ile hackler, gruba hackleyeni yazmadan duyurur', async () => {
  const chatJid = yeniGrup()
  const sock = sahteSoket(chatJid, [H, K, BOT])
  const calistir = (args, isGroup = false) => hackKomutu.execute({
    sock, msg: {}, args, from: isGroup ? chatJid : H, parsed: { isGroup, sender: H, senderPn: H, mentions: [] },
  })
  const son = () => sock.giden.at(-1)

  await calistir([K], true)
  assert.match(son().metin, /özelden/)
  await calistir([])
  assert.match(son().metin, /hacker ya da fidye yazılımı yok/)

  sulyVer(chatJid, H, 1000)
  karaborsaAl({ chatJid, userJid: H, urun: urun('usta'), adet: 5 })
  karaborsaAl({ chatJid, userJid: H, urun: urun('vpn'), adet: 5 })
  xpAyarla({ chatJid, userJid: K, miktar: 1_000_000 })

  await calistir([])
  assert.ok(son().metin.includes(K))
  assert.ok(!son().metin.includes('905550000000'), 'bot hedef listesinde yok')
  await calistir(['999999999999'])
  assert.match(son().metin, /bulunamadı/)

  sock.giden.length = 0
  await calistir([K.replace('@lid', ''), 'usta'])
  assert.equal(sock.giden.length, 2)
  const [ozel, grup] = sock.giden
  assert.equal(ozel.kime, H)
  assert.equal(grup.kime, chatJid)
  assert.deepEqual(grup.mentions, [K], 'VPN ya da başarı: hackleyen yazılmaz')
  assert.ok(!grup.metin.includes('905551110001'))
})

test('.sulymarket, .nft ve .çete bas komutları', async () => {
  const chatJid = yeniGrup()
  const sock = sahteSoket(chatJid, [H, K, BOT])
  const calistir = (komut, text, isGroup = true) => komut.execute({
    sock, msg: {}, args: text.split(' ').filter(Boolean), text, from: isGroup ? chatJid : H, sender: H, parsed: { isGroup, sender: H, senderPn: H, mentions: [] },
  })
  const son = () => sock.giden.at(-1)
  sulyVer(chatJid, H, 1000)
  xpAyarla({ chatJid, userJid: H, miktar: 10_000_000 })

  await calistir(marketKomutu, '')
  for (const u of URUNLER) assert.ok(son().metin.includes(u.ad), u.kod)
  await calistir(marketKomutu, 'al 10 2', false)
  assert.match(son().metin, /VPN x2/)
  assert.equal(son().kime, H)
  await calistir(marketKomutu, 'al 99')
  assert.match(son().metin, /numarası/)
  await calistir(marketKomutu, 'al 2')
  assert.match(son().metin, /çeten olmalı/)

  await calistir(nftKomutu, '')
  assert.ok(son().image)
  await calistir(nftKomutu, 'al 30')
  assert.match(son().metin, /artık senin/)
  const { alis } = nftListesi(chatJid)[0]
  assert.ok(alis >= 20)
  await calistir(nftKomutu, 'sat 30 0.5')
  assert.match(son().metin, /0,5 Suly/)
  await calistir(nftKomutu, '30')
  assert.match(son().metin, /Satılık/)
  await calistir(nftKomutu, 'boz 30')
  assert.match(son().metin, new RegExp(`\\+${sulyYaz((alis * BIRIM) / 2)} Suly`))

  ceteKur({ chatJid, userJid: H, ad: 'Aslan', anahtar: 'aslan' })
  ceteKur({ chatJid, userJid: 'r', ad: 'Tim 9', anahtar: 'tim 9' })
  xpAyarla({ chatJid, userJid: 'r', miktar: 10_000_000 })
  ceteKur({ chatJid, userJid: 'r', ad: 'Tim 9', anahtar: 'tim 9' })
  await calistir(marketKomutu, 'al 2 3')
  assert.match(son().metin, /Aslan cephaneliğine/)
  await calistir(ceteKomutu, 'bas tim 9 1')
  assert.match(son().metin, /O kadar bomba yok/)
  await calistir(ceteKomutu, 'bas tim 9')
  assert.match(son().metin, /BASKIN/)
  await calistir(ceteKomutu, '')
  assert.match(son().metin, /Tabanca|boş/)
})
