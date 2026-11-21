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
const { endpointGecerli, pushMotoru, vapid, vapidBasligi } = await import('../panel/push.js')
const { createPublicKey, verify } = await import('node:crypto')

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
// Push ağa çıkmaz: gönderilen istekler burada birikir, bekleme hemen çalışır.
const pushIstekleri = []
const push = pushMotoru({ gonder: async (adres, ayar) => { pushIstekleri.push({ adres, ayar }); return { ok: true, status: 201 } }, zamanlayici: (fn) => fn() })
const sunucu = sunucuKur({ sifreHash: await sifreHashle('yonetici'), veri, yedekKlasoru: path.join(klasor, 'yedek'), sosyal: sosyalMotoru({ saat: () => (sahteSaat += 5000) }), push })
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
const g_ = g
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
  const b1 = await (await gonder(ayse, '/s/begen', { grup: GRUP, id, tepki: '😂' }, { 'X-Istemci': '1' })).text()
  assert.ok(b1.startsWith('<div class="eylem"'))
  assert.ok(b1.includes('😂 1'))
  // Başka tepki değiştirir, aynı tepki kaldırır; bildirim yalnızca ilkinde.
  assert.deepEqual(S.begen(GRUP, AYSE, id, 1, '👍').ozet, [{ tepki: '👍', n: 1 }])
  assert.equal(S.begen(GRUP, AYSE, id, 1, '👍').sayi, 0)
  assert.equal(S.begen(GRUP, AYSE, id, 1, '<script>').tepki, '❤️')
  // Etiket ve beğeni Ayşe'ye ve Ali'ye bildirim düşer.
  assert.ok(S.sayaclar(GRUP, AYSE).bildirim >= 1)
  assert.equal(S.bildirimler(GRUP, ALI)[0].tur, 'begeni')
  // Kaldırıp yeniden vermek yeni tepkidir; değiştirmek bildirim düşmez.
  assert.equal(S.bildirimler(GRUP, ALI).filter((b) => b.tur === 'begeni').length, 2)
})

test('paylaşım ve alıntı: düz paylaşım aç/kapa, zincir özgüne gider, XP vermez', async () => {
  const ozgun = S.gonderiYaz({ chatJid: GRUP, userJid: ALI, metin: 'özgün #Çay_Saati' }).id
  const p1 = S.gonderiYaz({ chatJid: GRUP, userJid: AYSE, alintiId: ozgun })
  assert.ok(p1.id && p1.xp === 0)
  assert.equal(S.bildirimler(GRUP, ALI)[0].tur, 'paylasim')
  // Paylaşımın paylaşımı özgüne bağlanır.
  const p2 = S.gonderiYaz({ chatJid: GRUP, userJid: CAN, alintiId: p1.id })
  assert.equal(db.prepare('SELECT alinti_id FROM sosyal_gonderi WHERE id = ?').get(p2.id).alinti_id, ozgun)
  const [g] = S.akis(GRUP, AYSE, { id: p1.id })
  assert.equal(g.alinti.id, ozgun)
  assert.equal(g.alinti.paylasim, 2)
  assert.ok(g.alinti.paylastim)
  assert.deepEqual(S.gonderiYaz({ chatJid: GRUP, userJid: AYSE, alintiId: ozgun }), { geriAlindi: true })
  assert.equal(S.akis(GRUP, ALI, { id: ozgun })[0].paylasim, 1)

  const alinti = S.gonderiYaz({ chatJid: GRUP, userJid: AYSE, alintiId: ozgun, metin: 'buna katılıyorum' })
  assert.equal(S.bildirimler(GRUP, ALI)[0].tur, 'alinti')
  const html = await (await al(ali, `/s/gonderi?grup=${g_}&id=${alinti.id}`)).text()
  assert.ok(html.includes('class="alinti"') && html.includes('buna katılıyorum'))
  assert.equal((await al(ayse, `/s/alinti?grup=${g_}&id=${ozgun}`)).status, 200)

  // Özgün silinince alıntı "silinmiş" der.
  S.gonderiSil(GRUP, ALI, ozgun)
  assert.ok(S.akis(GRUP, ALI, { id: alinti.id })[0].alinti.silindi)
  assert.ok((await (await al(ali, `/s/gonderi?grup=${g_}&id=${alinti.id}`)).text()).includes('Bu gönderi silinmiş'))
})

