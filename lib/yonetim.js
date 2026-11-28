// Yönetim paneli (Faz 90): yöneticiler, tek kullanımlık giriş kodu, işlem kaydı ve panelin bota bıraktığı işler.
// Bot (kod üretme, iş işleme) ve panel (giriş, iş kuyruğa koyma) aynı tabloları kullanır.
import { createHash, randomInt } from 'node:crypto'
import { getDb } from './db.js'
import logger from './logger.js'

export const KOD_MS = 10 * 60_000
// Aynı gruba iki duyuru arasında en az bu kadar süre (bot sahibinin kararı).
export const DUYURU_ARALIGI_MS = 10 * 60_000
export const DUYURU_AZAMI = 2000
// Bot her turda nabzını yazar; panel bundan eskisini "çevrimdışı" sayar.
export const NABIZ_ESIGI_MS = 30_000

/** Roller güçlüden zayıfa. Sahip yalnızca `.env`'deki sahiptir. */
export const ROLLER = {
  sahip: { ad: 'Sahip', emoji: '👑' },
  yonetici: { ad: 'Yönetici', emoji: '🛡️' },
  moderator: { ad: 'Moderatör', emoji: '🎙️' },
}

/** Hangi rol neyi yapar. Sayfa ve işlem aynı izin adını kullanır. */
export const IZINLER = {
  gosterge: ['sahip', 'yonetici', 'moderator'],
  duyuru: ['sahip', 'yonetici', 'moderator'],
  ekonomi: ['sahip', 'yonetici'],
  kasa: ['sahip', 'yonetici'],
  kayit: ['sahip', 'yonetici'],
  yoneticiler: ['sahip'],
}
export const izinVar = (rol, izin) => Boolean(IZINLER[izin]?.includes(rol))

/** "moderatör", "mod", "yönetici", "admin" → rol kodu. */
export function rolCoz(yazi) {
  const k = String(yazi ?? '').toLocaleLowerCase('tr')
  if (['moderatör', 'moderator', 'mod'].includes(k)) return 'moderator'
  if (['yönetici', 'yonetici', 'admin'].includes(k)) return 'yonetici'
  return null
}

