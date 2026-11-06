// .hapis, .seçim, .evlen, .meslek, .çete, .dava ve .özet.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { kefaletTutari } = await import('../lib/hapis.js')
const { ceteAdi } = await import('../lib/cete.js')
const { davaKarari } = await import('../lib/dava.js')
const { maasHesapla, meslekBul, MESLEKLER } = await import('../lib/meslek.js')
const { kumarEngeli } = await import('../lib/kumar.js')
const {
  adayOl, bankaBakiyesi, bankaYatir, baskanMi, botHesabiniTani, bosan, calis, ceteAt, ceteAyril, ceteCek, ceteDurumu,
  ceteKatil, ceteKur, ceteYatir, davaAc, davaOde, ekonomiDurumu, esBul, evlen, faizDurumu, faizKarari, getStats, haftaOzeti,
  hapisDurumu, hapistekiler, iflasEt, kefaletOde, krediCek, kumarYasagi, meslekSec, oyVer, recordMessage, secimDurumu,
  sezonDurumu, soygunYap, sosyalDurum, xpAyarla,
} = await import('../lib/stats.js')

const SAAT = 3_600_000
const HAFTA = 7 * 24 * SAAT
// Çarşamba öğlen.
const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `t${++sayac}@g.us`
const xp = (chatJid, userJid) => getStats(chatJid, userJid).xp
const ver = (chatJid, userJid, miktar) => xpAyarla({ chatJid, userJid, miktar })

function ayarla(uyeler) {
  const chatJid = yeniGrup()
  for (const [jid, miktar] of Object.entries(uyeler)) ver(chatJid, jid, miktar)
  return chatJid
}

test('kefalet: cüzdanın %20\'si, en az 100', () => {
  assert.equal(kefaletTutari(10_000), 2000)
  assert.equal(kefaletTutari(50), 100)
})

test('yakalanan hapse girer: kumar yasağı işler, süre dolunca çıkar', () => {
  const chatJid = ayarla({ h: 1000, k: 1000 })
  const s = soygunYap({ chatJid, hirsiz: 'h', kurban: 'k', sans: () => false, now: T })
  assert.equal(s.hapis.bitis, T + 2 * SAAT)

  assert.deepEqual(hapisDurumu(chatJid, 'h', T + 1), s.hapis)
  assert.equal(hapistekiler(chatJid, T + 1).length, 1)
  assert.equal(kumarYasagi(chatJid, 'h'), T + 2 * SAAT)
  assert.match(kumarEngeli(5000, kumarYasagi(chatJid, 'h'), T + 1), /yasağın var/)

  assert.equal(hapisDurumu(chatJid, 'h', T + 2 * SAAT), null)
  assert.equal(hapistekiler(chatJid, T + 2 * SAAT).length, 0)
})

test('başarılı soygun hapse sokmaz', () => {
  const chatJid = ayarla({ h: 1000, k: 1000 })
  soygunYap({ chatJid, hirsiz: 'h', kurban: 'k', sans: () => true, now: T })
  assert.equal(hapisDurumu(chatJid, 'h', T), null)
})

test('kefalet: XP yanar, başkası öder, eş yarı fiyata öder', () => {
  const chatJid = ayarla({ h: 10_000, k: 1000, a: 5000, e: 5000 })
  const { hapis } = soygunYap({ chatJid, hirsiz: 'h', kurban: 'k', sans: () => false, now: T })
  assert.equal(hapis.kefalet, 1800)

  assert.deepEqual(kefaletOde({ chatJid, odeyen: 'a', mahkum: 'k', now: T }), { yok: true })
  ver(chatJid, 'a', -4000)
  assert.deepEqual(kefaletOde({ chatJid, odeyen: 'a', mahkum: 'h', now: T }), { yetersiz: true, xp: 1000, ucret: 1800 })

  evlen({ chatJid, a: 'h', b: 'e', now: T })
  assert.deepEqual(kefaletOde({ chatJid, odeyen: 'e', mahkum: 'h', now: T }), { ucret: 900, es: true, xp: 4100 })
  assert.equal(hapisDurumu(chatJid, 'h', T), null)
  assert.equal(kumarYasagi(chatJid, 'h'), 0)
})

