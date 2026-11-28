// Yönetim paneli (Faz 90): giriş kodu, roller, ayarlar, iş kuyruğu ve panel işlemleri.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.STATS_DB = ':memory:'
process.env.LOG_LEVEL = 'silent'
const {
  DUYURU_ARALIGI_MS, isAl, isEkle, isIptal, izinVar, KOD_MS, kodlaGir, kodUret, oturumYoneticisi, yoneticiGuncelle,
} = await import('../lib/yonetim.js')
const { ayarDeger, ayarOnbellekSil, ayarYaz } = await import('../lib/ayarlar.js')
const { getDb } = await import('../lib/db.js')
const { botHesabiniTani, coinAyarla, getStats, sandikAl, sandikDurumu } = await import('../lib/stats.js')
const { yonetimTuru } = await import('../lib/yonetimIs.js')
const { setMuted } = await import('../lib/mute.js')
const { yonetimMotoru } = await import('../panel/yonetim.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
let sayac = 0
const yeniGrup = () => `1203630199${++sayac}@g.us`

test('kod tek kullanımlıktır, süresi dolar, yeni kod eskisini geçersiz kılar', () => {
  const { kod, yonetici } = kodUret({ now: T })
  assert.equal(yonetici.rol, 'sahip')
  assert.match(kod, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/)
  assert.equal(kodlaGir(kod, T + KOD_MS + 1), null, 'süresi dolmuş')

  const ikinci = kodUret({ now: T }).kod
  const ucuncu = kodUret({ now: T }).kod
  assert.equal(kodlaGir(ikinci, T), null, 'yeni kod eskisini siler')
  const giren = kodlaGir(` ${ucuncu.toLowerCase().replace('-', ' ')} `, T)
  assert.equal(giren?.rol, 'sahip', 'boşluk ve küçük harf kabul')
  assert.equal(kodlaGir(ucuncu, T), null, 'ikinci kullanım yok')
  assert.equal(kodUret({ now: T }).yonetici.id, giren.id, 'sahip satırı tektir')
})

test('kapatılan ya da rolü değişen kişinin oturumu düşer', () => {
  const { kod } = kodUret({ rol: 'moderator', ad: 'Ali', now: T })
  const ali = kodlaGir(kod, T)
  const oturum = { tur: 'yonetim', id: ali.id, surum: ali.surum }
  assert.equal(oturumYoneticisi(oturum)?.ad, 'Ali')
  assert.equal(oturumYoneticisi({ ...oturum, tur: 'oyuncu' }), null)

  yoneticiGuncelle({ id: ali.id, rol: 'yonetici' })
  assert.equal(oturumYoneticisi(oturum), null, 'rol değişince düşer')
  const yeni = kodlaGir(kodUret({ rol: 'yonetici', ad: 'ali', now: T }).kod, T)
  assert.equal(yeni.id, ali.id, 'adla aynı kişi bulunur')
  yoneticiGuncelle({ id: ali.id, aktif: false })
  assert.equal(oturumYoneticisi({ tur: 'yonetim', id: yeni.id, surum: yeni.surum }), null, 'kapatılınca düşer')
  const sahip = kodlaGir(kodUret({ now: T }).kod, T)
  assert.equal(yoneticiGuncelle({ id: sahip.id, aktif: false }), null, 'sahip kapatılamaz')
})

test('roller: moderatör yalnızca gösterge ve duyuru', () => {
  assert.ok(izinVar('moderator', 'duyuru'))
  assert.ok(!izinVar('moderator', 'ekonomi'))
  assert.ok(!izinVar('yonetici', 'yoneticiler'))
  assert.ok(izinVar('sahip', 'yoneticiler'))
})

test('duyuru gruba 10 dakikada bir; iptal ve kuyruk sırası', () => {
  const g = yeniGrup()
  const ilk = isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'a' }, yoneticiId: 1, now: T })
  assert.ok(ilk.id)
  assert.equal(isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'b' }, yoneticiId: 1, now: T + 60_000 }).bekle, T + DUYURU_ARALIGI_MS)
  assert.ok(isEkle({ chatJid: yeniGrup(), tur: 'duyuru', veri: { metin: 'c' }, yoneticiId: 1, now: T }).id, 'başka grup serbest')
  assert.ok(isIptal(ilk.id))
  assert.ok(isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'd' }, yoneticiId: 1, now: T + 60_000 }).id, 'iptal edilen sayılmaz')
  assert.equal(isEkle({ chatJid: g, tur: 'bilinmeyen', veri: {}, yoneticiId: 1, now: T }), null)
  while (isAl());
})

