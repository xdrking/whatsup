// Panelin sosyal bölümü (Faz 66): akış, beğeni, duvar, bildirim, DM, tek seferlik hikâye, medya izni.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const klasor = mkdtempSync(path.join(tmpdir(), 'sosyal-'))
process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = path.join(klasor, 'test.db')
process.env.MEDYA_DIR = path.join(klasor, 'medya')

const { getDb } = await import('../lib/db.js')
const { sifreHashle } = await import('../panel/guvenlik.js')
const { panelKaydet } = await import('../lib/panelHesap.js')
const S = await import('../lib/sosyal.js')
const { multipartCoz } = await import('../panel/multipart.js')
const { sunucuKur } = await import('../panel/sunucu.js')
const { sosyalMotoru } = await import('../panel/sosyal.js')
const { veriAc } = await import('../panel/veri.js')

const GRUP = 'g1@g.us'
const OTEKI = 'g2@g.us'
const ALI = '111@lid'
const AYSE = '222@lid'
const CAN = '333@lid'
const db = getDb()
db.exec(`
  INSERT INTO stats (chat_jid, user_jid, messages, xp, last_seen) VALUES
    ('${GRUP}', '${ALI}', 10, 1000, 1), ('${GRUP}', '${AYSE}', 5, 500, 2), ('${GRUP}', '${CAN}', 1, 0, 3),
    ('${OTEKI}', '${CAN}', 1, 0, 3);
  INSERT INTO isimler (user_jid, ad, guncelleme) VALUES ('${ALI}', 'Ali Veli', 1), ('${AYSE}', 'Ayşe', 1), ('${CAN}', 'Can', 1);
  INSERT INTO ayar (anahtar, deger) VALUES ('bot_jid', 'bot@s.whatsapp.net');
`)
const SIFRE = 'oyuncu-sifresi'
const hash = await sifreHashle(SIFRE)
panelKaydet({ uyelikler: [{ chatJid: GRUP, userJid: ALI }], numara: '905550000001', lid: '111', sifre: hash })
panelKaydet({ uyelikler: [{ chatJid: GRUP, userJid: AYSE }], numara: '905550000002', lid: '222', sifre: hash })
panelKaydet({ uyelikler: [{ chatJid: OTEKI, userJid: CAN }], numara: '905550000003', lid: '333', sifre: hash })

