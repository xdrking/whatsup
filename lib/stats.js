import { randomInt } from 'node:crypto'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import logger from './logger.js'
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'
import { gununGorevleri } from './gorev.js'
import { bozdurmaDegeri, COIN_TABAN, coinKuru, hacizPayi, kurOlcegi, oyunOlcegi } from './coin.js'
import { BIRIM, SULY, sulyDegeri, sulyFiyati, sulySatisDegeri } from './kripto.js'
import { kiraHesapla, MULKLER } from './mulk.js'
import { odulOlcekle } from './kasa.js'
import { KALKAN_SURESI_MS } from './market.js'
import {
  GUNLUK_DENEME, KORUNMA_MS, MIN_HIRSIZ_XP, MIN_KURBAN_XP, ODUL_KESINTI_YUZDESI, soygunPayi,
} from './soygun.js'
import { cekimKesintisi, FAIZ_YUZDESI, faizIslet, servetVergisi, TESVIK_AKTIF_GUN, kacisSonucu } from './banka.js'
import { azamiKredi, borcIslet, krediFaizi, IFLAS_KREDI_YASAK_SAATI, IFLAS_YASAK_SAATI, KREDI_LIMITI, KREDI_VADE_SAATI } from './kredi.js'
import {
  ADIM_MS, AZAMI_ADIM, BASLANGIC_FIYATI, fiyatAdimi, GECMIS_SAATI, HABER_OMRU, HISSELER, IFLAS_FIYATI,
  komisyon, piyasaAdimi, piyasaHavasi, SAAT_MS, SAATTEKI_ADIM,
} from './borsa.js'
import { haftaAnahtari, SEZON_ODULLERI } from './sezon.js'
import { esKefaleti, HAPIS_SAATI, kefaletTutari } from './hapis.js'
import { adaylikUcreti, OY_UCRETI, SECIM_SURE_MS } from './secim.js'
import { AMBARGO_MS, BAKAN_GUNLUK, DARBE_BORSA_DUSUS, darbeCezasi, darbeOdulu, HAZINE_KISI, hazineLimiti, KALKAN_MS, MAKAMLAR, makamKoduyla, TUTUKLAMA_SAATI } from './devlet.js'
import { nafakaTutari } from './evlilik.js'
import { CALISMA_DAKIKASI, EVLI_MAAS_YUZDESI, ISSIZ, maasHesapla, MESLEK_DEGISIM_SAATI, meslekKoduyla } from './meslek.js'
import { AZAMI_UYE, CETE_SEZON_ODULU, KASA_KESINTI_YUZDESI, kurulusUcreti } from './cete.js'
import { azamiDava, davaHarci } from './dava.js'
import { olayUygula, piyasaOlayi } from './olay.js'
import { RISKLER, YATIRIM_SAATI, yatirimSonucu } from './yatirim.js'
import { geriOdeme, TEKLIF_SURESI_MS } from './tefeci.js'
import { aktifBonus, bonusluXp, BONUS_SURESI_MS, EKSTRA_FIYATI, EKSTRA_GUNLUK, hakDurumu, HAK_PENCERESI_MS } from './cark.js'
import {
  BESLE_PET_XP, durum as petDurumu, HEDIYE_BEKLEME_MS, HEDIYE_ESIGI, hediyeTabani, kactiMi, MAMA_FIYATI, MAMA_TOKLUK,
  OYNA_PET_XP, OYUN_BEKLEME_MS, OYUN_MUTLULUK, TURLER as PET_TURLERI,
} from './pet.js'

const XP_KAZANC = { mesaj: 1, sticker: 2, ses: 2 }

// Aynı kişi arka arkaya mesaj yağdırarak XP kasmasın. Sayaçlar yine artar,
// yalnızca XP verilmez. Bellekte tutulur; bot yeniden başlarsa sıfırlanır.
const XP_BEKLEME_MS = 30_000
const sonXp = new Map()

