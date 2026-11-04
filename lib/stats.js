import logger from './logger.js'
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'
import { gununGorevleri } from './gorev.js'
import { KALKAN_SURESI_MS } from './market.js'
import {
  GUNLUK_DENEME, KORUNMA_MS, MIN_HIRSIZ_XP, MIN_KURBAN_XP, ODUL_KESINTI_YUZDESI, soygunPayi,
} from './soygun.js'
import { aktifBonus, bonusluXp, BONUS_SURESI_MS, EKSTRA_UCRET, hakDurumu, HAK_PENCERESI_MS } from './cark.js'

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

  // Devirde kişi mesaj yazmış sayılmaz: last_seen (.stats "Son mesaj") değişmez.
  const xpAktar = db.prepare(`
    INSERT INTO stats (chat_jid, user_jid, xp) VALUES (@chat, @user, @xp)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET xp = xp + excluded.xp
  `)

  sorgular = {
    // İki tablo tek işlemde yazılır: sayaç artıp saat dağılımı yazılmadan
    // süreç ölürse veriler birbirini tutmaz.
    kaydet: db.transaction((params) => {
      stats.run(params)
      hours.run(params)
    }),
    xpEkle,
    xpAktar,
    gunlukOku: db.prepare('SELECT last_day, streak FROM daily WHERE chat_jid = ? AND user_jid = ?'),
    gunlukYaz: db.prepare(`
      INSERT INTO daily (chat_jid, user_jid, last_day, streak)
      VALUES (@chat, @user, @gun, @seri)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        last_day = excluded.last_day,
        streak   = excluded.streak
    `),
    kumarYaz: db.prepare(`
      INSERT INTO kumar (chat_jid, user_jid, won, lost, games)
      VALUES (@chat, @user, @kazanc, @kayip, 1)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        won   = won + excluded.won,
        lost  = lost + excluded.lost,
        games = games + 1
    `),
    kumarKazananlar: db.prepare(`
      SELECT user_jid, won - lost AS net, games FROM kumar
      WHERE chat_jid = ? AND won > lost ORDER BY net DESC LIMIT ?
    `),
    kumarKaybedenler: db.prepare(`
      SELECT user_jid, won - lost AS net, games FROM kumar
      WHERE chat_jid = ? AND won < lost ORDER BY net ASC LIMIT ?
    `),
    piyangoEkle: db.prepare(`
      INSERT INTO piyango (chat_jid, user_jid, xp) VALUES (@chat, @user, @xp)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET xp = xp + excluded.xp
    `),
    piyangoOku: db.prepare('SELECT user_jid, xp FROM piyango WHERE chat_jid = ? ORDER BY xp DESC'),
    piyangoSil: db.prepare('DELETE FROM piyango WHERE chat_jid = ?'),
    gorevYaz: db.prepare(`
      INSERT INTO gorev (chat_jid, user_jid, anahtar, day, sayac) VALUES (@chat, @user, @anahtar, @gun, 1)
      ON CONFLICT (chat_jid, user_jid, anahtar) DO UPDATE SET
        sayac  = CASE WHEN day = excluded.day THEN sayac + 1 ELSE 1 END,
        alindi = CASE WHEN day = excluded.day THEN alindi ELSE 0 END,
        day    = excluded.day
    `),
    gorevOku: db.prepare('SELECT * FROM gorev WHERE chat_jid = ? AND user_jid = ? AND anahtar = ?'),
    gorevAl: db.prepare('UPDATE gorev SET alindi = 1 WHERE chat_jid = ? AND user_jid = ? AND anahtar = ?'),
    marketOku: db.prepare('SELECT * FROM market WHERE chat_jid = ? AND user_jid = ?'),
    marketYaz: db.prepare(`
      INSERT INTO market (chat_jid, user_jid, unvan, kalkan_until) VALUES (@chat, @user, @unvan, @kalkan)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        unvan        = excluded.unvan,
        kalkan_until = excluded.kalkan_until
    `),
    soygunOku: db.prepare('SELECT * FROM soygun WHERE chat_jid = ? AND user_jid = ?'),
    soygunYaz: db.prepare(`
      INSERT INTO soygun (chat_jid, user_jid, day, deneme, korunma_until) VALUES (@chat, @user, @gun, @deneme, @korunma)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        day           = excluded.day,
        deneme        = excluded.deneme,
        korunma_until = excluded.korunma_until
    `),
    odulOku: db.prepare('SELECT xp FROM odul WHERE chat_jid = ? AND user_jid = ?'),
    odulEkle: db.prepare(`
      INSERT INTO odul (chat_jid, user_jid, xp) VALUES (@chat, @user, @xp)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET xp = xp + excluded.xp
    `),
    odulSil: db.prepare('DELETE FROM odul WHERE chat_jid = ? AND user_jid = ?'),
    odulListe: db.prepare('SELECT user_jid, xp FROM odul WHERE chat_jid = ? ORDER BY xp DESC LIMIT 10'),
    carkOku: db.prepare('SELECT * FROM cark WHERE chat_jid = ? AND user_jid = ?'),
    carkYaz: db.prepare(`
      INSERT INTO cark (chat_jid, user_jid, window_start, spins, bonus_percent, bonus_until)
      VALUES (@chat, @user, @pencere, @cevirme, @yuzde, @bitis)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        window_start  = excluded.window_start,
        spins         = excluded.spins,
        bonus_percent = excluded.bonus_percent,
        bonus_until   = excluded.bonus_until
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
    gorevIlerlet(q, chatJid, userJid, 'mesaj', at)
  } catch (err) {
    logger.error({ err, chatJid }, 'İstatistik yazılamadı')
  }
}

/**
 * Oyun ödülü olarak XP verir. `recordMessage`'ın 30 sn'lik cooldown'u burada
 * uygulanmaz: oyun XP'si mesaj yağdırarak değil, doğru cevap vererek kazanılır.
 * Kişinin aktif `.çark` bonusu varsa uygulanır.
 *
 * @returns {number} kazanılan XP (bonus dahil); oyunlar bunu mesajda gösterir.
 */
export function addXp({ chatJid, userJid, amount, at = Date.now() }) {
  if (!chatJid || !userJid || !amount) return 0

  try {
    const q = hazirla()
    if (!q) return amount

    const bonus = aktifBonus(q.carkOku.get(chatJid, userJid), at)
    const kazanc = bonus ? bonusluXp(amount, bonus.yuzde) : amount

    q.xpEkle.run({ chat: chatJid, user: userJid, xp: kazanc, at })
    gorevIlerlet(q, chatJid, userJid, 'oyun', at)
    return kazanc
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Oyun XP\'si yazılamadı')
    return amount
  }
}

/** Günlük görev sayacını artırır. Gün Türkiye takvim günüdür. */
function gorevIlerlet(q, chatJid, userJid, anahtar, at = Date.now()) {
  q.gorevYaz.run({ chat: chatJid, user: userJid, anahtar, gun: istanbulDay(new Date(at)) })
}

/** Tek kumar sonucunu karneye yazar; çağıran transaction içindedir. */
function kumarKaydet(q, chatJid, userJid, fark) {
  gorevIlerlet(q, chatJid, userJid, 'kumar')
  q.kumarYaz.run({
    chat: chatJid,
    user: userJid,
    kazanc: Math.max(fark, 0),
    kayip: Math.max(-fark, 0),
  })
}

/**
 * Bot sahibinin elle XP vermesi/alması (.xpver). Eksi miktar XP'yi en fazla
 * sıfıra indirir; okuma ve yazma tek transaction'dadır.
 *
 * @returns {{ once: number, xp: number } | null}  null: veritabanı kullanılamıyor.
 */
export function xpAyarla({ chatJid, userJid, miktar, at = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      const fark = Math.max(miktar, -once)
      if (fark) q.xpEkle.run({ chat: chatJid, user: userJid, xp: fark, at })
      return { once, xp: once + fark }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Elle XP yazılamadı')
    return null
  }
}

/**
 * Bir kişinin XP'sini başkasına aktarır (.devret). Toplam XP değişmez; bakiye
 * kontrolü ve iki yazma tek transaction'dadır, aynı XP iki kez devredilemez.
 *
 * @returns {{ yetersiz: true, xp: number }
 *   | { yetersiz: false, kaynakXp: number, hedefXp: number }
 *   | null}  null: veritabanı kullanılamıyor.
 */
export function xpDevret({ chatJid, kaynak, hedef, miktar }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const bakiye = q.oku.get(chatJid, kaynak)?.xp ?? 0
      if (miktar > bakiye) return { yetersiz: true, xp: bakiye }

      q.xpAktar.run({ chat: chatJid, user: kaynak, xp: -miktar })
      q.xpAktar.run({ chat: chatJid, user: hedef, xp: miktar })

      return {
        yetersiz: false,
        kaynakXp: bakiye - miktar,
        hedefXp: q.oku.get(chatJid, hedef).xp,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, kaynak, hedef }, 'XP devredilemedi')
    return null
  }
}

/**
 * XP ile şans oyunu (.bahis, .slot, .rulet). Bakiye kontrolü, çekiliş ve XP
 * güncellemesi tek transaction'dadır: çekiliş ancak XP yetiyorsa yapılır ve
 * aynı XP iki bahse birden basılamaz.
 *
 * @param {(miktar: number) => { carpan: number }} cevir  sonucu üretir;
 *   çarpan 0 = bahis yandı, 2 = iki katı geri döndü
 * @returns {{ yetersiz: true, xp: number }
 *   | { yetersiz: false, once: number, xp: number, fark: number, sonuc: object }
 *   | null}  null: veritabanı kullanılamıyor.
 */
export function bahisOyna({ chatJid, userJid, miktar, cevir, at = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar <= 0 || miktar > once) return { yetersiz: true, xp: once }

      const sonuc = cevir(miktar)
      const fark = Math.floor(miktar * sonuc.carpan) - miktar
      if (fark) q.xpEkle.run({ chat: chatJid, user: userJid, xp: fark, at })
      kumarKaydet(q, chatJid, userJid, fark)

      return { yetersiz: false, once, xp: once + fark, fark, sonuc }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Bahis yazılamadı')
    return null
  }
}

/**
 * Çok adımlı kumar oyununa (.blackjack, .mayın) girerken bahsi kasaya alır;
 * oyun sürerken aynı XP başka bahse basılamaz.
 *
 * @returns {{ yetersiz: boolean, xp: number } | null}  null: veritabanı kullanılamıyor.
 */
export function xpCek({ chatJid, userJid, miktar }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar <= 0 || miktar > xp) return { yetersiz: true, xp }

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      return { yetersiz: false, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Bahis kasaya alınamadı')
    return null
  }
}

/**
 * `xpCek` ile başlayan oyunu kapatır: `odeme` kadar XP geri verir ve sonucu
 * karneye yazar. Çarpan bonusu uygulanmaz, kumar kazancı oyun XP'si değildir.
 *
 * @returns {{ xp: number, fark: number } | null}  `fark` bahse göre net sonuç.
 */
export function kumarOde({ chatJid, userJid, bahis, odeme }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (odeme) q.xpAktar.run({ chat: chatJid, user: userJid, xp: odeme })
      kumarKaydet(q, chatJid, userJid, odeme - bahis)
      return { xp: q.oku.get(chatJid, userJid)?.xp ?? 0, fark: odeme - bahis }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid, odeme }, 'Kumar ödemesi yazılamadı')
    return null
  }
}

/**
 * İki kişilik bahis (.vs). Bakiyeler ancak kabul anında denetlenir, çünkü
 * meydan okuma ile kabul arasında XP harcanmış olabilir.
 *
 * @param {() => string} sec  iki oyuncudan kazananın JID'ini döner
 * @returns {{ yetersiz: string, xp: number }
 *   | { kazanan: string, kaybeden: string, kazananXp: number, kaybedenXp: number }
 *   | null}  `yetersiz`: bakiyesi yetmeyen oyuncu.
 */
export function vsOyna({ chatJid, a, b, miktar, sec }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      for (const jid of [a, b]) {
        const xp = q.oku.get(chatJid, jid)?.xp ?? 0
        if (xp < miktar) return { yetersiz: jid, xp }
      }

      const kazanan = sec()
      const kaybeden = kazanan === a ? b : a
      q.xpAktar.run({ chat: chatJid, user: kazanan, xp: miktar })
      q.xpAktar.run({ chat: chatJid, user: kaybeden, xp: -miktar })
      kumarKaydet(q, chatJid, kazanan, miktar)
      kumarKaydet(q, chatJid, kaybeden, -miktar)

      return {
        kazanan,
        kaybeden,
        kazananXp: q.oku.get(chatJid, kazanan).xp,
        kaybedenXp: q.oku.get(chatJid, kaybeden).xp,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, '.vs yazılamadı')
    return null
  }
}

/** @returns {{ yetersiz: boolean, xp: number } | null} */
export function piyangoBilet({ chatJid, userJid, miktar }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar <= 0 || miktar > xp) return { yetersiz: true, xp }

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      q.piyangoEkle.run({ chat: chatJid, user: userJid, xp: miktar })
      return { yetersiz: false, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Piyango bileti yazılamadı')
    return null
  }
}

/** Biletler, en çok yatırandan aza; veritabanı yoksa boş. */
export function piyangoBiletleri(chatJid) {
  try {
    const q = hazirla()
    return q ? q.piyangoOku.all(chatJid) : []
  } catch (err) {
    logger.error({ err, chatJid }, 'Piyango okunamadı')
    return []
  }
}

/**
 * Çekilişi yapar: havuzun tamamı kazananındır, biletler silinir. En az iki kişi
 * gerekir; tek kişilik çekiliş yatırılanı geri vermekten ibaret olurdu.
 *
 * @param {(biletler: object[]) => string} sec  kazananın JID'ini döner
 * @returns {{ yetersiz: true } | { kazanan: string, havuz: number, kisi: number } | null}
 */
export function piyangoCek({ chatJid, sec }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const biletler = q.piyangoOku.all(chatJid)
      if (biletler.length < 2) return { yetersiz: true }

      const havuz = biletler.reduce((t, b) => t + b.xp, 0)
      const kazanan = sec(biletler)

      q.xpAktar.run({ chat: chatJid, user: kazanan, xp: havuz })
      for (const b of biletler) {
        kumarKaydet(q, chatJid, b.user_jid, b.user_jid === kazanan ? havuz - b.xp : -b.xp)
      }
      q.piyangoSil.run(chatJid)

      return { kazanan, havuz, kisi: biletler.length }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Çekiliş yapılamadı')
    return null
  }
}

/** Kumar karnesi: net kazananlar ve net kaybedenler. */
export function kumarSiralama(chatJid, limit = 5) {
  try {
    const q = hazirla()
    if (!q) return { kazananlar: [], kaybedenler: [] }

    return {
      kazananlar: q.kumarKazananlar.all(chatJid, limit),
      kaybedenler: q.kumarKaybedenler.all(chatJid, limit),
    }
  } catch (err) {
    logger.error({ err, chatJid }, 'Kumar sıralaması okunamadı')
    return { kazananlar: [], kaybedenler: [] }
  }
}

/** Yeni bonus eskisini ezmez: güçlü olan yüzde kalır, süre yeniden 1 saat olur. */
function yeniBonus(kayit, yuzde, now) {
  return { yuzde: Math.max(yuzde, aktifBonus(kayit, now)?.yuzde ?? 0), bitis: now + BONUS_SURESI_MS }
}

/**
 * Çarkı çevirir (.çark). Ücretsiz hak varsa o kullanılır, `ekstra` istense bile
 * XP alınmaz. Hak, ücret, ödül ve bonus tek transaction'dadır.
 *
 * @param {() => { xp?: number, bonus?: number }} cevir  ödülü seçer
 * @returns {{ hakYok: true, yenilenme: number }
 *   | { yetersiz: true, xp: number }
 *   | { odul: object, ucret: number, once: number, xp: number, kalan: number,
 *       yenilenme: number | null, bonus: { yuzde: number, bitis: number } | null }
 *   | null}  null: veritabanı kullanılamıyor.
 */
export function carkOyna({ chatJid, userJid, ekstra = false, cevir, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kayit = q.carkOku.get(chatJid, userJid)
      const hak = hakDurumu(kayit, now)
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0

      const ucretsiz = hak.kalan > 0
      if (!ucretsiz && !ekstra) return { hakYok: true, yenilenme: hak.yenilenme }
      if (!ucretsiz && once < EKSTRA_UCRET) return { yetersiz: true, xp: once }

      const ucret = ucretsiz ? 0 : EKSTRA_UCRET
      const odul = cevir()

      const fark = (odul.xp || 0) - ucret
      if (fark) q.xpEkle.run({ chat: chatJid, user: userJid, xp: fark, at: now })

      const bonus = odul.bonus ? yeniBonus(kayit, odul.bonus, now) : aktifBonus(kayit, now)

      const pencere = ucretsiz && hak.yenilenme === null ? now : kayit?.window_start ?? 0
      const cevirme = hak.yenilenme === null ? 0 : kayit.spins

      q.carkYaz.run({
        chat: chatJid,
        user: userJid,
        pencere,
        cevirme: cevirme + (ucretsiz ? 1 : 0),
        yuzde: bonus?.yuzde ?? 0,
        bitis: bonus?.bitis ?? 0,
      })
      gorevIlerlet(q, chatJid, userJid, 'cark', now)

      return {
        odul,
        ucret,
        once,
        xp: once + fark,
        kalan: hak.kalan - (ucretsiz ? 1 : 0),
        yenilenme: ucretsiz ? hak.yenilenme ?? now + HAK_PENCERESI_MS : hak.yenilenme,
        bonus,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çark yazılamadı')
    return null
  }
}

/** Kalan hak ve aktif bonus (.çark durum); null: veritabanı kullanılamıyor. */
export function carkDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    const kayit = q.carkOku.get(chatJid, userJid)
    return { ...hakDurumu(kayit, now), bonus: aktifBonus(kayit, now) }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çark durumu okunamadı')
    return null
  }
}

/**
 * Günün görevlerini okur, tamamlanıp ödülü alınmamışları öder. Bot kendiliğinden
 * mesaj atmadığı için ödül `.görev` yazılınca verilir.
 *
 * @returns {{ gorevler: object[], kazanilan: number } | null}
 */
export function gorevTopla({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    const gun = istanbulDay(new Date(now))

    return getDb().transaction(() => {
      let kazanilan = 0

      const gorevler = gununGorevleri(gun).map((g) => {
        const satir = q.gorevOku.get(chatJid, userJid, g.anahtar)
        const bugun = satir?.day === gun
        const sayac = bugun ? satir.sayac : 0
        const tamam = sayac >= g.hedef
        const yeni = tamam && !satir.alindi

        if (yeni) {
          q.gorevAl.run(chatJid, userJid, g.anahtar)
          q.xpEkle.run({ chat: chatJid, user: userJid, xp: g.odul, at: now })
          kazanilan += g.odul
        }

        return { ...g, sayac: Math.min(sayac, g.hedef), tamam, yeni }
      })

      return { gorevler, kazanilan }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Görevler okunamadı')
    return null
  }
}

/** Kişinin unvanı ve kalkanının bitişi (kalkan yoksa 0). */
export function marketDurumu(chatJid, userJid, now = Date.now()) {
  try {
    const q = hazirla()
    const satir = q?.marketOku.get(chatJid, userJid)
    return {
      unvan: satir?.unvan ?? null,
      kalkan: satir?.kalkan_until > now ? satir.kalkan_until : 0,
    }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Market durumu okunamadı')
    return { unvan: null, kalkan: 0 }
  }
}

/** Bonusu çark satırına yazar, çark hakkına dokunmaz; çağıran transaction içindedir. */
function bonusYaz(q, chatJid, userJid, yuzde, now) {
  const cark = q.carkOku.get(chatJid, userJid)
  const bonus = yeniBonus(cark, yuzde, now)
  q.carkYaz.run({
    chat: chatJid,
    user: userJid,
    pencere: cark?.window_start ?? 0,
    cevirme: cark?.spins ?? 0,
    yuzde: bonus.yuzde,
    bitis: bonus.bitis,
  })
  return bonus
}

/**
 * Ürün satın alır; ücret ve etkisi tek transaction'dadır.
 *
 * @returns {{ yetersiz: true, xp: number } | { zatenVar: true }
 *   | { xp: number, kalkan: number, bonus: object | null } | null}
 */
export function marketAl({ chatJid, userJid, urun, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      const market = q.marketOku.get(chatJid, userJid)
      let unvan = market?.unvan ?? null
      let kalkan = market?.kalkan_until ?? 0

      if (urun.tur === 'unvan' && unvan === urun.unvan) return { zatenVar: true }
      if (urun.fiyat > xp) return { yetersiz: true, xp }

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -urun.fiyat })

      let bonus = null
      if (urun.tur === 'bonus') {
        bonus = bonusYaz(q, chatJid, userJid, urun.bonus, now)
      } else {
        if (urun.tur === 'unvan') unvan = urun.unvan
        if (urun.tur === 'kalkan') kalkan = Math.max(kalkan, now) + KALKAN_SURESI_MS
        q.marketYaz.run({ chat: chatJid, user: userJid, unvan, kalkan })
      }

      return { xp: xp - urun.fiyat, kalkan, bonus }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Market satışı yazılamadı')
    return null
  }
}

/**
 * Random key açar; ücret, çekiliş ve ödül tek transaction'dadır. Kumar karnesine
 * yazılmaz: ödül XP olmayabilir, net kazanç hesabı anlamsız kalırdı.
 *
 * Kişinin unvanı varsa çıkan unvan yazılmaz, yerine `yedekXp` verilir: 25.000 XP'lik
 * Kral unvanı şansla gelen bir unvanla ezilmesin.
 *
 * @param {() => object} cek  ödülü seçer, ancak XP yetiyorsa çağrılır
 * @returns {{ yetersiz: true, xp: number }
 *   | { odul: object, xp: number, yedekXp: number } | null}
 */
export function kasaAc({ chatJid, userJid, kasa, cek, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (kasa.fiyat > once) return { yetersiz: true, xp: once }

      const odul = cek()
      const market = q.marketOku.get(chatJid, userJid)
      const yedekXp = odul.unvan && market?.unvan ? odul.yedekXp : 0
      const fark = (odul.xp || 0) + yedekXp - kasa.fiyat
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: fark })

      if (odul.bonus) bonusYaz(q, chatJid, userJid, odul.bonus, now)

      if (odul.kalkanMs || (odul.unvan && !yedekXp)) {
        const kalkan = market?.kalkan_until ?? 0
        q.marketYaz.run({
          chat: chatJid,
          user: userJid,
          unvan: market?.unvan ?? odul.unvan ?? null,
          kalkan: odul.kalkanMs ? Math.max(kalkan, now) + odul.kalkanMs : kalkan,
        })
      }

      // Harcanan hak sayısı eksiye inerek fazladan hak olur. Pencere kapalıysa
      // şimdi açılır, yoksa hakDurumu() eksi sayıyı görmezden gelirdi.
      if (odul.carkHakki) {
        const cark = q.carkOku.get(chatJid, userJid)
        const acik = hakDurumu(cark, now).yenilenme !== null
        const bonus = aktifBonus(cark, now)
        q.carkYaz.run({
          chat: chatJid,
          user: userJid,
          pencere: acik ? cark.window_start : now,
          cevirme: (acik ? cark.spins : 0) - odul.carkHakki,
          yuzde: bonus?.yuzde ?? 0,
          bitis: bonus?.bitis ?? 0,
        })
      }

      if (odul.soygunHakki) {
        const gun = istanbulDay(new Date(now))
        const soygun = q.soygunOku.get(chatJid, userJid)
        q.soygunYaz.run({
          chat: chatJid,
          user: userJid,
          gun,
          deneme: (soygun?.day === gun ? soygun.deneme : 0) - odul.soygunHakki,
          korunma: soygun?.korunma_until ?? 0,
        })
      }

      return { odul, xp: once + fark, yedekXp }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Key açılamadı')
    return null
  }
}

/**
 * Birinin başına ödül koyar. Kesinti yanar, kalanı hedefin ödülüne eklenir.
 *
 * @returns {{ yetersiz: true, xp: number } | { havuz: number, kesinti: number, xp: number } | null}
 */
export function odulKoy({ chatJid, koyan, hedef, miktar }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const xp = q.oku.get(chatJid, koyan)?.xp ?? 0
      if (miktar > xp) return { yetersiz: true, xp }

      const kesinti = Math.floor((miktar * ODUL_KESINTI_YUZDESI) / 100)
      q.xpAktar.run({ chat: chatJid, user: koyan, xp: -miktar })
      q.odulEkle.run({ chat: chatJid, user: hedef, xp: miktar - kesinti })

      return { havuz: q.odulOku.get(chatJid, hedef).xp, kesinti, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, koyan, hedef }, 'Ödül koyulamadı')
    return null
  }
}

/** En yüksek ödüllü 10 kişi. */
export function odulListesi(chatJid) {
  try {
    return hazirla()?.odulListe.all(chatJid) ?? []
  } catch (err) {
    logger.error({ err, chatJid }, 'Ödüller okunamadı')
    return []
  }
}

/**
 * Soygun denemesi. Engeller (hak, kalkan, korunma, bakiye) denemeyi yakmaz.
 * Başarıda kurbanın payı ve başındaki `.ödül` hırsıza geçer, kurban korunur;
 * başarısızlıkta hırsız kendi payını kurbana öder.
 *
 * @param {() => boolean} sans  soygun başarılı mı
 * @returns {{ engel: string, bitis?: number }
 *   | { basarili: boolean, miktar: number, odul: number, hirsizXp: number, kurbanXp: number }
 *   | null}  `engel`: hak | kalkan | korunma | kurban-fakir | hirsiz-fakir
 */
export function soygunYap({ chatJid, hirsiz, kurban, sans, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    const gun = istanbulDay(new Date(now))

    return getDb().transaction(() => {
      const h = q.soygunOku.get(chatJid, hirsiz)
      const k = q.soygunOku.get(chatJid, kurban)
      const deneme = h?.day === gun ? h.deneme : 0
      const kalkan = q.marketOku.get(chatJid, kurban)?.kalkan_until ?? 0
      const hirsizXp = q.oku.get(chatJid, hirsiz)?.xp ?? 0
      const kurbanXp = q.oku.get(chatJid, kurban)?.xp ?? 0
      const baslik = q.odulOku.get(chatJid, kurban)?.xp ?? 0

      if (deneme >= GUNLUK_DENEME) return { engel: 'hak' }
      if (kalkan > now) return { engel: 'kalkan', bitis: kalkan }
      if (k?.korunma_until > now) return { engel: 'korunma', bitis: k.korunma_until }
      // Başında ödül olan fakir kişi de soyulabilir, yoksa o ödül hiç alınamazdı.
      if (kurbanXp < MIN_KURBAN_XP && !baslik) return { engel: 'kurban-fakir' }
      if (hirsizXp < MIN_HIRSIZ_XP) return { engel: 'hirsiz-fakir' }

      const basarili = sans()
      const miktar = soygunPayi(basarili ? kurbanXp : hirsizXp)
      const yon = basarili ? miktar : -miktar

      q.xpAktar.run({ chat: chatJid, user: hirsiz, xp: yon })
      q.xpAktar.run({ chat: chatJid, user: kurban, xp: -yon })
      q.soygunYaz.run({
        chat: chatJid, user: hirsiz, gun, deneme: deneme + 1, korunma: h?.korunma_until ?? 0,
      })
      const odul = basarili ? baslik : 0
      if (basarili) {
        q.soygunYaz.run({
          chat: chatJid, user: kurban, gun: k?.day ?? '', deneme: k?.deneme ?? 0, korunma: now + KORUNMA_MS,
        })
      }
      if (odul) {
        q.xpAktar.run({ chat: chatJid, user: hirsiz, xp: odul })
        q.odulSil.run(chatJid, kurban)
      }
      gorevIlerlet(q, chatJid, hirsiz, 'soygun', now)

      return { basarili, miktar, odul, hirsizXp: hirsizXp + yon + odul, kurbanXp: kurbanXp - yon }
    })()
  } catch (err) {
    logger.error({ err, chatJid, hirsiz, kurban }, 'Soygun yazılamadı')
    return null
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