test('ayar sınırı denetlenir ve kasa alım sınırına işler', () => {
  assert.ok(ayarYaz('kasaHaftalikAlim', '-1').hata)
  assert.ok(ayarYaz('kasaHaftalikAlim', '2,5').hata)
  assert.ok(ayarYaz('yok', '1').hata)
  assert.ok(ayarYaz('constructor', '1').hata)
  assert.deepEqual(ayarYaz('kasaHaftalikAlim', '2'), { once: 7, deger: 2 })
  const g = yeniGrup()
  coinAyarla({ chatJid: g, userJid: 'u@lid', adet: 10_000 })
  assert.equal(sandikAl({ chatJid: g, userJid: 'u@lid', tur: 'kasa', tier: 1, adet: 3, now: T }).sinir, 2)
  ayarYaz('kasaHaftalikAlim', '7')
  assert.equal(ayarDeger('kasaHaftalikAlim'), 7, 'varsayılana dönünce satır silinir')
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM ayar WHERE anahtar = 'yonetim:kasaHaftalikAlim'").get().n, 0)

  ayarYaz('kasaGecelikAnahtar', '0')
  assert.deepEqual(sandikDurumu({ chatJid: g, userJid: 'u@lid', now: T }).yeniAnahtar, [], 'gecelik anahtar kapalı')
  ayarYaz('kasaGecelikAnahtar', '1')
  ayarOnbellekSil()
  assert.equal(sandikDurumu({ chatJid: g, userJid: 'u@lid', now: T }).yeniAnahtar.length, 1)
})

test('bot turu duyuruyu gizli etiketle atar, susturulmuş gruba atmaz, kasa dağıtır', async () => {
  while (isAl());
  const g = yeniGrup()
  const susuk = yeniGrup()
  const giden = []
  const sock = {
    user: { id: 'bot@s.whatsapp.net' },
    groupMetadata: async (jid) => ({ id: jid, subject: 'G', participants: [{ id: 'a@lid' }, { id: 'b@lid' }, { id: 'bot@s.whatsapp.net' }] }),
    sendMessage: async (jid, icerik) => { giden.push({ jid, ...icerik }) },
  }
  botHesabiniTani(sock.user)
  setMuted(susuk, true)
  const d = isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'Toplantı var', etiket: true }, yoneticiId: 1, now: T }).id
  const s = isEkle({ chatJid: susuk, tur: 'duyuru', veri: { metin: 'x', etiket: false }, yoneticiId: 1, now: T }).id
  const k = isEkle({ chatJid: g, tur: 'kasa_dagit', veri: {}, yoneticiId: 1, now: T }).id
  await yonetimTuru(sock)

  const durum = (id) => getDb().prepare('SELECT durum, sonuc FROM yonetim_is WHERE id = ?').get(id)
  assert.equal(durum(d).durum, 'tamam')
  assert.equal(durum(s).durum, 'hata')
  assert.equal(durum(k).durum, 'tamam')
  assert.equal(giden.length, 2)
  assert.match(giden[0].text, /DUYURU[\s\S]*Toplantı var/)
  assert.equal(giden[0].mentions.length, 3)
  assert.doesNotMatch(giden[0].text, /@/, 'etiketler metne yazılmaz')
  assert.match(giden[1].text, /KASA YAĞMURU/)
  const kasalar = (jid) => Object.values(sandikDurumu({ chatJid: g, userJid: jid, now: T }).kasa).reduce((t, n) => t + n, 0)
  assert.equal(kasalar('a@lid'), 1)
  assert.equal(kasalar('bot@s.whatsapp.net'), 0, 'bot almaz')
  setMuted(susuk, false)
})

test('panel motoru: izin, onay ve kayıt', () => {
  const g = yeniGrup()
  getDb().prepare("INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, 'x@lid', 1, 0, 0, 100, 1)").run(g)
  let saat = T
  const motor = yonetimMotoru({ veri: { gruplar: () => [{ chat_jid: g, ad: 'G', uye: 1, mesaj: 1 }] }, saat: () => saat })
  const mod = kodlaGir(kodUret({ rol: 'moderator', ad: 'Mod', now: T }).kod, T)
  const sahip = kodlaGir(kodUret({ now: T }).kod, T)
  const form = (alanlar) => new URLSearchParams({ grup: g, ...alanlar })

  assert.match(motor.islem(mod, form({ islem: 'xp', kisi: 'x@lid', miktar: '5', onay: '1' })).hata, /rolün/)
  saat += 1000
  assert.match(motor.islem(sahip, form({ islem: 'xp', kisi: 'x@lid', miktar: '5' })).hata, /Onay/)
  saat += 1000
  assert.ok(motor.islem(sahip, form({ islem: 'xp', kisi: 'x@lid', miktar: '1 bin', onay: '1' })).tamam)
  assert.equal(getStats(g, 'x@lid').xp, 1100)
  assert.match(motor.islem(sahip, form({ islem: 'faiz', oran: '20' })).hata, /hızlı/, 'iki işlem arası bekleme')
  saat += 1000
  assert.match(motor.islem(sahip, form({ islem: 'xp', kisi: 'yok@lid', miktar: '5', onay: '1' })).hata, /Üye/)
  saat += 1000
  assert.match(motor.islem(sahip, form({ islem: 'constructor' })).hata, /Bilinmeyen/)
  const kayit = getDb().prepare("SELECT * FROM yonetim_kayit WHERE islem = 'xp'").all()
  assert.equal(kayit.length, 1)
  assert.match(kayit[0].ayrinti, /\+1\.000 XP/)
})