// Servet vergisi her mesajda veritabanına sorulmasın diye kişinin o gün
// denetlendiği bellekte tutulur. Yeniden başlatmada banka.vergi_day korur.
const vergiDenetimi = new Map()
const ekonomiDenetimi = new Map()

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
    kumarOyunYaz: db.prepare(`
      INSERT INTO kumar_oyun (chat_jid, user_jid, oyun, won, lost, games, en_buyuk, en_kotu)
      VALUES (@chat, @user, @oyun, @kazanc, @kayip, 1, @kazanc, @kayip)
      ON CONFLICT (chat_jid, user_jid, oyun) DO UPDATE SET
        won      = won + excluded.won,
        lost     = lost + excluded.lost,
        games    = games + 1,
        en_buyuk = MAX(en_buyuk, excluded.en_buyuk),
        en_kotu  = MAX(en_kotu, excluded.en_kotu)
    `),
    kumarGunOku: db.prepare('SELECT day, net, tavan FROM kumar_gun WHERE chat_jid = ? AND user_jid = ?'),
    kumarGunYaz: db.prepare(`
      INSERT INTO kumar_gun (chat_jid, user_jid, day, net, tavan) VALUES (@chat, @user, @gun, @net, @tavan)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET day = excluded.day, net = excluded.net, tavan = excluded.tavan
    `),
    kumarKarneOku: db.prepare('SELECT won, lost, games FROM kumar WHERE chat_jid = ? AND user_jid = ?'),
    kumarOyunlariOku: db.prepare('SELECT * FROM kumar_oyun WHERE chat_jid = ? AND user_jid = ? ORDER BY won - lost DESC'),
    kumarOyunSayisiOku: db.prepare('SELECT games FROM kumar_oyun WHERE chat_jid = ? AND user_jid = ? AND oyun = ?'),
    portfoyDegerleri: db.prepare(`
      SELECT p.hisse, p.adet, b.fiyat FROM portfoy p
      JOIN borsa b ON b.chat_jid = p.chat_jid AND b.hisse = p.hisse
      WHERE p.chat_jid = ? AND p.user_jid = ?
    `),
    servetUyeleri: db.prepare('SELECT user_jid FROM stats WHERE chat_jid = ?'),
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
    arzCuzdan: db.prepare('SELECT COALESCE(SUM(xp), 0) AS t FROM stats WHERE chat_jid = ? AND user_jid != ? AND xp > 0'),
    arzBanka: db.prepare('SELECT * FROM banka WHERE chat_jid = ? AND user_jid != ? AND bakiye > 0'),
    ekonomiOku: db.prepare('SELECT * FROM ekonomi WHERE chat_jid = ? AND day = ?'),
    ekonomiYaz: db.prepare('INSERT OR IGNORE INTO ekonomi (chat_jid, day, arz, kur) VALUES (?, ?, ?, ?)'),
    ekonomiGecmis: db.prepare('SELECT * FROM ekonomi WHERE chat_jid = ? AND day < ? ORDER BY day DESC LIMIT 7'),
    zenginler: db.prepare(`
      SELECT s.user_jid, s.xp + COALESCE(b.bakiye, 0) AS servet
      FROM stats s LEFT JOIN banka b ON b.chat_jid = s.chat_jid AND b.user_jid = s.user_jid
      WHERE s.chat_jid = ? AND s.user_jid != ? ORDER BY servet DESC LIMIT 5
    `),
    sigortaOku: db.prepare('SELECT bitis FROM sigorta WHERE chat_jid = ? AND user_jid = ?'),
    sigortaYaz: db.prepare(`
      INSERT INTO sigorta (chat_jid, user_jid, bitis) VALUES (?, ?, ?)
      ON CONFLICT(chat_jid, user_jid) DO UPDATE SET bitis = excluded.bitis
    `),
    mulkleriOku: db.prepare('SELECT * FROM mulk WHERE chat_jid = ? AND user_jid = ?'),
    mulkOku: db.prepare('SELECT * FROM mulk WHERE chat_jid = ? AND user_jid = ? AND kod = ?'),
    mulkYaz: db.prepare(`
      INSERT INTO mulk (chat_jid, user_jid, kod, adet, kira_saat, bekleyen) VALUES (@chat, @user, @kod, @adet, @saat, @bekleyen)
      ON CONFLICT(chat_jid, user_jid, kod) DO UPDATE SET adet = excluded.adet, kira_saat = excluded.kira_saat, bekleyen = excluded.bekleyen
    `),
    mulkSil: db.prepare('DELETE FROM mulk WHERE chat_jid = ? AND user_jid = ? AND kod = ?'),
    faizOku: db.prepare('SELECT oran FROM faiz WHERE chat_jid = ?'),
    faizYaz: db.prepare(`
      INSERT INTO faiz (chat_jid, oran) VALUES (?, ?)
      ON CONFLICT(chat_jid) DO UPDATE SET oran = excluded.oran
    `),
    grupBankalari: db.prepare('SELECT user_jid FROM banka WHERE chat_jid = ?'),
    grupKredileri: db.prepare('SELECT user_jid FROM kredi WHERE chat_jid = ?'),
    kullaniciSatirlari: db.prepare('SELECT chat_jid, xp FROM stats WHERE user_jid = ?'),
    kullaniciBankalari: db.prepare('SELECT chat_jid, bakiye FROM banka WHERE user_jid = ?'),
    kullaniciSil: db.prepare('DELETE FROM stats WHERE user_jid = ?'),
    kullaniciBankaSil: db.prepare('DELETE FROM banka WHERE user_jid = ?'),
    coinOku: db.prepare('SELECT * FROM coin WHERE chat_jid = ? AND user_jid = ?'),
    coinYaz: db.prepare(`
      INSERT INTO coin (chat_jid, user_jid, bakiye, toplu_hak) VALUES (@chat, @user, @bakiye, @toplu)
      ON CONFLICT(chat_jid, user_jid) DO UPDATE SET bakiye = excluded.bakiye, toplu_hak = excluded.toplu_hak
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
    iflasOku: db.prepare('SELECT yasak_bitis FROM iflas WHERE chat_jid = ? AND user_jid = ?'),
    iflasYaz: db.prepare(`
      INSERT INTO iflas (chat_jid, user_jid, yasak_bitis) VALUES (@chat, @user, @bitis)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET yasak_bitis = excluded.yasak_bitis
    `),
    portfoyVar: db.prepare('SELECT 1 FROM portfoy WHERE chat_jid = ? AND user_jid = ? LIMIT 1'),
    krediOku: db.prepare('SELECT * FROM kredi WHERE chat_jid = ? AND user_jid = ?'),
    krediYaz: db.prepare(`
      INSERT INTO kredi (chat_jid, user_jid, borc, faiz_saat, vade)
      VALUES (@chat, @user, @borc, @faizSaat, @vade)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        borc = excluded.borc, faiz_saat = excluded.faiz_saat, vade = excluded.vade
    `),
    krediSil: db.prepare('DELETE FROM kredi WHERE chat_jid = ? AND user_jid = ?'),
    bankaOku: db.prepare('SELECT * FROM banka WHERE chat_jid = ? AND user_jid = ?'),
    bankaYaz: db.prepare(`
      INSERT INTO banka (chat_jid, user_jid, bakiye, faiz_saat, faiz_artik, bekleyen, vergi_day, son_vergi)
      VALUES (@chat, @user, @bakiye, @faizSaat, @faizArtik, @bekleyen, @vergiGun, @sonVergi)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        bakiye    = excluded.bakiye,
        faiz_saat  = excluded.faiz_saat,
        faiz_artik = excluded.faiz_artik,
        bekleyen   = excluded.bekleyen,
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
    hapisOku: db.prepare('SELECT * FROM hapis WHERE chat_jid = ? AND user_jid = ?'),
    hapisYaz: db.prepare(`
      INSERT INTO hapis (chat_jid, user_jid, bitis, kefalet) VALUES (@chat, @user, @bitis, @kefalet)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET bitis = excluded.bitis, kefalet = excluded.kefalet
    `),
    hapisSil: db.prepare('DELETE FROM hapis WHERE chat_jid = ? AND user_jid = ?'),
    hapisListe: db.prepare('SELECT * FROM hapis WHERE chat_jid = ? AND bitis > ? ORDER BY bitis'),
    makamSecimOku: db.prepare('SELECT * FROM makam_secim WHERE chat_jid = ? AND makam = ?'),
    makamSecimler: db.prepare('SELECT * FROM makam_secim WHERE chat_jid = ? ORDER BY baslangic'),
    makamSecimYaz: db.prepare('INSERT INTO makam_secim (chat_jid, makam, baslangic) VALUES (?, ?, ?)'),
    makamSecimSil: db.prepare('DELETE FROM makam_secim WHERE chat_jid = ? AND makam = ?'),
    makamAdaylar: db.prepare('SELECT user_jid, oy FROM makam_aday WHERE chat_jid = ? AND secim = ? AND makam = ? ORDER BY oy DESC, sira'),
    makamAday: db.prepare('SELECT 1 FROM makam_aday WHERE chat_jid = ? AND secim = ? AND makam = ? AND user_jid = ?'),
    makamAdayYaz: db.prepare('INSERT INTO makam_aday (chat_jid, secim, makam, user_jid, sira) VALUES (?, ?, ?, ?, ?)'),
    makamOyEkle: db.prepare('UPDATE makam_aday SET oy = oy + 1 WHERE chat_jid = ? AND secim = ? AND makam = ? AND user_jid = ?'),
    makamAdaySil: db.prepare('DELETE FROM makam_aday WHERE chat_jid = ? AND secim = ? AND makam = ?'),
    makamOyVar: db.prepare('SELECT 1 FROM makam_oy WHERE chat_jid = ? AND secim = ? AND makam = ? AND user_jid = ?'),
    makamOyYaz: db.prepare('INSERT INTO makam_oy (chat_jid, secim, makam, user_jid) VALUES (?, ?, ?, ?)'),
    makamOySil: db.prepare('DELETE FROM makam_oy WHERE chat_jid = ? AND secim = ? AND makam = ?'),
    makamOku: db.prepare('SELECT * FROM makam WHERE chat_jid = ? AND makam = ?'),
    makamYaz: db.prepare(`
      INSERT INTO makam (chat_jid, makam, user_jid, kalici) VALUES (@chat, @makam, @user, @kalici)
      ON CONFLICT (chat_jid, makam) DO UPDATE SET user_jid = excluded.user_jid, kalici = excluded.kalici, karar_gun = ''
    `),
    makamKarar: db.prepare('UPDATE makam SET karar_gun = ? WHERE chat_jid = ? AND makam = ?'),
    makamKalici: db.prepare('UPDATE makam SET kalici = ? WHERE chat_jid = ? AND makam = ?'),
    makamKaliciHepsi: db.prepare('UPDATE makam SET kalici = 0 WHERE chat_jid = ?'),
    bakanHakOku: db.prepare('SELECT * FROM bakan_hak WHERE chat_jid = ? AND makam = ?'),
    bakanHakYaz: db.prepare('INSERT OR REPLACE INTO bakan_hak (chat_jid, makam, user_jid, day, adet) VALUES (?, ?, ?, ?, ?)'),
    ambargoOku: db.prepare('SELECT bitis FROM ambargo WHERE chat_jid = ? AND user_jid = ?'),
    ambargoYaz: db.prepare('INSERT OR REPLACE INTO ambargo (chat_jid, user_jid, bitis) VALUES (?, ?, ?)'),
    hazineBugun: db.prepare('SELECT user_jid, miktar FROM hazine_aktarim WHERE chat_jid = ? AND day = ?'),
    hazineYaz: db.prepare(`
      INSERT INTO hazine_aktarim (chat_jid, day, user_jid, miktar) VALUES (?, ?, ?, ?)
      ON CONFLICT (chat_jid, day, user_jid) DO UPDATE SET miktar = miktar + excluded.miktar
    `),
    hazineEskiSil: db.prepare('DELETE FROM hazine_aktarim WHERE chat_jid = ? AND day <> ?'),
    esOku: db.prepare('SELECT * FROM evlilik WHERE chat_jid = ? AND user_jid = ?'),
    esYaz: db.prepare('INSERT INTO evlilik (chat_jid, user_jid, es_jid, tarih) VALUES (?, ?, ?, ?)'),
    esSil: db.prepare('DELETE FROM evlilik WHERE chat_jid = ? AND user_jid = ?'),
    meslekOku: db.prepare('SELECT * FROM meslek WHERE chat_jid = ? AND user_jid = ?'),
    meslekYaz: db.prepare(`
      INSERT INTO meslek (chat_jid, user_jid, kod, secim, son_calisma) VALUES (@chat, @user, @kod, @secim, @son)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        kod = excluded.kod, secim = excluded.secim, son_calisma = excluded.son_calisma
    `),
    kacakOku: db.prepare('SELECT * FROM vergi_kacak WHERE chat_jid = ? AND user_jid = ?'),
    kacakYaz: db.prepare(`
      INSERT INTO vergi_kacak (chat_jid, user_jid, aktif, sonuc, tutar) VALUES (@chat, @user, @aktif, @sonuc, @tutar)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        aktif = excluded.aktif, sonuc = excluded.sonuc, tutar = excluded.tutar
    `),
    maasEkle: db.prepare(`
      INSERT INTO maas_gun (chat_jid, day, toplam) VALUES (?, ?, ?)
      ON CONFLICT (chat_jid, day) DO UPDATE SET toplam = toplam + excluded.toplam
    `),
    maasOku: db.prepare('SELECT toplam FROM maas_gun WHERE chat_jid = ? AND day = ?'),
    krediOzeti: db.prepare('SELECT COUNT(*) AS adet, COALESCE(SUM(borc), 0) AS toplam FROM kredi WHERE chat_jid = ?'),
    vergiEkle: db.prepare(`
      INSERT INTO vergi (chat_jid, user_jid, toplam) VALUES (?, ?, ?)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET toplam = toplam + excluded.toplam
    `),
    vergiSiralama: db.prepare('SELECT user_jid, toplam FROM vergi WHERE chat_jid = ? AND toplam > 0 ORDER BY toplam DESC LIMIT ?'),
    meslekSil: db.prepare('DELETE FROM meslek WHERE chat_jid = ? AND user_jid = ?'),
    meslekBitenOku: db.prepare('SELECT 1 FROM meslek_biten WHERE chat_jid = ? AND user_jid = ? AND kod = ?'),
    meslekBitenYaz: db.prepare('INSERT OR IGNORE INTO meslek_biten (chat_jid, user_jid, kod) VALUES (?, ?, ?)'),
    ceteOku: db.prepare('SELECT * FROM cete WHERE chat_jid = ? AND anahtar = ?'),
    ceteYaz: db.prepare('INSERT INTO cete (chat_jid, anahtar, ad, lider) VALUES (?, ?, ?, ?)'),
    ceteSil: db.prepare('DELETE FROM cete WHERE chat_jid = ? AND anahtar = ?'),
    ceteKasa: db.prepare('UPDATE cete SET kasa = kasa + ? WHERE chat_jid = ? AND anahtar = ?'),
    ceteLiderYaz: db.prepare('UPDATE cete SET lider = ? WHERE chat_jid = ? AND anahtar = ?'),
    ceteLiderKasasi: db.prepare('SELECT 1 FROM cete WHERE chat_jid = ? AND lider = ? AND kasa > 0'),
    ceteUyeOku: db.prepare('SELECT * FROM cete_uye WHERE chat_jid = ? AND user_jid = ?'),
    ceteUyeYaz: db.prepare('INSERT INTO cete_uye (chat_jid, user_jid, anahtar, katilma) VALUES (?, ?, ?, ?)'),
    ceteUyeSil: db.prepare('DELETE FROM cete_uye WHERE chat_jid = ? AND user_jid = ?'),
    ceteUyeleri: db.prepare('SELECT user_jid FROM cete_uye WHERE chat_jid = ? AND anahtar = ? ORDER BY katilma, user_jid'),
    ceteSira: db.prepare(`
      SELECT c.anahtar, c.ad, c.kasa, COUNT(u.user_jid) AS uye, COALESCE(SUM(s.puan), 0) AS puan
      FROM cete c
      LEFT JOIN cete_uye u ON u.chat_jid = c.chat_jid AND u.anahtar = c.anahtar
      LEFT JOIN sezon s ON s.chat_jid = u.chat_jid AND s.user_jid = u.user_jid AND s.hafta = ?
      WHERE c.chat_jid = ? GROUP BY c.anahtar ORDER BY puan DESC, c.kasa DESC, c.anahtar LIMIT 10
    `),
    arzCete: db.prepare('SELECT COALESCE(SUM(kasa), 0) AS t FROM cete WHERE chat_jid = ?'),
    arzYatirim: db.prepare('SELECT COALESCE(SUM(miktar), 0) AS t FROM yatirim WHERE chat_jid = ?'),
    arzKripto: db.prepare('SELECT COALESCE(SUM(birim), 0) AS t FROM kripto WHERE chat_jid = ? AND user_jid != ?'),
    kriptoOku: db.prepare('SELECT * FROM kripto WHERE chat_jid = ? AND user_jid = ?'),
    kriptoYaz: db.prepare(`
      INSERT INTO kripto (chat_jid, user_jid, birim) VALUES (?, ?, ?)
      ON CONFLICT(chat_jid, user_jid) DO UPDATE SET birim = excluded.birim
    `),
    kriptoSil: db.prepare('DELETE FROM kripto WHERE chat_jid = ? AND user_jid = ?'),
    kriptoFiyatOku: db.prepare('SELECT * FROM kripto_fiyat WHERE sembol = ?'),
    kriptoFiyatYaz: db.prepare(`
      INSERT INTO kripto_fiyat (sembol, usd, zaman) VALUES (?, ?, ?)
      ON CONFLICT(sembol) DO UPDATE SET usd = excluded.usd, zaman = excluded.zaman
    `),
    yatirimOku: db.prepare('SELECT * FROM yatirim WHERE chat_jid = ? AND user_jid = ?'),
    yatirimYaz: db.prepare(`
      INSERT INTO yatirim (chat_jid, user_jid, miktar, risk, carpan, bitis)
      VALUES (@chat, @user, @miktar, @risk, @carpan, @bitis)
    `),
    yatirimSil: db.prepare('DELETE FROM yatirim WHERE chat_jid = ? AND user_jid = ?'),
    tefeciOku: db.prepare('SELECT * FROM tefeci WHERE chat_jid = ? AND borclu = ?'),
    tefeciAlacaklar: db.prepare(`SELECT * FROM tefeci WHERE chat_jid = ? AND alacakli = ? AND durum = 'acik' ORDER BY vade`),
    tefeciYaz: db.prepare(`
      INSERT INTO tefeci (chat_jid, borclu, alacakli, anapara, borc, saat, vade, durum, teklif_bitis)
      VALUES (@chat, @borclu, @alacakli, @anapara, @borc, @saat, @vade, @durum, @teklifBitis)
      ON CONFLICT (chat_jid, borclu) DO UPDATE SET
        alacakli = excluded.alacakli, anapara = excluded.anapara, borc = excluded.borc, saat = excluded.saat,
        vade = excluded.vade, durum = excluded.durum, teklif_bitis = excluded.teklif_bitis
    `),
    tefeciBorc: db.prepare('UPDATE tefeci SET borc = ? WHERE chat_jid = ? AND borclu = ?'),
    tefeciSil: db.prepare('DELETE FROM tefeci WHERE chat_jid = ? AND borclu = ?'),
    wordleOku: db.prepare('SELECT deneme, cozuldu FROM wordle WHERE chat_jid = ? AND user_jid = ? AND day = ?'),
    wordleYaz: db.prepare(`
      INSERT INTO wordle (chat_jid, user_jid, day, deneme, cozuldu) VALUES (@chat, @user, @gun, @deneme, @cozuldu)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        day = excluded.day, deneme = excluded.deneme, cozuldu = excluded.cozuldu
    `),
    wordleGrupOku: db.prepare('SELECT toplam, cozen FROM wordle_grup WHERE chat_jid = ? AND day = ?'),
    wordleGrupYaz: db.prepare(`
      INSERT INTO wordle_grup (chat_jid, day, toplam, cozen) VALUES (@chat, @gun, @toplam, @cozen)
      ON CONFLICT (chat_jid) DO UPDATE SET day = excluded.day, toplam = excluded.toplam, cozen = excluded.cozen
    `),
    ozetYazanlar: db.prepare(`
      SELECT user_jid, SUM(mesaj) AS mesaj FROM gecmis
      WHERE chat_jid = ? AND gun >= ? AND user_jid != ? GROUP BY user_jid ORDER BY mesaj DESC, user_jid
    `),
    ozetGeceKusu: db.prepare(`
      SELECT user_jid, SUM(count) AS mesaj FROM hours
      WHERE chat_jid = ? AND hour < 6 AND user_jid != ? GROUP BY user_jid ORDER BY mesaj DESC, user_jid LIMIT 1
    `),
    carkOku: db.prepare('SELECT * FROM cark WHERE chat_jid = ? AND user_jid = ?'),
    ekstraOku: db.prepare('SELECT adet FROM cark_ekstra WHERE chat_jid = ? AND user_jid = ? AND day = ?'),
    ekstraYaz: db.prepare(`
      INSERT INTO cark_ekstra (chat_jid, user_jid, day, adet) VALUES (@chat, @user, @gun, 1)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        adet = CASE WHEN day = excluded.day THEN adet + 1 ELSE 1 END,
        day  = excluded.day
    `),
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
export function recordMessage({ chatJid, userJid, type, at = Date.now(), rnd = randomInt }) {
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

    // Bot kendiliğinden yazmadığı için vade, kişinin ilk mesajında tahsil edilir.
    getDb().transaction(() => {
      krediGuncelle(q, chatJid, userJid, at)
      tefeciTahsil(q, chatJid, userJid, at)
    })()

    const gun = istanbulDay(new Date(at))
    q.gecmisYaz.run({ chat: chatJid, user: userJid, gun })
    if (ekonomiDenetimi.get(chatJid) !== gun) {
      ekonomiDenetimi.set(chatJid, gun)
      gununEkonomisi(q, chatJid, at)
    }
    if (vergiDenetimi.get(anahtar) !== gun) {
      vergiDenetimi.set(anahtar, gun)
      vergiAl(q, chatJid, userJid, gun, at, rnd)
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

        // Puanlar silinmeden okunmalı: çete sıralaması aynı satırlardan çıkar.
        const birinci = q.ceteSira.get(eski.hafta, chatJid)
        const cete = birinci?.puan ? { ad: birinci.ad, odul: CETE_SEZON_ODULU } : null
        if (cete) q.ceteKasa.run(CETE_SEZON_ODULU, chatJid, birinci.anahtar)

        q.sezonSil.run(chatJid, eski.hafta)

        return { hafta: eski.hafta, kazananlar, cete }
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
 * olan o komutu yazmayarak kaçardı. Vergi bot hesabına gider.
 * `.vergikaçır` planı varsa zar burada atılır: kaçan ödemez, yakalanan ceza öder ve hapse girer.
 */
function vergiAl(q, chatJid, userJid, gun, now, rnd) {
  if (botKimlikleri.has(userJid)) return

  getDb().transaction(() => {
    if (q.bankaOku.get(chatJid, userJid)?.vergi_day === gun) return

    const { hesap } = faizIsle(q, chatJid, userJid, now)
    const cuzdan = Math.max(0, q.oku.get(chatJid, userJid)?.xp ?? 0)
    const servet = cuzdan + hesap.bakiye
    const vergi = servetVergisi(servet, gununEkonomisi(q, chatJid, now).kur)
    if (!vergi) return

    const plan = q.kacakOku.get(chatJid, userJid)?.aktif ? kacisSonucu(vergi, servet, rnd(0, 100)) : null
    if (plan) {
      q.kacakYaz.run({ chat: chatJid, user: userJid, aktif: 0, sonuc: plan.kacti ? 'kacti' : 'yakalandi', tutar: plan.tutar })
    }
    if (plan?.kacti) {
      bankaKaydet(q, chatJid, userJid, { ...hesap, vergi_day: gun, son_vergi: 0 })
      return
    }

    const odenecek = plan?.tutar ?? vergi
    const cuzdandan = Math.min(cuzdan, odenecek)
    const bankadan = odenecek - cuzdandan
    if (cuzdandan) q.xpAktar.run({ chat: chatJid, user: userJid, xp: -cuzdandan })
    botaYaz(q, chatJid, userJid, -odenecek)
    q.vergiEkle.run(chatJid, userJid, odenecek)
    if (plan) {
      q.hapisYaz.run({
        chat: chatJid, user: userJid, bitis: now + HAPIS_SAATI * SAAT_MS, kefalet: kefaletTutari(servet - odenecek),
      })
    }
    bankaKaydet(q, chatJid, userJid, {
      ...hesap,
      bakiye: hesap.bakiye - bankadan,
      bekleyen: Math.max(0, hesap.bekleyen - bankadan),
      vergi_day: gun,
      son_vergi: odenecek,
    })
  })()
}

/**
 * Bugünkü vergi ilk mesajda kesildiği için plan bir sonraki kesime işler.
 * @returns {{ zatenVar: boolean, sonuc: string, tutar: number } | null}
 */
export function vergiKacirPlani({ chatJid, userJid }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kayit = q.kacakOku.get(chatJid, userJid)
      const sonuc = kayit?.sonuc ?? ''
      const tutar = kayit?.tutar ?? 0
      if (kayit?.aktif) return { zatenVar: true, sonuc, tutar }

      q.kacakYaz.run({ chat: chatJid, user: userJid, aktif: 1, sonuc, tutar })
      return { zatenVar: false, sonuc, tutar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Vergi kaçırma planı yazılamadı')
    return null
  }
}

/** @returns {{ user_jid: string, toplam: number }[]} */
export function vergiSiralama(chatJid, limit = 10) {
  try {
    return hazirla()?.vergiSiralama.all(chatJid, limit) ?? []
  } catch (err) {
    logger.error({ err, chatJid }, 'Vergi sıralaması okunamadı')
    return []
  }
}

/** Çağıran `hazirla()`'dan aldığı `q`'yu verir. */
function bankaFaizi(q, chatJid) {
  return q.faizOku.get(chatJid)?.oran ?? FAIZ_YUZDESI
}

/** @returns {{ banka: number, kredi: number }} grubun saatlik faizleri */
export function faizDurumu(chatJid) {
  try {
    const q = hazirla()
    const banka = q ? bankaFaizi(q, chatJid) : FAIZ_YUZDESI
    return { banka, kredi: krediFaizi(banka) }
  } catch (err) {
    logger.error({ err, chatJid }, 'Faiz okunamadı')
    return { banka: FAIZ_YUZDESI, kredi: krediFaizi(FAIZ_YUZDESI) }
  }
}

/**
 * Faiz kararı. Birikmiş faiz önce eski orandan işlenir, yoksa yeni oran geçmiş
 * saatlere de uygulanırdı. Kredi faizi hep bankanın üstünde kalır.
 *
 * Başkan günde bir karar verebilir, sahip sınırsızdır.
 *
 * @returns {{ bugunVar: true } | { once: number, banka: number, kredi: number } | null}
 */
export function faizKarari({ chatJid, oran, baskan = false, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (baskan) {
        const gun = istanbulDay(new Date(now))
        if (q.makamOku.get(chatJid, 'baskan')?.karar_gun === gun) return { bugunVar: true }
        q.makamKarar.run(gun, chatJid, 'baskan')
      }

      const once = bankaFaizi(q, chatJid)
      for (const { user_jid: jid } of q.grupBankalari.all(chatJid)) faizIsle(q, chatJid, jid, now)
      for (const { user_jid: jid } of q.grupKredileri.all(chatJid)) krediGuncelle(q, chatJid, jid, now)
      q.faizYaz.run(chatJid, oran)
      return { once, banka: oran, kredi: krediFaizi(oran) }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Faiz kararı yazılamadı')
    return null
  }
}

/**
 * Kasadan son günlerde yazmış üyelere eşit XP dağıtır. Bölünmeyen artık kasada kalır.
 * Eksi cüzdana giden pay önce eksiyi kapatır.
 *
 * @returns {{ kapali: true } | { yetersiz: true, kasa: number } | { kimseYok: true }
 *   | { kisi: number, pay: number, toplam: number, kasa: number } | null}
 */
export function tesvikDagit({ chatJid, uyeler, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    if (!botJid) return { kapali: true }

    return getDb().transaction(() => {
      const kasa = kasaToplami(q, chatJid, now)
      if (miktar > kasa) return { yetersiz: true, kasa }

      const sinir = now - TESVIK_AKTIF_GUN * 86_400_000
      const aktifler = uyeler.filter((jid) => !botKimlikleri.has(jid) && (q.oku.get(chatJid, jid)?.last_seen ?? 0) >= sinir)
      const pay = aktifler.length ? Math.floor(miktar / aktifler.length) : 0
      if (!pay) return { kimseYok: true }

      const toplam = pay * aktifler.length
      kasadanCek(q, chatJid, toplam, now)
      for (const jid of aktifler) q.xpAktar.run({ chat: chatJid, user: jid, xp: pay })

      return { kisi: aktifler.length, pay, toplam, kasa: kasa - toplam }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Teşvik dağıtılamadı')
    return null
  }
}

function bankaKaydet(q, chatJid, userJid, hesap) {
  q.bankaYaz.run({
    chat: chatJid,
    user: userJid,
    bakiye: hesap.bakiye ?? 0,
    faizSaat: hesap.faiz_saat ?? 0,
    faizArtik: hesap.faiz_artik ?? 0,
    bekleyen: hesap.bekleyen ?? 0,
    vergiGun: hesap.vergi_day ?? '',
    sonVergi: hesap.son_vergi ?? 0,
  })
}

/** Botun bankasına XP koyar; kredi ödemeleri buraya gelir. Çağıran transaction içindedir. */
function kasayaYatir(q, chatJid, miktar, now) {
  if (!botJid || !miktar) return
  const { hesap } = faizIsle(q, chatJid, botJid, now)
  bankaKaydet(q, chatJid, botJid, { ...hesap, bakiye: hesap.bakiye + miktar, bekleyen: hesap.bekleyen + miktar })
}

/**
 * Kasa botun bankası ve cüzdanıdır: kumar kayıpları cüzdana düştüğü için yalnızca
 * banka sayılsaydı kasa boş görünürdü. Çağıran transaction içindedir.
 */
function kasaToplami(q, chatJid, now) {
  if (!botJid) return 0
  const { hesap } = faizIsle(q, chatJid, botJid, now)
  return hesap.bakiye + Math.max(0, q.oku.get(chatJid, botJid)?.xp ?? 0)
}

/** Krediyi önce botun bankasından, yetmezse cüzdanından karşılar. */
function kasadanCek(q, chatJid, miktar, now) {
  const { hesap } = faizIsle(q, chatJid, botJid, now)
  const bankadan = Math.min(miktar, hesap.bakiye)
  bankaKaydet(q, chatJid, botJid, {
    ...hesap, bakiye: hesap.bakiye - bankadan, bekleyen: Math.max(0, hesap.bekleyen - bankadan),
  })
  if (miktar > bankadan) q.xpAktar.run({ chat: chatJid, user: botJid, xp: bankadan - miktar })
}

/** Vadesi dolan borcu cüzdandan, sonra bankadan alır; kalanı cüzdana eksi yazar. */
function krediTahsil(q, chatJid, userJid, borc, now) {
  const { hesap } = faizIsle(q, chatJid, userJid, now)
  const cuzdan = Math.max(0, q.oku.get(chatJid, userJid)?.xp ?? 0)
  const cuzdandan = Math.min(cuzdan, borc)
  const bankadan = Math.min(hesap.bakiye, borc - cuzdandan)
  const kalan = borc - cuzdandan - bankadan

  q.xpAktar.run({ chat: chatJid, user: userJid, xp: -(cuzdandan + kalan) })
  bankaKaydet(q, chatJid, userJid, {
    ...hesap, bakiye: hesap.bakiye - bankadan, bekleyen: Math.max(0, hesap.bekleyen - bankadan),
  })
  kasayaYatir(q, chatJid, cuzdandan + bankadan, now)
  q.krediSil.run(chatJid, userJid)
}

/**
 * Faizi işler, vadesi geçtiyse tahsil eder. Faiz vadede durur: eksi bakiye
 * büyümeye devam etseydi hiç kapanmazdı. Çağıran transaction içindedir.
 *
 * @returns {{ borc: number, vade: number } | null} null: açık kredi yok.
 */
function krediGuncelle(q, chatJid, userJid, now) {
  const kredi = q.krediOku.get(chatJid, userJid)
  if (!kredi) return null

  const saat = Math.min(Math.floor(now / SAAT_MS), Math.floor(kredi.vade / SAAT_MS))
  const borc = borcIslet(kredi.borc, Math.max(0, saat - kredi.faiz_saat), krediFaizi(bankaFaizi(q, chatJid)))

  if (now >= kredi.vade) {
    krediTahsil(q, chatJid, userJid, borc, now)
    return null
  }

  q.krediYaz.run({ chat: chatJid, user: userJid, borc, faizSaat: saat, vade: kredi.vade })
  return { borc, vade: kredi.vade }
}

/** Borçtan `miktar` düşer, ödeme botun bankasına gider. Çağıran transaction içindedir. */
function krediyeOde(q, chatJid, userJid, kredi, miktar, now) {
  const kalan = kredi.borc - miktar
  if (kalan > 0) {
    q.krediYaz.run({
      chat: chatJid, user: userJid, borc: kalan, faizSaat: Math.floor(now / SAAT_MS), vade: kredi.vade,
    })
  } else {
    q.krediSil.run(chatJid, userJid)
  }
  kasayaYatir(q, chatJid, miktar, now)
  return kalan
}

/** @returns {{ borc: number, vade: number, xp: number, limit: number } | null} */
export function krediDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kredi = krediGuncelle(q, chatJid, userJid, now)
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      return { borc: kredi?.borc ?? 0, vade: kredi?.vade ?? 0, xp, limit: azamiKredi(kasaToplami(q, chatJid, now)) }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kredi okunamadı')
    return null
  }
}

/**
 * @returns {{ kapali: true } | { acik: true, borc: number } | { eksi: true, xp: number }
 *   | { yasak: number } | { limit: number } | { kasaLimit: number } | { xp: number } | null}
 */
export function krediCek({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    if (!botJid || botKimlikleri.has(userJid)) return { kapali: true }

    return getDb().transaction(() => {
      const kredi = krediGuncelle(q, chatJid, userJid, now)
      if (kredi) return { acik: true, borc: kredi.borc }

      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (xp < 0) return { eksi: true, xp }

      // Yasağın başlangıcı saklanmaz: kumar yasağının bitişinden geri hesaplanır.
      const iflas = q.iflasOku.get(chatJid, userJid)?.yasak_bitis ?? 0
      const yasak = iflas + (IFLAS_KREDI_YASAK_SAATI - IFLAS_YASAK_SAATI) * SAAT_MS
      if (iflas && yasak > now) return { yasak }

      if (miktar > KREDI_LIMITI) return { limit: KREDI_LIMITI }
      const azami = azamiKredi(kasaToplami(q, chatJid, now))
      if (miktar > azami) return { kasaLimit: azami }
      kasadanCek(q, chatJid, miktar, now)

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: miktar })
      q.krediYaz.run({
        chat: chatJid,
        user: userJid,
        borc: miktar,
        faizSaat: Math.floor(now / SAAT_MS),
        vade: now + KREDI_VADE_SAATI * SAAT_MS,
      })
      return { xp: xp + miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kredi verilemedi')
    return null
  }
}

/** @returns {{ yetersiz: true, xp: number } | { odenen: number, borc: number, xp: number } | null} */
export function krediOde({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kredi = krediGuncelle(q, chatJid, userJid, now)
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      const odenen = Math.min(miktar, kredi?.borc ?? 0, xp)
      if (odenen <= 0) return { yetersiz: true, xp }

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -odenen })
      const borc = krediyeOde(q, chatJid, userJid, kredi, odenen, now)
      return { odenen, borc: Math.max(0, borc), xp: xp - odenen }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kredi ödenemedi')
    return null
  }
}

/**
 * Eksi cüzdanı sıfırlar ve kumar yasağı yazar. Yalnızca eksi bakiye silinir: açık
 * kredi silinseydi kredi çekip harcamak bedava olurdu. Hisseler önce satılmalı,
 * yoksa krediyle alınan hisse iflastan sonra satılıp borçsuz paraya dönerdi.
 *
 * @returns {{ kredili: true, borc: number } | { borcYok: true } | { portfoy: true }
 *   | { silinen: number, yasakBitis: number } | null}
 */
export function iflasEt({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kredi = krediGuncelle(q, chatJid, userJid, now)
      if (kredi) return { kredili: true, borc: kredi.borc }

      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (xp >= 0) return { borcYok: true }
      if (q.portfoyVar.get(chatJid, userJid)) return { portfoy: true }
      if (q.coinOku.get(chatJid, userJid)?.bakiye) return { coin: true }
      if (q.kriptoOku.get(chatJid, userJid)?.birim) return { kripto: true }
      if (q.mulkleriOku.all(chatJid, userJid).length) return { mulk: true }
      if (q.ceteLiderKasasi.get(chatJid, userJid)) return { cete: true }
      if (q.yatirimOku.get(chatJid, userJid)) return { yatirim: true }

      const yasakBitis = now + IFLAS_YASAK_SAATI * SAAT_MS
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -xp })
      q.iflasYaz.run({ chat: chatJid, user: userJid, bitis: yasakBitis })
      return { silinen: -xp, yasakBitis }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'İflas yazılamadı')
    return null
  }
}