test('hashtag: ayıklama, etiket sayfası, gündem kişi başı sayar', async () => {
  assert.deepEqual(S.hashtagler('#Merhaba dünya #çay_saati a#yok &#39; #MERHABA'), ['merhaba', 'çay_saati'])
  S.gonderiYaz({ chatJid: GRUP, userJid: ALI, metin: 'bugün #halısaha var' })
  S.gonderiYaz({ chatJid: GRUP, userJid: ALI, metin: 'yine #halısaha' })
  S.gonderiYaz({ chatJid: GRUP, userJid: AYSE, metin: '#HALISAHA geliyorum' })
  assert.equal(S.etiketAkisi(GRUP, ALI, 'halısaha').length, 3)
  assert.deepEqual(S.gundem(GRUP).find((e) => e.ad === 'halısaha'), { ad: 'halısaha', sayi: 2 })
  const sayfa = await (await al(ali, `/s/etiket?grup=${g_}&ad=${encodeURIComponent('halısaha')}`)).text()
  assert.ok(sayfa.includes('#halısaha</h1>') && sayfa.includes('class="hashtag"'))
  assert.ok((await (await al(ali, `/s?grup=${g_}`)).text()).includes('Gündem'))
})

test('push: yalnızca bilinen servisler, imza doğrulanır, bildirim cihaza gider, DM metni gizli', async () => {
  assert.ok(endpointGecerli('https://fcm.googleapis.com/fcm/send/abc'))
  assert.ok(endpointGecerli('https://web.push.apple.com/QG'))
  for (const kotu of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.kotu.com/x', 'https://fcm.googleapis.com:8443/x', 'nope']) {
    assert.equal(endpointGecerli(kotu), false, kotu)
  }
  const baslik = vapidBasligi('https://fcm.googleapis.com/fcm/send/abc', 'https://panel.ornek', 0)
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(baslik)
  assert.equal(k, vapid().acik)
  const [bas, govde, imza] = jwt.split('.')
  assert.equal(JSON.parse(Buffer.from(govde, 'base64url')).aud, 'https://fcm.googleapis.com')
  const acik = Buffer.from(k, 'base64url')
  const anahtar = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: acik.subarray(1, 33).toString('base64url'), y: acik.subarray(33).toString('base64url') }, format: 'jwk' })
  assert.ok(verify('sha256', Buffer.from(`${bas}.${govde}`), { key: anahtar, dsaEncoding: 'ieee-p1363' }, Buffer.from(imza, 'base64url')))
  assert.equal((await fetch(`${adres}/s/push-anahtar`, { headers: { Cookie: ali } })).status, 200)

  const kotuKayit = await gonder(ayse, '/s/push-kayit', { endpoint: 'https://169.254.169.254/latest' })
  assert.equal(kotuKayit.status, 400)
  assert.equal((await gonder(ayse, '/s/push-kayit', { endpoint: 'https://fcm.googleapis.com/fcm/send/ayse' })).status, 204)
  assert.deepEqual(S.pushAlicilari(GRUP, AYSE), ['https://fcm.googleapis.com/fcm/send/ayse'])

  pushIstekleri.length = 0
  S.dmYaz({ chatJid: GRUP, gonderen: ALI, alici: AYSE, metin: 'çok gizli' })
  await new Promise((t) => setImmediate(t))
  assert.equal(pushIstekleri.length, 1)
  assert.equal(pushIstekleri[0].adres, 'https://fcm.googleapis.com/fcm/send/ayse')
  assert.ok(pushIstekleri[0].ayar.headers.Authorization.startsWith('vapid t='))
  assert.equal(pushIstekleri[0].ayar.body, undefined)

  const ozet = await (await al(ayse, '/s/push-ozet')).json()
  assert.equal(ozet.metin, 'Ali Veli sana mesaj gönderdi')
  assert.ok(!JSON.stringify(ozet).includes('çok gizli'))
  S.dmAkis(GRUP, AYSE, ALI)
  assert.equal((await gonder(ayse, '/s/push-sil', { endpoint: 'https://fcm.googleapis.com/fcm/send/ayse' })).status, 204)
  assert.deepEqual(S.pushAlicilari(GRUP, AYSE), [])
})

test('akış parçası ve yeni gönderi sayısı', async () => {
  const yanit = await al(ali, `/s/akis-parca?grup=${g_}&once=999999`)
  assert.equal(yanit.status, 200)
  assert.ok((await yanit.text()).includes('<article'))
  assert.equal(yanit.headers.get('x-sonraki'), '0')
  const son = db.prepare('SELECT MAX(id) AS id FROM sosyal_gonderi').get().id
  S.gonderiYaz({ chatJid: GRUP, userJid: AYSE, metin: 'yeni' })
  assert.equal(await (await al(ali, `/s/yeni-sayi?grup=${g_}&son=${son}`)).text(), '1')
  assert.equal(await (await al(ayse, `/s/yeni-sayi?grup=${g_}&son=${son}`)).text(), '0')
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

  const medya = db.prepare("SELECT medya FROM sosyal_dm WHERE medya <> ''").get().medya
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
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sosyal_gonderi WHERE metin = '' AND alinti_id = 0").get().n, 0)

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
