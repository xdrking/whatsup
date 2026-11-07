// .kredi: bot bankasından çekim, faiz, zorunlu kesinti, vade ve eksi bakiye.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { FAIZ_YUZDESI, faizIslet } = await import('../lib/banka.js')
const { SAAT_MS } = await import('../lib/borsa.js')
const { azamiKredi, borcIslet, IFLAS_KREDI_YASAK_SAATI, IFLAS_YASAK_SAATI, KREDI_FAIZ_YUZDESI, KREDI_LIMITI, KREDI_VADE_SAATI } = await import('../lib/kredi.js')
const { hisseBul } = await import('../lib/borsa.js')
const { kumarEngeli } = await import('../lib/kumar.js')
const {
  addXp, bankaBakiyesi, bankaYatir, hacizEt, borsaAl, borsaSat, botHesabiniTani, getStats, iflasEt, krediCek, krediDurumu, krediOde,
  kumarYasagi, odulKoy, recordMessage, seviyeIlerlemesi, soygunYap, xpAyarla, xpDevret,
} = await import('../lib/stats.js')

const BOT = '905550000000@s.whatsapp.net'
const T = Math.floor(new Date('2026-06-10T12:00:00+03:00').getTime() / SAAT_MS) * SAAT_MS
const VADE = T + KREDI_VADE_SAATI * SAAT_MS

botHesabiniTani({ id: BOT })

let sayac = 0
function kur(kasa = 100_000) {
  const chatJid = `k${++sayac}@g.us`
  addXp({ chatJid, userJid: BOT, amount: kasa, at: T })
  return { chatJid, userJid: `u${sayac}@s.whatsapp.net` }
}

test('kredi faizi banka faizinden yüksek', () => {
  assert.ok(KREDI_FAIZ_YUZDESI > FAIZ_YUZDESI)
  assert.equal(borcIslet(1000, 0), 1000)
  assert.equal(borcIslet(1000, 1), 1190)
})

test('kredi kasadan çıkar; limit, kasa ve ikinci kredi engellenir', () => {
  const k = kur(2500)
  assert.deepEqual(krediCek({ ...k, miktar: KREDI_LIMITI + 1, now: T }), { limit: KREDI_LIMITI })
  assert.deepEqual(krediCek({ ...k, miktar: 1000, now: T }), { xp: 1000 })
  assert.equal(getStats(k.chatJid, BOT).xp, 1500)
  assert.deepEqual(krediCek({ ...k, miktar: 100, now: T }), { acik: true, borc: 1000 })

  const fakir = kur(50)
  assert.deepEqual(krediCek({ ...fakir, miktar: 100, now: T }), { kasaLimit: 25 })
  assert.equal(getStats(fakir.chatJid, fakir.userJid).xp, 0)

  assert.deepEqual(krediCek({ chatJid: k.chatJid, userJid: BOT, miktar: 100, now: T }), { kapali: true })
})

test('tek kredi kasanın yarısını geçemez, limit durumda da görünür', () => {
  assert.equal(azamiKredi(90_000), 45_000)
  assert.equal(azamiKredi(KREDI_LIMITI * 3), KREDI_LIMITI)

  const k = kur(90_000)
  assert.equal(krediDurumu({ ...k, now: T }).limit, 45_000)
  assert.deepEqual(krediCek({ ...k, miktar: 100_000, now: T }), { kasaLimit: 45_000 })
  assert.deepEqual(krediCek({ ...k, miktar: 45_001, now: T }), { kasaLimit: 45_000 })
  assert.deepEqual(krediCek({ ...k, miktar: 45_000, now: T }), { xp: 45_000 })
  assert.equal(getStats(k.chatJid, BOT).xp, 45_000)
})

test('faiz saat başlarında işler, ödeme botun bankasına gider', () => {
  const k = kur()
  krediCek({ ...k, miktar: 1000, now: T + 1000 })
  assert.equal(krediDurumu({ ...k, now: T + 2000 }).borc, 1000)
  assert.equal(krediDurumu({ ...k, now: T + 2 * SAAT_MS }).borc, borcIslet(1000, 2))

  const s = krediOde({ ...k, miktar: 400, now: T + 2 * SAAT_MS })
  assert.deepEqual(s, { odenen: 400, borc: borcIslet(1000, 2) - 400, xp: 600 })
  assert.equal(bankaBakiyesi(k.chatJid, BOT), 400)
})

test('borcu aşan ödeme yalnızca borç kadar alınır, kredi kapanır', () => {
  const k = kur()
  addXp({ ...k, amount: 5000, at: T })
  krediCek({ ...k, miktar: 1000, now: T })
  assert.deepEqual(krediOde({ ...k, miktar: 6000, now: T }), { odenen: 1000, borc: 0, xp: 5000 })
  assert.equal(krediDurumu({ ...k, now: T }).borc, 0)
})

