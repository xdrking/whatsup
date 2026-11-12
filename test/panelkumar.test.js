// Panel kumarhanesi: oyuncu girişi, oyunların XP'ye yazılması, gruptan çıkanın düşmesi.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const klasor = mkdtempSync(path.join(tmpdir(), 'panelkumar-'))
process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = path.join(klasor, 'test.db')

const { getDb } = await import('../lib/db.js')
const { sifreHashle } = await import('../panel/guvenlik.js')
const { panelKaydet, panelUyeCikar, girisHesaplari } = await import('../lib/panelHesap.js')
const { bahisOyna, bankaDurumu, getStats, kumarYasagi } = await import('../lib/stats.js')
const { kumarMotoru } = await import('../panel/kumar.js')
const { hesapMotoru } = await import('../panel/hesap.js')
const { sunucuKur } = await import('../panel/sunucu.js')
const { veriAc } = await import('../panel/veri.js')

const GRUP = 'g1@g.us'
const UYE = '111@lid'
const db = getDb()
db.exec(`
  INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES
    ('${GRUP}', '${UYE}', 10, 0, 0, 100000, 1), ('${GRUP}', 'bot@s.whatsapp.net', 0, 0, 0, 0, 1);
  INSERT INTO ayar (anahtar, deger) VALUES ('bot_jid', 'bot@s.whatsapp.net');
`)

const SIFRE = 'oyuncu-sifresi'
panelKaydet({ uyelikler: [{ chatJid: GRUP, userJid: UYE }], numara: '905551112233', lid: '111', sifre: await sifreHashle(SIFRE) })

