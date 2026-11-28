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

test('panel motoru: izin, onay ve kayıt', async () => {
  const g = yeniGrup()
  getDb().prepare("INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, 'x@lid', 1, 0, 0, 100, 1)").run(g)
  let saat = T
  const motor = yonetimMotoru({ veri: { gruplar: () => [{ chat_jid: g, ad: 'G', uye: 1, mesaj: 1 }] }, saat: () => saat })
  const mod = kodlaGir(kodUret({ rol: 'moderator', ad: 'Mod', now: T }).kod, T)
  const sahip = kodlaGir(kodUret({ now: T }).kod, T)
  const form = (alanlar) => new URLSearchParams({ grup: g, ...alanlar })

  assert.match((await motor.islem(mod, form({ islem: 'xp', kisi: 'x@lid', miktar: '5', onay: '1' }))).hata, /rolün/)
  saat += 1000
  assert.match((await motor.islem(sahip, form({ islem: 'xp', kisi: 'x@lid', miktar: '5' }))).hata, /Onay/)
  saat += 1000
  assert.ok((await motor.islem(sahip, form({ islem: 'xp', kisi: 'x@lid', miktar: '1 bin', onay: '1' }))).tamam)
  assert.equal(getStats(g, 'x@lid').xp, 1100)
  assert.match((await motor.islem(sahip, form({ islem: 'faiz', oran: '20' }))).hata, /hızlı/, 'iki işlem arası bekleme')
  saat += 1000
  assert.match((await motor.islem(sahip, form({ islem: 'xp', kisi: 'yok@lid', miktar: '5', onay: '1' }))).hata, /Üye/)
  saat += 1000
  assert.match((await motor.islem(sahip, form({ islem: 'constructor' }))).hata, /Bilinmeyen/)
  const kayit = getDb().prepare("SELECT * FROM yonetim_kayit WHERE islem = 'xp'").all()
  assert.equal(kayit.length, 1)
  assert.match(kayit[0].ayrinti, /\+1\.000 XP/)
})

// Faz 91
const { kilitYaz, komutKapali, HEPSI } = await import('../lib/komutKilit.js')
const { hapistenCikar, ambargoKaldir, unvanAyarla, uyeDurumu, secimIptal, adayOl, secimDurumu } = await import('../lib/stats.js')
const { isMuted } = await import('../lib/mute.js')
const { uyeSusturuldu } = await import('../lib/uyeSustur.js')

test('komut kilidi: bütün gruplar, tek grup, kilitlenmeyen komutlar', () => {
  const g = yeniGrup()
  const t = Date.now()
  assert.ok(kilitYaz(HEPSI, 'slot', true))
  assert.ok(!kilitYaz(HEPSI, 'slot', true), 'ikinci kez değişmez')
  assert.ok(komutKapali(g, 'slot', t) && komutKapali('x@s.whatsapp.net', 'slot', t))
  assert.ok(kilitYaz(g, 'wordle', true))
  assert.ok(komutKapali(g, 'wordle', t) && !komutKapali(yeniGrup(), 'wordle', t))
  assert.ok(!kilitYaz(HEPSI, 'help', true) && !komutKapali(g, 'help', t), 'help kilitlenmez')
  kilitYaz(HEPSI, 'slot', false)
  kilitYaz(g, 'wordle', false)
  assert.ok(!komutKapali(g, 'slot', t) && !komutKapali(g, 'wordle', t))
})

