import logger from './logger.js'
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'

const XP_KAZANC = { mesaj: 1, sticker: 2, ses: 2 }

// Aynı kişi arka arkaya mesaj yağdırarak XP kasmasın. Sayaçlar yine artar,
// yalnızca XP verilmez. Bellekte tutulur; bot yeniden başlarsa sıfırlanır.
const XP_BEKLEME_MS = 30_000
const sonXp = new Map()

// Seviye eğrisi tek yerde: 2. seviye 50 XP, 3. seviye 200 XP, 4. seviye 450 XP…
const XP_KATSAYI = 50

// Sayılmayan mesaj tipleri: tepki, protokol mesajı, anket güncellemesi.
// Bunlar sohbette "mesaj" olarak görünmez, istatistikte de görünmemeli.
const SAYILMAZ = new Set([
  'reactionMessage',
  'protocolMessage',
  'senderKeyDistributionMessage',
  'pollUpdateMessage',
])

const saatBicimi = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  hour12: false,
})

function istanbulSaati(at) {
  return Number.parseInt(saatBicimi.format(new Date(at)), 10)
}

/** Mesaj tipi → sayaç adı. */
export function tipiCozumle(type) {
  if (type === 'stickerMessage') return 'sticker'
  if (type === 'audioMessage') return 'ses'
  return 'mesaj'
}

export function seviye(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / XP_KATSAYI)) + 1
}

export function seviyeIcinXp(level) {
  return XP_KATSAYI * (level - 1) ** 2
}

/** Seviye çubuğu için: mevcut seviyede kazanılan XP ve seviyeyi bitirmeye gereken. */
export function seviyeIlerlemesi(xp) {
  const level = seviye(xp)
  const taban = seviyeIcinXp(level)
  const tavan = seviyeIcinXp(level + 1)

  return { level, kazanilan: xp - taban, gereken: tavan - taban, sonraki: tavan }
}

// Hazırlanmış sorgular bir kez derlenir; her mesajda yeniden derlenmez.
let sorgular = null

function hazirla() {
  if (sorgular) return sorgular

  const db = getDb()
  if (!db) return null

  const stats = db.prepare(`
    INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen)
    VALUES (@chat, @user, @mesaj, @sticker, @ses, @xp, @at)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
      messages  = messages + excluded.messages,
      stickers  = stickers + excluded.stickers,
      voices    = voices + excluded.voices,
      xp        = xp + excluded.xp,
      last_seen = excluded.last_seen
  `)

  const hours = db.prepare(`
    INSERT INTO hours (chat_jid, user_jid, hour, count)
    VALUES (@chat, @user, @saat, 1)
    ON CONFLICT (chat_jid, user_jid, hour) DO UPDATE SET count = count + 1
  `)

  // Oyun ödülleri: yalnızca XP artar. Sayaçlara ve saat dağılımına dokunulmaz,
  // çünkü oyun cevabı zaten normal mesaj olarak recordMessage'a da düşmüştür.
  const xpEkle = db.prepare(`
    INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen)
    VALUES (@chat, @user, 0, 0, 0, @xp, @at)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
      xp        = xp + excluded.xp,
      last_seen = excluded.last_seen
  `)

  sorgular = {
    // İki tablo tek işlemde yazılır: sayaç artıp saat dağılımı yazılmadan
    // süreç ölürse veriler birbirini tutmaz.
    kaydet: db.transaction((params) => {
      stats.run(params)
      hours.run(params)
    }),
    xpEkle,
    gunlukOku: db.prepare('SELECT last_day, streak FROM daily WHERE chat_jid = ? AND user_jid = ?'),
    gunlukYaz: db.prepare(`
      INSERT INTO daily (chat_jid, user_jid, last_day, streak)
      VALUES (@chat, @user, @gun, @seri)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        last_day = excluded.last_day,
        streak   = excluded.streak
    `),
    oku: db.prepare('SELECT * FROM stats WHERE chat_jid = ? AND user_jid = ?'),
    enAktifSaat: db.prepare(`
      SELECT hour, count FROM hours
      WHERE chat_jid = ? AND user_jid = ?
      ORDER BY count DESC, hour ASC
      LIMIT 1
    `),
    siralama: db.prepare(`
      SELECT user_jid, xp, messages FROM stats
      WHERE chat_jid = ? AND xp > 0
      ORDER BY xp DESC, messages DESC
      LIMIT ?
    `),
  }

  return sorgular
}

/**
 * Gelen mesajı istatistiklere işler. İstatistik yan iştir: buradaki bir hata
 * mesaj işlemeyi durdurmaz, yalnızca loglanır.
 */