test('seçim: kazanan ertesi hafta başkan olur, oy tektir, ücretler yanar', () => {
  const chatJid = ayarla({ a: 50_000, b: 50_000, c: 1000, d: 1000 })
  assert.deepEqual(adayOl({ chatJid, userJid: 'a', now: T }), { ucret: 10_000, xp: 40_000 })
  assert.deepEqual(adayOl({ chatJid, userJid: 'a', now: T }), { zaten: true })
  adayOl({ chatJid, userJid: 'b', now: T + 1 })

  assert.deepEqual(oyVer({ chatJid, secmen: 'c', aday: 'd', now: T }), { adayDegil: true })
  assert.deepEqual(oyVer({ chatJid, secmen: 'c', aday: 'b', now: T }), { xp: 900 })
  assert.deepEqual(oyVer({ chatJid, secmen: 'c', aday: 'a', now: T }), { zaten: true })
  oyVer({ chatJid, secmen: 'd', aday: 'b', now: T })
  oyVer({ chatJid, secmen: 'a', aday: 'a', now: T })

  assert.equal(baskanMi(chatJid, 'b', T), false)
  assert.equal(baskanMi(chatJid, 'b', T + HAFTA), true)
  assert.equal(baskanMi(chatJid, 'a', T + HAFTA), false)
  assert.equal(sosyalDurum(chatJid, 'b', T + HAFTA).baskan, true)
  assert.equal(secimDurumu({ chatJid, userJid: 'c', now: T + HAFTA }).oyVerdi, false)

  // Görev bir haftadır.
  assert.equal(baskanMi(chatJid, 'b', T + 2 * HAFTA), false)
})

test('seçim: eşitlikte önce aday olan kazanır, yeni başkan bir kez duyurulur', () => {
  const chatJid = ayarla({ a: 50_000, b: 50_000, c: 1000, d: 1000 })
  adayOl({ chatJid, userJid: 'a', now: T })
  adayOl({ chatJid, userJid: 'b', now: T + 1 })
  oyVer({ chatJid, secmen: 'c', aday: 'b', now: T })
  oyVer({ chatJid, secmen: 'd', aday: 'a', now: T })

  assert.equal(secimDurumu({ chatJid, userJid: 'c', now: T + HAFTA }).yeniBaskan.user_jid, 'a')
  assert.equal(secimDurumu({ chatJid, userJid: 'c', now: T + HAFTA }).yeniBaskan, null)
})

test('seçim: görev haftası kaçırıldıysa başkan yazılmaz', () => {
  const chatJid = ayarla({ a: 50_000, c: 1000 })
  adayOl({ chatJid, userJid: 'a', now: T })
  oyVer({ chatJid, secmen: 'c', aday: 'a', now: T })
  assert.equal(baskanMi(chatJid, 'a', T + 2 * HAFTA), false)
})

test('başkan günde bir faiz kararı verir, sahip sınırsızdır', () => {
  const chatJid = ayarla({ a: 50_000, c: 1000 })
  adayOl({ chatJid, userJid: 'a', now: T })
  oyVer({ chatJid, secmen: 'c', aday: 'a', now: T })
  const pazartesi = T + HAFTA
  assert.equal(baskanMi(chatJid, 'a', pazartesi), true)

  assert.equal(faizKarari({ chatJid, oran: 30, baskan: true, now: pazartesi }).banka, 30)
  assert.deepEqual(faizKarari({ chatJid, oran: 40, baskan: true, now: pazartesi + 1 }), { bugunVar: true })
  assert.equal(faizDurumu(chatJid).banka, 30)
  assert.equal(faizKarari({ chatJid, oran: 40, now: pazartesi + 1 }).banka, 40)
  assert.equal(faizKarari({ chatJid, oran: 20, baskan: true, now: pazartesi + 24 * SAAT }).banka, 20)
})

test('evlilik: iki yönden görünür, evli olan ikinci kez evlenemez', () => {
  const chatJid = ayarla({ a: 100, b: 100, c: 100 })
  assert.deepEqual(evlen({ chatJid, a: 'a', b: 'b', now: T }), { tamam: true })
  assert.equal(esBul(chatJid, 'a').es_jid, 'b')
  assert.equal(esBul(chatJid, 'b').es_jid, 'a')
  assert.deepEqual(evlen({ chatJid, a: 'c', b: 'b', now: T }), { evli: 'b' })
})

