import logger from './logger.js'
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'
import { gununGorevleri } from './gorev.js'
import { KALKAN_SURESI_MS } from './market.js'
import {
  GUNLUK_DENEME, KORUNMA_MS, MIN_HIRSIZ_XP, MIN_KURBAN_XP, ODUL_KESINTI_YUZDESI, soygunPayi,
} from './soygun.js'
import { cekimKesintisi, faizHesapla, vergiHesapla } from './banka.js'
import {
  ADIM_MS, AZAMI_ADIM, BASLANGIC_FIYATI, fiyatAdimi, GECMIS_SAATI, HABER_OMRU, HISSELER, IFLAS_FIYATI,
  komisyon, piyasaAdimi, piyasaHavasi, SAAT_MS, SAATTEKI_ADIM,
} from './borsa.js'
import { haftaAnahtari, SEZON_ODULLERI } from './sezon.js'
import { aktifBonus, bonusluXp, BONUS_SURESI_MS, EKSTRA_UCRET, hakDurumu, HAK_PENCERESI_MS } from './cark.js'

const XP_KAZANC = { mesaj: 1, sticker: 2, ses: 2 }

// Aynı kişi arka arkaya mesaj yağdırarak XP kasmasın. Sayaçlar yine artar,
// yalnızca XP verilmez. Bellekte tutulur; bot yeniden başlarsa sıfırlanır.
const XP_BEKLEME_MS = 30_000
const sonXp = new Map()

// Servet vergisi her mesajda veritabanına sorulmasın diye kişinin o gün
// denetlendiği bellekte tutulur. Yeniden başlatmada banka.vergi_day korur.
const vergiDenetimi = new Map()

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
    bankaOku: db.prepare('SELECT * FROM banka WHERE chat_jid = ? AND user_jid = ?'),
    bankaYaz: db.prepare(`
      INSERT INTO banka (chat_jid, user_jid, bakiye, faiz_saat, faiz_artik, vergi_day, son_vergi)
      VALUES (@chat, @user, @bakiye, @faizSaat, @faizArtik, @vergiGun, @sonVergi)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        bakiye    = excluded.bakiye,
        faiz_saat  = excluded.faiz_saat,
        faiz_artik = excluded.faiz_artik,
        vergi_day = excluded.vergi_day,
        son_vergi = excluded.son_vergi
    `),
    sezonYaz: db.prepare(`
      INSERT INTO sezon (chat_jid, user_jid, hafta, puan) VALUES (@chat, @user, @hafta, @puan)
      ON CONFLICT (chat_jid, user_jid, hafta) DO UPDATE SET puan = puan + excluded.puan
    `),
    sezonSira: db.prepare(`
      SELECT user_jid, puan FROM sezon WHERE chat_jid = ? AND hafta = ?
      ORDER BY puan DESC, user_jid LIMIT ?
    `),
    sezonEskiler: db.prepare('SELECT DISTINCT hafta FROM sezon WHERE chat_jid = ? AND hafta < ? ORDER BY hafta'),
    sezonSil: db.prepare('DELETE FROM sezon WHERE chat_jid = ? AND hafta = ?'),
    sampiyonYaz: db.prepare(`
      INSERT INTO sampiyon (chat_jid, user_jid, kez, son_hafta) VALUES (@chat, @user, 1, @hafta)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET kez = kez + 1, son_hafta = excluded.son_hafta
    `),
    sampiyonOku: db.prepare('SELECT kez FROM sampiyon WHERE chat_jid = ? AND user_jid = ?'),
    sonSampiyon: db.prepare('SELECT user_jid, kez FROM sampiyon WHERE chat_jid = ? ORDER BY son_hafta DESC LIMIT 1'),
    gecmisYaz: db.prepare(`
      INSERT INTO gecmis (chat_jid, user_jid, gun, xp, mesaj)
      VALUES (@chat, @user, @gun, (SELECT xp FROM stats WHERE chat_jid = @chat AND user_jid = @user), 1)
      ON CONFLICT (chat_jid, user_jid, gun) DO UPDATE SET xp = excluded.xp, mesaj = mesaj + 1
    `),
    borsaGecmisYaz: db.prepare(`
      INSERT OR REPLACE INTO borsa_gecmis (chat_jid, hisse, saat, fiyat) VALUES (@chat, @hisse, @saat, @fiyat)
    `),
    borsaGecmisSil: db.prepare('DELETE FROM borsa_gecmis WHERE chat_jid = ? AND saat < ?'),
    borsaOku: db.prepare('SELECT * FROM borsa WHERE chat_jid = ? AND hisse = ?'),
    borsaYaz: db.prepare(`
      INSERT INTO borsa (chat_jid, hisse, fiyat, onceki, adim, haber, haber_adim)
      VALUES (@chat, @hisse, @fiyat, @onceki, @adim, @haber, @haberAdim)
      ON CONFLICT (chat_jid, hisse) DO UPDATE SET
        fiyat      = excluded.fiyat,
        onceki     = excluded.onceki,
        adim       = excluded.adim,
        haber      = excluded.haber,
        haber_adim = excluded.haber_adim
    `),
    portfoyOku: db.prepare('SELECT * FROM portfoy WHERE chat_jid = ? AND user_jid = ? AND hisse = ?'),
    portfoyYaz: db.prepare(`
      INSERT INTO portfoy (chat_jid, user_jid, hisse, adet, maliyet) VALUES (@chat, @user, @hisse, @adet, @maliyet)
      ON CONFLICT (chat_jid, user_jid, hisse) DO UPDATE SET
        adet    = excluded.adet,
        maliyet = excluded.maliyet
    `),
    portfoySil: db.prepare('DELETE FROM portfoy WHERE chat_jid = ? AND user_jid = ? AND hisse = ?'),
    portfoyBatir: db.prepare('DELETE FROM portfoy WHERE chat_jid = ? AND hisse = ?'),
    kartOku: db.prepare('SELECT no, adet FROM kart WHERE chat_jid = ? AND user_jid = ? AND adet > 0 ORDER BY no'),
    kartEkle: db.prepare(`
      INSERT INTO kart (chat_jid, user_jid, no, adet) VALUES (@chat, @user, @no, 1)
      ON CONFLICT (chat_jid, user_jid, no) DO UPDATE SET adet = adet + 1
    `),
    kartAzalt: db.prepare('UPDATE kart SET adet = adet - 1 WHERE chat_jid = ? AND user_jid = ? AND no = ? AND adet > 0'),
    vitrinTemizle: db.prepare('DELETE FROM vitrin WHERE chat_jid = ? AND hafta <> ?'),
    vitrinSayi: db.prepare('SELECT COUNT(*) AS n FROM vitrin WHERE chat_jid = ? AND hafta = ?'),
    vitrinKisi: db.prepare('SELECT 1 FROM vitrin WHERE chat_jid = ? AND hafta = ? AND user_jid = ?'),
    vitrinYaz: db.prepare('INSERT INTO vitrin (chat_jid, hafta, user_jid) VALUES (?, ?, ?)'),
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
    if (xpVer) sezonPuani(q, chatJid, userJid, XP_KAZANC[tip], at)

    const gun = istanbulDay(new Date(at))
    q.gecmisYaz.run({ chat: chatJid, user: userJid, gun })
    if (vergiDenetimi.get(anahtar) !== gun) {
      vergiDenetimi.set(anahtar, gun)
      vergiAl(q, chatJid, userJid, gun)
    }
  } catch (err) {
    logger.error({ err, chatJid }, 'İstatistik yazılamadı')
  }
}

