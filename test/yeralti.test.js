// .vurgun, .offshore, .izsür, fidye, .muhbir, sahte kimlik, gizemli kutu. Veritabanı bellekte açılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { getDb } = await import('../lib/db.js')
const { BIRIM } = await import('../lib/kripto.js')
const { NFT_GERI_ALIM, NADIRLIK } = await import('../lib/nft.js')
const { URUNLER, urunKoduyla } = await import('../lib/sulymarket.js')
const {
  IZ_SURESI_MS, KUTU_ODULLERI, kutuCek, ROLLER, rolBul, VURGUN_ARALIGI_MS, vurgunGanimeti, vurgunSansi, OFFSHORE_BASKIN_YUZDESI,
  FIDYE_MS, fidyeTutari, MUHBIR_KIM, OFFSHORE_KOMISYON, OFFSHORE_RISK,
} = await import('../lib/yeralti.js')
const {
  bankaBakiyesi, bankaCek, bankaYatir, botHesabiniTani, ceteKur, ekonomiDurumu, fidyeDurumu, fidyeKilitle, fidyeOde, getStats, hackYap, hapisDurumu,
  hazineDurumu, iflasEt, izListesi, izSur, karaborsaAl, karaborsaDurumu, krediCek, maskeBitisi, maskeTak, muhbirDosya, muhbirKim, offshoreCek,
  offshoreDurumu, offshoreYatir, recordMessage, servetDurumu, topluHaciz, vurgunBekleme, vurgunYap, xpAyarla,
} = await import('../lib/stats.js')
const { endGame, getGame } = await import('../games/gameManager.js')
const komut = async (ad) => (await import(`../commands/${ad}.js`)).default

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const SAAT = 3_600_000
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `12036399000${++sayac}@g.us`
const db = getDb()
const sulyVer = (chat, user, adet) =>
  db.prepare('INSERT INTO kripto (chat_jid, user_jid, birim) VALUES (?, ?, ?) ON CONFLICT (chat_jid, user_jid) DO UPDATE SET birim = excluded.birim').run(chat, user, adet * BIRIM)
const envanterVer = (chat, user, kod, adet = 1) =>
  db.prepare('INSERT INTO karaborsa (chat_jid, user_jid, kod, adet) VALUES (?, ?, ?, ?) ON CONFLICT (chat_jid, user_jid, kod) DO UPDATE SET adet = adet + excluded.adet').run(chat, user, kod, adet)
const xpVer = (chatJid, userJid, miktar) => xpAyarla({ chatJid, userJid, miktar })
const xp = (chat, user) => getStats(chat, user).xp
const bakan = (chat, user) => db.prepare("INSERT INTO makam (chat_jid, makam, user_jid) VALUES (?, 'icisleri', ?)").run(chat, user)
const eldeki = (chatJid, userJid) => Object.fromEntries(karaborsaDurumu({ chatJid, userJid, now: T }).envanter.map((e) => [e.kod, e.adet]))
const tutar = () => true
const tutmaz = () => false

test('saf kurallar: roller, vurgun şansı ve ganimet sınırı', () => {
  assert.equal(rolBul('Şoför').kod, 'sofor')
  assert.equal(rolBul('pilot'), null)
  assert.equal(vurgunSansi({ roller: ['sofor', 'gozcu'] }), 25)
  assert.equal(vurgunSansi({ roller: ROLLER.map((r) => r.kod), hacker: 'karasapka', silahBonusu: 10 }), 65)
  // Hazine piyasadan kat kat büyükse ganimeti piyasa sınırlar.
  assert.equal(vurgunGanimeti(1_000_000, 1000), 100)
  assert.equal(vurgunGanimeti(1000, 1_000_000), 100)
})

