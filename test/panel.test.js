// Panelin güvenlik kuralları ve sayfaları. Veritabanı geçici klasörde açılır.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const klasor = mkdtempSync(path.join(tmpdir(), 'panel-'))
process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = path.join(klasor, 'test.db')

const { getDb } = await import('../lib/db.js')
const { denemeSiniri, oturumlar, sifreDogru, sifreHashle, sifreUret } = await import('../panel/guvenlik.js')
const { h, mumlar } = await import('../panel/sayfalar.js')
const { addXp, borsaDurumu, recordMessage } = await import('../lib/stats.js')
const { ADIM_MS, SAAT_MS, GECMIS_SAATI } = await import('../lib/borsa.js')
const { groupMetadata } = await import('../lib/group.js')
const { sunucuKur } = await import('../panel/sunucu.js')
const { veriAc } = await import('../panel/veri.js')
const { yedekAl, sonYedek } = await import('../panel/yedek.js')

const GRUP = 'g1@g.us'
const db = getDb()
db.exec(`
  INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES
    ('${GRUP}', 'a@lid', 10, 1, 0, 500, 1), ('${GRUP}', 'b@lid', 20, 0, 2, 100, 1);
  INSERT INTO isimler VALUES ('a@lid', '<script>alert(1)</script>', 1);
  INSERT INTO banka (chat_jid, user_jid, bakiye) VALUES ('${GRUP}', 'b@lid', 1000);
`)