/** Kumar ve soygun buradan geçmez: sezon emekle kazanılan XP'nin yarışıdır. */
function sezonPuani(q, chatJid, userJid, puan, at) {
  q.sezonYaz.run({ chat: chatJid, user: userJid, hafta: haftaAnahtari(new Date(at)), puan })
}

/**
 * Bitmiş haftaları kapatır (ödüller yazılır), bu haftanın sıralamasını döner.
 *
 * @returns {{ hafta: string, siralama: object[], sonSampiyon: object | undefined,
 *   kapanan: { hafta: string, kazananlar: { user_jid: string, puan: number, odul: number }[] }[] } | null}
 */
export function sezonDurumu({ chatJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    const hafta = haftaAnahtari(new Date(now))

    return getDb().transaction(() => {
      const kapanan = q.sezonEskiler.all(chatJid, hafta).map((eski) => {
        const kazananlar = q.sezonSira.all(chatJid, eski.hafta, SEZON_ODULLERI.length)
          .map((k, i) => ({ ...k, odul: SEZON_ODULLERI[i] }))

        for (const k of kazananlar) q.xpAktar.run({ chat: chatJid, user: k.user_jid, xp: k.odul })
        q.sampiyonYaz.run({ chat: chatJid, user: kazananlar[0].user_jid, hafta: eski.hafta })
        q.sezonSil.run(chatJid, eski.hafta)

        return { hafta: eski.hafta, kazananlar }
      })

      return {
        hafta,
        kapanan,
        siralama: q.sezonSira.all(chatJid, hafta, 10),
        sonSampiyon: q.sonSampiyon.get(chatJid),
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Sezon okunamadı')
    return null
  }
}

/** Kişinin sezon birinciliği sayısı (.profil). */
export function sampiyonlukSayisi(chatJid, userJid) {
  try {
    return hazirla()?.sampiyonOku.get(chatJid, userJid)?.kez ?? 0
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Şampiyonluk okunamadı')
    return 0
  }
}

/**
 * Günün ilk mesajında servet vergisini keser. Komut yazınca kesilseydi zengin
 * olan o komutu yazmayarak kaçardı. Vergi yanar.
 */
function vergiAl(q, chatJid, userJid, gun) {
  getDb().transaction(() => {
    const hesap = q.bankaOku.get(chatJid, userJid)
    if (hesap?.vergi_day === gun) return

    const vergi = vergiHesapla(q.oku.get(chatJid, userJid)?.xp ?? 0)
    if (!vergi) return

    q.xpAktar.run({ chat: chatJid, user: userJid, xp: -vergi })
    bankaKaydet(q, chatJid, userJid, { ...hesap, vergi_day: gun, son_vergi: vergi })
  })()
}

function bankaKaydet(q, chatJid, userJid, hesap) {
  q.bankaYaz.run({
    chat: chatJid,
    user: userJid,
    bakiye: hesap.bakiye ?? 0,
    faizSaat: hesap.faiz_saat ?? 0,
    faizArtik: hesap.faiz_artik ?? 0,
    vergiGun: hesap.vergi_day ?? '',
    sonVergi: hesap.son_vergi ?? 0,
  })
}

/** Birikmiş faizi hesaba işler; çağıran transaction içindedir. */
function faizIsle(q, chatJid, userJid, now) {
  const saat = Math.floor(now / SAAT_MS)
  const hesap = q.bankaOku.get(chatJid, userJid) ?? {}
  const bakiye = hesap.bakiye ?? 0

  const { faiz, artik } = bakiye && hesap.faiz_saat
    ? faizHesapla(bakiye, saat - hesap.faiz_saat, hesap.faiz_artik)
    : { faiz: 0, artik: 0 }
  const yeni = { ...hesap, bakiye: bakiye + faiz, faiz_saat: saat, faiz_artik: artik }
  bankaKaydet(q, chatJid, userJid, yeni)
  return { hesap: yeni, faiz }
}

/**
 * Hesabı faizi işleyerek okur (.banka).
 *
 * @returns {{ bakiye: number, xp: number, faiz: number, sonVergi: number } | null}
 */
export function bankaDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const { hesap, faiz } = faizIsle(q, chatJid, userJid, now)
      return {
        bakiye: hesap.bakiye,
        xp: q.oku.get(chatJid, userJid)?.xp ?? 0,
        faiz,
        sonVergi: hesap.son_vergi ?? 0,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Banka okunamadı')
    return null
  }
}

/** @returns {{ yetersiz: true, xp: number } | { bakiye: number, xp: number } | null} */
export function bankaYatir({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar > xp) return { yetersiz: true, xp }

      const { hesap } = faizIsle(q, chatJid, userJid, now)
      const bakiye = hesap.bakiye + miktar
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      bankaKaydet(q, chatJid, userJid, { ...hesap, bakiye })
      return { bakiye, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Bankaya yatırılamadı')
    return null
  }
}

/**
 * `miktar` hesaptan düşer, kesinti yanar, kalanı cüzdana geçer.
 *
 * @returns {{ yetersiz: true, bakiye: number }
 *   | { bakiye: number, xp: number, kesinti: number } | null}
 */
export function bankaCek({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const { hesap } = faizIsle(q, chatJid, userJid, now)
      if (miktar > hesap.bakiye) return { yetersiz: true, bakiye: hesap.bakiye }

      const kesinti = cekimKesintisi(miktar)
      const bakiye = hesap.bakiye - miktar
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: miktar - kesinti })
      bankaKaydet(q, chatJid, userJid, { ...hesap, bakiye })
      return { bakiye, xp: q.oku.get(chatJid, userJid).xp, kesinti }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Bankadan çekilemedi')
    return null
  }
}