test('borçluyken bankaya yatırılan XP önce borcu keser, kalanı hesaba girer', () => {
  const k = kur()
  krediCek({ ...k, miktar: 1000, now: T })
  addXp({ ...k, amount: 500, at: T })

  const az = bankaYatir({ ...k, miktar: 300, now: T })
  assert.deepEqual(az, { bakiye: 0, xp: 1200, krediOdeme: 300, kalanBorc: 700 })

  const cok = bankaYatir({ ...k, miktar: 1000, now: T })
  assert.deepEqual(cok, { bakiye: 300, xp: 200, krediOdeme: 700, kalanBorc: 0 })
  assert.equal(bankaBakiyesi(k.chatJid, BOT), 1000)
  assert.equal(krediDurumu({ ...k, now: T }).borc, 0)
})

test('vade: önce cüzdan, sonra banka alınır; ödeme botun bankasına gider', () => {
  const k = kur()
  addXp({ ...k, amount: 4000, at: T })
  bankaYatir({ ...k, miktar: 3000, now: T })
  krediCek({ ...k, miktar: 1000, now: T })

  const borc = borcIslet(1000, KREDI_VADE_SAATI)
  const bankada = 3000 + faizIslet(3000, 3000, KREDI_VADE_SAATI).faiz
  assert.ok(bankada + 2000 > borc)

  // Bot kendiliğinden yazmadığı için tahsilat kişinin ilk mesajında olur.
  recordMessage({ ...k, type: 'conversation', at: VADE })
  assert.equal(krediDurumu({ ...k, now: VADE }).borc, 0)
  // Mesajın +1 XP'si tahsilattan önce cüzdana girer.
  assert.equal(getStats(k.chatJid, k.userJid).xp, 0)
  assert.equal(bankaBakiyesi(k.chatJid, k.userJid), bankada - (borc - 2001))
  assert.equal(bankaBakiyesi(k.chatJid, BOT), borc)
})

test('vadede para yoksa cüzdan eksiye düşer, geç gelince de faiz büyümez, XP ile kapanır', () => {
  const borc = borcIslet(1000, KREDI_VADE_SAATI)
  const eksi = 1000 - borc

  const gec = kur()
  krediCek({ ...gec, miktar: 1000, now: T })
  assert.equal(krediDurumu({ ...gec, now: VADE + 50 * SAAT_MS }).xp, eksi)

  const e = kur()
  krediCek({ ...e, miktar: 1000, now: T })
  assert.equal(krediDurumu({ ...e, now: VADE }).xp, eksi)
  assert.equal(krediDurumu({ ...e, now: VADE + 50 * SAAT_MS }).xp, eksi)

  assert.deepEqual(krediCek({ ...e, miktar: 100, now: VADE }), { eksi: true, xp: eksi })
  assert.equal(bankaYatir({ ...e, miktar: 10, now: VADE }).yetersiz, true)
  assert.ok(kumarEngeli(eksi))

  const { kazanilan, level } = seviyeIlerlemesi(eksi)
  assert.equal(level, 1)
  assert.ok(kazanilan < 0)

  addXp({ ...e, amount: 500 - eksi, at: VADE })
  assert.equal(getStats(e.chatJid, e.userJid).xp, 500)
  assert.equal(kumarEngeli(500), null)
})

test('borçlu XP devredemez, eksideki kişi ödülü olsa da soyulamaz', () => {
  const k = kur()
  const arkadas = 'arkadas@s.whatsapp.net'
  krediCek({ ...k, miktar: 1000, now: Date.now() })
  assert.deepEqual(
    xpDevret({ chatJid: k.chatJid, kaynak: k.userJid, hedef: arkadas, miktar: 100 }),
    { kredili: true },
  )
  assert.equal(xpDevret({ chatJid: k.chatJid, kaynak: k.userJid, hedef: arkadas, miktar: 100, sahipDevri: true }).kaynakXp, 900)

  const e = kur()
  const hirsiz = 'hirsiz@s.whatsapp.net'
  addXp({ chatJid: e.chatJid, userJid: hirsiz, amount: 1000, at: T })
  krediCek({ ...e, miktar: 100, now: T })
  krediDurumu({ ...e, now: VADE })
  assert.ok(getStats(e.chatJid, e.userJid).xp < 0)

  odulKoy({ chatJid: e.chatJid, koyan: hirsiz, hedef: e.userJid, miktar: 100 })
  const s = soygunYap({ chatJid: e.chatJid, hirsiz, kurban: e.userJid, sans: () => true, now: VADE })
  assert.deepEqual(s, { engel: 'kurban-fakir' })
})