test('boşanma: onaysız değişmez, nafaka önce cüzdandan sonra bankadan alınır, toplam korunur', () => {
  const chatJid = ayarla({ a: 1000, b: 0 })
  bankaYatir({ chatJid, userJid: 'a', miktar: 900, now: T })
  evlen({ chatJid, a: 'a', b: 'b', now: T })

  assert.deepEqual(bosan({ chatJid, userJid: 'a', now: T }), { onayGerek: true, nafaka: 200, es: 'b' })
  assert.equal(xp(chatJid, 'a'), 100)

  assert.deepEqual(bosan({ chatJid, userJid: 'a', onay: true, now: T }), { nafaka: 200, es: 'b', xp: 0 })
  assert.equal(bankaBakiyesi(chatJid, 'a'), 800)
  assert.equal(xp(chatJid, 'b'), 200)
  assert.equal(esBul(chatJid, 'a'), null)
  assert.equal(esBul(chatJid, 'b'), null)
  assert.deepEqual(bosan({ chatJid, userJid: 'a', now: T }), { bekar: true })
})

test('boşanma: borçlu boşanamaz', () => {
  const chatJid = ayarla({ a: 1000, b: 0, [BOT]: 1_000_000 })
  evlen({ chatJid, a: 'a', b: 'b', now: T })
  assert.equal(krediCek({ chatJid, userJid: 'a', miktar: 500, now: T }).xp, 1500)
  assert.deepEqual(bosan({ chatJid, userJid: 'a', onay: true, now: T + 1 }), { borclu: true })
})

test('meslek: maaş kura bağlı, aralıkta kalır', () => {
  for (const m of MESLEKLER) {
    assert.equal(maasHesapla(1_000_000, m, (min) => min), m.min * 100)
    assert.equal(maasHesapla(2_000_000, m, (_, ust) => ust - 1), m.max * 200)
  }
  assert.equal(meslekBul('YAZILIMCI').kod, 'yazilimci')
  assert.equal(meslekBul('çiftçi').kod, 'ciftci')
  assert.equal(meslekBul('astronot'), null)
})

test('çalış: 4 saatte bir, hapiste kapalı, evliye bonus', () => {
  const chatJid = ayarla({ a: 0, e: 0, k: 1000 })
  const rnd = (min) => min
  assert.deepEqual(calis({ chatJid, userJid: 'a', rnd, now: T }), { meslekYok: true })

  const garson = meslekBul('garson')
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: garson, now: T }), { tamam: true })
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: garson, now: T }), { ayni: true })

  const s = calis({ chatJid, userJid: 'a', rnd, now: T })
  assert.equal(s.maas, 4500)
  assert.equal(s.esBonusu, 0)
  assert.equal(xp(chatJid, 'a'), 4500)
  assert.deepEqual(calis({ chatJid, userJid: 'a', rnd, now: T + 1 }), { bekle: T + 4 * SAAT })

  evlen({ chatJid, a: 'a', b: 'e', now: T })
  assert.equal(calis({ chatJid, userJid: 'a', rnd, now: T + 4 * SAAT }).esBonusu, 900)

  soygunYap({ chatJid, hirsiz: 'a', kurban: 'k', sans: () => false, now: T + 8 * SAAT })
  assert.deepEqual(calis({ chatJid, userJid: 'a', rnd, now: T + 8 * SAAT }), { hapis: T + 10 * SAAT })
})

test('meslek değişimi: 24 saat bekler, çalışma beklemesini sıfırlamaz', () => {
  const chatJid = ayarla({ a: 0 })
  const rnd = (min) => min
  meslekSec({ chatJid, userJid: 'a', meslek: meslekBul('garson'), now: T })
  calis({ chatJid, userJid: 'a', rnd, now: T })

  const kurye = meslekBul('kurye')
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: kurye, now: T + SAAT }), { bekle: true, bitis: T + 24 * SAAT })
  assert.deepEqual(meslekSec({ chatJid, userJid: 'a', meslek: kurye, now: T + 24 * SAAT }), { tamam: true })

  const yeni = yeniGrup()
  ver(yeni, 'a', 0)
  meslekSec({ chatJid: yeni, userJid: 'a', meslek: kurye, now: T })
  assert.equal(calis({ chatJid: yeni, userJid: 'a', rnd, now: T }).meslek.kod, 'kurye')
})