const veri = veriAc()
// Testte iki yazma arası bekleme yok sayılsın diye saat her çağrıda ilerler.
let sahteSaat = 0
const sunucu = sunucuKur({ sifreHash: await sifreHashle('yonetici'), veri, yedekKlasoru: path.join(klasor, 'yedek'), sosyal: sosyalMotoru({ saat: () => (sahteSaat += 5000) }) })
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}`
after(() => {
  sunucu.close()
  veri.db.close()
  rmSync(klasor, { recursive: true, force: true })
})

const giris = async (kimlik) => {
  const y = await fetch(`${adres}/giris`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': `9.9.9.${kimlik.at(-1)}` },
    body: new URLSearchParams({ kimlik, sifre: SIFRE }),
  })
  assert.equal(y.headers.get('location'), '/s')
  return y.headers.get('set-cookie').split(';')[0]
}
const al = (Cookie, yol) => fetch(adres + yol, { redirect: 'manual', headers: { Cookie } })
const gonder = (Cookie, yol, alanlar, ek = {}) => fetch(adres + yol, {
  method: 'POST', redirect: 'manual', headers: { Cookie, ...ek },
  body: alanlar instanceof FormData ? alanlar : new URLSearchParams(alanlar),
})
const g = encodeURIComponent(GRUP)
const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c8553d' } }).png().toBuffer()
const fotoFormu = (alanlar) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(alanlar)) f.append(k, v)
  f.append('foto', new Blob([png], { type: 'image/png' }), 'a.png')
  return f
}

const ali = await giris('111')
const ayse = await giris('222')
const can = await giris('333')

test('multipart: metin alanları ve tek dosya', () => {
  const govde = Buffer.from('--x\r\nContent-Disposition: form-data; name="metin"\r\n\r\nselam\r\n--x\r\nContent-Disposition: form-data; name="foto"; filename="a.png"\r\n\r\nABC\r\n--x--\r\n')
  const s = multipartCoz(govde, 'multipart/form-data; boundary=x')
  assert.equal(s.alanlar.get('metin'), 'selam')
  assert.equal(s.dosya.toString(), 'ABC')
  assert.equal(multipartCoz(govde, 'multipart/form-data'), null)
})

test('etiket: uzun ad önce eşleşir', () => {
  const uyeler = [{ jid: 'a', ad: 'Ali' }, { jid: 'b', ad: 'Ali Veli' }]
  assert.deepEqual(S.etiketleriBul('selam @ali veli', uyeler), ['b'])
  assert.deepEqual(S.etiketleriBul('@Ali ve @Ali Veli', uyeler).sort(), ['a', 'b'])
})

test('akış: gönderi kaçırılır, XP günde üç kez, beğeni açılıp kapanır', async () => {
  const sayfa = await al(ali, `/s?grup=${g}`)
  assert.equal(sayfa.status, 200)
  assert.ok(sayfa.headers.get('content-security-policy').includes("img-src 'self' blob:"))
  assert.ok((await sayfa.text()).includes('href="/oyun?grup='))

  for (let i = 0; i < 4; i++) await gonder(ali, '/s/paylas', { grup: GRUP, metin: `<script>x</script> ${i} @Ayşe` })
  const html = await (await al(ali, `/s?grup=${g}`)).text()
  assert.ok(!html.includes('<script>x'))
  assert.ok(html.includes('&lt;script&gt;x'))
  assert.ok(html.includes('class="etiket"'))
  assert.equal(db.prepare('SELECT adet FROM sosyal_xp WHERE user_jid = ?').get(ALI).adet, 3)
  assert.ok(db.prepare('SELECT xp FROM stats WHERE chat_jid = ? AND user_jid = ?').get(GRUP, ALI).xp > 1000)

  const id = db.prepare('SELECT MAX(id) AS id FROM sosyal_gonderi').get().id
  const b1 = await gonder(ayse, '/s/begen', { grup: GRUP, id }, { 'X-Istemci': '1' })
  assert.equal(await b1.text(), '1:1')
  assert.equal(await (await gonder(ayse, '/s/begen', { grup: GRUP, id }, { 'X-Istemci': '1' })).text(), '0:0')
  // Etiket ve beğeni Ayşe'ye ve Ali'ye bildirim düşer.
  assert.ok(S.sayaclar(GRUP, AYSE).bildirim >= 1)
  assert.equal(S.bildirimler(GRUP, ALI)[0].tur, 'begeni')
})

test('duvar ve dürtme bildirim düşer, dürtme saatte bir', async () => {
  await gonder(ayse, '/s/paylas', { grup: GRUP, metin: 'duvarına yazdım', hedef: ALI, don: ALI })
  assert.equal(S.bildirimler(GRUP, ALI)[0].tur, 'duvar')
  const profil = await (await al(ali, `/s/profil?grup=${g}&id=${encodeURIComponent(ALI)}`)).text()
  assert.ok(profil.includes('duvarına yazdım'))
  assert.ok(profil.includes('Wrapped') || profil.includes('Seviye'))

  assert.deepEqual(S.durt(GRUP, AYSE, ALI, 1e12), { tamam: true })
  assert.ok(S.durt(GRUP, AYSE, ALI, 1e12 + 1000).bekleMs > 0)
})

test('gönderiyi yalnızca yazan ya da duvar sahibi siler', async () => {
  const id = db.prepare("SELECT id FROM sosyal_gonderi WHERE metin = 'duvarına yazdım'").get().id
  assert.equal(S.gonderiSil(GRUP, CAN, id), false)
  assert.equal(S.gonderiSil(GRUP, ALI, id), true)
})

test('DM: yalnızca taraflar okur, yoklama yeni mesajı verir', async () => {
  await gonder(ali, '/s/mesaj-yaz', fotoFormu({ grup: GRUP, ile: AYSE, metin: 'gizli <b>mesaj</b>' }))
  assert.equal(S.sayaclar(GRUP, AYSE).dm, 1)
  const yeni = await (await al(ayse, `/s/mesaj-yeni?grup=${g}&ile=${encodeURIComponent(ALI)}&son=0`)).text()
  assert.ok(yeni.includes('gizli &lt;b&gt;mesaj'))
  assert.equal(S.sayaclar(GRUP, AYSE).dm, 0)

  const medya = db.prepare('SELECT medya FROM sosyal_dm').get().medya
  assert.equal((await al(ayse, `/s/medya/${medya}?grup=${g}`)).status, 200)
  // Başka grubun üyesi kendi grubunu seçse de görseli alamaz.
  assert.equal((await al(can, `/s/medya/${medya}?grup=${encodeURIComponent(OTEKI)}`)).status, 404)
  // Panel hesabı olmayan kişiye mesaj yazılamaz.
  await gonder(ali, '/s/mesaj-yaz', { grup: GRUP, ile: CAN, metin: 'ulaşmaz' })
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sosyal_dm WHERE alici = ?").get(CAN).n, 0)
})

test('hikâye: izleyici bir kez görür, herkes görünce silinir', async () => {
  await gonder(ali, '/s/hikaye-yaz', fotoFormu({ grup: GRUP }))
  const id = db.prepare('SELECT id FROM sosyal_hikaye').get().id
  const medyaDosyasi = db.prepare('SELECT medya FROM sosyal_hikaye').get().medya

  // İzlemeden önce görsel alınamaz.
  assert.equal((await al(ayse, `/s/hikaye-medya?grup=${g}&id=${id}`)).status, 404)
  assert.equal((await al(ayse, `/s/hikaye?grup=${g}&id=${id}`)).status, 200)
  assert.equal((await al(ayse, `/s/hikaye-medya?grup=${g}&id=${id}`)).status, 200)
  const ikinci = await al(ayse, `/s/hikaye?grup=${g}&id=${id}`)
  assert.equal(ikinci.status, 303)

  // Panel hesabı olan tek izleyici Ayşe'ydi: görsel süresi dolunca hikâye ve dosyası gider.
  S.hikayeler(GRUP, ALI, Date.now() + S.HIKAYE_MEDYA_MS + 1000)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sosyal_hikaye').get().n, 0)
  assert.ok(!readdirSync(process.env.MEDYA_DIR).includes(`${medyaDosyasi}.webp`))
})

test('görsel olmayan dosya reddedilir, profil fotoğrafı kaydedilir', async () => {
  const f = new FormData()
  f.append('grup', GRUP)
  f.append('foto', new Blob([Buffer.from('düz metin')]), 'a.txt')
  await gonder(ali, '/s/paylas', f)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sosyal_gonderi WHERE metin = '' ").get().n, 0)

  await gonder(ali, '/s/profil-yaz', fotoFormu({ grup: GRUP, bio: 'merhaba', tur: 'avatar' }))
  const p = S.profilOku(GRUP, ALI)
  assert.equal(p.bio, 'merhaba')
  assert.ok(S.medyaAdiGecerli(p.avatar))
  assert.equal((await al(ayse, `/s/medya/${p.avatar}?grup=${g}`)).status, 200)
})

test('bot gönderisi akışta Grup Bülteni olarak görünür; PWA dosyaları açık', async () => {
  S.botGonderisi(GRUP, '♻️ Reborn geldi')
  assert.ok((await (await al(ali, `/s?grup=${g}`)).text()).includes('Grup Bülteni'))
  for (const yol of ['/manifest.webmanifest', '/sw.js', '/sosyal.css', '/sosyal.js', '/ikon-192.png']) {
    assert.equal((await fetch(adres + yol)).status, 200, yol)
  }
})

test('yönetici sosyal bölüme giremez, oyuncu başka grubu göremez', async () => {
  assert.equal((await al(can, `/s?grup=${g}`)).status, 200)
  assert.ok(!(await (await al(can, `/s?grup=${g}`)).text()).includes('Ali Veli'))
})