/** @returns {number} iflas, hapis ya da dolan günlük kumar tavanının bitişi (ms); yasak yoksa 0. */
export function kumarYasagi(chatJid, userJid, now = Date.now()) {
  try {
    const q = hazirla()
    if (!q) return 0
    const { net, tavan } = kumarGunDurumu(q, chatJid, userJid, now)
    const tavanDolu = userJid !== botJid && net > 0 && net >= tavan ? yarinBaslangici(now) : 0
    return Math.max(q.iflasOku.get(chatJid, userJid)?.yasak_bitis ?? 0, q.hapisOku.get(chatJid, userJid)?.bitis ?? 0, tavanDolu)
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kumar yasağı okunamadı')
    return 0
  }
}

/** Birikmiş faizi hesaba işler; çağıran transaction içindedir. */
function faizIsle(q, chatJid, userJid, now) {
  const saat = Math.floor(now / SAAT_MS)
  const hesap = q.bankaOku.get(chatJid, userJid) ?? {}
  const bakiye = hesap.bakiye ?? 0

  const gecen = saat - (hesap.faiz_saat ?? saat)
  const { faiz, artik } = bakiye && hesap.faiz_saat
    ? faizIslet(bakiye, hesap.bekleyen ?? 0, gecen, hesap.faiz_artik, bankaFaizi(q, chatJid))
    : { faiz: 0, artik: 0 }
  const bekleyen = gecen > 0 ? 0 : hesap.bekleyen ?? 0
  const yeni = { ...hesap, bakiye: bakiye + faiz, faiz_saat: saat, faiz_artik: artik, bekleyen }
  bankaKaydet(q, chatJid, userJid, yeni)
  return { hesap: yeni, faiz }
}

/**
 * Hesabı faizi işleyerek okur (.banka).
 *
 * @returns {{ bakiye: number, xp: number, faiz: number, sonVergi: number, borc: number } | null}
 */
export function bankaDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kredi = krediGuncelle(q, chatJid, userJid, now)
      const { hesap, faiz } = faizIsle(q, chatJid, userJid, now)
      return {
        borc: kredi?.borc ?? 0,
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

/**
 * Açık kredi varsa yatırılan XP önce borcu keser, kalanı hesaba girer.
 *
 * @returns {{ yetersiz: true, xp: number }
 *   | { bakiye: number, xp: number, krediOdeme: number, kalanBorc: number } | null}
 */
export function bankaYatir({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const kredi = krediGuncelle(q, chatJid, userJid, now)
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar > xp) return { yetersiz: true, xp }

      const krediOdeme = Math.min(miktar, kredi?.borc ?? 0)
      const kalanBorc = krediOdeme ? krediyeOde(q, chatJid, userJid, kredi, krediOdeme, now) : 0
      const yatan = miktar - krediOdeme

      const { hesap } = faizIsle(q, chatJid, userJid, now)
      const bakiye = hesap.bakiye + yatan
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      bankaKaydet(q, chatJid, userJid, { ...hesap, bakiye, bekleyen: hesap.bekleyen + yatan })
      return { bakiye, xp: xp - miktar, krediOdeme, kalanBorc }
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
      botaYaz(q, chatJid, userJid, -kesinti)
      // Önce faiz almayan para çıkar: yeni yatıran eski parasının faizini kaybetmesin.
      bankaKaydet(q, chatJid, userJid, { ...hesap, bakiye, bekleyen: Math.max(0, hesap.bekleyen - miktar) })
      return { bakiye, xp: q.oku.get(chatJid, userJid).xp, kesinti }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Bankadan çekilemedi')
    return null
  }
}

/**
 * Sahibin elle yaptığı haciz: önce banka, yetmezse cüzdan, o da yetmezse kalanı eksi
 * yazılır. Kasaya yalnızca gerçekten alınan girer: eksi kısım yoktan XP basmasın.
 * Kesinti yoktur, kredi borcundan düşmez.
 *
 * @returns {{ kapali: true } | { bakiye: number, xp: number, kasaya: number, eksi: number } | null}
 */
