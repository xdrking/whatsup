// .wrapped: veri özetinin hesabı ve kartın çizilmesi. Veritabanı bellekte açılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { getDb } = await import('../lib/db.js')
const { botHesabiniTani } = await import('../lib/stats.js')
const { enUzunSeri, gunFarki, grupWrapped, kisilik, kisiWrapped, saatOzeti } = await import('../lib/wrapped.js')
const { wrappedKarti } = await import('../lib/wrappedKart.js')
const { kisaSayi, tarihYaz } = await import('../commands/wrapped.js')

const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })
const G = 'w1@g.us'
const NOW = new Date('2026-11-19T12:00:00+03:00').getTime()

function tohumla() {
  const db = getDb()
  const stats = db.prepare('INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp) VALUES (?, ?, ?, ?, ?, ?)')
  stats.run(G, 'a@s', 900, 50, 10, 1000)
  stats.run(G, 'b@s', 300, 400, 0, 50)
  stats.run(G, BOT, 5000, 0, 0, 9_999_999)

  const gecmis = db.prepare('INSERT INTO gecmis (chat_jid, user_jid, gun, xp, mesaj) VALUES (?, ?, ?, ?, ?)')
  for (const [gun, mesaj, xp] of [['2026-11-01', 40, 500], ['2026-11-02', 120, 8_000_000], ['2026-11-03', 10, 200], ['2026-11-10', 5, 900]]) {
    gecmis.run(G, 'a@s', gun, xp, mesaj)
  }
  gecmis.run(G, 'b@s', '2026-10-30', 10, 3)
  gecmis.run(G, BOT, '2026-11-02', 99_999_999, 900)

  const saat = db.prepare('INSERT INTO hours (chat_jid, user_jid, hour, count) VALUES (?, ?, ?, ?)')
  saat.run(G, 'a@s', 2, 300)
  saat.run(G, 'a@s', 21, 600)

  db.prepare('INSERT INTO kumar (chat_jid, user_jid, won, lost, games) VALUES (?, ?, ?, ?, ?)').run(G, 'a@s', 5000, 2000, 400)
  const oyun = db.prepare('INSERT INTO kumar_oyun (chat_jid, user_jid, oyun, won, lost, games, en_buyuk, en_kotu) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  oyun.run(G, 'a@s', 'slot', 3000, 1500, 300, 2_500_000, 100)
  oyun.run(G, 'a@s', 'crash', 2000, 500, 50, 4_000_000, 50)
  db.prepare('INSERT INTO sampiyon (chat_jid, user_jid, kez, son_hafta) VALUES (?, ?, ?, ?)').run(G, 'a@s', 2, '2026-W45')
}
tohumla()

test('seri, gün farkı, saat özeti', () => {
  assert.equal(enUzunSeri(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-10']), 3)
  assert.equal(enUzunSeri([]), 0)
  assert.equal(enUzunSeri(['2026-12-31', '2027-01-01']), 2)
  assert.equal(gunFarki('2026-10-30', '2026-11-19'), 21)
  assert.deepEqual(saatOzeti([]), { saat: null, gece: 0 })
  const s = saatOzeti([{ hour: 2, count: 300 }, { hour: 21, count: 600 }])
  assert.equal(s.saat, 21)
  assert.ok(Math.abs(s.gece - 1 / 3) < 1e-9)
})

test('kişilik ilk tutan kurala göre seçilir', () => {
  const temel = { messages: 1000, stickers: 0, voices: 0, gecePayi: 0, kumarEl: 0, sira: 3, aktifPay: 0 }
  assert.match(kisilik({ ...temel, messages: 10 }).ad, /Sessiz/)
  assert.match(kisilik({ ...temel, gecePayi: 0.4 }).ad, /Gece/)
  assert.match(kisilik({ ...temel, stickers: 600 }).ad, /Sticker/)
  assert.match(kisilik({ ...temel, sira: 1 }).ad, /Grubun Sesi/)
  assert.match(kisilik(temel).ad, /Sohbet/)
})

test('kişi özeti tüm kaynakları toplar, bot sıralamaya girmez', () => {
  const v = kisiWrapped(G, 'a@s', NOW)
  assert.equal(v.messages, 900)
  assert.equal(v.sira, 1)
  assert.equal(v.uyeSayisi, 2)
  assert.ok(Math.abs(v.grupPayi - 900 / 1200) < 1e-9)
  assert.equal(v.ilkGun, '2026-11-01')
  assert.equal(v.toplamGun, 21)
  assert.equal(v.aktifGun, 4)
  assert.equal(v.seri, 3)
  assert.deepEqual([v.enYogun.gun, v.enYogun.mesaj], ['2026-11-02', 120])
  assert.equal(v.zirve.xp, 8_000_000)
  assert.equal(v.saat, 21)
  assert.equal(v.kumar.games, 400)
  assert.equal(v.kumar.net, 3000)
  assert.equal(v.kumar.favori.oyun, 'slot')
  assert.equal(v.kumar.vurgun.oyun, 'crash')
  assert.equal(v.sampiyon, 2)
  assert.match(v.kisilik.ad, /Gece Kuşu/)
  assert.equal(kisiWrapped(G, 'yok@s', NOW), null)
})

test('grup özeti botu saymaz', () => {
  const g = grupWrapped(G, NOW)
  assert.equal(g.mesaj, 1200)
  assert.equal(g.uyeSayisi, 2)
  assert.equal(g.ilkGun, '2026-10-30')
  assert.equal(g.yazanlar[0].user_jid, 'a@s')
  assert.equal(g.stickerKrali.user_jid, 'b@s')
  assert.equal(g.zirve.user_jid, 'a@s')
  assert.equal(g.vurgun.en_buyuk, 4_000_000)
  assert.equal(grupWrapped('bos@g.us', NOW), null)
})

test('sayı ve tarih biçimi', () => {
  assert.equal(tarihYaz('2026-08-16'), '16 Ağu 2026')
  assert.equal(kisaSayi(999_999), '999.999')
  assert.equal(kisaSayi(1_250_000), '1,3 milyon')
  assert.equal(kisaSayi(-2_000_000_000), '-2 milyar')
})

test('kart çizilir, kutu sayısına göre uzar', async () => {
  const temel = {
    ust: 'WRAPPED', baslik: 'Ayşe & <Ali>', altBaslik: '1 Kas 2026 → bugün', seed: 'a@s', avatar: null,
    hero: { deger: '12.345', etiket: 'mesaj yazdın' }, rozet: { ad: '🦉 Gece Kuşu', aciklama: 'Grup uyurken o yazıyor.' }, alt: 'dip',
  }
  const kutu = { ikon: '🔥', etiket: 'En uzun seri', deger: '12 gün', alt: 'art arda' }
  const az = await sharp(await wrappedKarti({ ...temel, kutular: [kutu, kutu] })).metadata()
  const cok = await sharp(await wrappedKarti({ ...temel, kutular: Array(8).fill(kutu) })).metadata()
  assert.equal(az.width, 1080)
  assert.equal(az.format, 'jpeg')
  assert.ok(cok.height > az.height)
})
