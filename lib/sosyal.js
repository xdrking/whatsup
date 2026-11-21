// Panelin sosyal bölümü (Faz 66): gönderi, yorum, beğeni, duvar, dürtme, DM, hikâye,
// bildirim. Her şey gruba aittir, grubun üyeleri otomatik arkadaştır. Panel yazar,
// bot yalnızca `botGonderisi` ile olay düşer. Medya dosyaları data/medya/ altındadır.
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'
import logger from './logger.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
export const MEDYA_DIR = process.env.MEDYA_DIR || path.join(DATA_DIR, 'medya')

export const METIN_AZAMI = 2000
export const YORUM_AZAMI = 500
export const BIO_AZAMI = 160
export const DM_AZAMI = 1000
export const AKIS_SAYFA = 20
export const SOSYAL_XP_HAKKI = 3
export const SOSYAL_XP_TABAN = 10
export const DURT_ARALIGI_MS = 60 * 60_000
// "Herkes görünce silinir" kuralı, hesabı olup hiç girmeyen yüzünden diski doldurmasın.
export const HIKAYE_AZAMI_MS = 7 * 24 * 60 * 60_000
// İzleme kaydından sonra görsel bu süre içinde yüklenmeli: hikâye bir kez görünür.
export const HIKAYE_MEDYA_MS = 2 * 60_000
const MEDYA_ADI = /^[a-f0-9]{32}$/

const db = () => getDb()
const temizMetin = (metin, azami) => String(metin ?? '').replace(/\r\n/g, '\n').trim().slice(0, azami)

// --- Medya ---------------------------------------------------------------

export const medyaAdiGecerli = (ad) => MEDYA_ADI.test(String(ad))
export const medyaYolu = (ad) => path.join(MEDYA_DIR, `${ad}.webp`)

/**
 * Görseli WebP'ye çevirip saklar. sharp metadata'yı (EXIF, konum) varsayılan olarak atar,
 * `rotate()` telefon fotoğrafının yönünü düzeltir. Görsel değilse sharp hata atar.
 * @returns {Promise<string>} dosya adı
 */
export async function medyaKaydet(tampon, { boyut = 1280, kare = false } = {}) {
  let resim = sharp(tampon, { limitInputPixels: 40_000_000 }).rotate()
  resim = kare
    ? resim.resize(boyut, boyut, { fit: 'cover' })
    : resim.resize(boyut, boyut, { fit: 'inside', withoutEnlargement: true })
  const cikti = await resim.webp({ quality: 80 }).toBuffer()
  mkdirSync(MEDYA_DIR, { recursive: true })
  const ad = randomBytes(16).toString('hex')
  writeFileSync(medyaYolu(ad), cikti)
  return ad
}

export function medyaSil(ad) {
  if (!medyaAdiGecerli(ad)) return
  try {
    rmSync(medyaYolu(ad), { force: true })
  } catch (err) {
    logger.error({ err, ad }, 'Medya dosyası silinemedi')
  }
}

/** Görsel bu grubun gönderisinde, profilinde ya da kişinin kendi DM'sinde mi. */
export function medyaIzni(chatJid, userJid, ad) {
  if (!medyaAdiGecerli(ad)) return false
  const d = db()
  if (!d) return false
  return Boolean(
    d.prepare('SELECT 1 FROM sosyal_gonderi WHERE chat_jid = ? AND medya = ?').get(chatJid, ad)
    || d.prepare('SELECT 1 FROM sosyal_profil WHERE chat_jid = ? AND (avatar = ? OR kapak = ?)').get(chatJid, ad, ad)
    || d.prepare('SELECT 1 FROM sosyal_dm WHERE chat_jid = ? AND medya = ? AND (gonderen = ? OR alici = ?)').get(chatJid, ad, userJid, userJid),
  )
}

// --- Üyeler ve profil ----------------------------------------------------

/**
 * Grubun üyeleri: istatistiği olan herkes, bot hariç. `panelde` hesabı olan, yani
 * DM okuyabilen kişidir.
 */