// Karışan harfler (0/O, 1/I/L) yok; kod büyük harfe çevrilip karşılaştırılır.
const KOD_HARFLERI = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const KOD_UZUNLUGU = 10
const ozet = (metin) => createHash('sha256').update(metin).digest('hex')
/** Girişte yazılan kod: boşluk ve tire atılır, büyük harfe çevrilir. */
export const kodDuzelt = (kod) => String(kod ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function dene(is, yedek, mesaj) {
  try {
    const db = getDb()
    return db ? is(db) : yedek
  } catch (err) {
    logger.error({ err }, mesaj)
    return yedek
  }
}

export const yoneticiBul = (id) => dene((db) => db.prepare('SELECT * FROM yonetici WHERE id = ?').get(id) ?? null, null, 'Yönetici okunamadı')
export const yoneticiListesi = () => dene((db) => db.prepare('SELECT * FROM yonetici ORDER BY aktif DESC, id').all(), [], 'Yöneticiler okunamadı')

/**
 * Giriş kodu üretir. `rol` verilmezse kod sahibindir (sahip satırı yoksa açılır). Başkası için adla bulunur ya da
 * açılır; kapatılmış kişi yeni kodla yeniden açılır, rolü yazılan olur.
 * @returns {{ kod: string, yonetici: object } | null}
 */
export function kodUret({ rol = 'sahip', ad = 'Sahip', now = Date.now(), rnd = randomInt } = {}) {
  return dene((db) => db.transaction(() => {
    let y = rol === 'sahip'
      ? db.prepare("SELECT * FROM yonetici WHERE rol = 'sahip'").get()
      : db.prepare("SELECT * FROM yonetici WHERE rol <> 'sahip' AND ad = ? COLLATE NOCASE").get(ad)
    if (!y) {
      const id = db.prepare('INSERT INTO yonetici (ad, rol, eklendi) VALUES (?, ?, ?)').run(ad, rol, now).lastInsertRowid
      y = yoneticiBul(id)
    } else if (y.rol !== rol || !y.aktif) {
      db.prepare('UPDATE yonetici SET rol = ?, aktif = 1, surum = surum + 1 WHERE id = ?').run(rol, y.id)
      y = yoneticiBul(y.id)
    }
    db.prepare('DELETE FROM yonetim_kod WHERE bitis <= ? OR yonetici_id = ?').run(now, y.id)
    const kod = Array.from({ length: KOD_UZUNLUGU }, () => KOD_HARFLERI[rnd(KOD_HARFLERI.length)]).join('')
    db.prepare('INSERT INTO yonetim_kod (ozet, yonetici_id, bitis) VALUES (?, ?, ?)').run(ozet(kod), y.id, now + KOD_MS)
    return { kod: `${kod.slice(0, 5)}-${kod.slice(5)}`, yonetici: y }
  })(), null, 'Yönetim kodu üretilemedi')
}

/**
 * Kodla giriş: kod tek kullanımlıktır, doğru da yanlış da olsa bulunduysa silinir.
 * @returns {object | null} giren yönetici
 */
export function kodlaGir(kod, now = Date.now()) {
  const k = kodDuzelt(kod)
  if (k.length !== KOD_UZUNLUGU) return null
  return dene((db) => db.transaction(() => {
    const satir = db.prepare('SELECT * FROM yonetim_kod WHERE ozet = ?').get(ozet(k))
    if (!satir) return null
    db.prepare('DELETE FROM yonetim_kod WHERE ozet = ?').run(satir.ozet)
    if (satir.bitis <= now) return null
    const y = yoneticiBul(satir.yonetici_id)
    if (!y?.aktif) return null
    db.prepare('UPDATE yonetici SET son_giris = ? WHERE id = ?').run(now, y.id)
    return { ...y, son_giris: now }
  })(), null, 'Yönetim girişi okunamadı')
}

/** Oturumun hâlâ geçerli sahibi: kapatılan ya da rolü değişen düşer. */
export function oturumYoneticisi(o) {
  if (o?.tur !== 'yonetim') return null
  const y = yoneticiBul(o.id)
  return y?.aktif && y.surum === o.surum ? y : null
}

/** Sahip başkasının rolünü değiştirir ya da erişimini kapatır. Sahip satırına dokunulmaz. */
export function yoneticiGuncelle({ id, rol, aktif }) {
  return dene((db) => {
    const y = yoneticiBul(id)
    if (!y || y.rol === 'sahip') return null
    const yeniRol = rol && ROLLER[rol] && rol !== 'sahip' ? rol : y.rol
    const yeniAktif = aktif === undefined ? y.aktif : aktif ? 1 : 0
    db.prepare('UPDATE yonetici SET rol = ?, aktif = ?, surum = surum + 1 WHERE id = ?').run(yeniRol, yeniAktif, id)
    if (!yeniAktif) db.prepare('DELETE FROM yonetim_kod WHERE yonetici_id = ?').run(id)
    return yoneticiBul(id)
  }, null, 'Yönetici güncellenemedi')
}

export function kayitYaz(y, islem, ayrinti = '', now = Date.now()) {
  dene((db) => db.prepare('INSERT INTO yonetim_kayit (yonetici_id, ad, rol, islem, ayrinti, zaman) VALUES (?, ?, ?, ?, ?, ?)')
    .run(y.id, y.ad, y.rol, islem, String(ayrinti).slice(0, 500), now), null, 'Yönetim kaydı yazılamadı')
}
export const kayitlar = (adet = 100) =>
  dene((db) => db.prepare('SELECT * FROM yonetim_kayit ORDER BY id DESC LIMIT ?').all(adet), [], 'Yönetim kaydı okunamadı')

// İş kuyruğu.

const IS_TURLERI = ['duyuru', 'kasa_dagit']

/** Gruptaki son duyuru (iptal ve hata hariç). */
const sonDuyuru = (db, chatJid) =>
  db.prepare("SELECT zaman FROM yonetim_is WHERE chat_jid = ? AND tur = 'duyuru' AND durum NOT IN ('iptal', 'hata') ORDER BY zaman DESC LIMIT 1").get(chatJid)

/** Grubun bir sonraki duyuru zamanı (ms); hemen atılabiliyorsa 0. */
export function duyuruBekleme(chatJid, now = Date.now()) {
  return dene((db) => {
    const son = sonDuyuru(db, chatJid)
    return son && son.zaman + DUYURU_ARALIGI_MS > now ? son.zaman + DUYURU_ARALIGI_MS : 0
  }, 0, 'Duyuru zamanı okunamadı')
}

/**
 * Panel bota iş bırakır. Duyuru gruba 10 dakikada birdir: denetim ve yazma aynı transaction'dadır,
 * aynı anda gönderilen iki form iki duyuru açmaz.
 * @returns {{ id: number } | { bekle: number } | null}
 */
export function isEkle({ chatJid, tur, veri, yoneticiId, now = Date.now() }) {
  if (!IS_TURLERI.includes(tur)) return null
  return dene((db) => db.transaction(() => {
    if (tur === 'duyuru') {
      const son = sonDuyuru(db, chatJid)
      if (son && son.zaman + DUYURU_ARALIGI_MS > now) return { bekle: son.zaman + DUYURU_ARALIGI_MS }
    }
    const id = db.prepare('INSERT INTO yonetim_is (chat_jid, tur, veri, yonetici_id, zaman) VALUES (?, ?, ?, ?, ?)')
      .run(chatJid, tur, JSON.stringify(veri), yoneticiId, now).lastInsertRowid
    return { id: Number(id) }
  })(), null, 'Yönetim işi yazılamadı')
}

/** Henüz işlenmemiş iş iptal edilir. */
export const isIptal = (id) =>
  dene((db) => db.prepare("UPDATE yonetim_is SET durum = 'iptal' WHERE id = ? AND durum = 'bekliyor'").run(id).changes > 0, false, 'Yönetim işi iptal edilemedi')

export const isler = ({ adet = 30, tur = null } = {}) => dene((db) => (tur
  ? db.prepare('SELECT * FROM yonetim_is WHERE tur = ? ORDER BY id DESC LIMIT ?').all(tur, adet)
  : db.prepare('SELECT * FROM yonetim_is ORDER BY id DESC LIMIT ?').all(adet)), [], 'Yönetim işleri okunamadı')

/** Bot sıradaki işi alır: `isleniyor` yazılır, iki tur aynı işi almaz. */
export function isAl() {
  return dene((db) => db.transaction(() => {
    const is = db.prepare("SELECT * FROM yonetim_is WHERE durum = 'bekliyor' ORDER BY id LIMIT 1").get()
    if (!is) return null
    db.prepare("UPDATE yonetim_is SET durum = 'isleniyor' WHERE id = ?").run(is.id)
    return { ...is, veri: JSON.parse(is.veri) }
  })(), null, 'Yönetim işi alınamadı')
}

export function isBitir(id, { tamam, sonuc = '', now = Date.now() }) {
  dene((db) => db.prepare('UPDATE yonetim_is SET durum = ?, sonuc = ?, islendi = ? WHERE id = ?')
    .run(tamam ? 'tamam' : 'hata', String(sonuc).slice(0, 500), now, id), null, 'Yönetim işi kapatılamadı')
}

/**
 * Bot yeniden başlarken yarıda kalan işler hata sayılır, yeniden denenmez: duyuru gitmiş olabilir,
 * ikinci kez atılmasın.
 */
export const yarimIsleriKapat = (now = Date.now()) =>
  dene((db) => db.prepare("UPDATE yonetim_is SET durum = 'hata', sonuc = 'Bot işlerken yeniden başladı', islendi = ? WHERE durum = 'isleniyor'").run(now).changes, 0, 'Yarım işler kapatılamadı')

export const nabizYaz = (now = Date.now()) =>
  dene((db) => db.prepare("INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES ('bot_nabiz', ?)").run(String(now)), null, 'Bot nabzı yazılamadı')
export const nabizOku = () =>
  dene((db) => Number(db.prepare("SELECT deger FROM ayar WHERE anahtar = 'bot_nabiz'").get()?.deger ?? 0), 0, 'Bot nabzı okunamadı')