test('haciz: hesaptan botun bankasına geçer, cüzdan ve borç değişmez, bakiye aşılamaz', () => {
  const k = kur()
  addXp({ ...k, amount: 3000, at: T })
  bankaYatir({ ...k, miktar: 2000, now: T })
  krediCek({ ...k, miktar: 500, now: T })

  assert.deepEqual(hacizEt({ ...k, miktar: 1500, now: T }), { bakiye: 500, xp: 1500, kasaya: 1500, eksi: 0 })

  assert.equal(bankaBakiyesi(k.chatJid, k.userJid), 500)
  assert.equal(bankaBakiyesi(k.chatJid, BOT), 1500)
  assert.equal(getStats(k.chatJid, k.userJid).xp, 1500)
  assert.equal(krediDurumu({ ...k, now: T }).borc, 500)
})

test('haciz: banka yetmezse cüzdandan alır, kalanı eksi yazar, kasaya yalnızca alınan girer', () => {
  const k = kur(0)
  addXp({ ...k, amount: 800, at: T })
  bankaYatir({ ...k, miktar: 500, now: T })

  assert.deepEqual(hacizEt({ ...k, miktar: 2000, now: T }), { bakiye: 0, xp: -1200, kasaya: 800, eksi: 1200 })
  assert.equal(getStats(k.chatJid, k.userJid).xp, -1200)
  assert.equal(bankaBakiyesi(k.chatJid, BOT), 800)

  // Zaten eksideki kişiden alınan bir şey yoktur, kasa değişmez.
  assert.deepEqual(hacizEt({ ...k, miktar: 100, now: T }), { bakiye: 0, xp: -1300, kasaya: 0, eksi: 100 })
  assert.equal(bankaBakiyesi(k.chatJid, BOT), 800)

  const hic = { chatJid: k.chatJid, userJid: 'hic@s.whatsapp.net' }
  assert.deepEqual(hacizEt({ ...hic, miktar: 50, now: T }), { bakiye: 0, xp: -50, kasaya: 0, eksi: 50 })
  assert.equal(getStats(hic.chatJid, hic.userJid).xp, -50)
})

test('.xpver eksi bakiyeyi yanlışlıkla sıfırlamaz', () => {
  const e = kur()
  krediCek({ ...e, miktar: 100, now: T })
  krediDurumu({ ...e, now: VADE })
  const { xp } = getStats(e.chatJid, e.userJid)
  assert.ok(xp < 0)

  assert.equal(xpAyarla({ ...e, miktar: -50 }).xp, xp)
  assert.equal(xpAyarla({ ...e, miktar: 50 }).xp, xp + 50)
})

test('iflas: eksi silinir, kumar 12 saat yasak, yasak bitince 500 XP yine gerekir', () => {
  const e = kur()
  krediCek({ ...e, miktar: 100, now: T })
  krediDurumu({ ...e, now: VADE })
  const { xp } = getStats(e.chatJid, e.userJid)
  assert.ok(xp < 0)

  const yasakBitis = VADE + IFLAS_YASAK_SAATI * SAAT_MS
  assert.deepEqual(iflasEt({ ...e, now: VADE }), { silinen: -xp, yasakBitis })
  assert.equal(getStats(e.chatJid, e.userJid).xp, 0)
  assert.equal(kumarYasagi(e.chatJid, e.userJid), yasakBitis)

  assert.match(kumarEngeli(1000, yasakBitis, VADE), /yasağın var/)
  assert.equal(kumarEngeli(1000, yasakBitis, yasakBitis), null)
  assert.match(kumarEngeli(100, yasakBitis, yasakBitis), /en az 500 XP/)
  assert.equal(kumarYasagi('baska@g.us', e.userJid), 0)

  const krediBitis = VADE + IFLAS_KREDI_YASAK_SAATI * SAAT_MS
  assert.deepEqual(krediCek({ ...e, miktar: 100, now: VADE }), { yasak: krediBitis })
  assert.deepEqual(krediCek({ ...e, miktar: 100, now: krediBitis - 1 }), { yasak: krediBitis })
  assert.deepEqual(krediCek({ ...e, miktar: 100, now: krediBitis }), { xp: 100 })
})

test('iflas: artı cüzdan, açık kredi ve elde hisse reddedilir', () => {
  const k = kur()
  assert.deepEqual(iflasEt({ ...k, now: T }), { borcYok: true })

  krediCek({ ...k, miktar: 1000, now: T })
  assert.deepEqual(iflasEt({ ...k, now: T }), { kredili: true, borc: 1000 })
  assert.equal(krediDurumu({ ...k, now: T }).borc, 1000)

  const hisse = hisseBul('muz')
  const sabit = () => 1000
  const h = kur()
  krediCek({ ...h, miktar: 1000, now: T })
  borsaAl({ ...h, hisse, miktar: 500, now: T, rnd: sabit })
  krediDurumu({ ...h, now: VADE })
  assert.ok(getStats(h.chatJid, h.userJid).xp < 0)
  assert.deepEqual(iflasEt({ ...h, now: VADE }), { portfoy: true })

  borsaSat({ ...h, hisse, now: VADE, rnd: sabit })
  assert.ok(iflasEt({ ...h, now: VADE }).silinen > 0)
})