test('gizemli kutu: ağırlıklar 100, her ürün katalogda, beklenen değer fiyatın altında', () => {
  assert.equal(KUTU_ODULLERI.reduce((t, o) => t + o.agirlik, 0), 100)
  const vpn = urunKoduyla('vpn').fiyat
  const beklenen = KUTU_ODULLERI.reduce((t, o) => {
    const u = o.kod && urunKoduyla(o.kod)
    if (o.kod) assert.ok(u, o.kod)
    const deger = o.tur === 'nft' ? Math.max(NADIRLIK.siradan.fiyat, vpn) : !u ? 0 : u.tur === 'silah' ? Math.max(u.fiyat * o.adet, vpn) : u.fiyat * o.adet
    return t + (o.agirlik / 100) * deger
  }, 0)
  assert.ok(beklenen < urunKoduyla('kutu').fiyat, `beklenen ${beklenen}`)
  assert.equal(kutuCek(() => 0).tur, 'bos')
  assert.equal(kutuCek(() => 99).tur, 'nft')
  assert.ok((NADIRLIK.siradan.fiyat * NFT_GERI_ALIM) / 100 < urunKoduyla('kutu').fiyat)
})

test('gizemli kutu: polis, NFT ve silah; ceza kısalmaz', () => {
  const chatJid = yeniGrup()
  sulyVer(chatJid, 'a', 1000)
  const ac = (n, userJid = 'a') => karaborsaAl({ chatJid, userJid, urun: urunKoduyla('kutu'), rnd: (k) => Math.min(n, k - 1), now: T }).kutu
  const sira = (f) => KUTU_ODULLERI.slice(0, KUTU_ODULLERI.findIndex(f)).reduce((t, o) => t + o.agirlik, 0)

  db.prepare('INSERT INTO hapis (chat_jid, user_jid, bitis, kefalet) VALUES (?, ?, ?, 0)').run(chatJid, 'a', T + 5 * SAAT)
  assert.equal(ac(sira((o) => o.tur === 'polis')).hapis.bitis, T + 5 * SAAT)
  assert.ok(ac(99).nft)
  assert.deepEqual(ac(sira((o) => o.kod === 'tabanca')), { kod: 'vpn', adet: 1 }, 'çetesize silah yerine VPN')
  xpVer(chatJid, 'b', 100_000_000)
  sulyVer(chatJid, 'b', 100)
  ceteKur({ chatJid, userJid: 'b', ad: 'Kurt', anahtar: 'kurt' })
  assert.equal(ac(sira((o) => o.kod === 'tabanca'), 'b').cete, 'Kurt')
  assert.equal(karaborsaDurumu({ chatJid, userJid: 'b', now: T }).birim, 75 * BIRIM)
})

test('vurgun: ganimet hazineden çıkar, para basılmaz, bekleme işler', () => {
  const chatJid = yeniGrup()
  for (const u of ['a', 'b', 'c']) xpVer(chatJid, u, 1_000_000)
  xpVer(chatJid, BOT, 50_000_000)
  envanterVer(chatJid, 'a', 'caylak')
  envanterVer(chatJid, 'a', 'karasapka')
  const ekip = [{ jid: 'a', rol: 'hacker' }, { jid: 'b', rol: 'sofor' }, { jid: 'c', rol: 'gozcu' }]

  assert.equal(vurgunYap({ chatJid, ekip: [{ jid: 'b', rol: 'hacker' }], now: T }).engel, 'hacker-yok')
  assert.equal(vurgunYap({ chatJid, ekip: [{ jid: 'b', rol: 'kasaci' }], now: T }).engel, 'cilingir-yok')
  assert.equal(vurgunYap({ chatJid, ekip: [{ jid: 'b', rol: 'silahci' }], now: T }).engel, 'silah-yok')

  const oncekiArz = ekonomiDurumu({ chatJid, now: T }).anlik
  const s = vurgunYap({ chatJid, ekip, rnd: () => 0, now: T })
  assert.equal(s.basarili, true)
  assert.equal(s.sans, 45)
  assert.equal(s.toplam, s.pay * 3)
  assert.ok(s.toplam <= oncekiArz / 10)
  assert.equal(xp(chatJid, 'b'), 1_000_000 + s.pay)
  assert.equal(xp(chatJid, BOT), 50_000_000 - s.toplam, 'hazineden çıkan oyuncuya girenle aynı')
  assert.deepEqual(eldeki(chatJid, 'a'), { caylak: 1 }, 'en iyi hacker harcanır')

  assert.ok(vurgunBekleme(chatJid, T + 1) > 0)
  assert.equal(vurgunYap({ chatJid, ekip, rnd: () => 0, now: T + SAAT }).engel, 'bekle')
  assert.equal(vurgunBekleme(chatJid, T + VURGUN_ARALIGI_MS), 0)
})