export function uyeler(chatJid) {
  const d = db()
  if (!d) return []
  const bot = d.prepare("SELECT deger FROM ayar WHERE anahtar = 'bot_jid'").get()?.deger ?? ''
  return d.prepare(`
    SELECT s.user_jid AS jid, COALESCE(i.ad, '') AS ad, s.xp, s.messages, s.last_seen,
           COALESCE(p.avatar, '') AS avatar,
           EXISTS (SELECT 1 FROM panel_hesap h WHERE h.chat_jid = s.chat_jid AND h.user_jid = s.user_jid) AS panelde
    FROM stats s
    LEFT JOIN isimler i ON i.user_jid = s.user_jid
    LEFT JOIN sosyal_profil p ON p.chat_jid = s.chat_jid AND p.user_jid = s.user_jid
    WHERE s.chat_jid = ? AND s.user_jid <> ?
    ORDER BY s.last_seen DESC
  `).all(chatJid, bot)
}

export function uyeBul(chatJid, jid) {
  return uyeler(chatJid).find((u) => u.jid === jid) ?? null
}

export function profilOku(chatJid, userJid) {
  return db()?.prepare('SELECT bio, avatar, kapak FROM sosyal_profil WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)
    ?? { bio: '', avatar: '', kapak: '' }
}

/** Yalnızca verilen alanlar değişir; eski avatar ya da kapak dosyası silinir. */
export function profilYaz(chatJid, userJid, alanlar) {
  const d = db()
  if (!d) return false
  const eski = profilOku(chatJid, userJid)
  const yeni = { ...eski }
  if (alanlar.bio !== undefined) yeni.bio = temizMetin(alanlar.bio, BIO_AZAMI)
  if (alanlar.avatar) yeni.avatar = alanlar.avatar
  if (alanlar.kapak) yeni.kapak = alanlar.kapak
  d.prepare(`
    INSERT INTO sosyal_profil (chat_jid, user_jid, bio, avatar, kapak) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET bio = excluded.bio, avatar = excluded.avatar, kapak = excluded.kapak
  `).run(chatJid, userJid, yeni.bio, yeni.avatar, yeni.kapak)
  if (eski.avatar && eski.avatar !== yeni.avatar) medyaSil(eski.avatar)
  if (eski.kapak && eski.kapak !== yeni.kapak) medyaSil(eski.kapak)
  return true
}

// --- Bildirim ------------------------------------------------------------

function bildir(d, { chatJid, userJid, kimden, tur, gonderiId = 0, now }) {
  if (!userJid || userJid === kimden) return
  d.prepare('INSERT INTO sosyal_bildirim (chat_jid, user_jid, kimden, tur, gonderi_id, zaman) VALUES (?, ?, ?, ?, ?, ?)')
    .run(chatJid, userJid, kimden, tur, gonderiId, now)
}

export function bildirimler(chatJid, userJid, adet = 40) {
  return db()?.prepare('SELECT * FROM sosyal_bildirim WHERE chat_jid = ? AND user_jid = ? ORDER BY id DESC LIMIT ?')
    .all(chatJid, userJid, adet) ?? []
}

export function bildirimleriOku(chatJid, userJid) {
  db()?.prepare('UPDATE sosyal_bildirim SET okundu = 1 WHERE chat_jid = ? AND user_jid = ? AND okundu = 0').run(chatJid, userJid)
}

/** Menüdeki rozetler: okunmamış bildirim ve DM sayısı. */
export function sayaclar(chatJid, userJid) {
  const d = db()
  if (!d) return { bildirim: 0, dm: 0 }
  return {
    bildirim: d.prepare('SELECT COUNT(*) AS n FROM sosyal_bildirim WHERE chat_jid = ? AND user_jid = ? AND okundu = 0').get(chatJid, userJid).n,
    dm: d.prepare('SELECT COUNT(*) AS n FROM sosyal_dm WHERE chat_jid = ? AND alici = ? AND okundu = 0').get(chatJid, userJid).n,
  }
}

// --- Gönderi -------------------------------------------------------------

/**
 * Metindeki "@Ad" etiketleri. Ad boşluk taşıyabildiği için en uzun ad önce aranır,
 * yoksa "@Ali Veli" içindeki "@Ali" de eşleşirdi.
 */
export function etiketleriBul(metin, uyeListesi) {
  const bulunan = new Set()
  const adlar = uyeListesi.filter((u) => u.ad).sort((a, b) => b.ad.length - a.ad.length)
  let kalan = String(metin).toLocaleLowerCase('tr')
  for (const u of adlar) {
    const iz = `@${u.ad.toLocaleLowerCase('tr')}`
    if (kalan.includes(iz)) {
      bulunan.add(u.jid)
      kalan = kalan.split(iz).join(' ')
    }
  }
  return [...bulunan]
}

/**
 * @returns {{ id: number, xp: number } | { hata: string }}
 * Günün ilk SOSYAL_XP_HAKKI gönderisi küçük bir XP verir (bot sahibinin kararı, "az XP").
 * XP fonksiyonu dışarıdan verilir: kurla ölçek lib/stats.js'tedir, burası ekonomiyi bilmez.
 */
export function gonderiYaz({ chatJid, userJid, hedefJid = '', metin = '', medya = '', now = Date.now(), xpVer = null }) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const temiz = temizMetin(metin, METIN_AZAMI)
  if (!temiz && !medya) return { hata: 'Boş gönderi paylaşılamaz.' }
  if (hedefJid === userJid) hedefJid = ''

  const liste = uyeler(chatJid)
  if (hedefJid && !liste.some((u) => u.jid === hedefJid)) return { hata: 'Bu kişi grupta yok.' }

  const sonuc = d.transaction(() => {
    const id = Number(d.prepare('INSERT INTO sosyal_gonderi (chat_jid, user_jid, hedef_jid, metin, medya, zaman) VALUES (?, ?, ?, ?, ?, ?)')
      .run(chatJid, userJid, hedefJid, temiz, medya, now).lastInsertRowid)
    if (hedefJid) bildir(d, { chatJid, userJid: hedefJid, kimden: userJid, tur: 'duvar', gonderiId: id, now })
    for (const jid of etiketleriBul(temiz, liste)) {
      if (jid !== hedefJid) bildir(d, { chatJid, userJid: jid, kimden: userJid, tur: 'etiket', gonderiId: id, now })
    }

    const gun = istanbulDay(new Date(now))
    const satir = d.prepare('SELECT day, adet FROM sosyal_xp WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)
    const adet = satir?.day === gun ? satir.adet : 0
    const xpHakki = adet < SOSYAL_XP_HAKKI
    if (xpHakki) {
      d.prepare(`INSERT INTO sosyal_xp (chat_jid, user_jid, day, adet) VALUES (?, ?, ?, ?)
        ON CONFLICT (chat_jid, user_jid) DO UPDATE SET day = excluded.day, adet = excluded.adet`).run(chatJid, userJid, gun, adet + 1)
    }
    return { id, xpHakki }
  })()

  const xp = sonuc.xpHakki && xpVer ? xpVer({ chatJid, userJid, taban: SOSYAL_XP_TABAN, now }) : 0
  return { id: sonuc.id, xp }
}

/** Bot olaylarını akışa düşer (reborn, darbe, rekor…). Bot sürecinden çağrılır, hata botu durdurmaz. */
export function botGonderisi(chatJid, metin, now = Date.now()) {
  try {
    db()?.prepare("INSERT INTO sosyal_gonderi (chat_jid, user_jid, metin, zaman) VALUES (?, '', ?, ?)")
      .run(chatJid, temizMetin(metin, METIN_AZAMI), now)
  } catch (err) {
    logger.error({ err, chatJid }, 'Bot gönderisi yazılamadı')
  }
}

/** Yazan da duvar sahibi de silebilir. */
export function gonderiSil(chatJid, userJid, id) {
  const d = db()
  if (!d) return false
  const g = d.prepare('SELECT * FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g || !userJid || (g.user_jid !== userJid && g.hedef_jid !== userJid)) return false
  d.transaction(() => {
    d.prepare('DELETE FROM sosyal_gonderi WHERE id = ?').run(id)
    d.prepare('DELETE FROM sosyal_begeni WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_yorum WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_bildirim WHERE chat_jid = ? AND gonderi_id = ?').run(chatJid, id)
  })()
  if (g.medya) medyaSil(g.medya)
  return true
}

/**
 * Akış: en yeni önce. `kisi` verilirse o kişinin profili (yazdıkları ve duvarına yazılanlar).
 * `once`: bu id'den eski gönderiler (sayfalama).
 */
export function akis(chatJid, izleyen, { kisi = '', once = 0, adet = AKIS_SAYFA, id = 0 } = {}) {
  const d = db()
  if (!d) return []
  const kosul = ['g.chat_jid = ?']
  const p = [chatJid]
  if (id) { kosul.push('g.id = ?'); p.push(id) }
  if (kisi) { kosul.push('(g.user_jid = ? OR g.hedef_jid = ?)'); p.push(kisi, kisi) }
  if (once) { kosul.push('g.id < ?'); p.push(once) }
  const gonderiler = d.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM sosyal_begeni b WHERE b.gonderi_id = g.id) AS begeni,
      EXISTS (SELECT 1 FROM sosyal_begeni b WHERE b.gonderi_id = g.id AND b.user_jid = ?) AS begendim
    FROM sosyal_gonderi g WHERE ${kosul.join(' AND ')} ORDER BY g.id DESC LIMIT ?
  `).all(izleyen, ...p, adet)
  const yorumOku = d.prepare('SELECT * FROM sosyal_yorum WHERE gonderi_id = ? ORDER BY id')
  return gonderiler.map((g) => ({ ...g, begendim: Boolean(g.begendim), yorumlar: yorumOku.all(g.id) }))
}

/** Beğeniyi açar ya da kapatır. */
export function begen(chatJid, userJid, id, now = Date.now()) {
  const d = db()
  if (!d) return null
  const g = d.prepare('SELECT user_jid FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g) return null
  return d.transaction(() => {
    const sil = d.prepare('DELETE FROM sosyal_begeni WHERE gonderi_id = ? AND user_jid = ?').run(id, userJid)
    const begendi = !sil.changes
    if (begendi) {
      d.prepare('INSERT INTO sosyal_begeni (gonderi_id, user_jid, zaman) VALUES (?, ?, ?)').run(id, userJid, now)
      bildir(d, { chatJid, userJid: g.user_jid, kimden: userJid, tur: 'begeni', gonderiId: id, now })
    }
    const sayi = d.prepare('SELECT COUNT(*) AS n FROM sosyal_begeni WHERE gonderi_id = ?').get(id).n
    return { begendi, sayi }
  })()
}

export function yorumYaz(chatJid, userJid, id, metin, now = Date.now()) {
  const d = db()
  const temiz = temizMetin(metin, YORUM_AZAMI)
  if (!d || !temiz) return false
  const g = d.prepare('SELECT user_jid FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g) return false
  const liste = uyeler(chatJid)
  d.transaction(() => {
    d.prepare('INSERT INTO sosyal_yorum (gonderi_id, user_jid, metin, zaman) VALUES (?, ?, ?, ?)').run(id, userJid, temiz, now)
    bildir(d, { chatJid, userJid: g.user_jid, kimden: userJid, tur: 'yorum', gonderiId: id, now })
    for (const jid of etiketleriBul(temiz, liste)) {
      if (jid !== g.user_jid) bildir(d, { chatJid, userJid: jid, kimden: userJid, tur: 'etiket', gonderiId: id, now })
    }
  })()
  return true
}

/** Yorumu yazan da gönderinin sahibi de silebilir. */
export function yorumSil(chatJid, userJid, yorumId) {
  const d = db()
  if (!d) return false
  const y = d.prepare(`SELECT y.id FROM sosyal_yorum y JOIN sosyal_gonderi g ON g.id = y.gonderi_id
    WHERE y.id = ? AND g.chat_jid = ? AND (y.user_jid = ? OR g.user_jid = ?)`).get(yorumId, chatJid, userJid, userJid)
  if (!y) return false
  d.prepare('DELETE FROM sosyal_yorum WHERE id = ?').run(yorumId)
  return true
}

// --- Dürtme --------------------------------------------------------------

/** @returns {{ tamam: true } | { bekleMs: number } | null} */
export function durt(chatJid, kimden, kime, now = Date.now()) {
  const d = db()
  if (!d || kimden === kime) return null
  const son = d.prepare('SELECT zaman FROM sosyal_durt WHERE chat_jid = ? AND kimden = ? AND kime = ?').get(chatJid, kimden, kime)?.zaman ?? 0
  if (now - son < DURT_ARALIGI_MS) return { bekleMs: son + DURT_ARALIGI_MS - now }
  d.transaction(() => {
    d.prepare(`INSERT INTO sosyal_durt (chat_jid, kimden, kime, zaman) VALUES (?, ?, ?, ?)
      ON CONFLICT (chat_jid, kimden, kime) DO UPDATE SET zaman = excluded.zaman`).run(chatJid, kimden, kime, now)
    bildir(d, { chatJid, userJid: kime, kimden, tur: 'durt', now })
  })()
  return { tamam: true }
}

// --- DM ------------------------------------------------------------------

export function dmYaz({ chatJid, gonderen, alici, metin = '', medya = '', now = Date.now() }) {
  const d = db()
  const temiz = temizMetin(metin, DM_AZAMI)
  if (!d || (!temiz && !medya) || gonderen === alici) return null
  return Number(d.prepare('INSERT INTO sosyal_dm (chat_jid, gonderen, alici, metin, medya, zaman) VALUES (?, ?, ?, ?, ?, ?)')
    .run(chatJid, gonderen, alici, temiz, medya, now).lastInsertRowid)
}

/** Kişinin konuşmaları: karşı taraf başına son mesaj ve okunmamış sayısı. */
export function konusmalar(chatJid, userJid) {
  const d = db()
  if (!d) return []
  const sonOku = d.prepare('SELECT * FROM sosyal_dm WHERE id = ?')
  return d.prepare(`
    SELECT ile, MAX(id) AS son_id,
      SUM(CASE WHEN alici = @u AND okundu = 0 THEN 1 ELSE 0 END) AS okunmamis
    FROM (SELECT id, alici, okundu, CASE WHEN gonderen = @u THEN alici ELSE gonderen END AS ile
          FROM sosyal_dm WHERE chat_jid = @c AND (gonderen = @u OR alici = @u))
    GROUP BY ile ORDER BY son_id DESC
  `).all({ c: chatJid, u: userJid }).map((k) => ({ ...k, son: sonOku.get(k.son_id) }))
}

/** İki kişi arasındaki mesajlar, `sonId`'den yeniler; gelenler okundu işaretlenir. */
export function dmAkis(chatJid, userJid, ile, { sonId = 0, adet = 100 } = {}) {
  const d = db()
  if (!d) return []
  d.prepare('UPDATE sosyal_dm SET okundu = 1 WHERE chat_jid = ? AND gonderen = ? AND alici = ? AND okundu = 0').run(chatJid, ile, userJid)
  return d.prepare(`
    SELECT * FROM (SELECT * FROM sosyal_dm WHERE chat_jid = ? AND id > ?
      AND ((gonderen = ? AND alici = ?) OR (gonderen = ? AND alici = ?)) ORDER BY id DESC LIMIT ?) ORDER BY id
  `).all(chatJid, sonId, userJid, ile, ile, userJid, adet)
}

// --- Hikâye --------------------------------------------------------------

function hikayeSil(d, h) {
  d.prepare('DELETE FROM sosyal_hikaye WHERE id = ?').run(h.id)
  d.prepare('DELETE FROM sosyal_izleme WHERE hikaye_id = ?').run(h.id)
  medyaSil(h.medya)
}

/**
 * Süresi dolanı ve panel hesabı olan herkesin gördüğünü siler. İzleme HIKAYE_MEDYA_MS
 * eskimeden sayılmaz: son izleyici görseli yükleyemeden dosya silinmesin.
 */
export function hikayeTemizle(chatJid, now = Date.now()) {
  const d = db()
  if (!d) return
  const izleyici = d.prepare('SELECT COUNT(*) AS n FROM panel_hesap WHERE chat_jid = ? AND user_jid <> ?')
  const izlenme = d.prepare(`SELECT COUNT(*) AS n FROM sosyal_izleme i
    JOIN panel_hesap h ON h.chat_jid = ? AND h.user_jid = i.user_jid WHERE i.hikaye_id = ? AND i.zaman <= ?`)
  for (const h of d.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ?').all(chatJid)) {
    const gerekli = izleyici.get(chatJid, h.user_jid).n
    if (now - h.zaman > HIKAYE_AZAMI_MS || (gerekli > 0 && izlenme.get(chatJid, h.id, now - HIKAYE_MEDYA_MS).n >= gerekli)) hikayeSil(d, h)
  }
}

export function hikayeYaz({ chatJid, userJid, medya, metin = '', now = Date.now() }) {
  const d = db()
  if (!d) return 0
  return Number(d.prepare('INSERT INTO sosyal_hikaye (chat_jid, user_jid, medya, metin, zaman) VALUES (?, ?, ?, ?, ?)')
    .run(chatJid, userJid, medya, temizMetin(metin, 120), now).lastInsertRowid)
}

/** Hikâye şeridi: kişi başına görülmemiş hikâyeler. Kendi hikâyeleri `benim`de, izleyenleriyle. */
export function hikayeler(chatJid, izleyen, now = Date.now()) {
  const d = db()
  if (!d) return { kisiler: [], benim: [] }
  hikayeTemizle(chatJid, now)
  const hepsi = d.prepare(`
    SELECT h.*, EXISTS (SELECT 1 FROM sosyal_izleme i WHERE i.hikaye_id = h.id AND i.user_jid = ?) AS gordum
    FROM sosyal_hikaye h WHERE h.chat_jid = ? ORDER BY h.id
  `).all(izleyen, chatJid)
  const izleyenler = d.prepare('SELECT user_jid, zaman FROM sosyal_izleme WHERE hikaye_id = ? ORDER BY zaman')
  const benim = hepsi.filter((h) => h.user_jid === izleyen).map((h) => ({ ...h, izleyenler: izleyenler.all(h.id) }))
  const kisiler = new Map()
  for (const h of hepsi) {
    if (h.user_jid === izleyen || h.gordum) continue
    if (!kisiler.has(h.user_jid)) kisiler.set(h.user_jid, [])
    kisiler.get(h.user_jid).push(h)
  }
  return { kisiler: [...kisiler].map(([jid, liste]) => ({ jid, liste })), benim }
}

/**
 * Hikâyeyi açar. Sahibi dışındaki herkes bir kez görebilir: ilk açılışta izleme yazılır,
 * görsel HIKAYE_MEDYA_MS içinde yüklenmeli.
 * @returns {{ hikaye: object } | { goruldu: true } | null}
 */
export function hikayeAc(chatJid, izleyen, id, now = Date.now()) {
  const d = db()
  const h = d?.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!h) return null
  if (h.user_jid === izleyen) return { hikaye: h }
  const yazildi = d.prepare('INSERT OR IGNORE INTO sosyal_izleme (hikaye_id, user_jid, zaman) VALUES (?, ?, ?)').run(id, izleyen, now)
  return yazildi.changes ? { hikaye: h } : { goruldu: true }
}

/** Hikâye görselinin dosya adı; izin yoksa null. */
export function hikayeMedyasi(chatJid, izleyen, id, now = Date.now()) {
  const d = db()
  const h = d?.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!h) return null
  if (h.user_jid === izleyen) return h.medya
  const i = d.prepare('SELECT zaman FROM sosyal_izleme WHERE hikaye_id = ? AND user_jid = ?').get(id, izleyen)
  return i && now - i.zaman <= HIKAYE_MEDYA_MS ? h.medya : null
}