/** .profil için; faiz işlemez. */
export function bankaBakiyesi(chatJid, userJid) {
  try {
    return hazirla()?.bankaOku.get(chatJid, userJid)?.bakiye ?? 0
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Banka bakiyesi okunamadı')
    return 0
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
    sezonPuani(q, chatJid, userJid, kazanc, at)
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
          sezonPuani(q, chatJid, userJid, g.odul, now)
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
 * @param {string} [vitrinHafta]  verilirse `kasa.stok` ve kişi başı hak uygulanır
 * @returns {{ yetersiz: true, xp: number } | { tukendi: true } | { zatenAldin: true }
 *   | { odul: object, xp: number, yedekXp: number } | null}
 */
export function kasaAc({ chatJid, userJid, kasa, cek, vitrinHafta, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (vitrinHafta) {
        q.vitrinTemizle.run(chatJid, vitrinHafta)
        if (q.vitrinKisi.get(chatJid, vitrinHafta, userJid)) return { zatenAldin: true }
        if (q.vitrinSayi.get(chatJid, vitrinHafta).n >= kasa.stok) return { tukendi: true }
      }

      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (kasa.fiyat > once) return { yetersiz: true, xp: once }

      if (vitrinHafta) q.vitrinYaz.run(chatJid, vitrinHafta, userJid)

      const odul = cek()
      const market = q.marketOku.get(chatJid, userJid)
      const yedekXp = odul.unvan && market?.unvan ? odul.yedekXp : 0
      const fark = (odul.xp || 0) + yedekXp - kasa.fiyat
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: fark })

      if (odul.bonus) bonusYaz(q, chatJid, userJid, odul.bonus, now)
      if (odul.kart) q.kartEkle.run({ chat: chatJid, user: userJid, no: odul.kart })

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

/** Fiyatları şimdiki adıma getirir; çağıran transaction içindedir. */
function borsaGuncelle(q, chatJid, now, rnd) {
  const simdi = Math.floor(now / ADIM_MS)

  const hisseler = HISSELER.map((hisse) => {
    const satir = q.borsaOku.get(chatJid, hisse.kod)
    return {
      ...hisse,
      fiyat: satir?.fiyat ?? BASLANGIC_FIYATI,
      onceki: satir?.onceki ?? BASLANGIC_FIYATI,
      adim: satir?.adim ?? simdi,
      haber: satir?.haber ?? '',
      haberAdim: satir?.haber_adim ?? 0,
    }
  })

  // Adımlar dışta döner: ortak piyasa hareketi o adımda bütün hisseleri birlikte itmeli.
  const ilk = Math.max(Math.min(...hisseler.map((h) => h.adim)) + 1, simdi - AZAMI_ADIM + 1)
  for (let adim = ilk; adim <= simdi; adim += 1) {
    const { carpan } = piyasaHavasi(chatJid, adim)
    const piyasa = piyasaAdimi(rnd)

    for (const h of hisseler) {
      if (h.adim >= adim) continue

      const sonuc = fiyatAdimi(h.fiyat, h, { carpan, piyasa }, rnd)
      h.onceki = h.fiyat
      h.fiyat = sonuc.fiyat
      if (sonuc.haber) Object.assign(h, { haber: sonuc.haber, haberAdim: adim })

      if (h.fiyat < IFLAS_FIYATI) {
        q.portfoyBatir.run(chatJid, h.kod)
        Object.assign(h, {
          fiyat: BASLANGIC_FIYATI, onceki: BASLANGIC_FIYATI, haber: `${h.ad} battı`, haberAdim: adim,
        })
      }

      if (adim % SAATTEKI_ADIM === 0) {
        q.borsaGecmisYaz.run({ chat: chatJid, hisse: h.kod, saat: adim / SAATTEKI_ADIM, fiyat: h.fiyat })
      }
    }
  }
  q.borsaGecmisSil.run(chatJid, Math.floor(simdi / SAATTEKI_ADIM) - GECMIS_SAATI)

  for (const h of hisseler) {
    q.borsaYaz.run({
      chat: chatJid, hisse: h.kod, fiyat: h.fiyat, onceki: h.onceki, adim: simdi, haber: h.haber, haberAdim: h.haberAdim,
    })
  }
  return hisseler
}

/**
 * Fiyatlar ve kişinin portföyü (.borsa).
 *
 * @returns {{ hisseler: object[], xp: number, hava: string, haberler: string[],
 *   portfoy: { kod: string, ad: string, deger: number, maliyet: number }[] } | null}
 */
export function borsaDurumu({ chatJid, userJid, now = Date.now(), rnd }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const hisseler = borsaGuncelle(q, chatJid, now, rnd)
      const portfoy = hisseler.flatMap((h) => {
        const p = q.portfoyOku.get(chatJid, userJid, h.kod)
        return p ? [{ kod: h.kod, ad: h.ad, deger: Math.floor(p.adet * h.fiyat), maliyet: p.maliyet }] : []
      })
      const simdi = Math.floor(now / ADIM_MS)
      const haberler = hisseler
        .filter((h) => h.haber && simdi - h.haberAdim < HABER_OMRU)
        .sort((a, b) => b.haberAdim - a.haberAdim)
        .slice(0, 3)
        .map((h) => h.haber)
      return {
        hisseler, portfoy, haberler,
        hava: piyasaHavasi(chatJid, simdi).ad,
        xp: q.oku.get(chatJid, userJid)?.xp ?? 0,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Borsa okunamadı')
    return null
  }
}

/** @returns {{ yetersiz: true, xp: number } | { fiyat: number, komisyon: number, xp: number } | null} */
export function borsaAl({ chatJid, userJid, hisse, miktar, now = Date.now(), rnd }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar > xp) return { yetersiz: true, xp }

      const { fiyat } = borsaGuncelle(q, chatJid, now, rnd).find((h) => h.kod === hisse.kod)
      const kesinti = komisyon(miktar)
      const p = q.portfoyOku.get(chatJid, userJid, hisse.kod)

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      q.portfoyYaz.run({
        chat: chatJid,
        user: userJid,
        hisse: hisse.kod,
        adet: (p?.adet ?? 0) + (miktar - kesinti) / fiyat,
        maliyet: (p?.maliyet ?? 0) + miktar,
      })

      return { fiyat, komisyon: kesinti, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Hisse alınamadı')
    return null
  }
}

/**
 * Payın `miktar` XP'lik kısmını satar; `miktar` null ise tamamını.
 *
 * @returns {{ yok: true } | { yetersiz: true, deger: number }
 *   | { satilan: number, komisyon: number, kar: number, xp: number } | null}
 */
export function borsaSat({ chatJid, userJid, hisse, miktar = null, now = Date.now(), rnd }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const { fiyat } = borsaGuncelle(q, chatJid, now, rnd).find((h) => h.kod === hisse.kod)
      const p = q.portfoyOku.get(chatJid, userJid, hisse.kod)
      if (!p) return { yok: true }

      const deger = Math.floor(p.adet * fiyat)
      const satilan = miktar ?? deger
      if (satilan > deger) return { yetersiz: true, deger }

      const hepsi = miktar === null || satilan === deger
      const oran = hepsi ? 1 : satilan / deger
      const kesinti = komisyon(satilan)
      const payMaliyet = hepsi ? p.maliyet : Math.round(p.maliyet * oran)

      if (hepsi) q.portfoySil.run(chatJid, userJid, hisse.kod)
      else {
        q.portfoyYaz.run({
          chat: chatJid,
          user: userJid,
          hisse: hisse.kod,
          adet: p.adet * (1 - oran),
          maliyet: p.maliyet - payMaliyet,
        })
      }
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: satilan - kesinti })

      return {
        satilan,
        komisyon: kesinti,
        kar: satilan - kesinti - payMaliyet,
        xp: q.oku.get(chatJid, userJid).xp,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Hisse satılamadı')
    return null
  }
}