test('hapis, ambargo, unvan ve seçim iptali', () => {
  const g = yeniGrup()
  const db = getDb()
  db.prepare("INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, 'u@lid', 1, 0, 0, 1000000000, 1)").run(g)
  db.prepare("INSERT INTO hapis (chat_jid, user_jid, bitis, kefalet) VALUES (?, 'u@lid', ?, 5)").run(g, T + 3_600_000)
  db.prepare("INSERT INTO ambargo (chat_jid, user_jid, bitis) VALUES (?, 'u@lid', ?)").run(g, T + 3_600_000)
  assert.ok(uyeDurumu({ chatJid: g, userJid: 'u@lid', now: T }).hapis)
  assert.equal(hapistenCikar({ chatJid: g, userJid: 'u@lid', now: T }), true)
  assert.equal(hapistenCikar({ chatJid: g, userJid: 'u@lid', now: T }), false)
  assert.equal(ambargoKaldir({ chatJid: g, userJid: 'u@lid', now: T }), true)
  assert.equal(uyeDurumu({ chatJid: g, userJid: 'u@lid', now: T }).ambargo, 0)
  assert.deepEqual(unvanAyarla({ chatJid: g, userJid: 'u@lid', unvan: 'Patron' }), { once: null })
  assert.equal(uyeDurumu({ chatJid: g, userJid: 'u@lid', now: T }).unvan, 'Patron')
  unvanAyarla({ chatJid: g, userJid: 'u@lid', unvan: '' })
  assert.equal(uyeDurumu({ chatJid: g, userJid: 'u@lid', now: T }).unvan, null)

  assert.ok(adayOl({ chatJid: g, userJid: 'u@lid', makam: 'adalet', now: T }).basladi)
  assert.ok(secimDurumu({ chatJid: g, userJid: '', now: T }).secimler.adalet)
  assert.equal(secimIptal({ chatJid: g, makam: 'adalet', now: T }), true)
  assert.equal(secimDurumu({ chatJid: g, userJid: '', now: T }).secimler.adalet, null)
  assert.equal(secimIptal({ chatJid: g, makam: 'adalet', now: T }), false)
})

test('bot turu: sus, konuş ve üye susturma', async () => {
  while (isAl());
  const g = yeniGrup()
  const giden = []
  const sock = { user: { id: 'bot@s.whatsapp.net' }, sendMessage: async (jid, icerik) => { giden.push({ jid, ...icerik }) } }
  isEkle({ chatJid: g, tur: 'sus', veri: {}, yoneticiId: 1, now: T })
  isEkle({ chatJid: g, tur: 'sustur', veri: { kisi: 'k@lid', dakika: 0 }, yoneticiId: 1, now: T })
  await yonetimTuru(sock)
  assert.ok(isMuted(g))
  assert.ok(uyeSusturuldu(g, ['k@lid']), 'susturulmuş grupta da üye susturulur')
  isEkle({ chatJid: g, tur: 'konus', veri: {}, yoneticiId: 1, now: T })
  isEkle({ chatJid: g, tur: 'sustur_kaldir', veri: { kisi: 'k@lid' }, yoneticiId: 1, now: T })
  await yonetimTuru(sock)
  assert.ok(!isMuted(g))
  assert.ok(!uyeSusturuldu(g, ['k@lid']))
  assert.ok(giden[0].text.startsWith('🤐') && giden[1].text.startsWith('🗣'))
})

test('panel motoru: moderatör susturur ama unvan veremez, darbe onay ister', async () => {
  const g = yeniGrup()
  getDb().prepare("INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES (?, 'x@lid', 1, 0, 0, 100, 1)").run(g)
  let saat = T
  const motor = yonetimMotoru({ veri: { gruplar: () => [{ chat_jid: g, ad: 'G', uye: 1, mesaj: 1 }] }, saat: () => saat })
  const mod = kodlaGir(kodUret({ rol: 'moderator', ad: 'Mod2', now: T }).kod, T)
  const sahip = kodlaGir(kodUret({ now: T }).kod, T)
  const form = (alanlar) => new URLSearchParams({ grup: g, ...alanlar })
  assert.ok((await motor.islem(mod, form({ islem: 'sustur', kisi: 'x@lid', dakika: '30' }))).tamam)
  saat += 1000
  assert.match((await motor.islem(mod, form({ islem: 'unvan', kisi: 'x@lid', unvan: 'a' }))).hata, /rolün/)
  saat += 1000
  assert.match((await motor.islem(mod, form({ islem: 'kilit', kapsam: '*', komut: 'slot', durum: 'kapat' }))).hata, /rolün/)
  saat += 1000
  assert.match((await motor.islem(sahip, form({ islem: 'darbe', onay: 'evet' }))).hata, /ONAYLIYORUM/)
  saat += 1000
  assert.match((await motor.islem(sahip, form({ islem: 'kilit', kapsam: '*', komut: 'yonetim', durum: 'kapat' }))).hata, /kilitlenemez/)
  saat += 1000
  assert.ok((await motor.islem(sahip, form({ islem: 'kilit', kapsam: g, komut: 'panel:slot', durum: 'kapat' }))).tamam)
  assert.ok(komutKapali(g, 'panel:slot'))
  while (isAl());
})