export function hacizEt({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    if (!botJid) return { kapali: true }

    return getDb().transaction(() => {
      const { hesap } = faizIsle(q, chatJid, userJid, now)
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0

      const bankadan = Math.min(miktar, hesap.bakiye)
      const kalan = miktar - bankadan
      const cuzdandan = Math.min(kalan, Math.max(0, once))
      const bakiye = hesap.bakiye - bankadan

      bankaKaydet(q, chatJid, userJid, { ...hesap, bakiye, bekleyen: Math.max(0, hesap.bekleyen - bankadan) })
      if (kalan) q.xpAktar.run({ chat: chatJid, user: userJid, xp: -kalan })
      kasayaYatir(q, chatJid, bankadan + cuzdandan, now)

      return { bakiye, xp: once - kalan, kasaya: bankadan + cuzdandan, eksi: kalan - cuzdandan }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Haciz yazılamadı')
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
 * Elle XP verir, kurla büyümez; oyun ödülü için `oyunOdulu` kullanılır. `recordMessage`'ın
 * 30 sn'lik cooldown'u burada uygulanmaz. Kişinin aktif `.çark` bonusu varsa uygulanır.
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

/**
 * Kazanılan oyun ödülü. `amount` taban sayıdır, XP'ye kurla çevrilir. Sezon puanı taban
 * kalır, yoksa oyun puanı mesaj ve görev puanlarını ezerdi.
 *
 * @returns {number} kazanılan XP (bonus dahil); oyunlar bunu mesajda gösterir.
 */
export function oyunOdulu({ chatJid, userJid, amount, at = Date.now() }) {
  if (!chatJid || !userJid || !amount) return 0

  try {
    const q = hazirla()
    if (!q) return 0

    return getDb().transaction(() => {
      const xp = olayUygula(piyasaOlayi(chatJid, at), 'oyun', oyunOlcegi(amount, anlikKur(q, chatJid, at)))
      const bonus = aktifBonus(q.carkOku.get(chatJid, userJid), at)
      const kazanc = bonus ? bonusluXp(xp, bonus.yuzde) : xp

      q.xpEkle.run({ chat: chatJid, user: userJid, xp: kazanc, at })
      gorevIlerlet(q, chatJid, userJid, 'oyun', at)
      sezonPuani(q, chatJid, userJid, bonus ? bonusluXp(amount, bonus.yuzde) : amount, at)
      return kazanc
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Oyun ödülü yazılamadı')
    return 0
  }
}

/** Oyun mesajında yazan güncel ödül. */
export function oyunTutari(chatJid, amount, now = Date.now()) {
  try {
    const q = hazirla()
    return q ? olayUygula(piyasaOlayi(chatJid, now), 'oyun', oyunOlcegi(amount, anlikKur(q, chatJid, now))) : amount
  } catch (err) {
    logger.error({ err, chatJid }, 'Oyun ödülü okunamadı')
    return amount
  }
}

/** Günlük görev sayacını artırır. Gün Türkiye takvim günüdür. */
function gorevIlerlet(q, chatJid, userJid, anahtar, at = Date.now()) {
  q.gorevYaz.run({ chat: chatJid, user: userJid, anahtar, gun: istanbulDay(new Date(at)) })
}

/**
 * Tek kumar sonucunu karneye yazar; çağıran transaction içindedir. `oyun` verilirse
 * `.kumarkarnem` dökümüne de girer.
 */
function kumarKaydet(q, chatJid, userJid, fark, oyun) {
  gorevIlerlet(q, chatJid, userJid, 'kumar')
  const satir = { chat: chatJid, user: userJid, kazanc: Math.max(fark, 0), kayip: Math.max(-fark, 0) }
  q.kumarYaz.run(satir)
  if (oyun) q.kumarOyunYaz.run({ ...satir, oyun })
}

// Bota karşı oyunlardan günlük net kazanç anlık piyasanın yarısını geçemez (bot sahibinin kararı, %10 az bulundu):
// darbeden sonra kasa piyasadan kat kat büyüdü, tek kişi bir gecede kasadan 1 trilyon çekip kuru şişirdi.
// Tavanı aşan kazanç ödenmez, kasada kalır. Kayıp net'i düşürür: kaybedip geri kazanmak serbesttir.
// Tavan günün ilk kumarında sabitlenir: kazanç piyasayı büyüttüğü için kayan tavan hiç dolmazdı.
export const KUMAR_GUNLUK_TAVAN = 0.5

const ISTANBUL_OFSET_MS = 3 * SAAT_MS

/** İstanbul'da bir sonraki gece yarısı (ms). Türkiye 2016'dan beri yaz saati uygulamıyor, ofset sabittir. */
function yarinBaslangici(now) {
  const gun = 24 * SAAT_MS
  return Math.floor((now + ISTANBUL_OFSET_MS) / gun) * gun + gun - ISTANBUL_OFSET_MS
}

function kumarGunDurumu(q, chatJid, userJid, now) {
  const satir = q.kumarGunOku.get(chatJid, userJid)
  const gun = istanbulDay(new Date(now))
  if (satir?.day === gun) return { gun, net: satir.net, tavan: satir.tavan }
  return { gun, net: 0, tavan: Math.floor(paraArzi(q, chatJid, now) * KUMAR_GUNLUK_TAVAN) }
}

/**
 * Kazancı günlük tavana göre kırpar ve günün net'ine yazar; çağıran transaction içindedir.
 * @returns {{ fark: number, kesilen: number }}  `kesilen`: tavan yüzünden ödenmeyen kazanç.
 */
function kumarTavaniUygula(q, chatJid, userJid, fark, now) {
  if (!fark || userJid === botJid) return { fark, kesilen: 0 }
  const { gun, net, tavan } = kumarGunDurumu(q, chatJid, userJid, now)
  const kesilen = fark > 0 ? Math.max(0, fark - Math.max(0, tavan - net)) : 0
  fark -= kesilen
  q.kumarGunYaz.run({ chat: chatJid, user: userJid, gun, net: net + fark, tavan })
  return { fark, kesilen }
}

let botJid = ''
let botKimlikleri = new Set()

/**
 * QR ile bağlı numarayı tanıtır. Hesap `id`'den türeyen numaralı JID'dir: bot
 * numarasından yazılan mesajlar da o satıra işlenir (`parseMessage`). `lid`
 * yalnızca etiketleri tanımak içindir, LID'li grupta etiket "...@lid" gelir.
 */
export function botHesabiniTani(user) {
  const kimlikler = [user?.id, user?.lid].filter(Boolean).map((jid) => jidNormalizedUser(jid))
  const degisti = kimlikler.length !== botKimlikleri.size || kimlikler[0] !== botJid
  botJid = kimlikler[0] ?? ''
  botKimlikleri = new Set(kimlikler)
  if (degisti) kimlikler.slice(1).forEach(botSatiriniBirlestir)
}

export function botHesabiMi(jid) {
  return botKimlikleri.has(jid)
}

/** LID'li grupta bot üye listesinde "...@lid" görünür, hesabı ise numaralı JID'dir. */
function hesapKimligi(jid) {
  return botKimlikleri.has(jid) ? botJid : jid
}

/**
 * Bot etiketlenerek yapılan eski devirler LID'e ayrı satır açtı: `.top`'ta bot iki kez
 * görünüyor, o XP kasaya da sayılmıyordu. Para ana hesaba taşınır, satırlar silinir.
 */
function botSatiriniBirlestir(lid) {
  try {
    const q = hazirla()
    if (!q) return

    getDb().transaction(() => {
      for (const { chat_jid: chat, xp } of q.kullaniciSatirlari.all(lid)) {
        if (xp) q.xpAktar.run({ chat, user: botJid, xp })
      }
      for (const { chat_jid: chat, bakiye } of q.kullaniciBankalari.all(lid)) {
        kasayaYatir(q, chat, bakiye, Date.now())
      }
      q.kullaniciSil.run(lid)
      q.kullaniciBankaSil.run(lid)
    })()
  } catch (err) {
    logger.error({ err }, 'Bot satırları birleştirilemedi')
  }
}

/**
 * Kumar kaybını, banka ve borsa kesintisini bot numarasının XP'sine ekler;
 * çağıran transaction içindedir. .vs ve .piyango buradan geçmez: orada
 * kaybedilen XP rakibe gider, bota da yazılsaydı aynı XP iki kez sayılırdı.
 * Bot numarasının kendi kaybı kendine dönmesin diye yazılmaz.
 */
function botaYaz(q, chatJid, userJid, fark) {
  if (fark >= 0 || !botJid || userJid === botJid) return
  q.xpAktar.run({ chat: chatJid, user: botJid, xp: -fark })
}

/**
 * Kumar kazancı ve kira hazineden (botun kasası) çıkar, yetmeyen kısım yeni basılır (bot sahibinin
 * kararı: hazine kumarın ve devletin ortak kasasıdır). Alan kişi her durumda tamamını alır, bu
 * fonksiyon yalnızca kasadan düşer. Çağıran transaction içindedir. @returns kasadan çıkan
 */
function hazinedenOde(q, chatJid, userJid, miktar, now) {
  if (miktar <= 0 || !botJid || userJid === botJid) return 0
  const kasadan = Math.min(miktar, kasaToplami(q, chatJid, now))
  if (kasadan > 0) kasadanCek(q, chatJid, kasadan, now)
  return Math.max(0, kasadan)
}

/**
 * Bot sahibinin elle XP vermesi/alması (.xpver). Eksi miktar XP'yi en fazla
 * sıfıra indirir, zaten eksideki bakiyeyi daha da indirmez; okuma ve yazma tek transaction'dadır.
 *
 * @returns {{ once: number, xp: number } | null}  null: veritabanı kullanılamıyor.
 */
export function xpAyarla({ chatJid, userJid, miktar, at = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    userJid = hesapKimligi(userJid)

    return getDb().transaction(() => {
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      const fark = Math.max(miktar, -Math.max(0, once))
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
 * Kredili kişi devredemez: yoksa parayı arkadaşına aktarıp borçtan kaçardı.
 * `sahipDevri`: sahip başkasının XP'sini taşıyordur, bu kural ona uygulanmaz.
 *
 * @returns {{ yetersiz: true, xp: number } | { kredili: true }
 *   | { yetersiz: false, kaynakXp: number, hedefXp: number }
 *   | null}  null: veritabanı kullanılamıyor.
 */
export function xpDevret({ chatJid, kaynak, hedef, miktar, sahipDevri = false, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    kaynak = hesapKimligi(kaynak)
    hedef = hesapKimligi(hedef)

    return getDb().transaction(() => {
      if (krediGuncelle(q, chatJid, kaynak, now) && !sahipDevri) return { kredili: true }
      const ambargo = !sahipDevri && ambargoBitisi(q, chatJid, kaynak, now)
      if (ambargo) return { ambargo }

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
export function bahisOyna({ chatJid, userJid, miktar, cevir, oyun, at = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar <= 0 || miktar > once) return { yetersiz: true, xp: once }

      const sonuc = cevir(miktar)
      const { fark, kesilen } = kumarTavaniUygula(q, chatJid, userJid, Math.floor(miktar * sonuc.carpan) - miktar, at)
      if (fark) q.xpEkle.run({ chat: chatJid, user: userJid, xp: fark, at })
      kumarKaydet(q, chatJid, userJid, fark, oyun)
      botaYaz(q, chatJid, userJid, fark)
      hazinedenOde(q, chatJid, userJid, fark, at)

      return { yetersiz: false, once, xp: once + fark, fark, kesilen, sonuc }
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
 * @returns {{ xp: number, fark: number, kesilen: number } | null}  `fark` bahse göre net sonuç,
 *   `kesilen` günlük tavan yüzünden ödenmeyen kazanç.
 */
export function kumarOde({ chatJid, userJid, bahis, odeme, oyun }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const { fark, kesilen } = kumarTavaniUygula(q, chatJid, userJid, odeme - bahis, Date.now())
      odeme = bahis + fark
      if (odeme) q.xpAktar.run({ chat: chatJid, user: userJid, xp: odeme })
      kumarKaydet(q, chatJid, userJid, fark, oyun)
      botaYaz(q, chatJid, userJid, fark)
      hazinedenOde(q, chatJid, userJid, fark, Date.now())
      return { xp: q.oku.get(chatJid, userJid)?.xp ?? 0, fark, kesilen }
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
      kumarKaydet(q, chatJid, kazanan, miktar, 'vs')
      kumarKaydet(q, chatJid, kaybeden, -miktar, 'vs')

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
        kumarKaydet(q, chatJid, b.user_jid, b.user_jid === kazanan ? havuz - b.xp : -b.xp, 'piyango')
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
      const ekstraFiyat = kurOlcegi(EKSTRA_FIYATI, anlikKur(q, chatJid, now))
      const gun = istanbulDay(new Date(now))
      const ekstraKalan = EKSTRA_GUNLUK - (q.ekstraOku.get(chatJid, userJid, gun)?.adet ?? 0)
      if (!ucretsiz && !ekstra) return { hakYok: true, yenilenme: hak.yenilenme, ekstraFiyat, ekstraKalan }
      if (!ucretsiz && ekstraKalan <= 0) return { ekstraBitti: true }
      if (!ucretsiz && once < ekstraFiyat) return { yetersiz: true, xp: once, ekstraFiyat }

      const ucret = ucretsiz ? 0 : ekstraFiyat
      if (!ucretsiz) q.ekstraYaz.run({ chat: chatJid, user: userJid, gun })
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
        ekstraKalan: ekstraKalan - (ucretsiz ? 0 : 1),
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
    const ekstra = q.ekstraOku.get(chatJid, userJid, istanbulDay(new Date(now)))?.adet ?? 0
    return {
      ...hakDurumu(kayit, now),
      bonus: aktifBonus(kayit, now),
      ekstraKalan: EKSTRA_GUNLUK - ekstra,
      ekstraFiyat: kurOlcegi(EKSTRA_FIYATI, anlikKur(q, chatJid, now)),
    }
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

/** Harcanan hak sayısı eksiye inerek fazladan hak olur. */
function soygunHakkiEkle(q, chatJid, userJid, adet, now) {
  const gun = istanbulDay(new Date(now))
  const soygun = q.soygunOku.get(chatJid, userJid)
  q.soygunYaz.run({
    chat: chatJid,
    user: userJid,
    gun,
    deneme: (soygun?.day === gun ? soygun.deneme : 0) - adet,
    korunma: soygun?.korunma_until ?? 0,
  })
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
      const fiyat = olayUygula(piyasaOlayi(chatJid, now), 'market', kurOlcegi(urun.fiyat, anlikKur(q, chatJid, now)))
      if (fiyat > xp) return { yetersiz: true, xp, fiyat }

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -fiyat })

      let bonus = null
      if (urun.tur === 'bonus') {
        bonus = bonusYaz(q, chatJid, userJid, urun.bonus, now)
      } else {
        if (urun.tur === 'unvan') unvan = urun.unvan
        if (urun.tur === 'kalkan') kalkan = Math.max(kalkan, now) + KALKAN_SURESI_MS
        q.marketYaz.run({ chat: chatJid, user: userJid, unvan, kalkan })
      }

      return { xp: xp - fiyat, kalkan, bonus }
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

      const kur = anlikKur(q, chatJid, now)
      const fiyat = kurOlcegi(kasa.fiyat, kur)
      const once = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (fiyat > once) return { yetersiz: true, xp: once, fiyat }

      if (vitrinHafta) q.vitrinYaz.run(chatJid, vitrinHafta, userJid)

      const odul = odulOlcekle(cek(), kur)
      const market = q.marketOku.get(chatJid, userJid)
      const yedekXp = odul.unvan && market?.unvan ? odul.yedekXp : 0
      const fark = (odul.xp || 0) + yedekXp - fiyat
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

      if (odul.soygunHakki) soygunHakkiEkle(q, chatJid, userJid, odul.soygunHakki, now)

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
      botaYaz(q, chatJid, userJid, -kesinti)
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
      botaYaz(q, chatJid, userJid, -kesinti)

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
function kurbanEngeli({ kalkan, korunma, kurbanXp, baslik, now }) {
  if (kalkan > now) return { engel: 'kalkan', bitis: kalkan }
  if (korunma > now) return { engel: 'korunma', bitis: korunma }
  // Eksideki kişiden alınacak bir şey yok, ödülü olsa da soyulamaz.
  if (kurbanXp < 0) return { engel: 'kurban-fakir' }
  // Başında ödül olan fakir kişi de soyulabilir, yoksa o ödül hiç alınamazdı.
  if (kurbanXp < MIN_KURBAN_XP && !baslik) return { engel: 'kurban-fakir' }
  return null
}

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
      const engel = kurbanEngeli({ kalkan, korunma: k?.korunma_until ?? 0, kurbanXp, baslik, now })
      if (engel) return engel
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

      const hapis = basarili ? null : {
        bitis: now + HAPIS_SAATI * SAAT_MS,
        kefalet: kefaletTutari(hirsizXp + yon + faizIsle(q, chatJid, hirsiz, now).hesap.bakiye),
      }
      if (hapis) q.hapisYaz.run({ chat: chatJid, user: hirsiz, ...hapis })

      return { basarili, miktar, odul, ...(hapis && { hapis }), hirsizXp: hirsizXp + yon + odul, kurbanXp: kurbanXp - yon }
    })()
  } catch (err) {
    logger.error({ err, chatJid, hirsiz, kurban }, 'Soygun yazılamadı')
    return null
  }
}

/**
 * Toplu soygun: her kurban için ayrı zar atılır. Hak coinle alındığı için yakalanmanın
 * cezası yoktur, günlük soygun hakkı da harcanmaz. Kalkan ve korunma yine geçerlidir.
 * Soyulacak kimse yoksa hak yanmaz.
 *
 * @returns {{ hakYok: true } | { hedefYok: true }
 *   | { soyulanlar: { jid: string, miktar: number, odul: number }[], kacanlar: string[], toplam: number, xp: number } | null}
 */
export function topluSoygun({ chatJid, hirsiz, kurbanlar, sans, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const coin = q.coinOku.get(chatJid, hirsiz)
      if (!coin?.toplu_hak) return { hakYok: true }

      const hedefler = kurbanlar.filter((jid) => !kurbanEngeli({
        kalkan: q.marketOku.get(chatJid, jid)?.kalkan_until ?? 0,
        korunma: q.soygunOku.get(chatJid, jid)?.korunma_until ?? 0,
        kurbanXp: q.oku.get(chatJid, jid)?.xp ?? 0,
        baslik: q.odulOku.get(chatJid, jid)?.xp ?? 0,
        now,
      }))
      if (!hedefler.length) return { hedefYok: true }

      const soyulanlar = []
      const kacanlar = []
      for (const jid of hedefler) {
        if (!sans()) {
          kacanlar.push(jid)
          continue
        }
        const miktar = soygunPayi(q.oku.get(chatJid, jid)?.xp ?? 0)
        const odul = q.odulOku.get(chatJid, jid)?.xp ?? 0
        const k = q.soygunOku.get(chatJid, jid)
        q.xpAktar.run({ chat: chatJid, user: hirsiz, xp: miktar + odul })
        q.xpAktar.run({ chat: chatJid, user: jid, xp: -miktar })
        q.soygunYaz.run({
          chat: chatJid, user: jid, gun: k?.day ?? '', deneme: k?.deneme ?? 0, korunma: now + KORUNMA_MS,
        })
        if (odul) q.odulSil.run(chatJid, jid)
        soyulanlar.push({ jid, miktar, odul })
      }

      q.coinYaz.run({ chat: chatJid, user: hirsiz, bakiye: coin.bakiye, toplu: coin.toplu_hak - 1 })
      gorevIlerlet(q, chatJid, hirsiz, 'soygun', now)

      return {
        soyulanlar,
        kacanlar,
        toplam: soyulanlar.reduce((t, s) => t + s.miktar + s.odul, 0),
        xp: q.oku.get(chatJid, hirsiz)?.xp ?? 0,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, hirsiz }, 'Toplu soygun yazılamadı')
    return null
  }
}

export function coinDurumu(chatJid, userJid) {
  try {
    const satir = hazirla()?.coinOku.get(chatJid, userJid)
    return { bakiye: satir?.bakiye ?? 0, topluHak: satir?.toplu_hak ?? 0 }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Coin durumu okunamadı')
    return { bakiye: 0, topluHak: 0 }
  }
}

/**
 * Üyelerin parası: artı cüzdanlar, bankalar ve çete kasaları. Bot hariçtir, kasa kendi faiziyle büyür.
 * Banka faizi yazılmadan hesaplanır: işlenmemiş faizi olan kişi önce ucuza coin alıp sonra
 * `.banka` yazarak kuru sıçratamasın.
 */
function paraArzi(q, chatJid, now) {
  const haric = botJid ?? ''
  const saat = Math.floor(now / SAAT_MS)
  const oran = bankaFaizi(q, chatJid)
  const banka = q.arzBanka.all(chatJid, haric).reduce((t, h) => {
    const { faiz } = h.faiz_saat
      ? faizIslet(h.bakiye, h.bekleyen, saat - h.faiz_saat, h.faiz_artik, oran)
      : { faiz: 0 }
    return t + h.bakiye + faiz
  }, 0)
  return q.arzCuzdan.get(chatJid, haric).t + banka + q.arzCete.get(chatJid).t + q.arzYatirim.get(chatJid).t + kriptoArzi(q, chatJid, now)
}

/**
 * Suly'nin XP fiyatında kullanılan kur: günün kaydı, yoksa son kayıt. Anlık kur kullanılamaz:
 * kur arzdan, arz Suly'den hesaplandığı için birbirini çağırırdı.
 */
function kriptoKuru(q, chatJid, now) {
  const gun = istanbulDay(new Date(now))
  return q.ekonomiOku.get(chatJid, gun)?.kur ?? q.ekonomiGecmis.all(chatJid, gun)[0]?.kur ?? COIN_TABAN
}

/**
 * Suly piyasaya son işlem fiyatıyla sayılır (bot sahibinin kararı): sayılmasaydı Suly alıp kuru
 * düşüren kişi ucuza coin alır, Suly'yi satıp kuru geri çıkarırdı. Botun darbeden aldığı Suly sayılmaz.
 */
function kriptoArzi(q, chatJid, now) {
  const usd = q.kriptoFiyatOku.get(SULY.sembol)?.usd
  if (!usd) return 0
  return sulyDegeri(q.arzKripto.get(chatJid, botJid ?? '').t, usd, kriptoKuru(q, chatJid, now))
}

/** Coin alışı anlık paraya bakar. Maaş, kira ve vergi günün sabit kurunu kullanır. */
function anlikKur(q, chatJid, now) {
  return coinKuru(paraArzi(q, chatJid, now))
}

/**
 * Bozdurma, anlık kurla günün kurundan düşük olanıdır: kredi çekip kuru şişiren kişi
 * coinini aynı gün şişmiş kurdan bozup XP basamasın.
 */
function bozdurmaKuru(q, chatJid, now) {
  return Math.min(anlikKur(q, chatJid, now), gununEkonomisi(q, chatJid, now).kur)
}

/** Günün kaydı: maaş, kira, vergi ve enflasyon gün içinde sabit kalsın. */
function gununEkonomisi(q, chatJid, now) {
  const gun = istanbulDay(new Date(now))
  const kayit = q.ekonomiOku.get(chatJid, gun)
  if (kayit) return kayit

  const arz = paraArzi(q, chatJid, now)
  const kur = coinKuru(arz)
  q.ekonomiYaz.run(chatJid, gun, arz, kur)
  return { arz, kur, day: gun }
}

/** @returns {{ anlik: number, arz: number, kur: number, gunKur: number, bozdurmaKur: number, kasa: number, kredi: { adet: number, toplam: number }, maas: number, dun: object | null, hafta: object | null, zenginler: object[] } | null} */
export function ekonomiDurumu({ chatJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const bugun = gununEkonomisi(q, chatJid, now)
      const gecmis = q.ekonomiGecmis.all(chatJid, istanbulDay(new Date(now)))
      return {
        anlik: paraArzi(q, chatJid, now),
        arz: bugun.arz,
        kur: anlikKur(q, chatJid, now),
        gunKur: bugun.kur,
        bozdurmaKur: bozdurmaKuru(q, chatJid, now),
        kasa: kasaToplami(q, chatJid, now),
        kredi: q.krediOzeti.get(chatJid),
        maas: q.maasOku.get(chatJid, istanbulDay(new Date(now)))?.toplam ?? 0,
        dun: gecmis[0] ?? null,
        hafta: gecmis.at(-1) ?? null,
        zenginler: q.zenginler.all(chatJid, botJid ?? ''),
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Ekonomi durumu okunamadı')
    return null
  }
}

/**
 * XP ile günün kurundan coin alır, ödenen XP yanar. Açık krediyle alınamaz: coin borç
 * tahsilatına girmediği için kredi parası coine çevrilip borçtan kaçılırdı.
 *
 * @returns {{ kredili: true } | { yetersiz: true, xp: number, ucret: number } | { bakiye: number, xp: number, ucret: number } | null}
 */
export function coinAl({ chatJid, userJid, adet, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (q.krediOku.get(chatJid, userJid)) return { kredili: true }

      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      const ucret = adet * anlikKur(q, chatJid, now)
      if (ucret > xp) return { yetersiz: true, xp, ucret }

      const coin = q.coinOku.get(chatJid, userJid)
      const bakiye = (coin?.bakiye ?? 0) + adet
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -ucret })
      q.coinYaz.run({ chat: chatJid, user: userJid, bakiye, toplu: coin?.toplu_hak ?? 0 })

      return { bakiye, xp: xp - ucret, ucret }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Coin satışı yazılamadı')
    return null
  }
}

/**
 * Coini başka üyeye aktarır, toplam coin değişmez. Borçlu (kredi ya da eksi cüzdan) devredemez:
 * coin tahsilata ve hacze girmediği için arkadaşa aktarılıp iflasla borçtan kaçılırdı.
 *
 * @returns {{ borclu: true } | { yetersiz: true, bakiye: number } | { kaynakBakiye: number, hedefBakiye: number } | null}
 */
export function coinDevret({ chatJid, kaynak, hedef, adet, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    kaynak = hesapKimligi(kaynak)
    hedef = hesapKimligi(hedef)

    return getDb().transaction(() => {
      if (borcluMu(q, chatJid, kaynak, now)) return { borclu: true }
      const ambargo = ambargoBitisi(q, chatJid, kaynak, now)
      if (ambargo) return { ambargo }

      const k = q.coinOku.get(chatJid, kaynak)
      const eldeki = k?.bakiye ?? 0
      if (adet <= 0 || adet > eldeki) return { yetersiz: true, bakiye: eldeki }

      const h = q.coinOku.get(chatJid, hedef)
      const hedefBakiye = (h?.bakiye ?? 0) + adet
      q.coinYaz.run({ chat: chatJid, user: kaynak, bakiye: eldeki - adet, toplu: k.toplu_hak })
      q.coinYaz.run({ chat: chatJid, user: hedef, bakiye: hedefBakiye, toplu: h?.toplu_hak ?? 0 })
      return { kaynakBakiye: eldeki - adet, hedefBakiye }
    })()
  } catch (err) {
    logger.error({ err, chatJid, kaynak, hedef }, 'Coin devredilemedi')
    return null
  }
}

/** @returns {{ yetersiz: true, bakiye: number } | { bakiye: number, xp: number, kazanc: number } | null} */
export function coinSat({ chatJid, userJid, adet, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const coin = q.coinOku.get(chatJid, userJid)
      const eldeki = coin?.bakiye ?? 0
      if (adet > eldeki) return { yetersiz: true, bakiye: eldeki }

      const kazanc = bozdurmaDegeri(adet, bozdurmaKuru(q, chatJid, now))
      q.coinYaz.run({ chat: chatJid, user: userJid, bakiye: eldeki - adet, toplu: coin.toplu_hak })
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: kazanc })

      return { bakiye: eldeki - adet, xp: (q.oku.get(chatJid, userJid)?.xp ?? 0), kazanc }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Coin bozdurulamadı')
    return null
  }
}

/** @returns {number} sigortanın bitişi (ms); yoksa 0. */
export function sigortaBitisi(chatJid, userJid, now = Date.now()) {
  try {
    const bitis = hazirla()?.sigortaOku.get(chatJid, userJid)?.bitis ?? 0
    return bitis > now ? bitis : 0
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Sigorta okunamadı')
    return 0
  }
}

/** Geçen saatlerin kirasını `bekleyen`e işler; çağıran transaction içindedir. */
function kiraIsle(q, chatJid, userJid, satir, mulk, now) {
  const saat = Math.floor(now / SAAT_MS)
  const { kur } = gununEkonomisi(q, chatJid, now)
  const kira = kiraHesapla(mulk, satir.adet, saat - satir.kira_saat, kur)
  const bekleyen = satir.bekleyen + olayUygula(piyasaOlayi(chatJid, now), 'kira', kira)
  return { adet: satir.adet, saat, bekleyen }
}

function mulkKaydet(q, chatJid, userJid, kod, { adet, saat, bekleyen }) {
  if (adet > 0) q.mulkYaz.run({ chat: chatJid, user: userJid, kod, adet, saat, bekleyen })
  else q.mulkSil.run(chatJid, userJid, kod)
}

/** @returns {{ yetersiz: true, bakiye: number } | { bakiye: number, adet: number } | null} */
export function mulkAl({ chatJid, userJid, mulk, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const coin = q.coinOku.get(chatJid, userJid)
      const eldeki = coin?.bakiye ?? 0
      if (mulk.fiyat > eldeki) return { yetersiz: true, bakiye: eldeki }

      const satir = q.mulkOku.get(chatJid, userJid, mulk.kod)
      const durum = satir
        ? kiraIsle(q, chatJid, userJid, satir, mulk, now)
        : { adet: 0, saat: Math.floor(now / SAAT_MS), bekleyen: 0 }
      const adet = durum.adet + 1

      q.coinYaz.run({ chat: chatJid, user: userJid, bakiye: eldeki - mulk.fiyat, toplu: coin.toplu_hak })
      mulkKaydet(q, chatJid, userJid, mulk.kod, { ...durum, adet })

      return { bakiye: eldeki - mulk.fiyat, adet }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Mülk alınamadı')
    return null
  }
}

/** Bir tane satar, birikmiş kira da ödenir. @returns {{ yok: true } | { kazanc: number, kira: number, xp: number } | null} */
export function mulkSat({ chatJid, userJid, mulk, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const satir = q.mulkOku.get(chatJid, userJid, mulk.kod)
      if (!satir) return { yok: true }

      const durum = kiraIsle(q, chatJid, userJid, satir, mulk, now)
      const kazanc = bozdurmaDegeri(mulk.fiyat, gununEkonomisi(q, chatJid, now).kur)
      mulkKaydet(q, chatJid, userJid, mulk.kod, { ...durum, adet: durum.adet - 1, bekleyen: 0 })
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: kazanc + durum.bekleyen })
      hazinedenOde(q, chatJid, userJid, durum.bekleyen, now)

      return { kazanc, kira: durum.bekleyen, xp: q.oku.get(chatJid, userJid)?.xp ?? 0 }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Mülk satılamadı')
    return null
  }
}

/** @returns {{ kira: number, xp: number } | null} */
export function kiraTopla({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      let kira = 0
      for (const satir of q.mulkleriOku.all(chatJid, userJid)) {
        const mulk = MULKLER.find((m) => m.kod === satir.kod)
        if (!mulk) continue
        const durum = kiraIsle(q, chatJid, userJid, satir, mulk, now)
        kira += durum.bekleyen
        mulkKaydet(q, chatJid, userJid, mulk.kod, { ...durum, bekleyen: 0 })
      }
      if (kira) q.xpAktar.run({ chat: chatJid, user: userJid, xp: kira })
      hazinedenOde(q, chatJid, userJid, kira, now)
      return { kira, xp: q.oku.get(chatJid, userJid)?.xp ?? 0 }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kira toplanamadı')
    return null
  }
}

/** .mülk ve .profil için; kirayı yazmadan hesaplar. */
export function mulkDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return []

    return getDb().transaction(() => q.mulkleriOku.all(chatJid, userJid).flatMap((satir) => {
      const mulk = MULKLER.find((m) => m.kod === satir.kod)
      if (!mulk) return []
      return [{ mulk, adet: satir.adet, kira: kiraIsle(q, chatJid, userJid, satir, mulk, now).bekleyen }]
    }))()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Mülk durumu okunamadı')
    return []
  }
}

/**
 * Mülkü başka üyeye verir. Birikmiş kira verende kalır: son tanesi giderse kira ona ödenir,
 * alan kirayı devir anından biriktirir. Borçlu veremez, yoksa mülk tahsilattan kaçırılırdı.
 *
 * @returns {{ borclu: true } | { yetersiz: true, adet: number } | { kaynakAdet: number, hedefAdet: number, kira: number } | null}
 */
export function mulkDevret({ chatJid, kaynak, hedef, mulk, adet = 1, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    kaynak = hesapKimligi(kaynak)
    hedef = hesapKimligi(hedef)

    return getDb().transaction(() => {
      if (borcluMu(q, chatJid, kaynak, now)) return { borclu: true }
      const ambargo = ambargoBitisi(q, chatJid, kaynak, now)
      if (ambargo) return { ambargo }

      const satir = q.mulkOku.get(chatJid, kaynak, mulk.kod)
      if (!satir || adet <= 0 || adet > satir.adet) return { yetersiz: true, adet: satir?.adet ?? 0 }

      const durum = kiraIsle(q, chatJid, kaynak, satir, mulk, now)
      const kira = durum.adet === adet ? durum.bekleyen : 0
      if (kira) {
        q.xpAktar.run({ chat: chatJid, user: kaynak, xp: kira })
        hazinedenOde(q, chatJid, kaynak, kira, now)
      }
      mulkKaydet(q, chatJid, kaynak, mulk.kod, { ...durum, adet: durum.adet - adet })

      const hedefSatir = q.mulkOku.get(chatJid, hedef, mulk.kod)
      const hedefDurum = hedefSatir
        ? kiraIsle(q, chatJid, hedef, hedefSatir, mulk, now)
        : { adet: 0, saat: Math.floor(now / SAAT_MS), bekleyen: 0 }
      mulkKaydet(q, chatJid, hedef, mulk.kod, { ...hedefDurum, adet: hedefDurum.adet + adet })

      return { kaynakAdet: durum.adet - adet, hedefAdet: hedefDurum.adet + adet, kira }
    })()
  } catch (err) {
    logger.error({ err, chatJid, kaynak, hedef }, 'Mülk devredilemedi')
    return null
  }
}

/**
 * Sahibin mülke koyduğu haciz: bir tane silinir, geri satış değeri kasaya girer.
 * Birikmiş kira sahibinde kalır.
 *
 * @returns {{ kapali: true } | { yok: true } | { kasaya: number, kalan: number } | null}
 */
export function mulkHaciz({ chatJid, userJid, mulk, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    if (!botJid) return { kapali: true }

    return getDb().transaction(() => {
      const satir = q.mulkOku.get(chatJid, userJid, mulk.kod)
      if (!satir) return { yok: true }

      const durum = kiraIsle(q, chatJid, userJid, satir, mulk, now)
      const kasaya = bozdurmaDegeri(mulk.fiyat, gununEkonomisi(q, chatJid, now).kur)
      mulkKaydet(q, chatJid, userJid, mulk.kod, { ...durum, adet: durum.adet - 1 })
      // Son mülk gidince satır silinir, kira kaybolmasın.
      if (durum.adet === 1 && durum.bekleyen) q.xpAktar.run({ chat: chatJid, user: userJid, xp: durum.bekleyen })
      kasayaYatir(q, chatJid, kasaya, now)

      return { kasaya, kalan: durum.adet - 1 }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Mülk haczedilemedi')
    return null
  }
}

/**
 * Coin marketten ürün alır; ücret ve etkisi tek transaction'dadır.
 *
 * @returns {{ zatenVar: true } | { yetersiz: true, bakiye: number } | { bakiye: number } | null}
 */
export function coinMarketAl({ chatJid, userJid, urun, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const coin = q.coinOku.get(chatJid, userJid)
      const market = q.marketOku.get(chatJid, userJid)
      const eldeki = coin?.bakiye ?? 0

      if (urun.unvan && market?.unvan === urun.unvan) return { zatenVar: true }
      if (urun.fiyat > eldeki) return { yetersiz: true, bakiye: eldeki }

      const bakiye = eldeki - urun.fiyat
      q.coinYaz.run({
        chat: chatJid, user: userJid, bakiye, toplu: (coin?.toplu_hak ?? 0) + (urun.topluHak ?? 0),
      })

      if (urun.bonus) bonusYaz(q, chatJid, userJid, urun.bonus, now)
      if (urun.soygunHakki) soygunHakkiEkle(q, chatJid, userJid, urun.soygunHakki, now)
      if (urun.sigortaMs) {
        const sigorta = q.sigortaOku.get(chatJid, userJid)?.bitis ?? 0
        q.sigortaYaz.run(chatJid, userJid, Math.max(sigorta, now) + urun.sigortaMs)
      }
      if (urun.kalkanMs || urun.unvan) {
        const kalkan = market?.kalkan_until ?? 0
        q.marketYaz.run({
          chat: chatJid,
          user: userJid,
          unvan: urun.unvan ?? market?.unvan ?? null,
          kalkan: urun.kalkanMs ? Math.max(kalkan, now) + urun.kalkanMs : kalkan,
        })
      }

      return { bakiye }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Coin market satışı yazılamadı')
    return null
  }
}

/**
 * Coinle alınan toplu haciz: herkesin payı alıcının cüzdanına geçer. Soygun değildir,
 * kalkan korumaz, sigorta korur. Alınacak para yoksa coin harcanmaz.
 *
 * @returns {{ yetersiz: true, bakiye: number } | { hedefYok: true }
 *   | { kurbanlar: { jid: string, miktar: number }[], sigortalilar: string[], toplam: number, xp: number, bakiye: number } | null}
 */
export function topluHaciz({ chatJid, userJid, kurbanlar, urun, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const coin = q.coinOku.get(chatJid, userJid)
      const eldeki = coin?.bakiye ?? 0
      if (urun.fiyat > eldeki) return { yetersiz: true, bakiye: eldeki }

      const alinanlar = []
      const sigortalilar = []
      for (const jid of kurbanlar) {
        if ((q.sigortaOku.get(chatJid, jid)?.bitis ?? 0) > now) {
          sigortalilar.push(jid)
          continue
        }
        const { hesap } = faizIsle(q, chatJid, jid, now)
        const pay = hacizPayi(hesap.bakiye, q.oku.get(chatJid, jid)?.xp ?? 0)
        if (!pay.banka && !pay.cuzdan) continue

        if (pay.banka) {
          bankaKaydet(q, chatJid, jid, {
            ...hesap, bakiye: hesap.bakiye - pay.banka, bekleyen: Math.max(0, hesap.bekleyen - pay.banka),
          })
        }
        if (pay.cuzdan) q.xpAktar.run({ chat: chatJid, user: jid, xp: -pay.cuzdan })
        alinanlar.push({ jid, miktar: pay.banka + pay.cuzdan })
      }
      if (!alinanlar.length) return { hedefYok: true }

      const toplam = alinanlar.reduce((t, k) => t + k.miktar, 0)
      const bakiye = eldeki - urun.fiyat
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: toplam })
      q.coinYaz.run({ chat: chatJid, user: userJid, bakiye, toplu: coin.toplu_hak })

      return { kurbanlar: alinanlar, sigortalilar, toplam, xp: q.oku.get(chatJid, userJid)?.xp ?? 0, bakiye }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Toplu haciz yazılamadı')
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

    return q.oku.get(chatJid, hesapKimligi(userJid)) || { ...BOS }
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

/** @returns {{ bitis: number, kefalet: number } | null} hapiste değilse null */
export function hapisDurumu(chatJid, userJid, now = Date.now()) {
  try {
    const h = hazirla()?.hapisOku.get(chatJid, userJid)
    return h && h.bitis > now ? { bitis: h.bitis, kefalet: h.kefalet } : null
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Hapis durumu okunamadı')
    return null
  }
}

export function hapistekiler(chatJid, now = Date.now()) {
  try {
    return hazirla()?.hapisListe.all(chatJid, now) ?? []
  } catch (err) {
    logger.error({ err, chatJid }, 'Hapis listesi okunamadı')
    return []
  }
}

/**
 * Kefalet botun bankasına gider. Başkası da ödeyebilir, eşi yarı fiyata öder.
 *
 * @returns {{ yok: true } | { yetersiz: true, xp: number, ucret: number }
 *   | { ucret: number, es: boolean, xp: number } | null}
 */
export function kefaletOde({ chatJid, odeyen, mahkum, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const h = q.hapisOku.get(chatJid, mahkum)
      if (!h || h.bitis <= now) return { yok: true }

      const es = q.esOku.get(chatJid, mahkum)?.es_jid === odeyen
      const ucret = es ? esKefaleti(h.kefalet) : h.kefalet
      const xp = q.oku.get(chatJid, odeyen)?.xp ?? 0
      if (xp < ucret) return { yetersiz: true, xp, ucret }

      q.xpAktar.run({ chat: chatJid, user: odeyen, xp: -ucret })
      kasayaYatir(q, chatJid, ucret, now)
      q.hapisSil.run(chatJid, mahkum)
      return { ucret, es, xp: xp - ucret }
    })()
  } catch (err) {
    logger.error({ err, chatJid, mahkum }, 'Kefalet yazılamadı')
    return null
  }
}

/**
 * Süresi dolan seçimleri kapatır, her makam için ayrı. Kazanan en çok oyu alandır (en az 1 oy),
 * yenisi seçilene kadar makamda kalır. Bot kendiliğinden yazmadığı için her seçim okumasında çalışır,
 * `.seçim` ayrıca süre dolunca sonucu duyurur. Darbe ya da kayyum varken (kalici) o makamın seçimi işlenmez.
 * Çağıran transaction içindedir.
 *
 * @returns {{ makam: string, user_jid: string | null, oy: number }[]} kapanan seçimler; kazanan yoksa user_jid null
 */
function secimKapat(q, chatJid, now) {
  const kapananlar = []

  for (const { makam, baslangic } of q.makamSecimler.all(chatJid)) {
    if (now < baslangic + SECIM_SURE_MS) continue
    const anahtar = String(baslangic)
    const [ilk] = q.makamAdaylar.all(chatJid, anahtar, makam)
    const askida = q.makamOku.get(chatJid, makam)?.kalici
    if (ilk?.oy && !askida) {
      q.makamYaz.run({ chat: chatJid, makam, user: ilk.user_jid, kalici: 0 })
      kapananlar.push({ makam, ...ilk })
    } else {
      kapananlar.push({ makam, user_jid: null, oy: 0 })
    }
    q.makamAdaySil.run(chatJid, anahtar, makam)
    q.makamOySil.run(chatJid, anahtar, makam)
    q.makamSecimSil.run(chatJid, makam)
  }
  return kapananlar
}

/** Açık seçimin anahtarı; seçim yoksa null. Çağıran secimKapat'ı önce çağırmış olmalı. */
function acikSecim(q, chatJid, makam) {
  const s = q.makamSecimOku.get(chatJid, makam)
  return s ? { anahtar: String(s.baslangic), bitis: s.baslangic + SECIM_SURE_MS } : null
}

function makamSahibi(q, chatJid, makam) {
  return q.makamOku.get(chatJid, makam)?.user_jid ?? null
}

function gorevdekiBaskan(q, chatJid) {
  return makamSahibi(q, chatJid, 'baskan')
}

/** Süresi dolan seçimleri kapatır; `.seçim`'in zamanlayıcısı sonucu duyurmak için çağırır. @returns {object[] | null} */
export function secimleriKapat({ chatJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    return getDb().transaction(() => secimKapat(q, chatJid, now))()
  } catch (err) {
    logger.error({ err, chatJid }, 'Seçim kapatılamadı')
    return null
  }
}

/**
 * Makam satırı yoksa başkan bot sahibidir; bunu komut katmanı gösterir, burada `sahip` null'dır.
 * `secimler[kod]` açık seçimdir: { bitis, adaylar, oyVerdi } ya da null.
 *
 * @returns {{ yeniler: object[], yeniBaskan: object | null, makamlar: object[], secimler: Record<string, object | null>,
 *   ucret: number, darbe: boolean } | null}
 */
export function secimDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const yeniler = secimKapat(q, chatJid, now).filter((k) => k.user_jid)
      const secimler = {}
      for (const m of MAKAMLAR) {
        const s = acikSecim(q, chatJid, m.kod)
        secimler[m.kod] = s && {
          bitis: s.bitis,
          adaylar: q.makamAdaylar.all(chatJid, s.anahtar, m.kod),
          oyVerdi: Boolean(q.makamOyVar.get(chatJid, s.anahtar, m.kod, userJid)),
        }
      }
      return {
        yeniler,
        yeniBaskan: yeniler.find((y) => y.makam === 'baskan') ?? null,
        makamlar: MAKAMLAR.map((m) => ({ kod: m.kod, sahip: makamSahibi(q, chatJid, m.kod), askida: Boolean(q.makamOku.get(chatJid, m.kod)?.kalici) })),
        secimler,
        ucret: adaylikUcreti(gununEkonomisi(q, chatJid, now).kur),
        darbe: Boolean(q.makamOku.get(chatJid, 'baskan')?.kalici),
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Seçim okunamadı')
    return null
  }
}

/**
 * Makamda açık seçim yoksa bu adaylık seçimi başlatır (`basladi`).
 *
 * @returns {{ askida: true } | { zaten: true } | { yetersiz: true, xp: number, ucret: number } |
 *   { ucret: number, xp: number, bitis: number, basladi: boolean } | null}
 */
export function adayOl({ chatJid, userJid, makam = 'baskan', now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      if (q.makamOku.get(chatJid, makam)?.kalici) return { askida: true }
      const acik = acikSecim(q, chatJid, makam)
      if (acik && q.makamAday.get(chatJid, acik.anahtar, makam, userJid)) return { zaten: true }

      const ucret = adaylikUcreti(gununEkonomisi(q, chatJid, now).kur)
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (xp < ucret) return { yetersiz: true, xp, ucret }

      if (!acik) q.makamSecimYaz.run(chatJid, makam, now)
      const secim = acik ?? { anahtar: String(now), bitis: now + SECIM_SURE_MS }
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -ucret })
      q.makamAdayYaz.run(chatJid, secim.anahtar, makam, userJid, now)
      return { ucret, xp: xp - ucret, bitis: secim.bitis, basladi: !acik }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Adaylık yazılamadı')
    return null
  }
}