const veri = veriAc()
const sunucu = sunucuKur({ sifreHash: await sifreHashle('yonetici'), veri, yedekKlasoru: path.join(klasor, 'yedek') })
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}`

after(() => {
  sunucu.close()
  veri.db.close()
  rmSync(klasor, { recursive: true, force: true })
})

const post = (yol, alanlar, Cookie = '', ip = '7.7.7.7') => fetch(adres + yol, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip, ...(Cookie ? { Cookie } : {}) },
  body: new URLSearchParams(alanlar),
})

test('hesap: numara da LID de giriş adıdır, +90 ve boşluk atılır', () => {
  assert.equal(girisHesaplari('+90 555 111 22 33').length, 1)
  assert.equal(girisHesaplari('111').length, 1)
  assert.equal(girisHesaplari('999').length, 0)
})

test('panel: oyuncu girer, kumarhaneyi görür, yönetici sayfalarına giremez', async () => {
  assert.equal((await post('/giris', { kimlik: '905551112233', sifre: 'yanlis-sifre' }, '', '6.6.6.6')).status, 401)

  const giris = await post('/giris', { kimlik: '905551112233', sifre: SIFRE })
  assert.equal(giris.status, 303)
  assert.equal(giris.headers.get('location'), '/oyun')
  const Cookie = giris.headers.get('set-cookie').split(';')[0]

  const sayfa = await fetch(`${adres}/oyun`, { headers: { Cookie } })
  assert.equal(sayfa.status, 200)
  const html = await sayfa.text()
  assert.ok(html.includes('data-xp="100000">100.000<'))
  // Betik yalnızca panelin kendi dosyasıdır, satır içi betik yoktur.
  assert.ok(html.includes('src="/oyun.js'))
  assert.ok(!/<script(?![^>]*src=)/.test(html))
  assert.ok(sayfa.headers.get('content-security-policy').includes("script-src 'self'"))
  for (const dosya of ['/oyun.js', '/kumarhane.css']) assert.equal((await fetch(adres + dosya)).status, 200, dosya)

  for (const yol of ['/', `/grup?id=${encodeURIComponent(GRUP)}`, '/yedek']) {
    const y = await fetch(adres + yol, { redirect: 'manual', headers: { Cookie } })
    assert.equal(y.status, 303, yol)
    assert.equal(y.headers.get('location'), '/oyun')
  }

  // Lobi oyunları kategorili listeler, her oyunun ve hesabın kendi sayfası vardır.
  assert.ok(html.includes('class="yan"') && html.includes('Çarpan oyunları'))
  const al = async (yol) => (await fetch(adres + yol, { headers: { Cookie } })).text()
  const g = encodeURIComponent(GRUP)
  assert.ok((await al(`/oyun?grup=${g}&oyun=crash`)).includes('Hedef çarpan'))
  assert.ok((await al(`/oyun/hesap?grup=${g}`)).includes('Net servet'))
  assert.ok((await al(`/oyun/coin?grup=${g}`)).includes('Anlık kur'))

  const yatir = await post('/oyun/islem', { grup: GRUP, sayfa: 'banka', islem: 'banka-yatir', tutar: '20 bin' }, Cookie)
  assert.equal(yatir.headers.get('location'), `/oyun/banka?grup=${g}`)
  assert.ok((await al(`/oyun/banka?grup=${g}`)).includes('20.000 XP bankaya yatırıldı'))
  assert.equal(bankaDurumu({ chatJid: GRUP, userJid: UYE }).bakiye, 20000)
  assert.equal(getStats(GRUP, UYE).xp, 80000)
  await new Promise((r) => setTimeout(r, 800))
  await post('/oyun/islem', { grup: GRUP, sayfa: 'banka', islem: 'banka-cek', tutar: 'hepsi' }, Cookie)
  assert.equal(getStats(GRUP, UYE).xp, 99000)
  await new Promise((r) => setTimeout(r, 800))
  await post('/oyun/islem', { grup: GRUP, sayfa: 'hesap', islem: 'constructor' }, Cookie)
  assert.ok((await al(`/oyun/hesap?grup=${g}`)).includes('Böyle bir işlem yok.'))

  const oyna = await post('/oyun/oyna', { grup: GRUP, oyun: 'slot', miktar: '1000' }, Cookie)
  assert.equal(oyna.status, 303)
  assert.equal(oyna.headers.get('location'), `/oyun?grup=${g}&oyun=slot`)
  const sonra = await (await fetch(`${adres}/oyun?grup=${encodeURIComponent(GRUP)}`, { headers: { Cookie } })).text()
  assert.ok(sonra.includes('Slot'))
  const { xp } = getStats(GRUP, UYE)
  assert.notEqual(xp, 99000)

  // Üye olmadığı grubun formu gönderilirse oynanmaz.
  await new Promise((r) => setTimeout(r, 800))
  await post('/oyun/oyna', { grup: 'baska@g.us', oyun: 'slot', miktar: '1000' }, Cookie)
  assert.equal(getStats(GRUP, UYE).xp, xp)

  panelUyeCikar(GRUP, [UYE])
  const atildi = await fetch(`${adres}/oyun`, { redirect: 'manual', headers: { Cookie } })
  assert.equal(atildi.status, 303)
  assert.equal(atildi.headers.get('location'), '/giris')
})

test('motor: mayın bahsi baştan alır, çekince öder; süre dolunca el kapanır', () => {
  db.prepare('INSERT OR REPLACE INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, ?, 0, 0, 0, 50000, 1)').run(GRUP, 'm@lid')
  let simdi = 1_000_000
  const zamanlar = []
  const m = kumarMotoru({ saat: () => simdi, zamanlayici: (f) => zamanlar.push(f), temizle: () => {} })
  const kim = { chat: GRUP, user: 'm@lid' }

  m.basla(kim, { oyun: 'mayın', miktar: '1000' })
  assert.equal(getStats(GRUP, 'm@lid').xp, 49000)
  assert.ok(m.durum(kim).el)

  simdi += 1000
  m.tekOyna(kim, { oyun: 'slot', miktar: '1000' })
  assert.equal(m.durum(kim).sonuc.hata, 'Önce açık elini bitir.')

  simdi += 1000
  m.hamle(kim, { hamle: 'çek' })
  const d = m.durum(kim)
  assert.equal(d.el, null)
  assert.equal(d.sonuc.fark, 0)
  assert.equal(getStats(GRUP, 'm@lid').xp, 50000)

  simdi += 1000
  m.basla(kim, { oyun: 'kule', miktar: '1000', secim: 'orta' })
  zamanlar.at(-1)()
  assert.equal(m.durum(kim).el, null)
  assert.equal(getStats(GRUP, 'm@lid').xp, 50000)

  simdi += 1000
  m.basla(kim, { oyun: 'constructor', miktar: '1000' })
  assert.equal(m.durum(kim).sonuc.hata, 'Böyle bir oyun yok.')
})

test('panelde kumar yasağı ve günlük tavan yok; WhatsApp tarafında sürer', () => {
  const kim = { chat: GRUP, user: 'y@lid' }
  db.prepare('INSERT OR REPLACE INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, ?, 0, 0, 0, 10000, 1)').run(GRUP, 'y@lid')
  // Tavanı WhatsApp yolundan doldur: 1000x kazanç piyasanın yarısını aşar, fazlası kasada kalır.
  const wp = bahisOyna({ chatJid: GRUP, userJid: 'y@lid', miktar: 1000, cevir: () => ({ carpan: 1000 }), oyun: 'slot' })
  assert.ok(wp.kesilen > 0)
  assert.ok(kumarYasagi(GRUP, 'y@lid') > Date.now())

  const once = getStats(GRUP, 'y@lid').xp
  const serbest = bahisOyna({ chatJid: GRUP, userJid: 'y@lid', miktar: 1000, cevir: () => ({ carpan: 1000 }), oyun: 'slot', tavansiz: true })
  assert.equal(serbest.kesilen, 0)
  assert.equal(getStats(GRUP, 'y@lid').xp, once + 999000)

  let simdi = 5_000_000
  const m = kumarMotoru({ saat: () => simdi, zamanlayici: () => {}, temizle: () => {} })
  m.tekOyna(kim, { oyun: 'slot', miktar: '1000' })
  assert.equal(m.durum(kim).sonuc.hata, undefined)
  simdi += 1000
  m.basla(kim, { oyun: 'mayın', miktar: '1000' })
  simdi += 1000
  m.hamle(kim, { hamle: 'çek' })
  assert.equal(m.durum(kim).sonuc.kesilen, 0)
})

test('hesap motoru: günlük ödül bir kez, olmayan coin bozdurulmaz', () => {
  db.prepare('INSERT OR REPLACE INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, ?, 0, 0, 0, 5000, 1)').run(GRUP, 'h@lid')
  let simdi = 9_000_000
  const hm = hesapMotoru({ saat: () => simdi })
  const kim = { chat: GRUP, user: 'h@lid' }
  hm.islem(kim, { islem: 'gunluk' })
  assert.ok(hm.durum(kim).bildirim.tamam.includes('Günlük ödül'))
  assert.equal(hm.durum(kim).bildirim, null)
  simdi += 1000
  hm.islem(kim, { islem: 'gunluk' })
  assert.ok(hm.durum(kim).bildirim.hata.includes('zaten aldın'))
  simdi += 1000
  hm.islem(kim, { islem: 'coin-sat', miktar: '1' })
  assert.ok(hm.durum(kim).bildirim.hata.includes('coinin yok'))
})