// Faz 92
const S = await import('../lib/sosyal.js')
const { mkdtempSync, existsSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const pathMod = (await import('node:path')).default
const { yedekListesi, yedekYolu } = await import('../panel/yedek.js')

test('zamanlanmış duyuru: zamanı gelmeden alınmaz, 10 dakika kuralı zamanlananı da sayar', () => {
  while (isAl());
  const g = yeniGrup()
  const sonra = T + 3_600_000
  const z = isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'z' }, yoneticiId: 1, now: T, calisma: sonra })
  assert.ok(z.id)
  assert.equal(isAl(T), null, 'zamanı gelmedi')
  assert.equal(isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'y' }, yoneticiId: 1, now: T, calisma: sonra + 5 * 60_000 }).cakisma, sonra)
  assert.ok(isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'hemen' }, yoneticiId: 1, now: T }).id, 'şimdi atılabilir')
  assert.equal(isEkle({ chatJid: g, tur: 'duyuru', veri: { metin: 'x' }, yoneticiId: 1, now: sonra - 60_000 }).bekle, sonra + DUYURU_ARALIGI_MS)
  assert.equal(isAl(T).veri.metin, 'hemen')
  assert.equal(isAl(sonra).veri.metin, 'z')
})

test('moderasyon: zorla silme ve yazma engeli', () => {
  const g = yeniGrup()
  const id = S.gonderiYaz({ chatJid: g, userJid: 'a@lid', metin: 'kötü söz', now: T }).id
  assert.ok(id)
  const yorumId = S.yorumYaz(g, 'b@lid', id, 'yorum', T)
  assert.ok(S.sonGonderiler(g).some((x) => x.id === id))
  assert.ok(S.sonYorumlar(g).length >= 1, String(yorumId))
  assert.equal(S.gonderiSil(g, 'c@lid', id), false, 'başkası silemez')
  assert.equal(S.gonderiSil(g, '', id, { zorla: true }), true)
  assert.equal(S.sonYorumlar(g).length, 0, 'yorumları da gider')
  S.engelYaz(g, 'a@lid', 2, T)
  assert.ok(S.engelBitisi(g, 'a@lid', T + 3_600_000))
  assert.equal(S.engelBitisi(g, 'a@lid', T + 3 * 3_600_000), 0, 'süre dolunca düşer')
  assert.ok(S.engelKaldir(g, 'a@lid'))
  assert.equal(S.engelBitisi(g, 'a@lid', T), 0)
})

test('yedek: yalnızca bilinen adlar indirilir', () => {
  const k = mkdtempSync(pathMod.join(tmpdir(), 'yonetim-yedek-'))
  assert.deepEqual(yedekListesi(k), [])
  assert.equal(yedekYolu(k, '../stats.db'), null)
  assert.equal(yedekYolu(k, 'stats-2026-01-01.db'), null, 'listede olmayan')
  assert.deepEqual(yedekListesi(pathMod.join(k, 'yok')), [])
  assert.ok(existsSync(k))
})