/**
 * Seçim başına makamda tek oy, değiştirilemez. Ücret yanar: oy satın alınamaz, yalnızca bedeli vardır.
 *
 * @returns {{ askida: true } | { secimYok: true } | { adayDegil: true } | { zaten: true } | { yetersiz: true, xp: number } |
 *   { xp: number, bitis: number } | null}
 */
export function oyVer({ chatJid, secmen, aday, makam = 'baskan', now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      if (q.makamOku.get(chatJid, makam)?.kalici) return { askida: true }
      const acik = acikSecim(q, chatJid, makam)
      if (!acik) return { secimYok: true }
      if (!q.makamAday.get(chatJid, acik.anahtar, makam, aday)) return { adayDegil: true }
      if (q.makamOyVar.get(chatJid, acik.anahtar, makam, secmen)) return { zaten: true }

      const xp = q.oku.get(chatJid, secmen)?.xp ?? 0
      if (xp < OY_UCRETI) return { yetersiz: true, xp }

      q.xpAktar.run({ chat: chatJid, user: secmen, xp: -OY_UCRETI })
      q.makamOyYaz.run(chatJid, acik.anahtar, makam, secmen)
      q.makamOyEkle.run(chatJid, acik.anahtar, makam, aday)
      return { xp: xp - OY_UCRETI, bitis: acik.bitis }
    })()
  } catch (err) {
    logger.error({ err, chatJid, secmen }, 'Oy yazılamadı')
    return null
  }
}

export function makamMi(chatJid, userJid, makam, now = Date.now()) {
  try {
    const q = hazirla()
    if (!q) return false

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      return makamSahibi(q, chatJid, makam) === userJid
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid, makam }, 'Makam okunamadı')
    return false
  }
}

export const baskanMi = (chatJid, userJid, now = Date.now()) => makamMi(chatJid, userJid, 'baskan', now)

/**
 * Bakanlık yetkisi, makam başına günde BAKAN_GUNLUK kez. Hedef engeli (hapiste değil, zaten hapiste,
 * zaten ambargolu) hakkı yakmaz. Makama yeni gelen sayaca sıfırdan başlar.
 *
 * @returns {{ degil: true } | { bugunVar: true } | { hapisteDegil: true } | { zatenHapiste: true } |
 *   { zatenAmbargo: number } | ({ af: true } | { tutuklama: { bitis: number, kefalet: number } } | { kalkan: number } |
 *   { ambargo: number }) & { kalan: number } | null}
 */
export function bakanYetkisi({ chatJid, userJid, makam, hedef, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    const tanim = makamKoduyla(makam)
    if (!tanim?.yetki) return { degil: true }

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      const satir = q.makamOku.get(chatJid, makam)
      if (satir?.user_jid !== userJid) return { degil: true }
      const gun = istanbulDay(new Date(now))
      const hak = q.bakanHakOku.get(chatJid, makam)
      const kullanilan = hak?.day === gun && hak.user_jid === userJid ? hak.adet : 0
      if (kullanilan >= BAKAN_GUNLUK) return { bugunVar: true }

      const hapis = q.hapisOku.get(chatJid, hedef)
      const hapiste = hapis && hapis.bitis > now
      let sonuc

      if (tanim.yetki === 'af') {
        if (!hapiste) return { hapisteDegil: true }
        q.hapisSil.run(chatJid, hedef)
        sonuc = { af: true }
      } else if (tanim.yetki === 'tutukla') {
        if (hapiste) return { zatenHapiste: true }
        const servet = Math.max(0, q.oku.get(chatJid, hedef)?.xp ?? 0) + faizIsle(q, chatJid, hedef, now).hesap.bakiye
        const tutuklama = { bitis: now + TUTUKLAMA_SAATI * SAAT_MS, kefalet: kefaletTutari(servet) }
        q.hapisYaz.run({ chat: chatJid, user: hedef, ...tutuklama })
        sonuc = { tutuklama }
      } else if (tanim.yetki === 'ambargo') {
        const bitis = q.ambargoOku.get(chatJid, hedef)?.bitis ?? 0
        if (bitis > now) return { zatenAmbargo: bitis }
        q.ambargoYaz.run(chatJid, hedef, now + AMBARGO_MS)
        sonuc = { ambargo: now + AMBARGO_MS }
      } else {
        const market = q.marketOku.get(chatJid, hedef)
        const kalkan = Math.max(market?.kalkan_until ?? 0, now + KALKAN_MS)
        q.marketYaz.run({ chat: chatJid, user: hedef, unvan: market?.unvan ?? null, kalkan })
        sonuc = { kalkan }
      }

      q.bakanHakYaz.run(chatJid, makam, userJid, gun, kullanilan + 1)
      return { ...sonuc, kalan: BAKAN_GUNLUK - kullanilan - 1 }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid, makam }, 'Bakan yetkisi kullanılamadı')
    return null
  }
}

