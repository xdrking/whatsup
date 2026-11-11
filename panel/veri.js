// Panelin okuduğu her şey burada. Bağlantı salt okunurdur: panel botun verisini
// değiştiremez.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { HISSELER, SAAT_MS } from '../lib/borsa.js'
import { istanbulDay } from '../lib/dataset.js'
import { SETLER } from '../lib/kart.js'
import { FAIZ_YUZDESI } from '../lib/banka.js'
import { borcIslet, krediFaizi } from '../lib/kredi.js'
import { bozdurmaDegeri, COIN_TABAN } from '../lib/coin.js'
import { MAKAMLAR } from '../lib/devlet.js'
import { SULY, sulyFiyati, sulySatisDegeri } from '../lib/kripto.js'
import { MESLEKLER, meslekKoduyla } from '../lib/meslek.js'
import { MULKLER } from '../lib/mulk.js'
import { durum as petDurumu, kactiMi, seviye as petSeviyesi, TURLER } from '../lib/pet.js'
import { RISKLER } from '../lib/yatirim.js'
import { SECIM_SURE_MS } from '../lib/secim.js'
import { ROZETLER } from '../lib/rozet.js'
import { haftaAnahtari } from '../lib/sezon.js'
import { seviye, seviyeIlerlemesi } from '../lib/stats.js'

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

const GUN_MS = 86_400_000
const GRAFIK_GUNU = 30
const KUCUK_GRAFIK_SAATI = 7 * 24

// `mum`: bir mumun kaç saat olduğu, `etiket`: zaman ekseni kaç saatte bir yazılır.
export const ARALIKLAR = {
  '1g': { ad: '1 Gün', saat: 24, mum: 1, etiket: 6 },
  '3g': { ad: '3 Gün', saat: 72, mum: 3, etiket: 12 },
  '7g': { ad: '7 Gün', saat: 168, mum: 6, etiket: 24 },
  '30g': { ad: '30 Gün', saat: 720, mum: 24, etiket: 120 },
}

export const SIRALAMALAR = {
  xp: 'XP',
  servet: 'Servet',
  messages: 'Mesaj',
  stickers: 'Sticker',
  voices: 'Ses',
}

// Yeni rekor = bir satır. `alan`, uyeler() satırındaki sayıdır.
const REKORLAR = [
  { etiket: '💰 En zengin', alan: 'servet', birim: 'XP' },
  { etiket: '💬 En geveze', alan: 'messages', birim: 'mesaj' },
  { etiket: '😂 Sticker kralı', alan: 'stickers', birim: 'sticker' },
  { etiket: '🎤 Podcast\'çi', alan: 'voices', birim: 'ses' },
  { etiket: '🏦 Bankacı', alan: 'bakiye', birim: 'XP' },
  { etiket: '🔥 En uzun seri', alan: 'seri', birim: 'gün' },
  { etiket: '🍀 En şanslı', alan: 'kumarNet', birim: 'XP kâr' },
  { etiket: '💸 En çok batan', alan: 'kumarZarar', birim: 'XP zarar' },
  { etiket: '🪙 Coin baronu', alan: 'coin', birim: 'coin' },
  { etiket: '🏘️ Emlak kralı', alan: 'mulkDeger', birim: 'XP mülk' },
]

/** Son `GRAFIK_GUNU` günün dizisi; verisi olmayan gün 0'dır. */
function gunler(satirlar, now) {
  const degerler = new Map(satirlar.map((r) => [r.gun, r.n]))
  return Array.from({ length: GRAFIK_GUNU }, (_, i) => {
    const gun = istanbulDay(new Date(now - (GRAFIK_GUNU - 1 - i) * GUN_MS))
    return { gun, n: degerler.get(gun) ?? 0 }
  })
}