/** Vitrinde kalan stok. */
export function vitrinKalan(chatJid, hafta, stok) {
  try {
    const n = hazirla()?.vitrinSayi.get(chatJid, hafta).n ?? 0
    return Math.max(0, stok - n)
  } catch (err) {
    logger.error({ err, chatJid }, 'Vitrin okunamadı')
    return 0
  }
}

/** @returns {{ no: number, adet: number }[]} */
export function kartlariOku(chatJid, userJid) {
  try {
    return hazirla()?.kartOku.all(chatJid, userJid) ?? []
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kartlar okunamadı')
    return []
  }
}

/** @returns {{ yok: true } | { verildi: true } | null} */
export function kartVer({ chatJid, kaynak, hedef, no }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (!q.kartAzalt.run(chatJid, kaynak, no).changes) return { yok: true }
      q.kartEkle.run({ chat: chatJid, user: hedef, no })
      return { verildi: true }
    })()
  } catch (err) {
    logger.error({ err, chatJid, kaynak, hedef }, 'Kart verilemedi')
    return null
  }
}

/**
 * Setin her kartından birer tane harcayıp ödülü verir.
 *
 * @returns {{ eksik: object[] } | { xp: number } | null}
 */
export function setTamamla({ chatJid, userJid, set }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const sahip = new Set(q.kartOku.all(chatJid, userJid).map((k) => k.no))
      const eksik = set.kartlar.filter((k) => !sahip.has(k.no))
      if (eksik.length) return { eksik }

      for (const k of set.kartlar) q.kartAzalt.run(chatJid, userJid, k.no)
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: set.odul })
      return { xp: q.oku.get(chatJid, userJid).xp }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Set tamamlanamadı')
    return null
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
      sezonPuani(q, chatJid, userJid, miktar, now.getTime())

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