test('vurgun başarısız: VPN kaçırır, diğeri hapse girer, para değişmez', () => {
  const chatJid = yeniGrup()
  for (const u of ['a', 'b', 'c']) xpVer(chatJid, u, 1_000_000)
  xpVer(chatJid, BOT, 50_000_000)
  envanterVer(chatJid, 'a', 'vpn')
  const s = vurgunYap({ chatJid, ekip: [{ jid: 'a', rol: 'sofor' }, { jid: 'b', rol: 'gozcu' }, { jid: 'c', rol: 'gozcu' }], rnd: () => 99, now: T })
  assert.deepEqual(s.kacanlar, ['a'])
  assert.deepEqual(s.yakalananlar.map((y) => y.jid), ['b', 'c'])
  assert.equal(xp(chatJid, 'b'), 1_000_000)
  assert.equal(xp(chatJid, BOT), 50_000_000)
  assert.deepEqual(eldeki(chatJid, 'a'), {})
  assert.ok(hapisDurumu(chatJid, 'b', T))
})

test('offshore: komisyon yanar, kilitli para arzda kalır, hacizall dokunmaz, baskın yarısını alır', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'a', 100_000)
  const arz = ekonomiDurumu({ chatJid, now: T }).anlik
  const s = offshoreYatir({ chatJid, userJid: 'a', miktar: 100_000, gun: 2, rnd: () => 99, now: T })
  assert.equal(s.net, 100_000 - (100_000 * OFFSHORE_KOMISYON) / 100)
  assert.equal(ekonomiDurumu({ chatJid, now: T }).anlik, arz - s.komisyon, 'kuru düşürmesin')
  assert.equal(offshoreYatir({ chatJid, userJid: 'a', miktar: 10, gun: 1, now: T }).acik, true)
  assert.equal(offshoreCek({ chatJid, userJid: 'a', now: T + SAAT }).bekle, s.bitis)
  assert.equal(servetDurumu({ chatJid, userJid: 'a', now: T }).net, 0, 'net servete girmez')
  assert.equal(servetDurumu({ chatJid, userJid: 'a', now: T }).offshore, 90_000)

  db.prepare('INSERT INTO coin (chat_jid, user_jid, bakiye) VALUES (?, ?, 500)').run(chatJid, 'z')
  topluHaciz({ chatJid, userJid: 'z', now: T })
  assert.equal(offshoreDurumu({ chatJid, userJid: 'a' }).hesap.miktar, 90_000)

  assert.equal(offshoreCek({ chatJid, userJid: 'a', now: s.bitis }).odeme, 90_000)
  assert.equal(offshoreCek({ chatJid, userJid: 'a', now: s.bitis }).yok, true)

  const b = offshoreYatir({ chatJid, userJid: 'a', miktar: 90_000, gun: 3, rnd: () => OFFSHORE_RISK * 3 - 1, now: T })
  const c = offshoreCek({ chatJid, userJid: 'a', now: b.bitis })
  assert.equal(c.elKonan, (b.net * OFFSHORE_BASKIN_YUZDESI) / 100)
  assert.equal(bankaBakiyesi(chatJid, BOT), c.elKonan, 'el konan hazineye girer')
  assert.equal(c.odeme + c.elKonan, b.net)
})

test('offshore: borçlu yatıramaz, doluyken iflas edilmez', () => {
  const chatJid = yeniGrup()
  db.prepare('INSERT INTO banka (chat_jid, user_jid, bakiye, faiz_saat) VALUES (?, ?, 1000000, 0)').run(chatJid, BOT)
  xpVer(chatJid, 'a', 1000)
  assert.ok(!krediCek({ chatJid, userJid: 'a', miktar: 500, now: T }).yasak)
  assert.equal(offshoreYatir({ chatJid, userJid: 'a', miktar: 100, gun: 1, now: T }).borclu, true)

  xpVer(chatJid, 'b', 1000)
  offshoreYatir({ chatJid, userJid: 'b', miktar: 1000, gun: 1, rnd: () => 99, now: T })
  db.prepare('UPDATE stats SET xp = -50 WHERE chat_jid = ? AND user_jid = ?').run(chatJid, 'b')
  assert.equal(iflasEt({ chatJid, userJid: 'b', now: T }).offshore, true)
})