export function recordMessage({ chatJid, userJid, type, at = Date.now() }) {
  if (!chatJid || !userJid || SAYILMAZ.has(type)) return

  try {
    const q = hazirla()
    if (!q) return

    const tip = tipiCozumle(type)
    const anahtar = `${chatJid}|${userJid}`

    const sonuncu = sonXp.get(anahtar) || 0
    const xpVer = at - sonuncu >= XP_BEKLEME_MS
    if (xpVer) sonXp.set(anahtar, at)

    q.kaydet({
      chat: chatJid,
      user: userJid,
      mesaj: tip === 'mesaj' ? 1 : 0,
      sticker: tip === 'sticker' ? 1 : 0,
      ses: tip === 'ses' ? 1 : 0,
      xp: xpVer ? XP_KAZANC[tip] : 0,
      at,
      saat: istanbulSaati(at),
    })
  } catch (err) {
    logger.error({ err, chatJid }, 'İstatistik yazılamadı')
  }
}

/**
 * Oyun ödülü olarak XP verir. `recordMessage`'ın 30 sn'lik cooldown'u burada
 * uygulanmaz: oyun XP'si mesaj yağdırarak değil, doğru cevap vererek kazanılır.
 */
export function addXp({ chatJid, userJid, amount, at = Date.now() }) {
  if (!chatJid || !userJid || !amount) return

  try {
    const q = hazirla()
    if (!q) return

    q.xpEkle.run({ chat: chatJid, user: userJid, xp: amount, at })
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Oyun XP\'si yazılamadı')
  }
}

// Günlük ödül: seri her gün +5 XP büyür, 7. günde tavana (50) ulaşır.
const GUNLUK_TABAN = 20
const GUNLUK_SERI_ARTIS = 5
const GUNLUK_SERI_TAVAN = 7

/** Seri uzunluğuna göre günlük ödül miktarı. */
export function gunlukOdul(seri) {
  return GUNLUK_TABAN + GUNLUK_SERI_ARTIS * (Math.min(seri, GUNLUK_SERI_TAVAN) - 1)
}

/**
 * Günlük ödülü verir. Gün sınırı Türkiye takvim günüdür; aynı gün ikinci kez
 * çağrılırsa XP verilmez.
 *
 * @returns {{ alindi: boolean, seri: number, miktar: number } | null}
 *   null: veritabanı kullanılamıyor.
 */
export function claimDaily({ chatJid, userJid, now = new Date() }) {
  try {
    const q = hazirla()
    if (!q) return null

    const bugun = istanbulDay(now)
    // Türkiye 2016'dan beri yaz saati uygulamıyor: 24 saat geri gitmek her
    // zaman bir önceki takvim gününe düşer.
    const dun = istanbulDay(new Date(now.getTime() - 86_400_000))

    // Okuma + yazma tek işlemde: senkron olduğu için zaten araya mesaj
    // giremez, ama yarıda kalan yazma seriyi ödülsüz ilerletmesin.
    return getDb().transaction(() => {
      const kayit = q.gunlukOku.get(chatJid, userJid)
      if (kayit?.last_day === bugun) return { alindi: false, seri: kayit.streak, miktar: 0 }

      const seri = kayit?.last_day === dun ? kayit.streak + 1 : 1
      const miktar = gunlukOdul(seri)

      q.gunlukYaz.run({ chat: chatJid, user: userJid, gun: bugun, seri })
      q.xpEkle.run({ chat: chatJid, user: userJid, xp: miktar, at: now.getTime() })

      return { alindi: true, seri, miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Günlük ödül yazılamadı')
    return null
  }
}

/** Süren günlük seri; son ödül bugün ya da dün alınmadıysa seri bozulmuştur, 0 döner. */
export function getDailyStreak(chatJid, userJid, now = new Date()) {
  try {
    const q = hazirla()
    if (!q) return 0

    const kayit = q.gunlukOku.get(chatJid, userJid)
    if (!kayit) return 0

    const dun = istanbulDay(new Date(now.getTime() - 86_400_000))
    return kayit.last_day === istanbulDay(now) || kayit.last_day === dun ? kayit.streak : 0
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Günlük seri okunamadı')
    return 0
  }
}

const BOS = { messages: 0, stickers: 0, voices: 0, xp: 0, last_seen: 0 }

/** Tek kullanıcının sayaçları; kaydı yoksa sıfırlarla döner. */
export function getStats(chatJid, userJid) {
  try {
    const q = hazirla()
    if (!q) return { ...BOS }

    return q.oku.get(chatJid, userJid) || { ...BOS }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'İstatistik okunamadı')
    return { ...BOS }
  }
}

/** En çok mesaj yazılan saat (0-23) ve o saatteki mesaj sayısı; veri yoksa null. */
export function getBusiestHour(chatJid, userJid) {
  try {
    const q = hazirla()
    if (!q) return null

    return q.enAktifSaat.get(chatJid, userJid) || null
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'En aktif saat okunamadı')
    return null
  }
}

/** Sohbetin XP sıralaması. */
export function getLeaderboard(chatJid, limit = 10) {
  try {
    const q = hazirla()
    if (!q) return []

    return q.siralama.all(chatJid, limit)
  } catch (err) {
    logger.error({ err, chatJid }, 'Sıralama okunamadı')
    return []
  }
}
