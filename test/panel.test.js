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
const { h } = await import('../panel/sayfalar.js')
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