/** Bugünkü aktarım durumu; `.hazine` gösterir. Çağıran transaction içindedir. */
function hazineBugun(q, chatJid, now) {
  const gun = istanbulDay(new Date(now))
  const satirlar = q.hazineBugun.all(chatJid, gun)
  // Kişi başı sınır anlık piyasaya bakar (bot sahibinin kararı): günün açılışı hiperenflasyonda çok geride kalıyordu.
  const limit = hazineLimiti(paraArzi(q, chatJid, now))
  const kullanilan = satirlar.reduce((t, s) => t + s.miktar, 0)
  return { gun, satirlar, limit, kullanilan, kasa: kasaToplami(q, chatJid, now) }
}

/** @returns {{ kasa: number, limit: number, kullanilan: number, kisiler: string[], baskan: string | null, darbe: boolean } | null} */
export function hazineDurumu({ chatJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q || !botJid) return null

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      const h = hazineBugun(q, chatJid, now)
      return {
        kasa: h.kasa, limit: h.limit, kullanilan: h.kullanilan,
        kisiler: h.satirlar.map((s) => s.user_jid),
        baskan: gorevdekiBaskan(q, chatJid),
        darbe: Boolean(q.makamOku.get(chatJid, 'baskan')?.kalici),
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Hazine okunamadı')
    return null
  }
}

/**
 * Başkan hazineden (botun kasası) aktarır: günde en çok HAZINE_KISI kişi, kişi başı anlık
 * piyasanın HAZINE_YUZDESI'si. Başkan kendine aktaramaz. `sahip` bot sahibidir, başkan gibi sayılır.
 *
 * @returns {{ degil: true } | { kendine: true } | { kisiSiniri: true } | { limit: number, kalan: number } |
 *   { kasaYetersiz: true, kasa: number } | { miktar: number, kalan: number, kisi: number } | null}
 */
export function hazineAktar({ chatJid, userJid, hedef, miktar, sahip = false, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q || !botJid) return null

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      if (!sahip && gorevdekiBaskan(q, chatJid) !== userJid) return { degil: true }
      if (hedef === userJid) return { kendine: true }

      const h = hazineBugun(q, chatJid, now)
      const kisiler = new Set(h.satirlar.map((s) => s.user_jid))
      if (!kisiler.has(hedef) && kisiler.size >= HAZINE_KISI) return { kisiSiniri: true }
      const verilen = h.satirlar.find((s) => s.user_jid === hedef)?.miktar ?? 0
      const kalan = Math.max(0, h.limit - verilen)
      if (miktar > kalan) return { limit: h.limit, kalan }
      if (miktar > h.kasa) return { kasaYetersiz: true, kasa: h.kasa }

      kasadanCek(q, chatJid, miktar, now)
      q.xpAktar.run({ chat: chatJid, user: hedef, xp: miktar })
      q.hazineYaz.run(chatJid, h.gun, hedef, miktar)
      q.hazineEskiSil.run(chatJid, h.gun)
      kisiler.add(hedef)
      return { miktar, kalan: kalan - miktar, kisi: kisiler.size }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Hazine aktarımı yazılamadı')
    return null
  }
}

/**
 * Darbe başlar başlamaz yönetim darbeciye geçer, başkan seçimi askıya alınır.
 *
 * @returns {{ odul: number, kasa: number } | null}
 */
export function darbeBaslat({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q || !botJid) return null

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      q.makamYaz.run({ chat: chatJid, makam: 'baskan', user: userJid, kalici: 1 })
      return { odul: darbeOdulu(gununEkonomisi(q, chatJid, now).kur), kasa: kasaToplami(q, chatJid, now) }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Darbe başlatılamadı')
    return null
  }
}

/**
 * Destekçiye hazineden ödül, muhalife el koyma: banka ve cüzdanın %60'ı hazineye, coin ve Suly'nin %60'ı ile
 * mülklerin 3'te 2'si bot hesabına geçer. Sonra borsa çöker. Bot hariçtir. Sigorta ve kalkan korumaz.
 *
 * @returns {{ destek: { jid: string, odul: number }[], ceza: object[], borsa: { kod: string, dusus: number }[] } | null}
 */
export function darbeSonuc({ chatJid, destekciler, muhalifler, odul, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q || !botJid) return null

    return getDb().transaction(() => {
      const ceza = []
      for (const jid of muhalifler) {
        if (botKimlikleri.has(jid)) continue
        const { hesap } = faizIsle(q, chatJid, jid, now)
        const c = darbeCezasi({
          banka: hesap.bakiye,
          cuzdan: q.oku.get(chatJid, jid)?.xp ?? 0,
          coin: q.coinOku.get(chatJid, jid)?.bakiye ?? 0,
          suly: q.kriptoOku.get(chatJid, jid)?.birim ?? 0,
          mulkler: q.mulkleriOku.all(chatJid, jid).map((m) => ({ ...m, fiyat: MULKLER.find((x) => x.kod === m.kod)?.fiyat ?? 0 })),
        })

        if (c.banka) {
          const bakiye = hesap.bakiye - c.banka
          bankaKaydet(q, chatJid, jid, { ...hesap, bakiye, bekleyen: Math.min(hesap.bekleyen ?? 0, bakiye) })
        }
        if (c.cuzdan) q.xpAktar.run({ chat: chatJid, user: jid, xp: -c.cuzdan })
        kasayaYatir(q, chatJid, c.banka + c.cuzdan, now)

        if (c.coin) {
          const coin = q.coinOku.get(chatJid, jid)
          q.coinYaz.run({ chat: chatJid, user: jid, bakiye: coin.bakiye - c.coin, toplu: coin.toplu_hak })
          const botCoin = q.coinOku.get(chatJid, botJid)
          q.coinYaz.run({ chat: chatJid, user: botJid, bakiye: (botCoin?.bakiye ?? 0) + c.coin, toplu: botCoin?.toplu_hak ?? 0 })
        }
        if (c.suly) {
          const kalan = q.kriptoOku.get(chatJid, jid).birim - c.suly
          if (kalan > 0) q.kriptoYaz.run(chatJid, jid, kalan)
          else q.kriptoSil.run(chatJid, jid)
          q.kriptoYaz.run(chatJid, botJid, (q.kriptoOku.get(chatJid, botJid)?.birim ?? 0) + c.suly)
        }
        // Birikmiş kira eski sahibinde kalır; bot kirayı alınan andan itibaren biriktirir.
        for (const m of c.mulkler) {
          const mulk = MULKLER.find((x) => x.kod === m.kod)
          const durum = kiraIsle(q, chatJid, jid, q.mulkOku.get(chatJid, jid, m.kod), mulk, now)
          if (durum.adet === m.adet && durum.bekleyen) q.xpAktar.run({ chat: chatJid, user: jid, xp: durum.bekleyen })
          mulkKaydet(q, chatJid, jid, m.kod, { ...durum, adet: durum.adet - m.adet })

          const botSatir = q.mulkOku.get(chatJid, botJid, m.kod)
          const botDurum = botSatir
            ? kiraIsle(q, chatJid, botJid, botSatir, mulk, now)
            : { adet: 0, saat: Math.floor(now / SAAT_MS), bekleyen: 0 }
          mulkKaydet(q, chatJid, botJid, m.kod, { ...botDurum, adet: botDurum.adet + m.adet })
        }

        ceza.push({ jid, ...c })
      }

      const borsa = darbeBorsaCokusu(q, chatJid, now)

      const destek = []
      for (const jid of destekciler) {
        if (botKimlikleri.has(jid)) continue
        const pay = Math.min(odul, kasaToplami(q, chatJid, now))
        if (pay > 0) {
          kasadanCek(q, chatJid, pay, now)
          q.xpAktar.run({ chat: chatJid, user: jid, xp: pay })
        }
        destek.push({ jid, odul: Math.max(0, pay) })
      }

      return { destek, ceza, borsa }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Darbe sonucu yazılamadı')
    return null
  }
}

/** Darbe şoku: borsa bugüne getirilir, her hisse %45-55 düşer; çağıran transaction içindedir. */
function darbeBorsaCokusu(q, chatJid, now, rnd = randomInt) {
  const adim = Math.floor(now / ADIM_MS)
  return borsaGuncelle(q, chatJid, now).map((h) => {
    const dusus = rnd(DARBE_BORSA_DUSUS[0], DARBE_BORSA_DUSUS[1] + 1)
    let fiyat = (h.fiyat * (100 - dusus)) / 100
    let haber = `🪖 Darbe şoku: ${h.ad} çakıldı`
    if (fiyat < IFLAS_FIYATI) {
      q.portfoyBatir.run(chatJid, h.kod)
      fiyat = BASLANGIC_FIYATI
      haber = `${h.ad} darbede battı`
    }
    q.borsaYaz.run({
      chat: chatJid, hisse: h.kod, fiyat, onceki: h.fiyat, adim, haber, haberAdim: adim,
    })
    return { kod: h.kod, ad: h.ad, dusus }
  })
}

/**
 * Darbeyi sona erdirir: başkan ve kayyumlar yerinde kalır, bütün seçimler yeniden açılır.
 * @returns {boolean | null} başkan seçimi askıda mıydı
 */
export function darbeBitir({ chatJid }) {
  try {
    const q = hazirla()
    if (!q) return null
    return getDb().transaction(() => {
      const darbe = Boolean(q.makamOku.get(chatJid, 'baskan')?.kalici)
      q.makamKaliciHepsi.run(chatJid)
      return darbe
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Darbe bitirilemedi')
    return null
  }
}

/**
 * Başkan bir bakanlığa kayyum atar: makam hemen hedefe geçer, o makamın seçimi askıya alınır,
 * açık seçim iptal olur (adaylık ve oy ücretleri yanar). Yetki denetimi komut katmanındadır.
 *
 * @returns {{ degil: true } | { zaten: true } | { onceki: string | null, iptal: boolean } | null}
 */
export function kayyumAta({ chatJid, makam, hedef, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    if (!makamKoduyla(makam)?.yetki) return { degil: true }

    return getDb().transaction(() => {
      secimKapat(q, chatJid, now)
      const satir = q.makamOku.get(chatJid, makam)
      if (satir?.user_jid === hedef && satir.kalici) return { zaten: true }

      const acik = acikSecim(q, chatJid, makam)
      if (acik) {
        q.makamAdaySil.run(chatJid, acik.anahtar, makam)
        q.makamOySil.run(chatJid, acik.anahtar, makam)
        q.makamSecimSil.run(chatJid, makam)
      }
      q.makamYaz.run({ chat: chatJid, makam, user: hedef, kalici: 1 })
      return { onceki: satir && satir.user_jid !== hedef ? satir.user_jid : null, iptal: Boolean(acik) }
    })()
  } catch (err) {
    logger.error({ err, chatJid, makam }, 'Kayyum atanamadı')
    return null
  }
}

/** Kayyumu kaldırır: kişi makamda kalır, seçim yeniden açılır. @returns {{ kayyumYok: true } | { sahip: string } | null} */
export function kayyumKaldir({ chatJid, makam }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const satir = q.makamOku.get(chatJid, makam)
      if (!satir?.kalici || !makamKoduyla(makam)?.yetki) return { kayyumYok: true }
      q.makamKalici.run(0, chatJid, makam)
      return { sahip: satir.user_jid }
    })()
  } catch (err) {
    logger.error({ err, chatJid, makam }, 'Kayyum kaldırılamadı')
    return null
  }
}

/** Ambargonun bitişi; ambargo yoksa 0. Çağıran transaction içindedir. */
function ambargoBitisi(q, chatJid, userJid, now) {
  const bitis = q.ambargoOku.get(chatJid, userJid)?.bitis ?? 0
  return bitis > now ? bitis : 0
}

/** @returns {{ es_jid: string, tarih: number } | null} */
export function esBul(chatJid, userJid) {
  try {
    return hazirla()?.esOku.get(chatJid, userJid) ?? null
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Eş okunamadı')
    return null
  }
}

/** @returns {{ evli: string } | { tamam: true } | null} */
export function evlen({ chatJid, a, b, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const evli = [a, b].find((jid) => q.esOku.get(chatJid, jid))
      if (evli) return { evli }

      q.esYaz.run(chatJid, a, b, now)
      q.esYaz.run(chatJid, b, a, now)
      return { tamam: true }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Evlilik yazılamadı')
    return null
  }
}

/** Kredi ya da eksi cüzdan varken para başkasına geçmesin: `.devret` kapısıyla aynı. Çağıran transaction içindedir. */
function borcluMu(q, chatJid, userJid, now) {
  return Boolean(krediGuncelle(q, chatJid, userJid, now)) || (q.oku.get(chatJid, userJid)?.xp ?? 0) < 0
}

/**
 * Boşanmayı isteyen, cüzdan ve bankasının toplamından nafaka öder; önce cüzdandan alınır.
 * Borçluyken kapalıdır, yoksa evlenip boşanarak para borçtan kaçırılırdı.
 *
 * @returns {{ bekar: true } | { borclu: true } | { onayGerek: true, nafaka: number, es: string }
 *   | { nafaka: number, es: string, xp: number } | null}
 */
export function bosan({ chatJid, userJid, onay = false, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const evlilik = q.esOku.get(chatJid, userJid)
      if (!evlilik) return { bekar: true }
      if (borcluMu(q, chatJid, userJid, now)) return { borclu: true }

      const es = evlilik.es_jid
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      const { hesap } = faizIsle(q, chatJid, userJid, now)
      const nafaka = nafakaTutari(xp + hesap.bakiye)
      if (!onay) return { onayGerek: true, nafaka, es }

      const cuzdandan = Math.min(xp, nafaka)
      const bankadan = nafaka - cuzdandan
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -cuzdandan })
      bankaKaydet(q, chatJid, userJid, {
        ...hesap, bakiye: hesap.bakiye - bankadan, bekleyen: Math.max(0, hesap.bekleyen - bankadan),
      })
      q.xpAktar.run({ chat: chatJid, user: es, xp: nafaka })
      q.esSil.run(chatJid, userJid)
      q.esSil.run(chatJid, es)

      return { nafaka, es, xp: xp - cuzdandan }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Boşanma yazılamadı')
    return null
  }
}

/** Bot kendiliğinden yazmadığı için süresi dolan kariyer, kişinin ilk meslek okumasında kapanır. */
function aktifMeslek(q, chatJid, userJid, now) {
  const m = q.meslekOku.get(chatJid, userJid)
  const saat = meslekKoduyla(m?.kod)?.kariyerSaati
  if (!saat || now < m.secim + saat * SAAT_MS) return m

  q.meslekBitenYaz.run(chatJid, userJid, m.kod)
  q.meslekSil.run(chatJid, userJid)
  return undefined
}

/** @returns {{ meslek: object, sonraki: number, kariyerBitis: number } | null} kariyerBitis: süresiz meslekte 0. */
export function meslekDurumu(chatJid, userJid, now = Date.now()) {
  try {
    const q = hazirla()
    const m = q && aktifMeslek(q, chatJid, userJid, now)
    const meslek = m && meslekKoduyla(m.kod)
    if (!meslek) return null
    return {
      meslek,
      sonraki: m.son_calisma + CALISMA_DAKIKASI * 60_000,
      kariyerBitis: meslek.kariyerSaati ? m.secim + meslek.kariyerSaati * SAAT_MS : 0,
    }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Meslek okunamadı')
    return null
  }
}

/** Değiştirmek son çalışma anını sıfırlamaz, yoksa meslek değiştirerek bekleme atlanırdı. */
export function meslekSec({ chatJid, userJid, meslek, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const m = aktifMeslek(q, chatJid, userJid, now)
      if (m?.kod === meslek.kod) return { ayni: true }
      if (meslek.kariyerSaati && q.meslekBitenOku.get(chatJid, userJid, meslek.kod)) return { hakBitti: true }

      const bitis = (m?.secim ?? 0) + MESLEK_DEGISIM_SAATI * SAAT_MS
      if (m && bitis > now) return { bekle: true, bitis }

      if (meslekKoduyla(m?.kod)?.kariyerSaati) q.meslekBitenYaz.run(chatJid, userJid, m.kod)
      q.meslekYaz.run({ chat: chatJid, user: userJid, kod: meslek.kod, secim: now, son: m?.son_calisma ?? 0 })
      return { tamam: true }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Meslek yazılamadı')
    return null
  }
}

/**
 * Meslekten çıkar. Satır silinmez, `ISSIZ` yazılır: silinseydi istifa edip hemen yeni meslek
 * seçerek değişim beklemesi atlanırdı. Kariyerli meslekte (futbolcu) istifa kariyeri bitirir,
 * o meslek bir daha seçilemez; süresi dolan kariyer gibi yeni meslek hemen seçilir.
 *
 * @returns {{ yok: true } | { meslek: object, sonraki: number } | null}  sonraki: yeni meslek seçilebilecek an.
 */
export function meslekIstifa({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const m = aktifMeslek(q, chatJid, userJid, now)
      const meslek = m && meslekKoduyla(m.kod)
      if (!meslek) return { yok: true }

      if (meslek.kariyerSaati) {
        q.meslekBitenYaz.run(chatJid, userJid, m.kod)
        q.meslekSil.run(chatJid, userJid)
        return { meslek, sonraki: now }
      }

      q.meslekYaz.run({ chat: chatJid, user: userJid, kod: ISSIZ, secim: m.secim, son: m.son_calisma })
      return { meslek, sonraki: Math.max(now, m.secim + MESLEK_DEGISIM_SAATI * SAAT_MS) }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'İstifa yazılamadı')
    return null
  }
}

/**
 * Maaş coin kuruna bağlıdır, XP basar. `addXp`'den geçmez: çark bonusu oyun ödülü içindir.
 * Sezon puanı da yazılmaz, yoksa maaş mesaj ve oyun puanlarını ezerdi.
 *
 * @returns {{ meslekYok: true } | { kariyerBitti: object } | { hapis: number } | { bekle: number }
 *   | { meslek: object, maas: number, esBonusu: number, xp: number } | null}
 */
export function calis({ chatJid, userJid, rnd, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const onceki = q.meslekOku.get(chatJid, userJid)
      const m = aktifMeslek(q, chatJid, userJid, now)
      if (onceki && !m) return { kariyerBitti: meslekKoduyla(onceki.kod) }

      const meslek = m && meslekKoduyla(m.kod)
      if (!meslek) return { meslekYok: true }

      const hapis = q.hapisOku.get(chatJid, userJid)?.bitis ?? 0
      if (hapis > now) return { hapis }

      const sonraki = m.son_calisma + CALISMA_DAKIKASI * 60_000
      if (sonraki > now) return { bekle: sonraki }

      const maas = olayUygula(piyasaOlayi(chatJid, now), 'maas', maasHesapla(gununEkonomisi(q, chatJid, now).kur, meslek, rnd))
      const esBonusu = q.esOku.get(chatJid, userJid) ? Math.floor((maas * EVLI_MAAS_YUZDESI) / 100) : 0

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: maas + esBonusu })
      q.maasEkle.run(chatJid, istanbulDay(new Date(now)), maas + esBonusu)
      q.meslekYaz.run({ chat: chatJid, user: userJid, kod: m.kod, secim: m.secim, son: now })
      return { meslek, maas, esBonusu, xp: q.oku.get(chatJid, userJid).xp }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Maaş yazılamadı')
    return null
  }
}