function hackKur(chatJid, vpn) {
  xpVer(chatJid, 'kurban', 100_000)
  bankaYatir({ chatJid, userJid: 'kurban', miktar: 100_000, now: T })
  envanterVer(chatJid, 'hacker', 'caylak')
  if (vpn) envanterVer(chatJid, 'hacker', 'vpn')
  return hackYap({ chatJid, hacker: 'hacker', kurban: 'kurban', kod: 'caylak', sans: tutar, now: T })
}

test('izsür: VPN\'siz saldırgan bulunur, yarısı döner; VPN\'li iz kaybolur', () => {
  const chatJid = yeniGrup()
  assert.equal(hackKur(chatJid, false).vpn, false)
  const [kayit] = izListesi(chatJid, T)
  assert.equal(kayit.para, 10_000)
  assert.ok(!('saldiran' in kayit), 'liste saldırganı söylemez')

  assert.equal(izSur({ chatJid, userJid: 'polis', id: kayit.id, now: T }).degil, true)
  bakan(chatJid, 'polis')
  assert.equal(izSur({ chatJid, userJid: 'polis', id: 999_999, now: T }).yok, true)
  assert.deepEqual(izSur({ chatJid, userJid: 'polis', id: kayit.id, rnd: () => 99, now: T }), { kalan: 4, bulunamadi: true })
  const s = izSur({ chatJid, userJid: 'polis', id: kayit.id, rnd: () => 0, now: T })
  assert.equal(s.saldiran, 'hacker')
  assert.equal(s.iade, 5000)
  assert.equal(bankaBakiyesi(chatJid, 'kurban'), 95_000)
  assert.equal(bankaBakiyesi(chatJid, 'hacker'), 5000)
  assert.ok(hapisDurumu(chatJid, 'hacker', T))
  assert.equal(izSur({ chatJid, userJid: 'polis', id: kayit.id, now: T }).yok, true, 'çözülen dosya kapanır')

  const b = yeniGrup()
  assert.equal(hackKur(b, true).vpn, true)
  assert.deepEqual(eldeki(b, 'hacker'), {}, 'VPN başarıda da harcanır')
  bakan(b, 'polis')
  const [vpnli] = izListesi(b, T)
  assert.equal(izSur({ chatJid: b, userJid: 'polis', id: vpnli.id, rnd: () => 0, now: T }).izKayip, true)
  assert.deepEqual(izListesi(b, T), [])
})

test('izsür: günlük hak biter, eski dosya sürülmez, bakan kendini ele vermez', () => {
  const chatJid = yeniGrup()
  hackKur(chatJid, false)
  bakan(chatJid, 'hacker')
  const { id } = izListesi(chatJid, T)[0]
  for (let i = 0; i < 5; i++) assert.equal(izSur({ chatJid, userJid: 'hacker', id, rnd: () => 0, now: T }).bulunamadi, true)
  assert.equal(izSur({ chatJid, userJid: 'hacker', id, now: T }).bugunVar, true)
  assert.equal(izSur({ chatJid, userJid: 'hacker', id, now: T + IZ_SURESI_MS }).yok, true)
})

test('fidye: banka çekimi kilitlenir, ödeme saldırgana geçer, süre dolunca açılır', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'kurban', 100_000)
  bankaYatir({ chatJid, userJid: 'kurban', miktar: 100_000, now: T })
  const ortak = { chatJid, hacker: 'hacker', kurban: 'kurban', now: T }
  assert.equal(fidyeKilitle({ ...ortak, sans: tutar }).engel, 'fidye-yok')
  envanterVer(chatJid, 'hacker', 'fidye', 2)
  assert.equal(fidyeKilitle({ ...ortak, kurban: BOT, sans: tutar }).engel, 'bot')
  assert.equal(fidyeKilitle({ ...ortak, kurban: 'bosadam', sans: tutar }).engel, 'bos')

  const s = fidyeKilitle({ ...ortak, sans: tutar })
  assert.equal(s.tutar, fidyeTutari(100_000))
  const cek = { chatJid, userJid: 'kurban', miktar: 10 }
  assert.equal(bankaCek({ ...cek, now: T + 1 }).kilitli, T + FIDYE_MS)
  assert.ok(bankaCek({ ...cek, now: T + FIDYE_MS }).xp >= 0)
  assert.equal(fidyeDurumu(chatJid, 'kurban', T + FIDYE_MS), null)
  assert.equal(fidyeKilitle({ ...ortak, sans: tutar }).engel, 'korunma')

  const oncesi = bankaBakiyesi(chatJid, 'kurban')
  const o = fidyeOde({ chatJid, userJid: 'kurban', now: T + 1 })
  assert.equal(o.odenen, s.tutar)
  assert.equal(bankaBakiyesi(chatJid, 'hacker'), s.tutar)
  assert.equal(bankaBakiyesi(chatJid, 'kurban'), oncesi - s.tutar)
  assert.equal(fidyeOde({ chatJid, userJid: 'kurban', now: T + 1 }).yok, true)
  assert.equal(izListesi(chatJid, T + 1)[0].para, s.tutar, 'ödenen fidye dosyaya yazılır')
})

