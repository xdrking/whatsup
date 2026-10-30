import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import logger from './logger.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'stats.db')

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

-- .sus ile susturulmuş gruplar. Bot yeniden başlayınca da susmaya devam etsin
-- diye kalıcı; aksi halde her çökmede bot kendiliğinden "konuşmaya" başlar.
CREATE TABLE IF NOT EXISTS muted_chats (
  chat_jid TEXT    PRIMARY KEY,
  muted_at INTEGER NOT NULL
);

-- Kelime oyununun TDK sonuçları: aynı kelime her oyunda yeniden sorulmasın.
-- Sözlük gün gün değişmediği için eskime süresi yok; checked_at ileride
-- gerekirse diye tutulur.
CREATE TABLE IF NOT EXISTS word_cache (
  word       TEXT    PRIMARY KEY,
  valid      INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);
`

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

    logger.info({ path: DB_PATH }, 'İstatistik veritabanı hazır')
    return db
  } catch (err) {
    bozuk = true
    logger.error({ err, path: DB_PATH }, 'İstatistik veritabanı açılamadı, istatistik devre dışı')
    return null
  }
}