/** Kişinin çetesi; üye değilse null. Çağıran transaction içindedir. */
function ceteBul(q, chatJid, userJid) {
  const uye = q.ceteUyeOku.get(chatJid, userJid)
  return uye ? q.ceteOku.get(chatJid, uye.anahtar) : null
}

/** @returns {{ cete: object | null, uyeler: string[], siralama: object[], ucret: number } | null} */
export function ceteDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const cete = ceteBul(q, chatJid, userJid) ?? null
      return {
        cete,
        uyeler: cete ? q.ceteUyeleri.all(chatJid, cete.anahtar).map((u) => u.user_jid) : [],
        siralama: q.ceteSira.all(haftaAnahtari(new Date(now)), chatJid),
        ucret: kurulusUcreti(gununEkonomisi(q, chatJid, now).kur),
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Çete okunamadı')
    return null
  }
}

/** Kuruluş ücreti yanar. @returns {{ uye: true } | { adVar: true } | { yetersiz: true, xp: number, ucret: number } | { ucret: number, xp: number } | null} */
export function ceteKur({ chatJid, userJid, ad, anahtar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (q.ceteUyeOku.get(chatJid, userJid)) return { uye: true }
      if (q.ceteOku.get(chatJid, anahtar)) return { adVar: true }

      const ucret = kurulusUcreti(gununEkonomisi(q, chatJid, now).kur)
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (xp < ucret) return { yetersiz: true, xp, ucret }

      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -ucret })
      q.ceteYaz.run(chatJid, anahtar, ad, userJid)
      q.ceteUyeYaz.run(chatJid, userJid, anahtar, now)
      return { ucret, xp: xp - ucret }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çete kurulamadı')
    return null
  }
}

/** @returns {{ uye: true } | { yok: true } | { dolu: true } | { ad: string } | null} */
export function ceteKatil({ chatJid, userJid, anahtar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (q.ceteUyeOku.get(chatJid, userJid)) return { uye: true }
      const cete = q.ceteOku.get(chatJid, anahtar)
      if (!cete) return { yok: true }
      if (q.ceteUyeleri.all(chatJid, anahtar).length >= AZAMI_UYE) return { dolu: true }

      q.ceteUyeYaz.run(chatJid, userJid, anahtar, now)
      return { ad: cete.ad }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çeteye katılınamadı')
    return null
  }
}

/** Üyeyi çıkarır; lider giderse en eski üye lider olur, son kişi giderse kasa ona döner. Çağıran transaction içindedir. */
function ceteAyrilt(q, chatJid, userJid, cete) {
  q.ceteUyeSil.run(chatJid, userJid)
  const [yeniLider] = q.ceteUyeleri.all(chatJid, cete.anahtar)

  if (!yeniLider) {
    q.xpAktar.run({ chat: chatJid, user: userJid, xp: cete.kasa })
    q.ceteSil.run(chatJid, cete.anahtar)
    return { kapandi: true, iade: cete.kasa }
  }
  if (cete.lider !== userJid) return { ayrildi: true }

  q.ceteLiderYaz.run(yeniLider.user_jid, chatJid, cete.anahtar)
  return { yeniLider: yeniLider.user_jid }
}

/** @returns {{ yok: true } | { kapandi: true, iade: number } | { yeniLider: string } | { ayrildi: true } | null} */
export function ceteAyril({ chatJid, userJid }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const cete = ceteBul(q, chatJid, userJid)
      return cete ? ceteAyrilt(q, chatJid, userJid, cete) : { yok: true }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çeteden ayrılınamadı')
    return null
  }
}

/** @returns {{ yok: true } | { liderDegil: true } | { uyeDegil: true } | { atildi: true } | null} */
export function ceteAt({ chatJid, lider, hedef }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const cete = ceteBul(q, chatJid, lider)
      if (!cete) return { yok: true }
      if (cete.lider !== lider) return { liderDegil: true }
      if (hedef === lider || q.ceteUyeOku.get(chatJid, hedef)?.anahtar !== cete.anahtar) return { uyeDegil: true }

      q.ceteUyeSil.run(chatJid, hedef)
      return { atildi: true }
    })()
  } catch (err) {
    logger.error({ err, chatJid, lider }, 'Çeteden atılamadı')
    return null
  }
}

/**
 * Kesinti bota gider. Kasa faiz almaz, vergi ve hacizden muaftır; kesinti olmasaydı parayı
 * saklamanın bedavası olurdu. Borçlu yatıramaz, yoksa para tahsilattan kaçırılırdı.
 *
 * @returns {{ yok: true } | { borclu: true } | { yetersiz: true, xp: number }
 *   | { kesinti: number, kasa: number, xp: number } | null}
 */
export function ceteYatir({ chatJid, userJid, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const cete = ceteBul(q, chatJid, userJid)
      if (!cete) return { yok: true }
      if (borcluMu(q, chatJid, userJid, now)) return { borclu: true }

      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (miktar > xp) return { yetersiz: true, xp }

      const kesinti = Math.floor((miktar * KASA_KESINTI_YUZDESI) / 100)
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      botaYaz(q, chatJid, userJid, -kesinti)
      q.ceteKasa.run(miktar - kesinti, chatJid, cete.anahtar)
      return { kesinti, kasa: cete.kasa + miktar - kesinti, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çete kasasına yatırılamadı')
    return null
  }
}

/** @returns {{ yok: true } | { liderDegil: true } | { yetersiz: true, kasa: number } | { kasa: number, xp: number } | null} */
export function ceteCek({ chatJid, userJid, miktar }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const cete = ceteBul(q, chatJid, userJid)
      if (!cete) return { yok: true }
      if (cete.lider !== userJid) return { liderDegil: true }
      if (miktar > cete.kasa) return { yetersiz: true, kasa: cete.kasa }

      q.ceteKasa.run(-miktar, chatJid, cete.anahtar)
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: miktar })
      return { kasa: cete.kasa - miktar, xp: q.oku.get(chatJid, userJid).xp }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Çete kasasından çekilemedi')
    return null
  }
}

/**
 * Harç peşin kesilir ve bota gider, dava düşse de iade edilmez. Davacı kaybederse aynı
 * miktarı öder, bu yüzden XP'si miktara yetmelidir.
 *
 * @returns {{ borclu: string } | { yetersiz: true, xp: number } | { fazla: true, azami: number }
 *   | { harc: number } | null}
 */
export function davaAc({ chatJid, davaci, sanik, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const borclu = [davaci, sanik].find((jid) => borcluMu(q, chatJid, jid, now))
      if (borclu) return { borclu }

      const harc = davaHarci(miktar)
      const xp = q.oku.get(chatJid, davaci)?.xp ?? 0
      if (xp < miktar + harc) return { yetersiz: true, xp }

      const azami = azamiDava(q.oku.get(chatJid, sanik)?.xp ?? 0)
      if (miktar > azami) return { fazla: true, azami }

      q.xpAktar.run({ chat: chatJid, user: davaci, xp: -harc })
      botaYaz(q, chatJid, davaci, -harc)
      return { harc }
    })()
  } catch (err) {
    logger.error({ err, chatJid, davaci }, 'Dava açılamadı')
    return null
  }
}

/**
 * Kaybeden en çok cüzdanı kadar öder, eksiye düşmez. Kaybeden oylama sırasında borçlandıysa
 * ödeme yapılmaz, yoksa dava para kaçırma yolu olurdu.
 *
 * @returns {{ borclu: true } | { odenen: number, kazananXp: number, kaybedenXp: number } | null}
 */
export function davaOde({ chatJid, kazanan, kaybeden, miktar, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (borcluMu(q, chatJid, kaybeden, now)) return { borclu: true }

      const odenen = Math.min(miktar, q.oku.get(chatJid, kaybeden)?.xp ?? 0)
      q.xpAktar.run({ chat: chatJid, user: kaybeden, xp: -odenen })
      q.xpAktar.run({ chat: chatJid, user: kazanan, xp: odenen })
      return {
        odenen,
        kazananXp: q.oku.get(chatJid, kazanan).xp,
        kaybedenXp: q.oku.get(chatJid, kaybeden).xp,
      }
    })()
  } catch (err) {
    logger.error({ err, chatJid, kaybeden }, 'Dava ödemesi yazılamadı')
    return null
  }
}

/**
 * Son 7 günün mesajları `gecmis`'ten, gece kuşu ve kumar sonuçları tüm zamanlardan gelir:
 * o tablolar haftalık tutulmaz.
 */
export function haftaOzeti({ chatJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    const haric = botJid ?? ''
    const yazanlar = q.ozetYazanlar.all(chatJid, istanbulDay(new Date(now - 6 * 86_400_000)), haric)
    return {
      toplamMesaj: yazanlar.reduce((t, y) => t + y.mesaj, 0),
      yazanlar: yazanlar.slice(0, 3),
      geceKusu: q.ozetGeceKusu.get(chatJid, haric) ?? null,
      kumarKazanan: q.kumarKazananlar.get(chatJid, 1) ?? null,
      kumarKaybeden: q.kumarKaybedenler.get(chatJid, 1) ?? null,
      sezonLideri: q.sezonSira.get(chatJid, haftaAnahtari(new Date(now)), 1) ?? null,
      baskan: gorevdekiBaskan(q, chatJid),
      hapiste: q.hapisListe.all(chatJid, now).length,
    }
  } catch (err) {
    logger.error({ err, chatJid }, 'Hafta özeti okunamadı')
    return null
  }
}

/** `.profil` satırları için. */
export function sosyalDurum(chatJid, userJid, now = Date.now()) {
  try {
    const q = hazirla()
    if (!q) return {}

    return {
      es: q.esOku.get(chatJid, userJid)?.es_jid ?? null,
      meslek: meslekKoduyla(aktifMeslek(q, chatJid, userJid, now)?.kod) ?? null,
      cete: ceteBul(q, chatJid, userJid)?.ad ?? null,
      hapis: hapisDurumu(chatJid, userJid, now),
      baskan: gorevdekiBaskan(q, chatJid) === userJid,
    }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Sosyal durum okunamadı')
    return {}
  }
}

/** .market fiyatı, olay dahil; komut listesi bunu yazar. */
export function marketFiyati(chatJid, fiyat, now = Date.now()) {
  const q = hazirla()
  const tutar = q ? kurOlcegi(fiyat, anlikKur(q, chatJid, now)) : fiyat
  return olayUygula(piyasaOlayi(chatJid, now), 'market', tutar)
}

/**
 * @returns {{ acik: object } | { borclu: true } | { yetersiz: true, xp: number }
 *   | { miktar: number, bitis: number, xp: number } | null}
 */
export function yatirimYap({ chatJid, userJid, miktar, risk, rnd = randomInt, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const acik = q.yatirimOku.get(chatJid, userJid)
      if (acik) return { acik }
      // Kredi parası tahsilatın dokunmadığı yatırıma kaçırılmasın.
      if (borcluMu(q, chatJid, userJid, now)) return { borclu: true }

      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (xp < miktar) return { yetersiz: true, xp }

      const carpan = yatirimSonucu(risk, rnd(100), piyasaOlayi(chatJid, now).yatirim ?? 100)
      const bitis = now + YATIRIM_SAATI * SAAT_MS
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -miktar })
      q.yatirimYaz.run({ chat: chatJid, user: userJid, miktar, risk, carpan, bitis })
      return { miktar, bitis, xp: xp - miktar }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Yatırım yazılamadı')
    return null
  }
}

/**
 * Vadesi dolan yatırımı öder; dolmadıysa yalnızca durumu döner.
 *
 * @returns {{ yok: true } | { bekle: number, miktar: number, risk: string }
 *   | { miktar: number, odeme: number, carpan: number, risk: string, xp: number } | null}
 */
export function yatirimTopla({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const y = q.yatirimOku.get(chatJid, userJid)
      if (!y) return { yok: true }
      if (y.bitis > now) return { bekle: y.bitis, miktar: y.miktar, risk: y.risk }

      const odeme = Math.floor((y.miktar * y.carpan) / 100)
      q.yatirimSil.run(chatJid, userJid)
      if (odeme) q.xpAktar.run({ chat: chatJid, user: userJid, xp: odeme })
      return { miktar: y.miktar, odeme, carpan: y.carpan, risk: y.risk, xp: q.oku.get(chatJid, userJid)?.xp ?? 0 }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Yatırım toplanamadı')
    return null
  }
}

/**
 * Vadesi geçmiş tefeci borcunu cüzdan ve bankadan alır, alacaklıya öder. Yetmezse borç
 * kalır, sonraki mesajlarda gelen paradan alınır. Cüzdan eksiye düşmez. Çağıran transaction içindedir.
 */
function tefeciTahsil(q, chatJid, userJid, now) {
  const t = q.tefeciOku.get(chatJid, userJid)
  if (!t) return
  if (t.durum === 'teklif') {
    if (t.teklif_bitis <= now) q.tefeciSil.run(chatJid, userJid)
    return
  }
  if (t.vade > now) return

  const cuzdan = Math.max(0, q.oku.get(chatJid, userJid)?.xp ?? 0)
  const cuzdandan = Math.min(cuzdan, t.borc)
  let bankadan = 0
  if (cuzdandan < t.borc) {
    const { hesap } = faizIsle(q, chatJid, userJid, now)
    bankadan = Math.min(hesap.bakiye, t.borc - cuzdandan)
    if (bankadan) {
      bankaKaydet(q, chatJid, userJid, {
        ...hesap, bakiye: hesap.bakiye - bankadan, bekleyen: Math.max(0, hesap.bekleyen - bankadan),
      })
    }
  }
  const alinan = cuzdandan + bankadan
  if (!alinan) return

  if (cuzdandan) q.xpAktar.run({ chat: chatJid, user: userJid, xp: -cuzdandan })
  q.xpAktar.run({ chat: chatJid, user: t.alacakli, xp: alinan })
  if (alinan >= t.borc) q.tefeciSil.run(chatJid, userJid)
  else q.tefeciBorc.run(t.borc - alinan, chatJid, userJid)
}

/**
 * @returns {{ borclu: true } | { yetersiz: true, xp: number } | { borcVar: true } | { teklifVar: true }
 *   | { borc: number } | null}
 */
export function tefeciTeklif({ chatJid, alacakli, borclu, miktar, faiz, saat, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      tefeciTahsil(q, chatJid, borclu, now)
      const mevcut = q.tefeciOku.get(chatJid, borclu)
      if (mevcut?.durum === 'acik') return { borcVar: true }
      if (mevcut) return { teklifVar: true }
      if (borcluMu(q, chatJid, alacakli, now)) return { borclu: true }

      const xp = q.oku.get(chatJid, alacakli)?.xp ?? 0
      if (xp < miktar) return { yetersiz: true, xp }

      const borc = geriOdeme(miktar, faiz)
      q.tefeciYaz.run({
        chat: chatJid, borclu, alacakli, anapara: miktar, borc, saat, vade: 0,
        durum: 'teklif', teklifBitis: now + TEKLIF_SURESI_MS,
      })
      return { borc }
    })()
  } catch (err) {
    logger.error({ err, chatJid, alacakli, borclu }, 'Tefeci teklifi yazılamadı')
    return null
  }
}

/**
 * Borçlu teklifi kabul eder ya da reddeder. Alacaklının parası kabulde yeniden denetlenir.
 *
 * @returns {{ yok: true } | { reddedildi: true, alacakli: string } | { alacakliYetersiz: true, alacakli: string }
 *   | { anapara: number, borc: number, vade: number, alacakli: string, xp: number } | null}
 */
export function tefeciCevap({ chatJid, borclu, kabul, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      tefeciTahsil(q, chatJid, borclu, now)
      const t = q.tefeciOku.get(chatJid, borclu)
      if (t?.durum !== 'teklif') return { yok: true }

      if (!kabul) {
        q.tefeciSil.run(chatJid, borclu)
        return { reddedildi: true, alacakli: t.alacakli }
      }
      const xp = q.oku.get(chatJid, t.alacakli)?.xp ?? 0
      if (xp < t.anapara || borcluMu(q, chatJid, t.alacakli, now)) {
        q.tefeciSil.run(chatJid, borclu)
        return { alacakliYetersiz: true, alacakli: t.alacakli }
      }

      const vade = now + t.saat * SAAT_MS
      q.xpAktar.run({ chat: chatJid, user: t.alacakli, xp: -t.anapara })
      q.xpAktar.run({ chat: chatJid, user: borclu, xp: t.anapara })
      q.tefeciYaz.run({
        chat: chatJid, borclu, alacakli: t.alacakli, anapara: t.anapara, borc: t.borc, saat: t.saat, vade,
        durum: 'acik', teklifBitis: 0,
      })
      return { anapara: t.anapara, borc: t.borc, vade, alacakli: t.alacakli, xp: q.oku.get(chatJid, borclu).xp }
    })()
  } catch (err) {
    logger.error({ err, chatJid, borclu }, 'Tefeci cevabı yazılamadı')
    return null
  }
}

/**
 * Borçlu cüzdanından öder. `miktar` null ise borcun tamamı.
 *
 * @returns {{ yok: true } | { yetersiz: true, xp: number } | { odenen: number, kalan: number, alacakli: string, xp: number } | null}
 */
export function tefeciOde({ chatJid, borclu, miktar = null, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      tefeciTahsil(q, chatJid, borclu, now)
      const t = q.tefeciOku.get(chatJid, borclu)
      if (t?.durum !== 'acik') return { yok: true }

      const odenen = Math.min(miktar ?? t.borc, t.borc)
      const xp = q.oku.get(chatJid, borclu)?.xp ?? 0
      if (odenen <= 0 || xp < odenen) return { yetersiz: true, xp }

      q.xpAktar.run({ chat: chatJid, user: borclu, xp: -odenen })
      q.xpAktar.run({ chat: chatJid, user: t.alacakli, xp: odenen })
      if (odenen >= t.borc) q.tefeciSil.run(chatJid, borclu)
      else q.tefeciBorc.run(t.borc - odenen, chatJid, borclu)
      return { odenen, kalan: t.borc - odenen, alacakli: t.alacakli, xp: xp - odenen }
    })()
  } catch (err) {
    logger.error({ err, chatJid, borclu }, 'Tefeci ödemesi yazılamadı')
    return null
  }
}

/** @returns {{ borc: object | null, alacaklar: object[] } | null} */
export function tefeciDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      tefeciTahsil(q, chatJid, userJid, now)
      return { borc: q.tefeciOku.get(chatJid, userJid) ?? null, alacaklar: q.tefeciAlacaklar.all(chatJid, userJid) }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Tefeci durumu okunamadı')
    return null
  }
}

export { RISKLER }

/**
 * Grubun bugünkü wordle tahtası ve kişinin kalan hakkı. Tahta gruba aittir: biri bilince
 * kelime herkese görünür, gün kapanır. Kişi tahtası olsaydı bilenin mesajı kopyalanırdı.
 *
 * @returns {{ deneme: number, toplam: number, cozen: string | null }}
 */
