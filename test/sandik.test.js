// Kasalar (Faz 89): beklenti, haftalık sınırlar, gece anahtarı, açma ve devir.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.STATS_DB = ':memory:'
process.env.LOG_LEVEL = 'silent'
const {
  coinBeklentisi, HAFTALIK_ALIM, HAFTALIK_KUMAR, HAFTALIK_SOYGUN, KASALAR, odulCek, odulMetni, serit, tierCoz,
} = await import('../lib/sandik.js')
const { NFTLER } = await import('../lib/nft.js')
const { getDb } = await import('../lib/db.js')
const { coinAyarla, kasaDusurDene, sandikAc, sandikAl, sandikDevret, sandikDurumu } = await import('../lib/stats.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const GUN = 24 * 60 * 60 * 1000
let sayac = 0
const yeniGrup = () => `1203630099${++sayac}@g.us`
const sabit = (...dizi) => { let i = 0; return () => dizi[i++ % dizi.length] }

test('her kasanın ağırlığı 1000, coin beklentisi fiyatın altında ama boş değil', () => {
  for (const k of KASALAR) {
    assert.equal(k.oduller.reduce((t, o) => t + o.agirlik, 0), 1000, k.ad)
    const oran = coinBeklentisi(k) / (k.fiyat + k.anahtar)
    assert.ok(oran > 0.35 && oran < 0.75, `${k.ad}: %${Math.round(oran * 100)}`)
  }
  assert.ok(KASALAR.every((k, i) => !i || k.fiyat > KASALAR[i - 1].fiyat), 'tier büyüdükçe pahalanır')
})

test('Suly NFT yalnızca Mistik Kasası\'ndan, en nadir ödül olarak çıkar', () => {
  const suly = NFTLER.find((n) => n.sinif === 'mistik')
  const olan = KASALAR.filter((k) => k.oduller.some((o) => o.no === suly.no))
  assert.deepEqual(olan.map((k) => k.tier), [5])
  const o = KASALAR[4].oduller.find((x) => x.no === suly.no)
  assert.equal(o.agirlik, Math.min(...KASALAR[4].oduller.map((x) => x.agirlik)))
})

test('tier yazıdan çözülür, şerit kazananı doğru yerde taşır', () => {
  assert.equal(tierCoz('3'), 3)
  assert.equal(tierCoz('t5'), 5)
  assert.equal(tierCoz('elit'), 3)
  assert.equal(tierCoz('9'), null)
  const odul = odulCek(KASALAR[0], () => 0)
  const s = serit(KASALAR[0], odul, { adet: 20, kazanan: 15 })
  assert.equal(s.length, 20)
  assert.equal(s[15], odul)
  assert.match(odulMetni(odul), /coin/)
})

test('gece anahtarı: ilk bakışta 1, aynı gün tekrar yok, kaçırılan günler en çok 7', () => {
  const chatJid = yeniGrup()
  const d1 = sandikDurumu({ chatJid, userJid: 'a', now: T })
  assert.equal(d1.yeniAnahtar.length, 1)
  assert.equal(sandikDurumu({ chatJid, userJid: 'a', now: T + 1000 }).yeniAnahtar.length, 0)
  assert.equal(sandikDurumu({ chatJid, userJid: 'a', now: T + 3 * GUN }).yeniAnahtar.length, 3)
  assert.equal(sandikDurumu({ chatJid, userJid: 'a', now: T + 30 * GUN }).yeniAnahtar.length, 7)
})

test('bedava kasa: kumardan haftada 3, soygundan 2; yeni hafta sıfırlanır', () => {
  const chatJid = yeniGrup()
  const hep = () => 0
  const dus = (kaynak, now = T) => kasaDusurDene({ chatJid, userJid: 'a', kaynak, now, rnd: hep })
  for (let i = 0; i < HAFTALIK_KUMAR; i++) assert.ok(dus('kumar'))
  assert.equal(dus('kumar'), null)
  for (let i = 0; i < HAFTALIK_SOYGUN; i++) assert.ok(dus('soygun'))
  assert.equal(dus('soygun'), null)
  assert.ok(dus('kumar', T + 7 * GUN))
  const d = sandikDurumu({ chatJid, userJid: 'a', now: T })
  assert.equal(Object.values(d.kasa).reduce((t, n) => t + n, 0), HAFTALIK_KUMAR + HAFTALIK_SOYGUN + 1)
  assert.equal(kasaDusurDene({ chatJid, userJid: 'b', kaynak: 'kumar', now: T, rnd: () => 99 }), null, 'olasılık tutmazsa düşmez')
})

test('coinle alım: haftada 7 kasa, coin yetmezse alınmaz, anahtar sınırsız', () => {
  const chatJid = yeniGrup()
  coinAyarla({ chatJid, userJid: 'a', adet: 1000 })
  assert.ok(sandikAl({ chatJid, userJid: 'a', tur: 'kasa', tier: 1, adet: HAFTALIK_ALIM, now: T }).adet)
  assert.equal(sandikAl({ chatJid, userJid: 'a', tur: 'kasa', tier: 1, now: T }).sinir, 0)
  assert.ok(sandikAl({ chatJid, userJid: 'a', tur: 'anahtar', tier: 1, adet: 20, now: T }).adet)
  assert.ok(sandikAl({ chatJid, userJid: 'a', tur: 'kasa', tier: 5, adet: 7, now: T + 7 * GUN }).yetersiz)
})

test('açma kasa ve anahtar harcar, ödülü yazar; NFT kalmayınca yedek coin', () => {
  const chatJid = yeniGrup()
  coinAyarla({ chatJid, userJid: 'a', adet: 1000 })
  sandikDurumu({ chatJid, userJid: 'a', now: T })
  assert.ok(sandikAc({ chatJid, userJid: 'a', tier: 1, now: T }).kasaYok)
  sandikAl({ chatJid, userJid: 'a', tur: 'kasa', tier: 1, adet: 3, now: T })
  getDb().prepare("DELETE FROM sandik WHERE chat_jid = ? AND tur = 'anahtar'").run(chatJid)
  assert.ok(sandikAc({ chatJid, userJid: 'a', tier: 1, now: T }).anahtarYok)
  sandikAl({ chatJid, userJid: 'a', tur: 'anahtar', tier: 1, adet: 3, now: T })

  const once = sandikDurumu({ chatJid, userJid: 'a', now: T }).coin
  const c = sandikAc({ chatJid, userJid: 'a', tier: 1, now: T, rnd: () => 0 })
  assert.equal(c.odul.tur, 'coin')
  assert.equal(c.coin, once + c.odul.adet)

  // rnd 990: ağırlık sırasında NFT (sıradan) ödülüne düşer
  const nftSirasi = KASALAR[0].oduller.findIndex((o) => o.tur === 'nft')
  const r = KASALAR[0].oduller.slice(0, nftSirasi).reduce((t, o) => t + o.agirlik, 0)
  const n = sandikAc({ chatJid, userJid: 'a', tier: 1, now: T, rnd: sabit(r, 0) })
  assert.equal(n.sonuc.nft.sinif, 'siradan')
  for (const x of NFTLER.filter((y) => y.sinif === 'siradan')) getDb().prepare('INSERT OR IGNORE INTO nft (chat_jid, no, user_jid) VALUES (?, ?, ?)').run(chatJid, x.no, 'b')
  const y = sandikAc({ chatJid, userJid: 'a', tier: 1, now: T, rnd: sabit(r, 0) })
  assert.equal(y.sonuc.coin, KASALAR[0].oduller[nftSirasi].yedek)
  const d = sandikDurumu({ chatJid, userJid: 'a', now: T })
  assert.equal(d.kasa[1] ?? 0, 0)
})

test('devir: anahtar geçer, fazlası ve borçlu reddedilir', () => {
  const chatJid = yeniGrup()
  coinAyarla({ chatJid, userJid: 'a', adet: 100 })
  sandikAl({ chatJid, userJid: 'a', tur: 'anahtar', tier: 2, adet: 3, now: T })
  const s = sandikDevret({ chatJid, kaynak: 'a', hedef: 'b', tur: 'anahtar', tier: 2, adet: 2, now: T })
  assert.deepEqual(s, { kaynakAdet: 1, hedefAdet: 2 })
  assert.ok(sandikDevret({ chatJid, kaynak: 'a', hedef: 'b', tur: 'anahtar', tier: 2, adet: 5, now: T }).yetersiz)
  getDb().prepare('INSERT OR REPLACE INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, ?, 0, 0, 0, -5, 1)').run(chatJid, 'a')
  assert.ok(sandikDevret({ chatJid, kaynak: 'a', hedef: 'b', tur: 'anahtar', tier: 2, adet: 1, now: T }).borclu)
})

test('sahibin dağıtımı: her üyeye 1 kasa, Mistik yok, bot almaz, haftalık sınıra sayılmaz', async () => {
  const { sandikDagit, botHesabiniTani } = await import('../lib/stats.js')
  botHesabiniTani({ id: '905550000000@s.whatsapp.net' })
  const chatJid = yeniGrup()
  const d = sandikDagit({ chatJid, uyeler: ['a', 'b', 'a', '905550000000@s.whatsapp.net'], rnd: (n) => n - 1 })
  assert.deepEqual(d.map((x) => x.jid), ['a', 'b'])
  assert.ok(d.every((x) => x.tier === 4), 'en nadir dilimde bile T4')
  const durum = sandikDurumu({ chatJid, userJid: 'a', now: T })
  assert.equal(durum.kasa[4], 1)
  assert.equal(durum.hafta.kumar + durum.hafta.soygun + durum.hafta.alim, 0)
})