const SIFRE = 'dogru-sifre'
const sifreHash = await sifreHashle(SIFRE)
const veri = veriAc()
const yedekKlasoru = path.join(klasor, 'yedek')
const sunucu = sunucuKur({ sifreHash, veri, yedekKlasoru })
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}`

after(() => {
  sunucu.close()
  veri.db.close()
  rmSync(klasor, { recursive: true, force: true })
})

const giris = (sifre, ip) => fetch(`${adres}/giris`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip },
  body: new URLSearchParams({ sifre }),
})

async function cerezAl(ip) {
  const yanit = await giris(SIFRE, ip)
  return yanit.headers.get('set-cookie').split(';')[0]
}

test('şifre: doğrusu geçer, yanlışı ve bozuk kayıt geçmez, üretilen şifre uzun', async () => {
  assert.equal(await sifreDogru(SIFRE, sifreHash), true)
  assert.equal(await sifreDogru('yanlis', sifreHash), false)
  assert.equal(await sifreDogru(SIFRE, 'bozuk'), false)
  assert.equal(sifreUret().length, 24)
  assert.notEqual(sifreUret(), sifreUret())
})

test('deneme sınırı: IP beş denemede kilitlenir, kilit süresi katlanır', () => {
  let simdi = 1_000_000
  const s = denemeSiniri({ saat: () => simdi })

  for (let i = 0; i < 5; i++) assert.equal(s.dene('1.1.1.1').izin, true)
  const kilit = s.dene('1.1.1.1')
  assert.equal(kilit.izin, false)
  assert.equal(kilit.bekleMs, 15 * 60_000)
  assert.equal(s.dene('2.2.2.2').izin, true)

  simdi += 15 * 60_000
  for (let i = 0; i < 5; i++) assert.equal(s.dene('1.1.1.1').izin, true)
  assert.equal(s.dene('1.1.1.1').bekleMs, 30 * 60_000)
})

test('deneme sınırı: farklı IP\'lerden gelen saldırıyı genel sınır durdurur', () => {
  const s = denemeSiniri({ saat: () => 1_000_000 })
  for (let i = 0; i < 30; i++) assert.equal(s.dene(`10.0.0.${i}`).izin, true)
  assert.equal(s.dene('10.0.1.1').izin, false)
})

test('oturum: açılan geçerli, kapatılan ve süresi dolan geçersiz', () => {
  let simdi = 0
  const o = oturumlar({ saat: () => simdi })
  const j = o.ac()
  assert.equal(o.gecerli(j), true)
  assert.equal(o.gecerli('uydurma'), false)
  assert.equal(o.gecerli(''), false)
  o.kapat(j)
  assert.equal(o.gecerli(j), false)

  const j2 = o.ac()
  simdi += 8 * 24 * 60 * 60_000
  assert.equal(o.gecerli(j2), false)
})

test('h: değerleri kaçırır, iç içe şablonu bozmaz', () => {
  const ad = '<img src=x onerror=alert(1)>"'
  assert.equal(h`<b>${ad}</b>`.metin, '<b>&lt;img src=x onerror=alert(1)&gt;&quot;</b>')
  assert.equal(h`<p>${h`<b>${'<'}</b>`}</p>`.metin, '<p><b>&lt;</b></p>')
})

test('panel: girişsiz hiçbir veri sayfası açılmaz', async () => {
  for (const yol of ['/', `/grup?id=${encodeURIComponent(GRUP)}`, '/kisi?grup=x&id=y', '/yedek']) {
    const yanit = await fetch(adres + yol, { redirect: 'manual' })
    assert.equal(yanit.status, 303, yol)
    assert.equal(yanit.headers.get('location'), '/giris')
  }
  const uydurma = await fetch(`${adres}/`, { redirect: 'manual', headers: { Cookie: '__Host-panel=uydurma' } })
  assert.equal(uydurma.status, 303)
})

test('panel: HEAD isteği GET gibi yanıtlanır', async () => {
  assert.equal((await fetch(`${adres}/giris`, { method: 'HEAD', redirect: 'manual' })).status, 200)
  assert.equal((await fetch(`${adres}/`, { method: 'HEAD', redirect: 'manual' })).status, 303)
})

test('panel: yanlış şifre reddedilir, beşinciden sonra doğrusu bile şifreye bakılmadan döner', async () => {
  const ip = '9.9.9.9'
  for (let i = 0; i < 5; i++) assert.equal((await giris('yanlis', ip)).status, 401)
  const yanit = await giris(SIFRE, ip)
  assert.equal(yanit.status, 429)
  assert.ok(Number(yanit.headers.get('retry-after')) > 0)
})

test('panel: çerez güvenli, sayfalar veriyi gösterir, ad kaçırılır', async () => {
  const yanit = await giris(SIFRE, '8.8.8.8')
  assert.equal(yanit.status, 303)
  const ham = yanit.headers.get('set-cookie')
  for (const parca of ['__Host-panel=', 'HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(ham.includes(parca), parca)

  const Cookie = ham.split(';')[0]
  const grup = await fetch(`${adres}/grup?id=${encodeURIComponent(GRUP)}&sirala=servet`, { headers: { Cookie } })
  assert.equal(grup.status, 200)
  assert.ok(grup.headers.get('content-security-policy').includes("default-src 'none'"))
  const html = await grup.text()
  assert.ok(html.includes('&lt;script&gt;alert(1)'))
  assert.ok(!html.includes('<script>alert'))
  // b'nin serveti bankayla 1.100, a'nınki 500.
  assert.ok(html.indexOf('1.100') < html.indexOf('>500<'))

  const kisi = await fetch(`${adres}/kisi?grup=${encodeURIComponent(GRUP)}&id=b%40lid`, { headers: { Cookie } })
  assert.equal(kisi.status, 200)
  assert.equal((await fetch(`${adres}/kisi?grup=x&id=y`, { headers: { Cookie } })).status, 404)
  assert.equal((await fetch(`${adres}/grup?id=x`, { headers: { Cookie } })).status, 404)
})

test('panel: çıkıştan sonra aynı çerez işe yaramaz', async () => {
  const Cookie = await cerezAl('7.7.7.7')
  assert.equal((await fetch(`${adres}/`, { redirect: 'manual', headers: { Cookie } })).headers.get('location').startsWith('/grup'), true)
  await fetch(`${adres}/cikis`, { method: 'POST', redirect: 'manual', headers: { Cookie } })
  assert.equal((await fetch(`${adres}/`, { redirect: 'manual', headers: { Cookie } })).headers.get('location'), '/giris')
})

test('veri bağlantısı salt okunur', () => {
  assert.throws(() => veri.db.exec("UPDATE stats SET xp = 0"), /readonly/)
})

test('yedek: günde bir alınır, 14 tane kalır, panelden iner', async () => {
  const gun = new Date('2026-06-10T12:00:00+03:00')
  assert.equal(await yedekAl(veri.db, yedekKlasoru, gun), 'stats-2026-06-10.db')
  assert.equal(await yedekAl(veri.db, yedekKlasoru, gun), null)

  for (let i = 1; i <= 20; i++) writeFileSync(path.join(yedekKlasoru, `stats-2026-05-${String(i).padStart(2, '0')}.db`), '')
  await yedekAl(veri.db, yedekKlasoru, new Date('2026-06-11T12:00:00+03:00'))
  assert.equal(readdirSync(yedekKlasoru).length, 14)
  assert.ok(sonYedek(yedekKlasoru).endsWith('stats-2026-06-11.db'))

  const Cookie = await cerezAl('6.6.6.6')
  const yanit = await fetch(`${adres}/yedek`, { headers: { Cookie } })
  assert.equal(yanit.status, 200)
  assert.ok(yanit.headers.get('content-disposition').includes('stats-2026-06-11.db'))
  assert.ok((await yanit.arrayBuffer()).byteLength > 0)
})

test('geçmiş: mesaj günlük sayılır, XP son değerde kalır, kişi sayfasına düşer', () => {
  const at = new Date('2026-06-10T12:00:00+03:00').getTime()
  const k = { chatJid: 'g2@g.us', userJid: 'c@lid', type: 'conversation' }
  recordMessage({ ...k, at })
  recordMessage({ ...k, at: at + 1000 })
  addXp({ chatJid: k.chatJid, userJid: k.userJid, amount: 50 })
  recordMessage({ ...k, at: at + 86_400_000 })

  const gunler = db.prepare('SELECT gun, xp, mesaj FROM gecmis WHERE chat_jid = ? ORDER BY gun').all(k.chatJid)
  assert.deepEqual(gunler.map((g) => g.mesaj), [2, 1])
  assert.ok(gunler[1].xp > gunler[0].xp)

  const kisi = veri.kisi(k.chatJid, k.userJid, at + 86_400_000)
  assert.equal(kisi.xpGecmisi.length, 2)
  assert.equal(kisi.gunlukMesaj.at(-1).n, 1)
  assert.equal(kisi.gunlukMesaj.length, 30)
  assert.equal(kisi.sira, 1)
})

test('borsa geçmişi: saat başı yazılır, 30 günden eskisi silinir, grup sayfasına düşer', () => {
  const T = 1_800_000_000_000 - (1_800_000_000_000 % SAAT_MS)
  const k = { chatJid: GRUP, userJid: 'a@lid' }
  const say = () => db.prepare("SELECT COUNT(*) AS n FROM borsa_gecmis WHERE chat_jid = ? AND hisse = 'muz'").get(GRUP).n

  borsaDurumu({ ...k, now: T })
  borsaDurumu({ ...k, now: T + 3 * SAAT_MS })
  assert.equal(say(), 3)
  assert.equal(veri.grup(GRUP).borsa[0].gecmis.length, 3)

  for (let g = 1; g <= 35; g++) borsaDurumu({ ...k, now: T + g * 24 * SAAT_MS })
  assert.ok(say() <= GECMIS_SAATI + 1)
  assert.ok(ADIM_MS < SAAT_MS)
  assert.ok(veri.grup(GRUP).borsa[0].gecmis.length <= 7 * 24)
})

test('borçlular: kredi güncel tutarla, eksi cüzdan ayrı görünür, büyük borç üstte', async () => {
  const grup = 'borclu@g.us'
  const db = getDb()
  const simdi = 500_000 * SAAT_MS
  const stats = db.prepare('INSERT INTO stats (chat_jid, user_jid, xp) VALUES (?, ?, ?)')
  stats.run(grup, 'kredili@lid', 100)
  stats.run(grup, 'eksi@lid', -5000)
  stats.run(grup, 'temiz@lid', 100)
  db.prepare('INSERT INTO kredi (chat_jid, user_jid, borc, faiz_saat, vade) VALUES (?, ?, ?, ?, ?)')
    .run(grup, 'kredili@lid', 1000, 499_998, simdi + 22 * SAAT_MS)

  const liste = veri.grup(grup, 'xp', simdi).borclular
  assert.deepEqual(liste.map((b) => [b.user_jid, b.borc]), [['eksi@lid', 5000], ['kredili@lid', 1417]])

  const yanit = await giris(SIFRE, '8.8.4.4')
  const Cookie = yanit.headers.get('set-cookie').split(';')[0]
  const html = await (await fetch(`${adres}/grup?id=${encodeURIComponent(grup)}`, { headers: { Cookie } })).text()
  assert.ok(html.includes('Borçlular'))
  assert.ok(html.includes('Eksi bakiye'))

  assert.deepEqual(veri.grup(GRUP).borclular, [])
})

test('ekonomi kartı: kur, faiz, enflasyon ve coin görünür; kayıt yoksa kart yok', async () => {
  const grup = 'ekonomi@g.us'
  const db = getDb()
  db.prepare('INSERT INTO stats (chat_jid, user_jid, xp) VALUES (?, ?, ?)').run(grup, 'zengin@lid', 5000)
  const gun = db.prepare('INSERT INTO ekonomi (chat_jid, day, arz, kur) VALUES (?, ?, ?, ?)')
  gun.run(grup, '2026-06-01', 100_000_000, 1_000_000)
  gun.run(grup, '2026-06-02', 250_000_000, 2_500_000)
  db.prepare('INSERT INTO coin (chat_jid, user_jid, bakiye, toplu_hak) VALUES (?, ?, 7, 0)').run(grup, 'zengin@lid')
  db.prepare('INSERT INTO mulk (chat_jid, user_jid, kod, adet, kira_saat) VALUES (?, ?, ?, 2, 0)').run(grup, 'zengin@lid', 'ev')
  db.prepare('INSERT INTO faiz (chat_jid, oran) VALUES (?, 25)').run(grup)

  const e = veri.grup(grup).ekonomi
  assert.equal(e.kur, 2_500_000)
  assert.equal(e.enflasyon, 1.5)
  assert.deepEqual(e.faiz, { banka: 25, kredi: 29 })
  assert.equal(e.toplamCoin, 7)
  assert.equal(e.mulkler[0].adet, 2)
  assert.equal(e.coinSahipleri[0].uye.user_jid, 'zengin@lid')

  const Cookie = await cerezAl('8.8.8.1')
  const html = await (await fetch(`${adres}/grup?id=${encodeURIComponent(grup)}`, { headers: { Cookie } })).text()
  assert.ok(html.includes('Ekonomi'))
  assert.ok(html.includes('2.500.000'))
  assert.equal(veri.grup(GRUP).ekonomi, null)
})

test('toplum: çete, hapis, evlilik ve meslek grup ve kişi sayfasında görünür', async () => {
  const grup = 'toplum@g.us'
  const simdi = 500_000 * SAAT_MS
  const db = getDb()
  const stats = db.prepare('INSERT INTO stats (chat_jid, user_jid, xp) VALUES (?, ?, ?)')
  for (const jid of ['a@lid', 'b@lid', 'c@lid']) stats.run(grup, jid, 100)
  db.prepare('INSERT INTO cete (chat_jid, anahtar, ad, lider, kasa) VALUES (?, ?, ?, ?, ?)').run(grup, 'kediler', '<b>Kediler</b>', 'a@lid', 950)
  const uye = db.prepare('INSERT INTO cete_uye (chat_jid, user_jid, anahtar, katilma) VALUES (?, ?, ?, 1)')
  uye.run(grup, 'a@lid', 'kediler')
  uye.run(grup, 'b@lid', 'kediler')
  const es = db.prepare('INSERT INTO evlilik (chat_jid, user_jid, es_jid, tarih) VALUES (?, ?, ?, 1)')
  es.run(grup, 'a@lid', 'b@lid')
  es.run(grup, 'b@lid', 'a@lid')
  const hapis = db.prepare('INSERT INTO hapis (chat_jid, user_jid, bitis, kefalet) VALUES (?, ?, ?, 1800)')
  hapis.run(grup, 'c@lid', simdi + SAAT_MS)
  hapis.run(grup, 'b@lid', simdi - 1)
  db.prepare('INSERT INTO meslek (chat_jid, user_jid, kod, secim) VALUES (?, ?, ?, 1)').run(grup, 'a@lid', 'kurye')

  const t = veri.grup(grup, 'xp', simdi).toplum
  assert.equal(t.ceteler[0].uyeSayisi, 2)
  assert.equal(t.ciftler.length, 1)
  assert.deepEqual(t.hapistekiler.map((h) => h.user_jid), ['c@lid'])
  assert.deepEqual(t.meslekler, [{ ad: '🛵 Kurye', adet: 1 }])

  const y = veri.kisi(grup, 'a@lid', simdi).hayat
  assert.equal(y.es.es_jid, 'b@lid')
  assert.equal(y.cete.lider, 1)
  assert.equal(y.meslek, '🛵 Kurye')
  assert.equal(y.hapis, null)

  const Cookie = await cerezAl('8.8.8.2')
  const sayfa = (yol) => fetch(`${adres}${yol}`, { headers: { Cookie } }).then((r) => r.text())
  const html = await sayfa(`/grup?id=${encodeURIComponent(grup)}`)
  for (const baslik of ['Çeteler', 'Evlilikler', 'Meslekler']) assert.ok(html.includes(baslik), baslik)
  assert.ok(html.includes('&lt;b&gt;Kediler'))
  assert.ok(!html.includes('<b>Kediler'))

  const bos = await sayfa(`/grup?id=${encodeURIComponent(GRUP)}`)
  assert.ok(!bos.includes('Evlilikler'))
})

test('hisse sayfası: grafik çizilir, aralık daralır, bilinmeyen değerler güvenli', async () => {
  const Cookie = await cerezAl('6.6.6.6')
  const al = (sorgu) => fetch(`${adres}/hisse?grup=${encodeURIComponent(GRUP)}&${sorgu}`, { headers: { Cookie } })

  assert.ok(veri.hisse(GRUP, 'muz', '1g').noktalar.length < veri.hisse(GRUP, 'muz', '30g').noktalar.length)
  assert.equal(veri.hisse(GRUP, 'muz', 'uydurma').aralik, '7g')
  assert.equal(veri.hisse(GRUP, 'uydurma', '7g'), null)

  const mum = await (await al('kod=muz&aralik=7g&tur=mum')).text()
  assert.ok(mum.includes('class="mum '))
  const cizgi = await (await al('kod=muz&aralik=1g&tur=cizgi')).text()
  assert.ok(cizgi.includes('class="hat"'))
  assert.ok((await (await al('kod=muz&tur=%3Cscript%3E')).text()).includes('class="mum '))
  assert.equal((await al('kod=uydurma')).status, 404)

  // Stil önbelleklenir: adres sürümsüz olursa yeni sayfa eski stille açılır, SVG simsiyah görünür.
  const stilAdresi = mum.match(/href="(\/stil\.css\?v=\d+)"/)?.[1]
  assert.ok(stilAdresi)
  assert.ok((await (await fetch(adres + stilAdresi)).text()).includes('.fiyat-grafik'))
})

test('mumlar: açılış önceki kapanıştır, yüksek ve düşük dilimden çıkar', () => {
  const mums = mumlar([
    { saat: 21, fiyat: 100 }, { saat: 22, fiyat: 110 }, { saat: 23, fiyat: 90 }, { saat: 27, fiyat: 95 },
  ], 6)
  assert.deepEqual(mums, [
    { saat: 21, acilis: 100, yuksek: 110, dusuk: 90, kapanis: 90 },
    { saat: 27, acilis: 90, yuksek: 95, dusuk: 90, kapanis: 95 },
  ])
})

test('grup adı: bilgi gelince yazılır, kaçırılarak gösterilir', async () => {
  await groupMetadata({ groupMetadata: async () => ({ subject: '<b>Kanka</b>', participants: [] }) }, GRUP)
  assert.equal(veri.grup(GRUP).ad, '<b>Kanka</b>')

  const Cookie = await cerezAl('5.5.5.5')
  const html = await (await fetch(`${adres}/grup?id=${encodeURIComponent(GRUP)}`, { headers: { Cookie } })).text()
  assert.ok(html.includes('&lt;b&gt;Kanka'))
  assert.ok(!html.includes('<b>Kanka'))
})

test('rekorlar ve rozetler: en yüksek kişi çıkar, sıfır rekor gösterilmez', () => {
  const g = veri.grup(GRUP)
  const rekor = (etiket) => g.rekorlar.find((r) => r.etiket.includes(etiket))
  assert.equal(rekor('En geveze').uye.user_jid, 'b@lid')
  assert.equal(rekor('En şanslı'), undefined)
  assert.ok(veri.kisi(GRUP, 'a@lid').rozetler.length > 0)
})

test('eksik kartlar: hazine, hükümet, kumarhane, Suly, pet, cezalılar, varlık ve borç görünür', async () => {
  const grup = 'devlet@g.us'
  const now = Date.now()
  const db = getDb()
  const BOT = '905550000000@s.whatsapp.net'
  db.prepare("INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES ('bot_jid', ?)").run(BOT)
  const uye = db.prepare('INSERT INTO stats (chat_jid, user_jid, xp) VALUES (?, ?, ?)')
  uye.run(grup, BOT, 777)
  uye.run(grup, 'baskan@lid', 1000)
  uye.run(grup, 'kumarbaz@lid', 2000)
  db.prepare("INSERT INTO isimler VALUES ('baskan@lid', 'Başkan Bey', 1), ('kumarbaz@lid', 'Mert', 1)").run()
  db.prepare('INSERT INTO banka (chat_jid, user_jid, bakiye) VALUES (?, ?, ?)').run(grup, BOT, 123_456)
  db.prepare('INSERT INTO ekonomi (chat_jid, day, arz, kur) VALUES (?, ?, ?, ?)').run(grup, '2026-06-01', 100_000_000, 1_000_000)
  db.prepare("INSERT INTO makam (chat_jid, makam, user_jid, kalici) VALUES (?, 'baskan', 'baskan@lid', 1)").run(grup)
  db.prepare("INSERT INTO makam_secim (chat_jid, makam, baslangic) VALUES (?, 'adalet', ?)").run(grup, now)
  db.prepare("INSERT INTO makam_aday (chat_jid, secim, makam, user_jid, oy, sira) VALUES (?, ?, 'adalet', 'kumarbaz@lid', 3, 1)").run(grup, String(now))
  db.prepare('INSERT INTO kumar (chat_jid, user_jid, won, lost, games) VALUES (?, ?, 5000, 1000, 10)').run(grup, 'kumarbaz@lid')
  db.prepare("INSERT INTO kumar_oyun (chat_jid, user_jid, oyun, won, lost, games) VALUES (?, ?, 'hilo', 5000, 1000, 10)").run(grup, 'kumarbaz@lid')
  db.prepare('INSERT INTO coin (chat_jid, user_jid, bakiye, toplu_hak) VALUES (?, ?, 3, 0)').run(grup, 'kumarbaz@lid')
  db.prepare("INSERT INTO mulk (chat_jid, user_jid, kod, adet, kira_saat) VALUES (?, ?, 'otel', 1, 0)").run(grup, 'kumarbaz@lid')
  db.prepare("INSERT OR REPLACE INTO kripto_fiyat (sembol, usd, zaman) VALUES ('BTC', 100000, ?)").run(now)
  db.prepare('INSERT INTO kripto (chat_jid, user_jid, birim) VALUES (?, ?, 50000000)').run(grup, 'kumarbaz@lid')
  db.prepare("INSERT INTO pet (chat_jid, user_jid, tur, ad, tokluk, mutluluk, guncelleme, dogum) VALUES (?, ?, 'kedi', 'Pamuk', 80, 80, ?, ?)").run(grup, 'kumarbaz@lid', now, now)
  db.prepare('INSERT INTO susturulan_uye (chat_jid, user_jid, bitis) VALUES (?, ?, 0)').run(grup, 'kumarbaz@lid')
  db.prepare("INSERT INTO tefeci (chat_jid, borclu, alacakli, anapara, borc, saat, vade, durum) VALUES (?, 'kumarbaz@lid', 'baskan@lid', 100, 150, 1, ?, 'acik')").run(grup, now + 3_600_000)

  const g = veri.grup(grup, 'xp', now)
  assert.equal(g.hazine.banka, 123_456)
  assert.equal(g.hukumet.find((m) => m.kod === 'baskan').askida, true)
  assert.equal(g.hukumet.find((m) => m.kod === 'adalet').secim.adaylar[0].oy, 3)
  assert.equal(g.kumarTop.kazananlar[0].user_jid, 'kumarbaz@lid')
  assert.equal(g.rekorlar.some((r) => r.uye.bot), false)
  const mert = g.uyeler.find((u) => u.user_jid === 'kumarbaz@lid')
  // 3 coin %90'la 2,7 milyon, otel 250 coin %90'la 225 milyon; Suly 0,5 × 100.000$ × kur/2,3m %99.
  assert.equal(mert.coinDeger, 2_700_000)
  assert.equal(mert.mulkDeger, 225_000_000)
  assert.ok(mert.sulyDeger > 0)
  assert.equal(mert.servet, 2000 + 2_700_000 + 225_000_000 + mert.sulyDeger)

  const Cookie = await cerezAl('8.8.8.2')
  const html = await (await fetch(`${adres}/grup?id=${encodeURIComponent(grup)}`, { headers: { Cookie } })).text()
  for (const parca of ['Hazine', '123.456', 'Hükümet', 'Başkan Bey', 'darbe', 'Seçim sürüyor', 'Kumarhane', 'Suly', 'Pamuk', 'Cezalılar', 'Tefeci']) {
    assert.ok(html.includes(parca), parca)
  }

  const kisi = await (await fetch(`${adres}/kisi?grup=${encodeURIComponent(grup)}&id=kumarbaz%40lid`, { headers: { Cookie } })).text()
  for (const parca of ['Varlıklar', '3 coin', '🏨 Otel', '0,5 Suly', 'Borç ve alacak', 'Tefeci borcu', 'hilo', 'Susturuldu', 'Pamuk']) {
    assert.ok(kisi.includes(parca), parca)
  }
  const baskan = await (await fetch(`${adres}/kisi?grup=${encodeURIComponent(grup)}&id=baskan%40lid`, { headers: { Cookie } })).text()
  assert.ok(baskan.includes('🏛️ Başkan'))
  assert.ok(baskan.includes('Alacak'))
})