export function wordleDurumu(chatJid, userJid, gun) {
  try {
    const q = hazirla()
    const grup = q?.wordleGrupOku.get(chatJid, gun)
    return {
      deneme: q?.wordleOku.get(chatJid, userJid, gun)?.deneme ?? 0,
      toplam: grup?.toplam ?? 0,
      cozen: grup?.cozen ?? null,
    }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Wordle durumu okunamadı')
    return { deneme: 0, toplam: 0, cozen: null }
  }
}

/**
 * Bir wordle tahminini sayar. Gün kapandıysa ya da kişinin hakkı bittiyse yazmaz: TDK
 * isteğini beklerken başkası kelimeyi bilmiş ya da aynı kişinin iki tahmini gelmiş olabilir.
 *
 * @returns {{ kapandi: string } | { hakYok: true } | { kabul: true, deneme: number, toplam: number } | null}
 *   kapandi: bilenin JID'i. null: veritabanı yok.
 */
export function wordleKaydet({ chatJid, userJid, gun, dogru, hak }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const grup = q.wordleGrupOku.get(chatJid, gun)
      if (grup?.cozen) return { kapandi: grup.cozen }

      const kisi = q.wordleOku.get(chatJid, userJid, gun)
      const deneme = kisi?.deneme ?? 0
      // cozuldu: aynı gün eski (kişisel tahtalı) sürümde bilen ikinci kez ödül almasın.
      if (deneme >= hak || kisi?.cozuldu) return { hakYok: true }

      const toplam = (grup?.toplam ?? 0) + 1
      q.wordleYaz.run({ chat: chatJid, user: userJid, gun, deneme: deneme + 1, cozuldu: dogru ? 1 : 0 })
      q.wordleGrupYaz.run({ chat: chatJid, gun, toplam, cozen: dogru ? userJid : null })
      return { kabul: true, deneme: deneme + 1, toplam }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Wordle tahmini yazılamadı')
    return null
  }
}

/**
 * Kişinin bütün varlığı, bugün nakde çevrilse ne edeceğiyle (.servet). Hiçbir şey yazmaz:
 * faiz, kira ve kredi faizi yalnızca gösterim için hesaplanır. Coin bozdurma kuruyla, mülk
 * satış fiyatıyla, hisse son işlenen fiyatla sayılır; borsa burada ilerletilmez.
 */
function servetHesapla(q, chatJid, userJid, now, { coinKur, gunKur, faiz, kriptoUsd, kriptoKur }) {
  const saat = Math.floor(now / SAAT_MS)
  const cuzdan = q.oku.get(chatJid, userJid)?.xp ?? 0

  const h = q.bankaOku.get(chatJid, userJid)
  const banka = h ? h.bakiye + (h.faiz_saat ? faizIslet(h.bakiye, h.bekleyen, saat - h.faiz_saat, h.faiz_artik, faiz).faiz : 0) : 0

  const coinAdet = q.coinOku.get(chatJid, userJid)?.bakiye ?? 0
  const coin = bozdurmaDegeri(coinAdet, coinKur)
  const kriptoBirim = q.kriptoOku.get(chatJid, userJid)?.birim ?? 0
  const kripto = kriptoUsd ? sulySatisDegeri(kriptoBirim, kriptoUsd, kriptoKur) : 0

  let mulk = 0
  for (const satir of q.mulkleriOku.all(chatJid, userJid)) {
    const m = MULKLER.find((x) => x.kod === satir.kod)
    if (m) mulk += satir.adet * bozdurmaDegeri(m.fiyat, gunKur) + kiraIsle(q, chatJid, userJid, satir, m, now).bekleyen
  }

  const borsa = q.portfoyDegerleri.all(chatJid, userJid).reduce((t, p) => t + Math.floor(p.adet * p.fiyat), 0)
  const yatirim = q.yatirimOku.get(chatJid, userJid)?.miktar ?? 0
  const alacak = q.tefeciAlacaklar.all(chatJid, userJid).reduce((t, r) => t + r.borc, 0)

  const k = q.krediOku.get(chatJid, userJid)
  const kredi = k
    ? borcIslet(k.borc, Math.max(0, Math.min(saat, Math.floor(k.vade / SAAT_MS)) - k.faiz_saat), krediFaizi(faiz))
    : 0
  const t = q.tefeciOku.get(chatJid, userJid)
  const tefeci = t?.durum === 'acik' ? t.borc : 0

  const varlik = Math.max(0, cuzdan) + banka + coin + kripto + mulk + borsa + yatirim + alacak
  const borc = Math.max(0, -cuzdan) + kredi + tefeci
  return { cuzdan, banka, coinAdet, coin, kriptoBirim, kripto, mulk, borsa, yatirim, alacak, kredi, tefeci, varlik, borc, net: varlik - borc }
}

function servetKurlari(q, chatJid, now) {
  return {
    coinKur: bozdurmaKuru(q, chatJid, now),
    gunKur: gununEkonomisi(q, chatJid, now).kur,
    faiz: bankaFaizi(q, chatJid),
    kriptoUsd: q.kriptoFiyatOku.get(SULY.sembol)?.usd ?? 0,
    kriptoKur: kriptoKuru(q, chatJid, now),
  }
}

/** @returns {ReturnType<typeof servetHesapla> | null} */
export function servetDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => servetHesapla(q, chatJid, hesapKimligi(userJid), now, servetKurlari(q, chatJid, now)))()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Servet okunamadı')
    return null
  }
}

/** Net servete göre sıralama; bot sayılmaz. @returns {{ user_jid: string, net: number }[]} */
export function servetSiralama({ chatJid, limit = 10, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return []

    return getDb().transaction(() => {
      const kurlar = servetKurlari(q, chatJid, now)
      return q.servetUyeleri.all(chatJid)
        .filter((r) => !botKimlikleri.has(r.user_jid))
        .map((r) => ({ user_jid: r.user_jid, net: servetHesapla(q, chatJid, r.user_jid, now, kurlar).net }))
        .filter((r) => r.net !== 0)
        .sort((a, b) => b.net - a.net)
        .slice(0, limit)
    })()
  } catch (err) {
    logger.error({ err, chatJid }, 'Servet sıralaması okunamadı')
    return []
  }
}

/** .kumarkarnem: toplam karne ve oyun dökümü. @returns {{ toplam: object | null, oyunlar: object[] }} */
export function kumarKarnesi(chatJid, userJid) {
  try {
    const q = hazirla()
    if (!q) return { toplam: null, oyunlar: [] }
    return { toplam: q.kumarKarneOku.get(chatJid, userJid) ?? null, oyunlar: q.kumarOyunlariOku.all(chatJid, userJid) }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kumar karnesi okunamadı')
    return { toplam: null, oyunlar: [] }
  }
}

/** Kişinin bu kumar oyununu kaç kez oynadığı (kumar_oyun tablosundan). */
export function kumarOyunSayisi(chatJid, userJid, oyun) {
  try {
    const q = hazirla()
    if (!q) return 0
    return q.kumarOyunSayisiOku.get(chatJid, userJid, oyun)?.games ?? 0
  } catch (err) {
    logger.error({ err, chatJid, userJid, oyun }, 'Kumar oyun sayısı okunamadı')
    return 0
  }
}

// --- .pet ---

let petSorgulari = null

function petHazirla() {
  if (petSorgulari) return petSorgulari
  const db = getDb()
  if (!db) return null
  petSorgulari = {
    oku: db.prepare('SELECT * FROM pet WHERE chat_jid = ? AND user_jid = ?'),
    sil: db.prepare('DELETE FROM pet WHERE chat_jid = ? AND user_jid = ?'),
    yaz: db.prepare(`
      INSERT INTO pet (chat_jid, user_jid, tur, ad, tokluk, mutluluk, guncelleme, pet_xp, son_oyun, son_hediye, dogum)
      VALUES (@chat_jid, @user_jid, @tur, @ad, @tokluk, @mutluluk, @guncelleme, @pet_xp, @son_oyun, @son_hediye, @dogum)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET
        tur = excluded.tur, ad = excluded.ad, tokluk = excluded.tokluk, mutluluk = excluded.mutluluk,
        guncelleme = excluded.guncelleme, pet_xp = excluded.pet_xp, son_oyun = excluded.son_oyun,
        son_hediye = excluded.son_hediye
    `),
    hepsi: db.prepare('SELECT * FROM pet WHERE chat_jid = ?'),
  }
  return petSorgulari
}

/**
 * Hayvanı okuyup işlemi tek transaction'da yapar. Kaçmış hayvan burada silinir: bot kendiliğinden
 * yazmadığı için kaçış sahibinin ilk `.pet` okumasında ortaya çıkar.
 */
function petIslem(chatJid, userJid, now, fn) {
  try {
    const q = hazirla()
    const p = petHazirla()
    if (!q || !p) return null
    return getDb().transaction(() => {
      const pet = p.oku.get(chatJid, userJid)
      if (!pet) return fn(null, null, q, p)
      if (kactiMi(pet, now)) {
        p.sil.run(chatJid, userJid)
        return { kacti: true, pet }
      }
      return fn(pet, petDurumu(pet, now), q, p)
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, '.pet yazılamadı')
    return null
  }
}

/** Değerleri şimdiye işleyip yazar: tokluk ve mutluluk `guncelleme` anına göre saklanır. */
function petKaydet(p, pet, d, now, degisim = {}) {
  const yeni = { ...pet, tokluk: d.tokluk, mutluluk: d.mutluluk, guncelleme: now, ...degisim }
  p.yaz.run(yeni)
  return yeni
}

/** @returns {{ yok: true } | { kacti: true, pet } | { pet, durum } | null} */
export function petOku({ chatJid, userJid, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, d) => (pet ? { pet, durum: d } : { yok: true }))
}

/** Satın alma ücreti yanar, market gibi. */
export function petSahiplen({ chatJid, userJid, tur, ad, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, _d, q, p) => {
    if (pet) return { zatenVar: pet }
    const fiyat = kurOlcegi(PET_TURLERI[tur].fiyat, anlikKur(q, chatJid, now))
    const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
    if (fiyat > xp) return { yetersiz: true, xp, fiyat }
    q.xpAktar.run({ chat: chatJid, user: userJid, xp: -fiyat })
    const yeni = {
      chat_jid: chatJid, user_jid: userJid, tur, ad, tokluk: 80, mutluluk: 80, guncelleme: now,
      pet_xp: 0, son_oyun: 0, son_hediye: 0, dogum: now,
    }
    p.yaz.run(yeni)
    return { pet: yeni, fiyat, xp: xp - fiyat }
  })
}

export function petBesle({ chatJid, userJid, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, d, q, p) => {
    if (!pet) return { yok: true }
    if (d.tokluk > 100 - MAMA_TOKLUK) return { tok: true, pet, durum: d }
    const fiyat = kurOlcegi(MAMA_FIYATI, anlikKur(q, chatJid, now))
    const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
    if (fiyat > xp) return { yetersiz: true, xp, fiyat }
    q.xpAktar.run({ chat: chatJid, user: userJid, xp: -fiyat })
    const yeni = petKaydet(p, pet, { ...d, tokluk: Math.min(100, d.tokluk + MAMA_TOKLUK) }, now,
      { pet_xp: pet.pet_xp + BESLE_PET_XP })
    return { pet: yeni, fiyat, xp: xp - fiyat, oncekiXp: pet.pet_xp }
  })
}

export function petOyna({ chatJid, userJid, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, d, _q, p) => {
    if (!pet) return { yok: true }
    if (pet.son_oyun && now - pet.son_oyun < OYUN_BEKLEME_MS) return { bekle: pet.son_oyun + OYUN_BEKLEME_MS - now, pet }
    if (d.tokluk < 20) return { ac: true, pet }
    const yeni = petKaydet(p, pet, { ...d, mutluluk: Math.min(100, d.mutluluk + OYUN_MUTLULUK) }, now,
      { pet_xp: pet.pet_xp + OYNA_PET_XP, son_oyun: now })
    return { pet: yeni, oncekiXp: pet.pet_xp }
  })
}

/** Günde bir hediye. XP basar ama oyun ödülü gibi kurun kareköküyle büyür, mama doğrusal büyür. */
export function petHediye({ chatJid, userJid, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, d, _q, p) => {
    if (!pet) return { yok: true }
    if (pet.son_hediye && now - pet.son_hediye < HEDIYE_BEKLEME_MS) return { bekle: pet.son_hediye + HEDIYE_BEKLEME_MS - now, pet }
    if (d.tokluk < HEDIYE_ESIGI || d.mutluluk < HEDIYE_ESIGI) return { isteksiz: true, pet, durum: d }
    const taban = hediyeTabani(pet, d)
    petKaydet(p, pet, d, now, { son_hediye: now })
    return { pet, xp: oyunOdulu({ chatJid, userJid, amount: taban, at: now }) }
  })
}

export function petAdDegistir({ chatJid, userJid, ad, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, d, _q, p) => {
    if (!pet) return { yok: true }
    return { pet: petKaydet(p, pet, d, now, { ad }), eski: pet.ad }
  })
}

export function petBirak({ chatJid, userJid, now = Date.now() }) {
  return petIslem(chatJid, userJid, now, (pet, _d, _q, p) => {
    if (!pet) return { yok: true }
    p.sil.run(chatJid, userJid)
    return { pet }
  })
}

/** .pet top: pet XP sırası. Kaçmış hayvan listelenmez; satırı sahibi `.pet` yazınca silinir. */
export function petSiralamasi(chatJid, limit = 10, now = Date.now()) {
  try {
    const p = petHazirla()
    if (!p) return []
    return p.hepsi.all(chatJid)
      .filter((pet) => !kactiMi(pet, now))
      .sort((a, b) => b.pet_xp - a.pet_xp)
      .slice(0, limit)
  } catch (err) {
    logger.error({ err, chatJid }, 'Pet sıralaması okunamadı')
    return []
  }
}

/** Komut listesinde yazan güncel fiyat. */
export function petFiyati(chatJid, fiyat, now = Date.now()) {
  const q = hazirla()
  return q ? kurOlcegi(fiyat, anlikKur(q, chatJid, now)) : fiyat
}

// --- .kripto (Suly) ---------------------------------------------------------------------------
// Kurallar lib/kripto.js'tedir. Fiyat dış servisten komut katmanında alınır, buraya `usd` gelir ve
// her işlemde kaydedilir: para arzı senkron hesaplandığı için Suly'yi son işlem fiyatıyla sayar.

/** @returns {{ birim: number, kur: number, fiyat: { usd: number, zaman: number } | null } | null} */
export function kriptoDurumu({ chatJid, userJid, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    return {
      birim: q.kriptoOku.get(chatJid, hesapKimligi(userJid))?.birim ?? 0,
      kur: kriptoKuru(q, chatJid, now),
      fiyat: q.kriptoFiyatOku.get(SULY.sembol) ?? null,
    }
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Kripto durumu okunamadı')
    return null
  }
}

/**
 * XP ile Suly alır, ödenen XP yanar (coin gibi); Suly arzda sayıldığı için piyasa değişmez.
 * Borçlu alamaz: Suly tahsilata girmediği için kredi parası ona çevrilip borçtan kaçılırdı.
 * Ücret yukarı yuvarlanır, küçük alımlar bedavaya gelmesin.
 *
 * @returns {{ borclu: true } | { yetersiz: true, xp: number, ucret: number } | { birim: number, xp: number, ucret: number, kur: number } | null}
 */
export function kriptoAl({ chatJid, userJid, birim, usd, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      if (borcluMu(q, chatJid, userJid, now)) return { borclu: true }

      q.kriptoFiyatYaz.run(SULY.sembol, usd, now)
      const { kur } = gununEkonomisi(q, chatJid, now)
      const ucret = Math.max(1, Math.ceil((birim / BIRIM) * sulyFiyati(usd, kur)))
      const xp = q.oku.get(chatJid, userJid)?.xp ?? 0
      if (ucret > xp) return { yetersiz: true, xp, ucret }

      const yeni = (q.kriptoOku.get(chatJid, userJid)?.birim ?? 0) + birim
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: -ucret })
      q.kriptoYaz.run(chatJid, userJid, yeni)
      return { birim: yeni, xp: xp - ucret, ucret, kur }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Suly alınamadı')
    return null
  }
}

/** Ödeme ve kesintiyi yazar, bakiyeyi düşürür; çağıran transaction içindedir. */
function kriptoCikar(q, chatJid, userJid, eldeki, birim, usd, now) {
  const kur = kriptoKuru(q, chatJid, now)
  const odeme = sulySatisDegeri(birim, usd, kur)
  if (eldeki - birim > 0) q.kriptoYaz.run(chatJid, userJid, eldeki - birim)
  else q.kriptoSil.run(chatJid, userJid)
  return { odeme, kesinti: sulyDegeri(birim, usd, kur) - odeme, kalan: eldeki - birim }
}

/**
 * Suly satar: değerin %99'u cüzdana, %1 hazineye. `birim` null ise hepsi.
 *
 * @returns {{ yetersiz: true, birim: number } | { birim: number, kazanc: number, kesinti: number, xp: number } | null}
 */
export function kriptoSat({ chatJid, userJid, birim = null, usd, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null

    return getDb().transaction(() => {
      const eldeki = q.kriptoOku.get(chatJid, userJid)?.birim ?? 0
      const satilan = birim ?? eldeki
      if (!satilan || satilan > eldeki) return { yetersiz: true, birim: eldeki }

      q.kriptoFiyatYaz.run(SULY.sembol, usd, now)
      gununEkonomisi(q, chatJid, now)
      const { odeme, kesinti, kalan } = kriptoCikar(q, chatJid, userJid, eldeki, satilan, usd, now)
      q.xpAktar.run({ chat: chatJid, user: userJid, xp: odeme })
      kasayaYatir(q, chatJid, kesinti, now)
      return { birim: kalan, satilan, kazanc: odeme, kesinti, xp: q.oku.get(chatJid, userJid)?.xp ?? 0 }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Suly satılamadı')
    return null
  }
}

/**
 * Yalnızca sahibin `.haciz`'i: Suly kesintisiz değeriyle hazineye geçer. Eldekinden
 * fazlası istenirse hepsi alınır. `.hacizall`, soygun ve bakanlar Suly'ye dokunmaz.
 *
 * @returns {{ kapali: true } | { yok: true } | { alinan: number, kalan: number, kasaya: number } | null}
 */
export function kriptoHaciz({ chatJid, userJid, birim = null, usd, now = Date.now() }) {
  try {
    const q = hazirla()
    if (!q) return null
    if (!botJid) return { kapali: true }

    return getDb().transaction(() => {
      const eldeki = q.kriptoOku.get(chatJid, userJid)?.birim ?? 0
      if (!eldeki) return { yok: true }

      const alinan = Math.min(birim ?? eldeki, eldeki)
      q.kriptoFiyatYaz.run(SULY.sembol, usd, now)
      gununEkonomisi(q, chatJid, now)
      const { odeme, kesinti, kalan } = kriptoCikar(q, chatJid, userJid, eldeki, alinan, usd, now)
      kasayaYatir(q, chatJid, odeme + kesinti, now)
      return { alinan, kalan, kasaya: odeme + kesinti }
    })()
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Suly haczedilemedi')
    return null
  }
}