test('çete adı: küçük harf anahtar, bozuk ad reddedilir', () => {
  assert.deepEqual(ceteAdi('  Kara   KEDİLER '), { ad: 'Kara KEDİLER', anahtar: 'kara kediler' })
  assert.equal(ceteAdi('a'), null)
  assert.equal(ceteAdi('<script>'), null)
  assert.equal(ceteAdi('x'.repeat(21)), null)
})

test('çete: kurma ücreti yanar, kasaya kesintiyle girer, yalnızca lider çeker', () => {
  const chatJid = ayarla({ l: 20_000, u: 2000, [BOT]: 0 })
  const ad = ceteAdi('Kediler')
  assert.deepEqual(ceteKur({ chatJid, userJid: 'l', ...ad, now: T }), { ucret: 10_000, xp: 10_000 })
  assert.deepEqual(ceteKur({ chatJid, userJid: 'u', ...ad, now: T }), { adVar: true })
  assert.deepEqual(ceteKatil({ chatJid, userJid: 'u', anahtar: ad.anahtar, now: T + 1 }), { ad: 'Kediler' })
  assert.deepEqual(ceteKatil({ chatJid, userJid: 'u', anahtar: ad.anahtar, now: T + 1 }), { uye: true })

  const bot = xp(chatJid, BOT)
  assert.deepEqual(ceteYatir({ chatJid, userJid: 'u', miktar: 1000, now: T }), { kesinti: 50, kasa: 950, xp: 1000 })
  assert.equal(xp(chatJid, BOT), bot + 50)
  assert.deepEqual(ceteYatir({ chatJid, userJid: 'u', miktar: 5000, now: T }), { yetersiz: true, xp: 1000 })

  assert.deepEqual(ceteCek({ chatJid, userJid: 'u', miktar: 100 }), { liderDegil: true })
  assert.deepEqual(ceteCek({ chatJid, userJid: 'l', miktar: 5000 }), { yetersiz: true, kasa: 950 })
  assert.deepEqual(ceteCek({ chatJid, userJid: 'l', miktar: 450 }), { kasa: 500, xp: 10_450 })
  assert.equal(sosyalDurum(chatJid, 'u', T).cete, 'Kediler')
})

test('çete: lider ayrılınca en eski üye geçer, son üye kasayı alır', () => {
  const chatJid = ayarla({ l: 20_000, a: 1000, b: 1000 })
  const ad = ceteAdi('Kurtlar')
  ceteKur({ chatJid, userJid: 'l', ...ad, now: T })
  ceteKatil({ chatJid, userJid: 'a', anahtar: ad.anahtar, now: T + 1 })
  ceteKatil({ chatJid, userJid: 'b', anahtar: ad.anahtar, now: T + 2 })
  ceteYatir({ chatJid, userJid: 'l', miktar: 1000, now: T })

  assert.deepEqual(ceteAt({ chatJid, lider: 'a', hedef: 'b' }), { liderDegil: true })
  assert.deepEqual(ceteAyril({ chatJid, userJid: 'l' }), { yeniLider: 'a' })
  assert.deepEqual(ceteAt({ chatJid, lider: 'a', hedef: 'a' }), { uyeDegil: true })
  assert.deepEqual(ceteAt({ chatJid, lider: 'a', hedef: 'b' }), { atildi: true })

  const once = xp(chatJid, 'a')
  assert.deepEqual(ceteAyril({ chatJid, userJid: 'a' }), { kapandi: true, iade: 950 })
  assert.equal(xp(chatJid, 'a'), once + 950)
  assert.equal(ceteDurumu({ chatJid, userJid: 'a', now: T }).siralama.length, 0)
})

test('çete: sıralama sezon puanından, birinci kasaya ödül alır', () => {
  const chatJid = ayarla({ l: 20_000, m: 20_000 })
  ceteKur({ chatJid, userJid: 'l', ...ceteAdi('Az'), now: T })
  ceteKur({ chatJid, userJid: 'm', ...ceteAdi('Cok'), now: T })
  recordMessage({ chatJid, userJid: 'm', type: 'conversation', at: T })

  assert.equal(ceteDurumu({ chatJid, userJid: 'l', now: T }).siralama[0].ad, 'Cok')

  const [kapanan] = sezonDurumu({ chatJid, now: T + HAFTA }).kapanan
  assert.deepEqual(kapanan.cete, { ad: 'Cok', odul: 5000 })
  assert.equal(ceteDurumu({ chatJid, userJid: 'm', now: T + HAFTA }).cete.kasa, 5000)
})

