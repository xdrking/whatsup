import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import logger from './logger.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
// Testler gerçek veritabanına dokunmasın diye STATS_DB=:memory: verilebilir.
const DB_PATH = process.env.STATS_DB || path.join(DATA_DIR, 'stats.db')

// Sohbet başına ayrı sayaç: aynı kişinin iki farklı gruptaki istatistiği
// karışmasın. Saat dağılımı ayrı tabloda, çünkü kişi başına 24 satıra kadar
// büyür ve ana satırı şişirmesinin anlamı yok.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS stats (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  messages  INTEGER NOT NULL DEFAULT 0,
  stickers  INTEGER NOT NULL DEFAULT 0,
  voices    INTEGER NOT NULL DEFAULT 0,
  xp        INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

CREATE TABLE IF NOT EXISTS hours (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  hour     INTEGER NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid, hour)
);

CREATE INDEX IF NOT EXISTS stats_siralama ON stats (chat_jid, xp DESC);

-- .günlük ödülü: son alınan Türkiye takvim günü ("2026-10-31") ve
-- kesintisiz gün serisi. Sohbet başına, tıpkı stats gibi.
CREATE TABLE IF NOT EXISTS daily (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  last_day TEXT    NOT NULL,
  streak   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .çark: 24 saatlik hak penceresinin başlangıcı (ms), o pencerede kullanılan
-- ücretsiz hak ve aktif oyun XP bonusu. Bonus kazanılmış ödüldür, yeniden
-- başlatmada kaybolmasın diye kalıcıdır.
CREATE TABLE IF NOT EXISTS cark (
  chat_jid      TEXT    NOT NULL,
  user_jid      TEXT    NOT NULL,
  window_start  INTEGER NOT NULL DEFAULT 0,
  spins         INTEGER NOT NULL DEFAULT 0,
  bonus_percent INTEGER NOT NULL DEFAULT 0,
  bonus_until   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Kumar karnesi (.kumartop): toplam net kazanç, net kayıp ve oyun sayısı.
CREATE TABLE IF NOT EXISTS kumar (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  won      INTEGER NOT NULL DEFAULT 0,
  lost     INTEGER NOT NULL DEFAULT 0,
  games    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .piyango biletleri. Gerçek XP yatırıldığı için kalıcıdır; çekilişte silinir.
CREATE TABLE IF NOT EXISTS piyango (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  xp       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .görev ilerlemesi: kişi başına görev türü başına tek satır, gün değişince
-- aynı satır sıfırdan başlar; tablo büyümez.
CREATE TABLE IF NOT EXISTS gorev (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  anahtar  TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  sayac    INTEGER NOT NULL DEFAULT 0,
  alindi   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid, anahtar)
);

-- .market: satın alınan unvan ve soygun kalkanının bitişi (ms).
CREATE TABLE IF NOT EXISTS market (
  chat_jid     TEXT    NOT NULL,
  user_jid     TEXT    NOT NULL,
  unvan        TEXT,
  kalkan_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .soygun: o günkü deneme sayısı ve soyulan kişinin korunma bitişi (ms).
CREATE TABLE IF NOT EXISTS soygun (
  chat_jid      TEXT    NOT NULL,
  user_jid      TEXT    NOT NULL,
  day           TEXT    NOT NULL DEFAULT '',
  deneme        INTEGER NOT NULL DEFAULT 0,
  korunma_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .ödül: kişinin başındaki birikmiş ödül; başarılı soygunda alınır, satır silinir.
CREATE TABLE IF NOT EXISTS odul (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  xp       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .banka: hesap bakiyesi, faizin işlendiği son saat dilimi, 1 XP'yi bulmayan
-- faiz küsuratı, servet vergisinin alındığı son gün ve son vergi miktarı.
CREATE TABLE IF NOT EXISTS banka (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  bakiye     INTEGER NOT NULL DEFAULT 0,
  faiz_saat  INTEGER NOT NULL DEFAULT 0,
  faiz_artik REAL    NOT NULL DEFAULT 0,
  bekleyen   INTEGER NOT NULL DEFAULT 0,
  vergi_day  TEXT    NOT NULL DEFAULT '',
  son_vergi  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .kredi: açık kredi. Borç kapanınca ya da vadesinde tahsil edilince satır silinir.
CREATE TABLE IF NOT EXISTS kredi (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  borc      INTEGER NOT NULL,
  faiz_saat INTEGER NOT NULL,
  vade      INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .iflas: kumar yasağının bitişi.
CREATE TABLE IF NOT EXISTS iflas (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  yasak_bitis INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .coinmarket: coin bakiyesi ve kullanılmamış toplu soygun hakkı.
CREATE TABLE IF NOT EXISTS coin (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  bakiye    INTEGER NOT NULL DEFAULT 0,
  toplu_hak INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .faizkararı: grubun saatlik banka faizi. Satır yoksa varsayılan geçerlidir.
CREATE TABLE IF NOT EXISTS faiz (
  chat_jid TEXT PRIMARY KEY,
  oran     INTEGER NOT NULL
);

-- .tüik: günün ilk mesajındaki para arzı ve o gün geçerli coin kuru.
CREATE TABLE IF NOT EXISTS ekonomi (
  chat_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  arz      INTEGER NOT NULL,
  kur      INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, day)
);

-- .hacizall sigortasının bitişi.
CREATE TABLE IF NOT EXISTS sigorta (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  bitis    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .mülk: adet, kiranın işlendiği saat ve toplanmamış kira.
CREATE TABLE IF NOT EXISTS mulk (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  kod       TEXT    NOT NULL,
  adet      INTEGER NOT NULL,
  kira_saat INTEGER NOT NULL,
  bekleyen  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid, kod)
);

-- .sezon: kişinin o haftaki puanı. Hafta kapanınca satırlar silinir.
CREATE TABLE IF NOT EXISTS sezon (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  hafta    TEXT    NOT NULL,
  puan     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid, hafta)
);

-- Sezon birincilikleri; hafta silinse de kalıcıdır.
CREATE TABLE IF NOT EXISTS sampiyon (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  kez      INTEGER NOT NULL DEFAULT 0,
  son_hafta TEXT   NOT NULL DEFAULT '',
  PRIMARY KEY (chat_jid, user_jid)
);

-- .borsa: her grubun kendi fiyatları. adim, son işlenen 15 dakikalık dilimdir;
-- haber_adim, hissenin son haberinin çıktığı dilim.
CREATE TABLE IF NOT EXISTS borsa (
  chat_jid TEXT    NOT NULL,
  hisse    TEXT    NOT NULL,
  fiyat      REAL    NOT NULL,
  onceki     REAL    NOT NULL,
  adim       INTEGER NOT NULL,
  haber      TEXT    NOT NULL DEFAULT '',
  haber_adim INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, hisse)
);

-- Kişinin elindeki pay ve o pay için ödediği toplam XP.
CREATE TABLE IF NOT EXISTS portfoy (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  hisse    TEXT    NOT NULL,
  adet     REAL    NOT NULL,
  maliyet  INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid, hisse)
);

-- .kart: kişinin elindeki kartlar. no, lib/kart.js'teki kart numarasıdır.
CREATE TABLE IF NOT EXISTS kart (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  no       INTEGER NOT NULL,
  adet     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid, no)
);

-- .market vitrini: o hafta alan kişiler; satır sayısı satılan stoktur.
CREATE TABLE IF NOT EXISTS vitrin (
  chat_jid TEXT NOT NULL,
  hafta    TEXT NOT NULL,
  user_jid TEXT NOT NULL,
  PRIMARY KEY (chat_jid, hafta, user_jid)
);

-- .sus ile susturulmuş gruplar. Bot yeniden başlayınca da susmaya devam etsin
-- diye kalıcı; aksi halde her çökmede bot kendiliğinden "konuşmaya" başlar.
CREATE TABLE IF NOT EXISTS muted_chats (
  chat_jid TEXT    PRIMARY KEY,
  muted_at INTEGER NOT NULL
);

-- Kelime oyununun TDK sonuçları: aynı kelime her oyunda yeniden sorulmasın.
-- Sözlük gün gün değişmediği için eskime süresi yok; checked_at ileride
-- gerekirse diye tutulur.
-- Panelin grafikleri için: kişinin o günkü mesaj sayısı ve gün sonundaki XP'si.
CREATE TABLE IF NOT EXISTS gecmis (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  gun      TEXT    NOT NULL,
  xp       INTEGER NOT NULL,
  mesaj    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid, gun)
);

-- Saat başı hisse fiyatı. Son 7 gün tutulur.
CREATE TABLE IF NOT EXISTS borsa_gecmis (
  chat_jid TEXT    NOT NULL,
  hisse    TEXT    NOT NULL,
  saat     INTEGER NOT NULL,
  fiyat    REAL    NOT NULL,
  PRIMARY KEY (chat_jid, hisse, saat)
);

-- Grubun WhatsApp'taki adı; panel gösterir.
CREATE TABLE IF NOT EXISTS gruplar (
  chat_jid TEXT PRIMARY KEY,
  ad       TEXT NOT NULL
);

-- Kişinin son görülen WhatsApp adı. Kişiye ait, sohbete değil. guncelleme ms.
CREATE TABLE IF NOT EXISTS isimler (
  user_jid   TEXT    PRIMARY KEY,
  ad         TEXT    NOT NULL,
  guncelleme INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS word_cache (
  word       TEXT    PRIMARY KEY,
  valid      INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);
`

/**
 * CREATE TABLE IF NOT EXISTS var olan tabloyu değiştirmez; önceki sürümden kalan
 * veritabanı burada yeni sütunlara taşınır, bakiyeler ve fiyatlar korunur.
 */
function eskiTablolariTasi(baglanti) {
  const sutunVar = (tablo, sutun) => baglanti.pragma(`table_info(${tablo})`).some((s) => s.name === sutun)

  baglanti.transaction(() => {
    if (sutunVar('banka', 'faiz_day')) {
      baglanti.exec(`
        ALTER TABLE banka ADD COLUMN faiz_saat INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE banka ADD COLUMN faiz_artik REAL NOT NULL DEFAULT 0;
        UPDATE banka SET faiz_saat = CAST(strftime('%s', faiz_day) AS INTEGER) / 3600 WHERE faiz_day != '';
        ALTER TABLE banka DROP COLUMN faiz_day;
      `)
    }
    if (!sutunVar('banka', 'bekleyen')) {
      baglanti.exec('ALTER TABLE banka ADD COLUMN bekleyen INTEGER NOT NULL DEFAULT 0')
    }
    if (sutunVar('borsa', 'saat')) {
      // Saatlik dilimden 15 dakikalık dilime: saatte dört adım.
      baglanti.exec(`
        ALTER TABLE borsa RENAME COLUMN saat TO adim;
        UPDATE borsa SET adim = adim * 4;
        ALTER TABLE borsa ADD COLUMN haber TEXT NOT NULL DEFAULT '';
        ALTER TABLE borsa ADD COLUMN haber_adim INTEGER NOT NULL DEFAULT 0;
      `)
    }
  })()
}

let db = null

// Veritabanı hiç açılamadıysa (disk izni, bozuk dosya) her mesajda yeniden
// denenip log'u doldurmasın: bir kez şikâyet edilir, bot istatistiksiz devam eder.
let bozuk = false

/** Açık bağlantı; açılamıyorsa null (çağıran taraf istatistiği atlar). */
export function getDb() {
  if (db) return db
  if (bozuk) return null

  try {
    mkdirSync(DATA_DIR, { recursive: true })

    db = new Database(DB_PATH)
    // WAL: okuma (.stats, .top) yazmayı bloklamaz.
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.exec(SCHEMA)
    eskiTablolariTasi(db)

    logger.info({ path: DB_PATH }, 'İstatistik veritabanı hazır')
    return db
  } catch (err) {
    bozuk = true
    logger.error({ err, path: DB_PATH }, 'İstatistik veritabanı açılamadı, istatistik devre dışı')
    return null
  }
}