test('fidye başarısız: hapis; iz bulununca kilit kalkar', () => {
  const chatJid = yeniGrup()
  xpVer(chatJid, 'kurban', 100_000)
  bankaYatir({ chatJid, userJid: 'kurban', miktar: 100_000, now: T })
  envanterVer(chatJid, 'h1', 'fidye')
  assert.ok(fidyeKilitle({ chatJid, hacker: 'h1', kurban: 'kurban', sans: tutmaz, now: T }).hapis)
  assert.equal(fidyeDurumu(chatJid, 'kurban', T), null)

  envanterVer(chatJid, 'h2', 'fidye')
  fidyeKilitle({ chatJid, hacker: 'h2', kurban: 'kurban', sans: tutar, now: T })
  bakan(chatJid, 'polis')
  const s = izSur({ chatJid, userJid: 'polis', id: izListesi(chatJid, T)[0].id, rnd: () => 0, now: T })
  assert.equal(s.saldiran, 'h2')
  assert.equal(s.iade, 0)
  assert.equal(fidyeDurumu(chatJid, 'kurban', T), null)
})

test('muhbir: bilmediğine para almaz, bilince Suly yanar; dosya gizli varlığı gösterir', () => {
  const chatJid = yeniGrup()
  sulyVer(chatJid, 'kurban', 100)
  assert.equal(muhbirKim({ chatJid, userJid: 'kurban', now: T }).yok, true)
  hackKur(chatJid, false)
  const s = muhbirKim({ chatJid, userJid: 'kurban', now: T })
  assert.equal(s.saldiran, 'hacker')
  assert.equal(s.birim, (100 - MUHBIR_KIM) * BIRIM)

  xpVer(chatJid, 'hacker', 1000)
  offshoreYatir({ chatJid, userJid: 'hacker', miktar: 1000, gun: 1, rnd: () => 99, now: T })
  const d = muhbirDosya({ chatJid, userJid: 'kurban', hedef: 'hacker', now: T })
  assert.equal(d.offshore.miktar, 900)
  assert.equal(muhbirDosya({ chatJid, userJid: 'kurban', hedef: BOT, now: T }).bot, true)
  assert.equal(muhbirDosya({ chatJid, userJid: 'fakir', hedef: 'hacker', now: T }).yetersiz, true)

  const b = yeniGrup()
  sulyVer(b, 'kurban', 100)
  hackKur(b, true)
  assert.equal(muhbirKim({ chatJid: b, userJid: 'kurban', now: T }).vpn, true)
  assert.equal(karaborsaDurumu({ chatJid: b, userJid: 'kurban', now: T }).birim, 100 * BIRIM)
})

test('sahte kimlik: takılınca harcanır, süre üst üste biner', () => {
  const chatJid = yeniGrup()
  assert.equal(maskeTak({ chatJid, userJid: 'a', now: T }).yok, true)
  envanterVer(chatJid, 'a', 'kimlik', 2)
  maskeTak({ chatJid, userJid: 'a', now: T })
  assert.equal(maskeTak({ chatJid, userJid: 'a', now: T }).bitis, T + 2 * SAAT)
  assert.equal(maskeBitisi(chatJid, 'a', T + 2 * SAAT), 0)
})