export function veriAc(dbYolu = process.env.STATS_DB || path.join(DATA_DIR, 'stats.db')) {
  const db = new Database(dbYolu, { readonly: true, fileMustExist: true })

  const saatler = (where, ...degerler) => {
    const dizi = Array(24).fill(0)
    for (const r of db.prepare(`SELECT hour, SUM(count) AS n FROM hours WHERE ${where} GROUP BY hour`).all(...degerler)) {
      dizi[r.hour] = r.n
    }
    return dizi
  }

  // Panel botun şemasını kuramaz: bot yeni sürümle açılmadan yeni tablolar yoktur.
  const tablolar = () => new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name))
  const tum = (tablo, sql, ...p) => (tablolar().has(tablo) ? db.prepare(sql).all(...p) : [])
  const tek = (tablo, sql, ...p) => (tablolar().has(tablo) ? db.prepare(sql).get(...p) ?? null : null)

  /** Hazine bot hesabıdır; bot kimliğini `ayar`'a yazar (`botHesabiniTani`). */
  const botJid = () => tek('ayar', "SELECT deger FROM ayar WHERE anahtar = 'bot_jid'")?.deger ?? ''

  /** Son kaydedilen günün kuru: panel anlık kuru hesaplamaz, servet bugünün açılış kuruyla sayılır. */
  const gunKuru = (chatJid) => tek('ekonomi', 'SELECT kur FROM ekonomi WHERE chat_jid = ? ORDER BY day DESC LIMIT 1', chatJid)?.kur ?? COIN_TABAN
  const btcUsd = () => tek('kripto_fiyat', 'SELECT usd FROM kripto_fiyat WHERE sembol = ?', SULY.sembol)?.usd ?? 0

  /** Kişi başı coin, Suly, mülk ve yatırım; `.servet` gibi bugün nakde çevrilse ne edeceği. */
  function varliklar(chatJid) {
    const kur = gunKuru(chatJid)
    const usd = btcUsd()
    const harita = new Map()
    const al = (jid) => {
      if (!harita.has(jid)) harita.set(jid, { coin: 0, coinDeger: 0, suly: 0, sulyDeger: 0, mulkDeger: 0, yatirim: 0 })
      return harita.get(jid)
    }
    for (const c of tum('coin', 'SELECT user_jid, bakiye FROM coin WHERE chat_jid = ?', chatJid)) {
      Object.assign(al(c.user_jid), { coin: c.bakiye, coinDeger: bozdurmaDegeri(c.bakiye, kur) })
    }
    for (const k of tum('kripto', 'SELECT user_jid, birim FROM kripto WHERE chat_jid = ?', chatJid)) {
      Object.assign(al(k.user_jid), { suly: k.birim, sulyDeger: usd ? sulySatisDegeri(k.birim, usd, kur) : 0 })
    }
    for (const m of tum('mulk', 'SELECT user_jid, kod, adet, bekleyen FROM mulk WHERE chat_jid = ?', chatJid)) {
      const mulk = MULKLER.find((x) => x.kod === m.kod)
      if (mulk) al(m.user_jid).mulkDeger += m.adet * bozdurmaDegeri(mulk.fiyat, kur) + m.bekleyen
    }
    for (const y of tum('yatirim', 'SELECT user_jid, miktar FROM yatirim WHERE chat_jid = ?', chatJid)) {
      al(y.user_jid).yatirim = y.miktar
    }
    return harita
  }

  function uyeler(chatJid, now) {
    const portfoyler = new Map(db.prepare(`
      SELECT p.user_jid, SUM(p.adet * b.fiyat) AS deger
      FROM portfoy p JOIN borsa b ON b.chat_jid = p.chat_jid AND b.hisse = p.hisse
      WHERE p.chat_jid = ? GROUP BY p.user_jid
    `).all(chatJid).map((r) => [r.user_jid, Math.floor(r.deger)]))
    const diger = varliklar(chatJid)
    const bot = botJid()

    return db.prepare(`
      SELECT s.user_jid, s.messages, s.stickers, s.voices, s.xp, s.last_seen,
        COALESCE(b.bakiye, 0) AS bakiye, COALESCE(i.ad, '') AS ad, COALESCE(m.unvan, '') AS unvan,
        COALESCE(k.won - k.lost, 0) AS net,
        CASE WHEN d.last_day >= @dun THEN d.streak ELSE 0 END AS seri
      FROM stats s
      LEFT JOIN banka b ON b.chat_jid = s.chat_jid AND b.user_jid = s.user_jid
      LEFT JOIN isimler i ON i.user_jid = s.user_jid
      LEFT JOIN market m ON m.chat_jid = s.chat_jid AND m.user_jid = s.user_jid
      LEFT JOIN kumar k ON k.chat_jid = s.chat_jid AND k.user_jid = s.user_jid
      LEFT JOIN daily d ON d.chat_jid = s.chat_jid AND d.user_jid = s.user_jid
      WHERE s.chat_jid = @chat
    `).all({ chat: chatJid, dun: istanbulDay(new Date(now - GUN_MS)) }).map((u) => {
      const portfoy = portfoyler.get(u.user_jid) ?? 0
      const v = diger.get(u.user_jid) ?? { coin: 0, coinDeger: 0, suly: 0, sulyDeger: 0, mulkDeger: 0, yatirim: 0 }
      return {
        ...u,
        ...v,
        bot: u.user_jid === bot,
        portfoy,
        servet: u.xp + u.bakiye + portfoy + v.coinDeger + v.sulyDeger + v.mulkDeger + v.yatirim,
        seviye: seviye(u.xp),
        seri: u.seri ?? 0,
        kumarNet: Math.max(u.net, 0),
        kumarZarar: Math.max(-u.net, 0),
      }
    })
  }

  /**
   * Açık krediler ve eksi cüzdanlar, en büyük borçtan aza. Panel yazamadığı için
   * kredinin güncel tutarı burada yalnızca gösterim için hesaplanır.
   */
  // Panel botun şemasını kuramaz: bot yeni sürümle açılmadan bu tablolar yoktur.
  const ekonomiTablolariVar = () => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'faiz'").get()

  function bankaFaizi(chatJid) {
    if (!ekonomiTablolariVar()) return FAIZ_YUZDESI
    return db.prepare('SELECT oran FROM faiz WHERE chat_jid = ?').get(chatJid)?.oran ?? FAIZ_YUZDESI
  }

  /** @returns {object | null} ekonomi kaydı yoksa null */
  function ekonomi(chatJid, liste) {
    if (!ekonomiTablolariVar()) return null

    const kayitlar = db.prepare('SELECT day, arz, kur FROM ekonomi WHERE chat_jid = ? ORDER BY day DESC LIMIT 30').all(chatJid).reverse()
    const son = kayitlar.at(-1)
    if (!son) return null

    const onceki = kayitlar.at(-2)
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const faiz = bankaFaizi(chatJid)
    const mulkAdet = new Map(db.prepare('SELECT kod, SUM(adet) AS adet FROM mulk WHERE chat_jid = ? GROUP BY kod').all(chatJid).map((m) => [m.kod, m.adet]))

    return {
      arz: son.arz,
      kur: son.kur,
      enflasyon: onceki?.arz ? (son.arz - onceki.arz) / onceki.arz : null,
      faiz: { banka: faiz, kredi: krediFaizi(faiz) },
      arzGecmisi: kayitlar.map((g) => g.arz),
      toplamCoin: db.prepare('SELECT COALESCE(SUM(bakiye), 0) AS t FROM coin WHERE chat_jid = ?').get(chatJid).t,
      coinSahipleri: db.prepare('SELECT user_jid, bakiye FROM coin WHERE chat_jid = ? AND bakiye > 0 ORDER BY bakiye DESC LIMIT 5').all(chatJid)
        .map((c) => ({ ...c, uye: adlar.get(c.user_jid) ?? null })),
      mulkler: MULKLER.flatMap((m) => (mulkAdet.get(m.kod) ? [{ ad: m.ad, adet: mulkAdet.get(m.kod) }] : [])),
    }
  }

  // Faz 39 tabloları da bot yeni sürümle açılmadan yoktur.
  const toplumTablolariVar = () => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cete'").get()

  function toplum(chatJid, liste, now) {
    if (!toplumTablolariVar()) return { ceteler: [], ciftler: [], hapistekiler: [], meslekler: [] }

    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const uye = (jid) => adlar.get(jid) ?? null
    const adetler = new Map(db.prepare('SELECT kod, COUNT(*) AS adet FROM meslek WHERE chat_jid = ? GROUP BY kod').all(chatJid).map((m) => [m.kod, m.adet]))

    return {
      // Kasa son işlenen değerdir, puan bu haftanın sezonundan gelir.
      ceteler: db.prepare(`
        SELECT c.ad, c.lider, c.kasa, COUNT(u.user_jid) AS uyeSayisi, COALESCE(SUM(s.puan), 0) AS puan
        FROM cete c
        LEFT JOIN cete_uye u ON u.chat_jid = c.chat_jid AND u.anahtar = c.anahtar
        LEFT JOIN sezon s ON s.chat_jid = u.chat_jid AND s.user_jid = u.user_jid AND s.hafta = ?
        WHERE c.chat_jid = ? GROUP BY c.anahtar ORDER BY puan DESC, c.kasa DESC, c.anahtar
      `).all(haftaAnahtari(new Date(now)), chatJid).map((c) => ({ ...c, liderUye: uye(c.lider) })),
      // Çift iki satırdır, her biri bir kez görünsün diye sıralı yarısı alınır.
      ciftler: db.prepare('SELECT user_jid, es_jid, tarih FROM evlilik WHERE chat_jid = ? AND user_jid < es_jid ORDER BY tarih').all(chatJid)
        .map((c) => ({ ...c, uye: uye(c.user_jid), es: uye(c.es_jid) })),
      hapistekiler: db.prepare('SELECT user_jid, bitis, kefalet FROM hapis WHERE chat_jid = ? AND bitis > ? ORDER BY bitis').all(chatJid, now)
        .map((h) => ({ ...h, uye: uye(h.user_jid) })),
      meslekler: MESLEKLER.flatMap((m) => (adetler.get(m.kod) ? [{ ad: m.ad, adet: adetler.get(m.kod) }] : [])),
    }
  }

  /** Kişi sayfasının Hayat kartı; hiçbiri yoksa alanlar boştur. */
  function hayat(chatJid, userJid, liste, now) {
    if (!toplumTablolariVar()) return { makam: [] }

    const es = db.prepare('SELECT es_jid, tarih FROM evlilik WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)
    const hapis = db.prepare('SELECT bitis, kefalet FROM hapis WHERE chat_jid = ? AND user_jid = ? AND bitis > ?').get(chatJid, userJid, now)
    const cete = db.prepare(`
      SELECT c.ad, c.kasa, c.lider = @user AS lider FROM cete_uye u
      JOIN cete c ON c.chat_jid = u.chat_jid AND c.anahtar = u.anahtar
      WHERE u.chat_jid = @chat AND u.user_jid = @user
    `).get({ chat: chatJid, user: userJid })
    const kod = db.prepare('SELECT kod FROM meslek WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)?.kod

    const makam = tum('makam', 'SELECT makam, kalici FROM makam WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)
      .map((m) => `${MAKAMLAR.find((x) => x.kod === m.makam)?.ad ?? m.makam}${m.kalici && m.makam !== 'baskan' ? ' (kayyum)' : ''}`)
    const sustur = tek('susturulan_uye', 'SELECT bitis FROM susturulan_uye WHERE chat_jid = ? AND user_jid = ? AND (bitis = 0 OR bitis > ?)', chatJid, userJid, now)
    const ambargo = tek('ambargo', 'SELECT bitis FROM ambargo WHERE chat_jid = ? AND user_jid = ? AND bitis > ?', chatJid, userJid, now)

    return {
      es: es ? { ...es, uye: liste.find((u) => u.user_jid === es.es_jid) ?? null } : null,
      hapis: hapis ?? null,
      cete: cete ?? null,
      meslek: meslekKoduyla(kod)?.ad ?? null,
      makam,
      sustur: sustur ?? null,
      ambargo: ambargo ?? null,
    }
  }

  /** Hazine: botun bankası ve cüzdanı, bugünkü maaş ve aktarımlar, toplam vergi. */
  function hazine(chatJid, liste, now) {
    const bot = liste.find((u) => u.bot)
    if (!bot) return null
    const gun = istanbulDay(new Date(now))
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    return {
      banka: bot.bakiye,
      cuzdan: bot.xp,
      coin: bot.coin,
      mulkDeger: bot.mulkDeger,
      maas: tek('maas_gun', 'SELECT toplam FROM maas_gun WHERE chat_jid = ? AND day = ?', chatJid, gun)?.toplam ?? 0,
      vergi: tek('vergi', 'SELECT COALESCE(SUM(toplam), 0) AS t FROM vergi WHERE chat_jid = ?', chatJid)?.t ?? 0,
      aktarimlar: tum('hazine_aktarim', 'SELECT user_jid, miktar FROM hazine_aktarim WHERE chat_jid = ? AND day = ? ORDER BY miktar DESC', chatJid, gun)
        .map((a) => ({ ...a, uye: adlar.get(a.user_jid) ?? null })),
    }
  }

  /** Makamlar ve açık seçimler. Oy gizlidir ama adayın oy sayısı tutulur, `.seçim` de yazar. */
  function hukumet(chatJid, liste, now) {
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const makamlar = new Map(tum('makam', 'SELECT makam, user_jid, kalici FROM makam WHERE chat_jid = ?', chatJid).map((m) => [m.makam, m]))
    const secimler = new Map(tum('makam_secim', 'SELECT makam, baslangic FROM makam_secim WHERE chat_jid = ?', chatJid).map((s) => [s.makam, s]))
    const adaylar = (makam, secim) => tum('makam_aday', 'SELECT user_jid, oy FROM makam_aday WHERE chat_jid = ? AND makam = ? AND secim = ? ORDER BY oy DESC, sira', chatJid, makam, String(secim))
      .map((a) => ({ ...a, uye: adlar.get(a.user_jid) ?? null }))

    const satirlar = MAKAMLAR.map((m) => {
      const kayit = makamlar.get(m.kod)
      const secim = secimler.get(m.kod)
      const acik = secim && now < secim.baslangic + SECIM_SURE_MS
      return {
        kod: m.kod,
        ad: m.ad,
        user_jid: kayit?.user_jid ?? null,
        uye: kayit ? adlar.get(kayit.user_jid) ?? null : null,
        askida: Boolean(kayit?.kalici),
        secim: acik ? { bitis: secim.baslangic + SECIM_SURE_MS, adaylar: adaylar(m.kod, secim.baslangic) } : null,
      }
    })
    return satirlar.some((s) => s.user_jid || s.secim) ? satirlar : []
  }

  function kumarTop(chatJid, liste) {
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const insanlar = liste.filter((u) => !u.bot && (u.kumarNet || u.kumarZarar)).map((u) => ({ ...u, uye: adlar.get(u.user_jid) }))
    return {
      kazananlar: insanlar.filter((u) => u.kumarNet > 0).toSorted((a, b) => b.kumarNet - a.kumarNet).slice(0, 3),
      kaybedenler: insanlar.filter((u) => u.kumarZarar > 0).toSorted((a, b) => b.kumarZarar - a.kumarZarar).slice(0, 3),
    }
  }

  function kripto(chatJid, liste) {
    const usd = btcUsd()
    if (!usd) return null
    const sahipler = liste.filter((u) => u.suly > 0 && !u.bot).toSorted((a, b) => b.suly - a.suly).slice(0, 5)
    return { usd, xp: Math.floor(sulyFiyati(usd, gunKuru(chatJid))), sahipler }
  }

  function petler(chatJid, liste, now) {
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    return tum('pet', 'SELECT * FROM pet WHERE chat_jid = ? ORDER BY pet_xp DESC', chatJid).filter((p) => !kactiMi(p, now)).map((p) => {
      const d = petDurumu(p, now)
      const tur = TURLER[p.tur]
      return { user_jid: p.user_jid, uye: adlar.get(p.user_jid) ?? null, ad: p.ad, tur: tur ? `${tur.emoji} ${tur.ad}` : p.tur, seviye: petSeviyesi(p.pet_xp), tokluk: Math.round(d.tokluk), mutluluk: Math.round(d.mutluluk) }
    })
  }

  /** Susturulan ve ambargolu üyeler; süresi dolan kayıtlar bot ilk mesajda silene kadar tabloda kalır. */
  function cezalilar(chatJid, liste, now) {
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const uye = (jid) => adlar.get(jid) ?? null
    return [
      ...tum('susturulan_uye', 'SELECT user_jid, bitis FROM susturulan_uye WHERE chat_jid = ? AND (bitis = 0 OR bitis > ?)', chatJid, now)
        .map((s) => ({ ...s, uye: uye(s.user_jid), tur: '🔇 Susturuldu' })),
      ...tum('ambargo', 'SELECT user_jid, bitis FROM ambargo WHERE chat_jid = ? AND bitis > ?', chatJid, now)
        .map((a) => ({ ...a, uye: uye(a.user_jid), tur: '🌍 Ambargo' })),
    ]
  }

  function vergiTop(chatJid, liste) {
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    return tum('vergi', 'SELECT user_jid, toplam FROM vergi WHERE chat_jid = ? AND toplam > 0 ORDER BY toplam DESC LIMIT 5', chatJid)
      .map((v) => ({ ...v, uye: adlar.get(v.user_jid) ?? null }))
  }

  function wordle(chatJid, liste, now) {
    const w = tek('wordle_grup', 'SELECT day, toplam, cozen FROM wordle_grup WHERE chat_jid = ?', chatJid)
    if (!w || w.day !== istanbulDay(new Date(now))) return null
    return { toplam: w.toplam, cozen: w.cozen ? liste.find((u) => u.user_jid === w.cozen) ?? null : null }
  }

  function borclular(chatJid, liste, now) {
    const krediOrani = krediFaizi(bankaFaizi(chatJid))
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const krediler = db.prepare('SELECT user_jid, borc, faiz_saat, vade FROM kredi WHERE chat_jid = ?').all(chatJid)
      .map((k) => {
        const saat = Math.min(Math.floor(now / SAAT_MS), Math.floor(k.vade / SAAT_MS))
        return {
          user_jid: k.user_jid,
          uye: adlar.get(k.user_jid) ?? null,
          borc: borcIslet(k.borc, Math.max(0, saat - k.faiz_saat), krediOrani),
          vade: k.vade,
          gecti: now >= k.vade,
        }
      })
    const eksiler = liste.filter((u) => u.xp < 0)
      .map((u) => ({ user_jid: u.user_jid, uye: u, borc: -u.xp, vade: 0, gecti: false }))
    const tefeciler = tum('tefeci', "SELECT borclu, alacakli, borc, vade FROM tefeci WHERE chat_jid = ? AND durum = 'acik'", chatJid)
      .map((t) => ({ user_jid: t.borclu, uye: adlar.get(t.borclu) ?? null, borc: t.borc, vade: t.vade, gecti: now >= t.vade, tefeci: adlar.get(t.alacakli) ?? null }))

    return [...krediler, ...tefeciler, ...eksiler].toSorted((a, b) => b.borc - a.borc)
  }

  /** Kişi sayfasının Varlıklar ve Borçlar kartı. */
  function kisiVarliklari(chatJid, userJid, uye, liste, now) {
    const adlar = new Map(liste.map((u) => [u.user_jid, u]))
    const yatirim = tek('yatirim', 'SELECT miktar, risk, bitis FROM yatirim WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)
    const t = tek('tefeci', "SELECT alacakli, borc, vade FROM tefeci WHERE chat_jid = ? AND borclu = ? AND durum = 'acik'", chatJid, userJid)
    const k = tek('kredi', 'SELECT borc, faiz_saat, vade FROM kredi WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)
    const saat = Math.floor(now / SAAT_MS)
    const pet = tek('pet', 'SELECT * FROM pet WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)
    const kalkan = tek('market', 'SELECT kalkan_until FROM market WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)?.kalkan_until ?? 0
    const sigorta = tek('sigorta', 'SELECT bitis FROM sigorta WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)?.bitis ?? 0

    return {
      coin: uye.coin,
      coinDeger: uye.coinDeger,
      suly: uye.suly,
      sulyDeger: uye.sulyDeger,
      mulkler: tum('mulk', 'SELECT kod, adet FROM mulk WHERE chat_jid = ? AND user_jid = ? AND adet > 0', chatJid, userJid)
        .map((m) => ({ ad: MULKLER.find((x) => x.kod === m.kod)?.ad ?? m.kod, adet: m.adet })),
      mulkDeger: uye.mulkDeger,
      yatirim: yatirim ? { ...yatirim, risk: RISKLER[yatirim.risk]?.ad ?? yatirim.risk } : null,
      kredi: k ? { borc: borcIslet(k.borc, Math.max(0, Math.min(saat, Math.floor(k.vade / SAAT_MS)) - k.faiz_saat), krediFaizi(bankaFaizi(chatJid))), vade: k.vade } : null,
      tefeci: t ? { ...t, uye: adlar.get(t.alacakli) ?? null } : null,
      alacaklar: tum('tefeci', "SELECT borclu, borc, vade FROM tefeci WHERE chat_jid = ? AND alacakli = ? AND durum = 'acik'", chatJid, userJid)
        .map((a) => ({ ...a, uye: adlar.get(a.borclu) ?? null })),
      vergi: tek('vergi', 'SELECT toplam FROM vergi WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)?.toplam ?? 0,
      kalkan: kalkan > now ? kalkan : 0,
      sigorta: sigorta > now ? sigorta : 0,
      pet: pet && !kactiMi(pet, now) ? (() => {
        const d = petDurumu(pet, now)
        const tur = TURLER[pet.tur]
        return { ad: pet.ad, tur: tur ? `${tur.emoji} ${tur.ad}` : pet.tur, seviye: petSeviyesi(pet.pet_xp), tokluk: Math.round(d.tokluk), mutluluk: Math.round(d.mutluluk) }
      })() : null,
    }
  }

  return {
    db,

    gruplar: () => db.prepare(`
      SELECT s.chat_jid, COUNT(*) AS uye, SUM(s.messages) AS mesaj, COALESCE(g.ad, '') AS ad
      FROM stats s LEFT JOIN gruplar g ON g.chat_jid = s.chat_jid
      WHERE s.chat_jid LIKE '%@g.us' GROUP BY s.chat_jid ORDER BY mesaj DESC
    `).all(),

    /** @returns {object | null} grup yoksa null */
    grup(chatJid, sirala, now = Date.now()) {
      const liste = uyeler(chatJid, now)
      if (!liste.length) return null

      const alan = SIRALAMALAR[sirala] ? sirala : 'xp'
      const toplam = (a) => liste.reduce((t, u) => t + u[a], 0)
      const adlar = new Map(liste.map((u) => [u.user_jid, u]))
      const fiyatlar = new Map(db.prepare('SELECT hisse, fiyat, onceki FROM borsa WHERE chat_jid = ?')
        .all(chatJid).map((r) => [r.hisse, r]))
      const fiyatGecmisi = db.prepare(`
        SELECT fiyat FROM (
          SELECT saat, fiyat FROM borsa_gecmis WHERE chat_jid = ? AND hisse = ? ORDER BY saat DESC LIMIT ${KUCUK_GRAFIK_SAATI}
        ) ORDER BY saat
      `)
      const bugun = db.prepare('SELECT COUNT(*) AS kisi, COALESCE(SUM(mesaj), 0) AS mesaj FROM gecmis WHERE chat_jid = ? AND gun = ?')
        .get(chatJid, istanbulDay(new Date(now)))

      return {
        ad: db.prepare('SELECT ad FROM gruplar WHERE chat_jid = ?').get(chatJid)?.ad ?? '',
        alan,
        uyeler: liste.toSorted((a, b) => b[alan] - a[alan]),
        toplam: { uye: liste.length, mesaj: toplam('messages'), xp: toplam('xp'), banka: toplam('bakiye') },
        bugun,
        borclular: borclular(chatJid, liste, now),
        ekonomi: ekonomi(chatJid, liste),
        toplum: toplum(chatJid, liste, now),
        hazine: hazine(chatJid, liste, now),
        hukumet: hukumet(chatJid, liste, now),
        kumarTop: kumarTop(chatJid, liste),
        vergiTop: vergiTop(chatJid, liste),
        kripto: kripto(chatJid, liste),
        petler: petler(chatJid, liste, now),
        cezalilar: cezalilar(chatJid, liste, now),
        wordle: wordle(chatJid, liste, now),
        saatler: saatler('chat_jid = ?', chatJid),
        gunlukMesaj: gunler(db.prepare('SELECT gun, SUM(mesaj) AS n FROM gecmis WHERE chat_jid = ? GROUP BY gun').all(chatJid), now),
        rekorlar: REKORLAR.flatMap((r) => {
          const insanlar = liste.filter((u) => !u.bot)
          if (!insanlar.length) return []
          const uye = insanlar.reduce((en, u) => (u[r.alan] > en[r.alan] ? u : en))
          return uye[r.alan] > 0 ? [{ ...r, uye, deger: uye[r.alan] }] : []
        }),
        borsa: HISSELER.flatMap((h) => (fiyatlar.has(h.kod)
          ? [{ ad: h.ad, kod: h.kod, ...fiyatlar.get(h.kod), gecmis: fiyatGecmisi.all(chatJid, h.kod).map((r) => r.fiyat) }]
          : [])),
        sezon: db.prepare('SELECT user_jid, puan FROM sezon WHERE chat_jid = ? AND hafta = ? ORDER BY puan DESC LIMIT 3')
          .all(chatJid, haftaAnahtari(new Date(now))).map((s) => ({ ...s, uye: adlar.get(s.user_jid) ?? null })),
      }
    },

    /** @returns {object | null} hisse o grupta hiç işlem görmediyse null */
    hisse(chatJid, kod, aralikAdi) {
      const hisse = HISSELER.find((h) => h.kod === kod)
      const kayit = hisse && db.prepare('SELECT fiyat, onceki FROM borsa WHERE chat_jid = ? AND hisse = ?').get(chatJid, kod)
      if (!kayit) return null

      const aralik = ARALIKLAR[aralikAdi] ? aralikAdi : '7g'
      const son = db.prepare('SELECT MAX(saat) AS saat FROM borsa_gecmis WHERE chat_jid = ? AND hisse = ?').get(chatJid, kod).saat ?? 0
      const islemGorenler = new Set(db.prepare('SELECT hisse FROM borsa WHERE chat_jid = ?').all(chatJid).map((r) => r.hisse))

      return {
        ...kayit,
        kod,
        ad: hisse.ad,
        aralik,
        grupAdi: db.prepare('SELECT ad FROM gruplar WHERE chat_jid = ?').get(chatJid)?.ad ?? '',
        noktalar: db.prepare('SELECT saat, fiyat FROM borsa_gecmis WHERE chat_jid = ? AND hisse = ? AND saat >= ? ORDER BY saat')
          .all(chatJid, kod, son - ARALIKLAR[aralik].saat),
        hisseler: HISSELER.filter((h) => islemGorenler.has(h.kod)).map((h) => ({ kod: h.kod, ad: h.ad })),
      }
    },

    /** @returns {object | null} kişi yoksa null */
    kisi(chatJid, userJid, now = Date.now()) {
      const liste = uyeler(chatJid, now).toSorted((a, b) => b.xp - a.xp)
      const sira = liste.findIndex((u) => u.user_jid === userJid)
      if (sira < 0) return null

      const uye = liste[sira]
      const saatDizisi = saatler('chat_jid = ? AND user_jid = ?', chatJid, userJid)
      const enCok = Math.max(...saatDizisi)
      const enAktifSaat = enCok ? saatDizisi.indexOf(enCok) : null

      const rozetVerisi = { ...uye, level: uye.seviye, saat: enAktifSaat }
      const adetler = new Map(db.prepare('SELECT no, adet FROM kart WHERE chat_jid = ? AND user_jid = ?')
        .all(chatJid, userJid).map((k) => [k.no, k.adet]))
      const hisseler = new Map(HISSELER.map((h) => [h.kod, h.ad]))
      const gecmis = db.prepare('SELECT gun, xp, mesaj AS n FROM gecmis WHERE chat_jid = ? AND user_jid = ? ORDER BY gun')
        .all(chatJid, userJid)

      return {
        ...uye,
        sira: sira + 1,
        uyeSayisi: liste.length,
        ilerleme: seviyeIlerlemesi(uye.xp),
        hayat: hayat(chatJid, userJid, liste, now),
        enAktifSaat,
        saatler: saatDizisi,
        gunlukMesaj: gunler(gecmis, now),
        xpGecmisi: gecmis.slice(-GRAFIK_GUNU).map((g) => g.xp),
        rozetler: ROZETLER.map((r) => ({ ad: r.ad, aciklama: r.aciklama, kazanildi: r.deger(rozetVerisi) >= r.hedef })),
        kumar: db.prepare('SELECT won, lost, games FROM kumar WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid) ?? null,
        kumarOyunlari: tum('kumar_oyun', 'SELECT oyun, won, lost, games FROM kumar_oyun WHERE chat_jid = ? AND user_jid = ? ORDER BY won - lost DESC', chatJid, userJid),
        varlik: kisiVarliklari(chatJid, userJid, uye, liste, now),
        sampiyonluk: db.prepare('SELECT kez FROM sampiyon WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)?.kez ?? 0,
        hisseler: db.prepare(`
          SELECT p.hisse, p.maliyet, p.adet * b.fiyat AS deger
          FROM portfoy p JOIN borsa b ON b.chat_jid = p.chat_jid AND b.hisse = p.hisse
          WHERE p.chat_jid = ? AND p.user_jid = ?
        `).all(chatJid, userJid).map((p) => ({ ...p, ad: hisseler.get(p.hisse) ?? p.hisse, deger: Math.floor(p.deger) })),
        setler: SETLER.map((s) => ({
          ad: s.ad,
          kartlar: s.kartlar.map((k) => ({ ad: k.ad, adet: adetler.get(k.no) ?? 0 })),
        })),
      }
    },
  }
}