test('çete kasası para arzına girer, kasası dolu lider iflas edemez', () => {
  const chatJid = ayarla({ l: 20_000 })
  ceteKur({ chatJid, userJid: 'l', ...ceteAdi('Kasa'), now: T })
  ceteYatir({ chatJid, userJid: 'l', miktar: 1000, now: T })
  assert.equal(ekonomiDurumu({ chatJid, now: T }).anlik, 9000 + 950)

  ver(chatJid, 'l', -9000)
  xpAyarlaEksi(chatJid, 'l')
  assert.deepEqual(iflasEt({ chatJid, userJid: 'l', now: T }), { cete: true })
})

// `xpAyarla` sıfırın altına inmez; eksi cüzdan kredi tahsilatından doğar.
function xpAyarlaEksi(chatJid, userJid) {
  ver(chatJid, BOT, 1_000_000)
  krediCek({ chatJid, userJid, miktar: 500, now: T })
  ver(chatJid, userJid, -500)
  recordMessage({ chatJid, userJid, type: 'conversation', at: T + 25 * SAAT })
}

test('dava kararı: en az 2 oy, beraberlik düşer', () => {
  assert.equal(davaKarari(1, 0), null)
  assert.equal(davaKarari(1, 1), null)
  assert.equal(davaKarari(2, 1), 'davaci')
  assert.equal(davaKarari(0, 2), 'sanik')
})

test('dava açma: harç bota gider, sınırlar denetlenir', () => {
  const chatJid = ayarla({ d: 1000, s: 2000, [BOT]: 0 })
  assert.deepEqual(davaAc({ chatJid, davaci: 'd', sanik: 's', miktar: 501, now: T }), { fazla: true, azami: 500 })
  assert.deepEqual(davaAc({ chatJid, davaci: 'd', sanik: 's', miktar: 1000, now: T }), { yetersiz: true, xp: 1000 })

  const bot = xp(chatJid, BOT)
  assert.deepEqual(davaAc({ chatJid, davaci: 'd', sanik: 's', miktar: 500, now: T }), { harc: 25 })
  assert.equal(xp(chatJid, 'd'), 975)
  assert.equal(xp(chatJid, BOT), bot + 25)
})

test('dava açma ve ödeme: borçlu mahkemelik olamaz', () => {
  const chatJid = ayarla({ d: 1000, s: 2000, [BOT]: 1_000_000 })
  krediCek({ chatJid, userJid: 's', miktar: 500, now: T })
  assert.deepEqual(davaAc({ chatJid, davaci: 'd', sanik: 's', miktar: 100, now: T + 1 }), { borclu: 's' })
  assert.deepEqual(davaOde({ chatJid, kazanan: 'd', kaybeden: 's', miktar: 100, now: T + 1 }), { borclu: true })
})

test('dava ödemesi: kaybeden cüzdanı kadar öder, eksiye düşmez, toplam korunur', () => {
  const chatJid = ayarla({ a: 300, b: 100 })
  assert.deepEqual(davaOde({ chatJid, kazanan: 'a', kaybeden: 'b', miktar: 500, now: T }), {
    odenen: 100, kazananXp: 400, kaybedenXp: 0,
  })
})

test('özet: son 7 gün sayılır, bot listede yok', () => {
  const chatJid = yeniGrup()
  recordMessage({ chatJid, userJid: 'eski', type: 'conversation', at: T - 8 * 24 * SAAT })
  recordMessage({ chatJid, userJid: 'a', type: 'conversation', at: T })
  recordMessage({ chatJid, userJid: 'a', type: 'conversation', at: T + 1 })
  recordMessage({ chatJid, userJid: 'b', type: 'conversation', at: T })
  recordMessage({ chatJid, userJid: BOT, type: 'conversation', at: T })

  const o = haftaOzeti({ chatJid, now: T + 2 })
  assert.equal(o.toplamMesaj, 3)
  assert.deepEqual(o.yazanlar.map((y) => y.user_jid), ['a', 'b'])
  assert.equal(o.kumarKazanan, null)
})