const H = '111111@lid'
const K = '222222@lid'
function sahteSoket(chatJid, uyeler) {
  const giden = []
  const grup = { id: chatJid, subject: 'G', participants: uyeler.map((id) => ({ id, jid: id.replace('@lid', '00@s.whatsapp.net') })) }
  return {
    giden,
    sendMessage: async (kime, icerik) => {
      giden.push({ kime, metin: icerik.text ?? icerik.caption ?? '', mentions: icerik.mentions ?? [] })
      return { key: { id: `m${giden.length}` } }
    },
    groupMetadata: async () => grup,
    groupFetchAllParticipating: async () => ({ [chatJid]: grup }),
  }
}

test('komutlar: maskeli soygun özelden, grupta ad yazmaz; muhbir ve offshore', async () => {
  const chatJid = yeniGrup()
  const sock = sahteSoket(chatJid, [H, K, BOT])
  const calistir = (k, text, isGroup = false) => k.execute({
    sock, msg: {}, args: text.split(' ').filter(Boolean), text, from: isGroup ? chatJid : H, sender: H, isOwner: false,
    parsed: { isGroup, sender: H, senderPn: H, mentions: [] },
  })
  const son = () => sock.giden.at(-1)
  const soygun = await komut('soygun')

  await calistir(soygun, K)
  assert.match(son().metin, /sahte kimlik gerekir/)
  xpVer(chatJid, H, 100_000)
  xpVer(chatJid, K, 100_000)
  envanterVer(chatJid, H, 'kimlik')
  await calistir(await komut('sulymarket'), 'kullan kimlik')
  assert.match(son().metin, /Maske takıldı/)
  sock.giden.length = 0
  await calistir(soygun, K)
  const grupta = sock.giden.find((g) => g.kime === chatJid)
  if (/MASKELİ/.test(grupta.metin)) {
    assert.deepEqual(grupta.mentions, [K])
    assert.ok(!grupta.metin.includes('111111'))
  } else assert.match(grupta.metin, /Maske düştü/)

  await calistir(await komut('muhbir'), 'kim', true)
  assert.match(son().metin, /özelden/)
  await calistir(await komut('muhbir'), 'kim')
  assert.match(son().metin, /Para almadı/)
  await calistir(await komut('muhbir'), `dosya ${K}`)
  assert.match(son().metin, /Suly istiyor/)

  await calistir(await komut('offshore'), 'yatır 1000 2')
  assert.match(son().metin, /900 XP/)
  await calistir(await komut('offshore'), '', true)
  assert.ok(!son().metin.includes('900'), 'tutar grupta yazılmaz')
  await calistir(await komut('offshore'), 'yatır 1000 9')
  assert.match(son().metin, /1 ile 3/)
  await calistir(await komut('izsur'), '', true)
  assert.match(son().metin, /çözülmemiş/)
  await calistir(await komut('fidye'), '', true)
  assert.match(son().metin, /kilitli değil/)
})

test('.vurgun lobisi: rol seçilir, kuran başlatır, eksik ekip başlamaz', async () => {
  const chatJid = yeniGrup()
  const sock = sahteSoket(chatJid, ['a', 'b', 'c'])
  const vurgun = await komut('vurgun')
  await vurgun.execute({ sock, msg: {}, args: [], from: chatJid, sender: 'a', parsed: { isGroup: true, sender: 'a' } })
  const state = getGame(chatJid)
  assert.equal(state.type, 'vurgun')
  const yaz = (kim, body) => state.onAnswer({ sock, msg: {}, parsed: { sender: kim }, state, body })
  const son = () => sock.giden.at(-1).metin

  await yaz('a', 'pilot')
  assert.match(son(), /Rolünü yaz/)
  await yaz('a', 'şoför')
  await yaz('b', 'şoför')
  assert.match(son(), /dolu/)
  await yaz('b', 'gözcü')
  await yaz('a', 'başla')
  assert.match(son(), /En az 3/)
  await yaz('b', 'başla')
  assert.match(son(), /yalnızca kuran/)
  await yaz('c', 'hacker')
  for (const u of ['a', 'b', 'c']) xpVer(chatJid, u, 100_000)
  xpVer(chatJid, BOT, 10_000_000)
  await yaz('a', 'başla')
  assert.match(son(), /hacker'sız/)
  envanterVer(chatJid, 'c', 'caylak')
  await yaz('a', 'başla')
  assert.match(son(), /VURGUN/)
  assert.equal(getGame(chatJid), null)
  endGame(chatJid)
})
