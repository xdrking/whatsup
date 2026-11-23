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

-- .yatırım: kişi başı tek açık yatırım. carpan baştan zarla belirlenir (anaparanın yüzdesi).
CREATE TABLE IF NOT EXISTS yatirim (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  miktar   INTEGER NOT NULL,
  risk     TEXT    NOT NULL,
  carpan   INTEGER NOT NULL,
  bitis    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .tefeci: borçlu başına tek satır. durum 'teklif' iken para geçmemiştir, 'acik' iken geçmiştir.
CREATE TABLE IF NOT EXISTS tefeci (
  chat_jid  TEXT    NOT NULL,
  borclu    TEXT    NOT NULL,
  alacakli  TEXT    NOT NULL,
  anapara   INTEGER NOT NULL,
  borc      INTEGER NOT NULL,
  saat      INTEGER NOT NULL,
  vade      INTEGER NOT NULL DEFAULT 0,
  durum     TEXT    NOT NULL,
  teklif_bitis INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, borclu)
);

-- .çark ekstra: İstanbul gününe göre bugün alınan ekstra çevirme sayısı.
CREATE TABLE IF NOT EXISTS cark_ekstra (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  adet     INTEGER NOT NULL DEFAULT 0,
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

-- .kripto: Suly bakiyesi, 1 Suly = 100.000.000 birim (lib/kripto.js:BIRIM).
CREATE TABLE IF NOT EXISTS kripto (
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  birim     INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Son alım satımdaki Bitcoin dolar fiyatı: para arzı Suly'yi bununla sayar.
CREATE TABLE IF NOT EXISTS kripto_fiyat (
  sembol TEXT    PRIMARY KEY,
  usd    REAL    NOT NULL,
  zaman  INTEGER NOT NULL
);

-- .offshore: kilitli para (komisyon düşülmüş). baskin, yatırılırken atılan zarın sonucudur.
CREATE TABLE IF NOT EXISTS offshore (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  miktar   INTEGER NOT NULL,
  baskin   INTEGER NOT NULL DEFAULT 0,
  bitis    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Başarılı saldırılar: .izsür ve .muhbir okur. tur: hack | fidye. cozuldu: 0 açık, 1 fail bulundu, 2 iz kayboldu.
CREATE TABLE IF NOT EXISTS hack_kayit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid TEXT    NOT NULL,
  saldiran TEXT    NOT NULL,
  kurban   TEXT    NOT NULL,
  tur      TEXT    NOT NULL DEFAULT 'hack',
  para     INTEGER NOT NULL DEFAULT 0,
  vpn      INTEGER NOT NULL DEFAULT 0,
  zaman    INTEGER NOT NULL,
  cozuldu  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS hack_kayit_grup ON hack_kayit (chat_jid, zaman);

-- Fidye yazılımı: bankası kilitli kişi.
CREATE TABLE IF NOT EXISTS fidye (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  saldiran TEXT    NOT NULL,
  tutar    INTEGER NOT NULL,
  bitis    INTEGER NOT NULL,
  kayit    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Sahte kimliğin bitişi.
CREATE TABLE IF NOT EXISTS maske (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  bitis    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .vurgun: grubun son Merkez Bankası soygunu.
CREATE TABLE IF NOT EXISTS vurgun (
  chat_jid TEXT    PRIMARY KEY,
  zaman    INTEGER NOT NULL
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

-- .hapis: soygunda yakalananın çıkış anı ve yakalanırken belirlenen kefaleti.
CREATE TABLE IF NOT EXISTS hapis (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  bitis    INTEGER NOT NULL,
  kefalet  INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .seçim: makamın açık seçimi. İlk adaylıkla başlar, SECIM_SURE_MS sonra kapanır, satır silinir.
CREATE TABLE IF NOT EXISTS makam_secim (
  chat_jid  TEXT    NOT NULL,
  makam     TEXT    NOT NULL,
  baslangic INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, makam)
);

-- Seçimin adayları. secim, seçimin başlangıcıdır (ms, metin). sira, oylar eşitse önce aday olanı seçer.
CREATE TABLE IF NOT EXISTS makam_aday (
  chat_jid TEXT    NOT NULL,
  secim    TEXT    NOT NULL,
  makam    TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  oy       INTEGER NOT NULL DEFAULT 0,
  sira     INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, secim, makam, user_jid)
);

-- Oy gizlidir: kimin oy verdiği tutulur, kime verdiği tutulmaz.
CREATE TABLE IF NOT EXISTS makam_oy (
  chat_jid TEXT NOT NULL,
  secim    TEXT NOT NULL,
  makam    TEXT NOT NULL,
  user_jid TEXT NOT NULL,
  PRIMARY KEY (chat_jid, secim, makam, user_jid)
);

-- Makamdaki kişi; yeni seçilen gelene kadar kalır. kalici = darbe (başkan) ya da kayyum (bakanlık), o makamın seçimi askıdadır.
-- karar_gun, yetkinin (faiz kararı, bakan yetkisi) son kullanıldığı gün.
CREATE TABLE IF NOT EXISTS makam (
  chat_jid  TEXT    NOT NULL,
  makam     TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  kalici    INTEGER NOT NULL DEFAULT 0,
  karar_gun TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (chat_jid, makam)
);

-- Başkanın bugün hazineden kime ne kadar aktardığı. Eski günler aktarımda silinir.
CREATE TABLE IF NOT EXISTS hazine_aktarim (
  chat_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  miktar   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, day, user_jid)
);

-- .evlen: çift için iki satır, her iki yönden de tek sorguyla bulunsun.
CREATE TABLE IF NOT EXISTS evlilik (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  es_jid   TEXT    NOT NULL,
  tarih    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .meslek: seçilen meslek, seçim anı ve son .çalış anı (ms).
CREATE TABLE IF NOT EXISTS meslek (
  chat_jid    TEXT    NOT NULL,
  user_jid    TEXT    NOT NULL,
  kod         TEXT    NOT NULL,
  secim       INTEGER NOT NULL,
  son_calisma INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .vergikaçır: bir sonraki vergi kesiminde kaçma planı ve son denemenin sonucu.
CREATE TABLE IF NOT EXISTS vergi_kacak (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  aktif    INTEGER NOT NULL DEFAULT 0,
  sonuc    TEXT    NOT NULL DEFAULT '',
  tutar    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .tüik: gün içinde ödenen toplam maaş.
CREATE TABLE IF NOT EXISTS maas_gun (
  chat_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  toplam   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, day)
);

-- .vergitop: kişinin bugüne kadar ödediği toplam servet vergisi.
CREATE TABLE IF NOT EXISTS vergi (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  toplam   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .meslek: kariyeri biten meslekler, aynı kişi bir daha seçemez.
CREATE TABLE IF NOT EXISTS meslek_biten (
  chat_jid TEXT NOT NULL,
  user_jid TEXT NOT NULL,
  kod      TEXT NOT NULL,
  PRIMARY KEY (chat_jid, user_jid, kod)
);

-- .çete: anahtar küçük harfli addır, ad yazıldığı gibi gösterilir.
CREATE TABLE IF NOT EXISTS cete (
  chat_jid TEXT    NOT NULL,
  anahtar  TEXT    NOT NULL,
  ad       TEXT    NOT NULL,
  lider    TEXT    NOT NULL,
  kasa     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, anahtar)
);

CREATE TABLE IF NOT EXISTS cete_uye (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  anahtar  TEXT    NOT NULL,
  katilma  INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .sus ile susturulmuş gruplar. Bot yeniden başlayınca da susmaya devam etsin
-- diye kalıcı; aksi halde her çökmede bot kendiliğinden "konuşmaya" başlar.
CREATE TABLE IF NOT EXISTS muted_chats (
  chat_jid TEXT    PRIMARY KEY,
  muted_at INTEGER NOT NULL
);

-- Bakanlık yetkisinin günlük sayacı. Makamdaki kişi değişince sayaç sıfırdan başlar.
CREATE TABLE IF NOT EXISTS bakan_hak (
  chat_jid TEXT    NOT NULL,
  makam    TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  adet     INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, makam)
);

-- Dışişleri ambargosu: bitişe kadar kişi XP, coin ve mülk gönderemez.
CREATE TABLE IF NOT EXISTS ambargo (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  bitis    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .sustur ile susturulan üyeler: bot mesajlarını siler. bitis 0 = kaldırılana kadar.
CREATE TABLE IF NOT EXISTS susturulan_uye (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  bitis    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Bot geneli ayarlar (anahtar → değer). Şimdilik yalnızca sahibin gizli kumar şansı.
CREATE TABLE IF NOT EXISTS ayar (
  anahtar TEXT PRIMARY KEY,
  deger   TEXT NOT NULL
);

-- Web panelinde kumar oynayacak üyelerin girişi. Kişi bota özelden \`.panel kayıt\` yazar,
-- bulunduğu her grup için bir satır açılır. Gruptan çıkan ya da atılanın satırı silinir.
-- numara ve lid giriş adıdır (yalnızca rakam), sifre scrypt özetidir. surum kayıt anıdır:
-- şifre değişince eski oturumlar düşer.
CREATE TABLE IF NOT EXISTS panel_hesap (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  numara   TEXT    NOT NULL DEFAULT '',
  lid      TEXT    NOT NULL DEFAULT '',
  sifre    TEXT    NOT NULL,
  surum    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
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

-- .wordle: kişinin bugünkü deneme sayısı ve çözdü mü. Tahminler saklanmaz.
CREATE TABLE IF NOT EXISTS wordle (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  deneme   INTEGER NOT NULL DEFAULT 0,
  cozuldu  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- .wordle grup tahtası: bugün toplam kaç tahmin yapıldı, kim bildi. Bilen varsa gün kapanmıştır.
CREATE TABLE IF NOT EXISTS wordle_grup (
  chat_jid TEXT    PRIMARY KEY,
  day      TEXT    NOT NULL,
  toplam   INTEGER NOT NULL DEFAULT 0,
  cozen    TEXT
);

-- .kumarkarnem: oyun başına döküm. Tablodan önceki oyunlar yalnızca \`kumar\` toplamındadır.
CREATE TABLE IF NOT EXISTS kumar_oyun (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  oyun     TEXT    NOT NULL,
  won      INTEGER NOT NULL DEFAULT 0,
  lost     INTEGER NOT NULL DEFAULT 0,
  games    INTEGER NOT NULL DEFAULT 0,
  en_buyuk INTEGER NOT NULL DEFAULT 0,
  en_kotu  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid, oyun)
);

-- Günlük kumar tavanı: kişinin bugün bota karşı oyunlardan net kazancı ve günün ilk kumarında
-- sabitlenen tavan. Gün değişince satır sıfırlanır.
CREATE TABLE IF NOT EXISTS kumar_gun (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  net      INTEGER NOT NULL DEFAULT 0,
  tavan    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Reborn: grubun ekonomisinin sıfırlandığı anlar. zaman ms; arz ve kur sıfırlanmadan önceki son değerdir.
CREATE TABLE IF NOT EXISTS reborn (
  chat_jid TEXT    NOT NULL,
  no       INTEGER NOT NULL,
  zaman    INTEGER NOT NULL,
  arz      INTEGER NOT NULL,
  kur      INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, no)
);

-- Reborn anındaki en zenginler: profilde kalıcı yıldız, panelde Devirler kartı.
CREATE TABLE IF NOT EXISTS reborn_zengin (
  chat_jid TEXT    NOT NULL,
  no       INTEGER NOT NULL,
  sira     INTEGER NOT NULL,
  user_jid TEXT    NOT NULL,
  servet   INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, no, sira)
);

-- .pet: kişi başı tek hayvan. Tokluk ve mutluluk \`guncelleme\` anındaki değerdir, sonrası hesaplanır.
CREATE TABLE IF NOT EXISTS pet (
  chat_jid   TEXT    NOT NULL,
  user_jid   TEXT    NOT NULL,
  tur        TEXT    NOT NULL,
  ad         TEXT    NOT NULL,
  tokluk     REAL    NOT NULL,
  mutluluk   REAL    NOT NULL,
  guncelleme INTEGER NOT NULL,
  pet_xp     INTEGER NOT NULL DEFAULT 0,
  son_oyun   INTEGER NOT NULL DEFAULT 0,
  son_hediye INTEGER NOT NULL DEFAULT 0,
  dogum      INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Panelin sosyal bölümü (Faz 66). Her şey gruba aittir: grup bir "ağ"dır, üyeleri
-- otomatik arkadaştır. user_jid '' bot gönderisidir. hedef_jid doluysa başkasının duvarına
-- yazılmıştır. medya data/medya/ altındaki dosyanın adıdır (32 hex), '' yok demektir.
CREATE TABLE IF NOT EXISTS sosyal_gonderi (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid  TEXT    NOT NULL,
  user_jid  TEXT    NOT NULL,
  hedef_jid TEXT    NOT NULL DEFAULT '',
  metin     TEXT    NOT NULL DEFAULT '',
  medya     TEXT    NOT NULL DEFAULT '',
  alinti_id INTEGER NOT NULL DEFAULT 0,
  kaynak    TEXT    NOT NULL DEFAULT '',
  zaman     INTEGER NOT NULL,
  duzenlendi INTEGER NOT NULL DEFAULT 0,
  vurgun    TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sosyal_gonderi_akis ON sosyal_gonderi (chat_jid, id DESC);

-- Anket gönderisi (Faz 69): seçenekler JSON dizisi; oy kişi başı bir, değiştirilebilir.
CREATE TABLE IF NOT EXISTS sosyal_anket (
  gonderi_id INTEGER PRIMARY KEY,
  secenekler TEXT    NOT NULL,
  bitis      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sosyal_anket_oy (
  gonderi_id INTEGER NOT NULL,
  user_jid   TEXT    NOT NULL,
  secim      INTEGER NOT NULL,
  zaman      INTEGER NOT NULL,
  PRIMARY KEY (gonderi_id, user_jid)
);

-- Tepki: kişi başı bir emoji (SOSYAL_TEPKILER). Faz 66'nın beğenileri ❤️ sayılır.
CREATE TABLE IF NOT EXISTS sosyal_begeni (
  gonderi_id INTEGER NOT NULL,
  user_jid   TEXT    NOT NULL,
  tepki      TEXT    NOT NULL DEFAULT '❤️',
  zaman      INTEGER NOT NULL,
  PRIMARY KEY (gonderi_id, user_jid)
);

-- yanit_id: yanıtlanan ana yorum (Faz 68), 0 = gönderiye yorum. Tek seviyedir.
CREATE TABLE IF NOT EXISTS sosyal_yorum (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gonderi_id INTEGER NOT NULL,
  user_jid   TEXT    NOT NULL,
  metin      TEXT    NOT NULL,
  yanit_id   INTEGER NOT NULL DEFAULT 0,
  zaman      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sosyal_yorum_gonderi ON sosyal_yorum (gonderi_id, id);

CREATE TABLE IF NOT EXISTS sosyal_yorum_tepki (
  yorum_id INTEGER NOT NULL,
  user_jid TEXT    NOT NULL,
  tepki    TEXT    NOT NULL,
  zaman    INTEGER NOT NULL,
  PRIMARY KEY (yorum_id, user_jid)
);

CREATE TABLE IF NOT EXISTS sosyal_profil (
  chat_jid TEXT NOT NULL,
  user_jid TEXT NOT NULL,
  bio      TEXT NOT NULL DEFAULT '',
  avatar   TEXT NOT NULL DEFAULT '',
  kapak    TEXT NOT NULL DEFAULT '',
  -- Faz 72: sabitlenen gönderi, 24 saatlik durum, son panel isteği (çevrimiçi), akışta görülen son gönderi.
  sabit        INTEGER NOT NULL DEFAULT 0,
  durum        TEXT    NOT NULL DEFAULT '',
  durum_bitis  INTEGER NOT NULL DEFAULT 0,
  aktif        INTEGER NOT NULL DEFAULT 0,
  akis_gorulen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Özel mesajlar WhatsApp'a gitmez, panelde kalır. okundu 0/1.
CREATE TABLE IF NOT EXISTS sosyal_dm (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid TEXT    NOT NULL,
  gonderen TEXT    NOT NULL,
  alici    TEXT    NOT NULL,
  metin    TEXT    NOT NULL DEFAULT '',
  medya    TEXT    NOT NULL DEFAULT '',
  zaman    INTEGER NOT NULL,
  okundu   INTEGER NOT NULL DEFAULT 0,
  hikaye_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sosyal_dm_alici ON sosyal_dm (chat_jid, alici, okundu);
CREATE INDEX IF NOT EXISTS sosyal_dm_cift ON sosyal_dm (chat_jid, gonderen, alici, id);

-- Hikâye her izleyiciye bir kez görünür; panel hesabı olan herkes görünce ya da
-- HIKAYE_AZAMI_MS dolunca dosyasıyla silinir.
CREATE TABLE IF NOT EXISTS sosyal_hikaye (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  medya    TEXT    NOT NULL,
  metin    TEXT    NOT NULL DEFAULT '',
  zaman    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sosyal_izleme (
  hikaye_id INTEGER NOT NULL,
  user_jid  TEXT    NOT NULL,
  zaman     INTEGER NOT NULL,
  tepki     TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (hikaye_id, user_jid)
);

-- tur: begeni | yorum | etiket | duvar | durt. DM'nin kendi okundu alanı var.
CREATE TABLE IF NOT EXISTS sosyal_bildirim (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid   TEXT    NOT NULL,
  user_jid   TEXT    NOT NULL,
  kimden     TEXT    NOT NULL,
  tur        TEXT    NOT NULL,
  gonderi_id INTEGER NOT NULL DEFAULT 0,
  zaman      INTEGER NOT NULL,
  okundu     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sosyal_bildirim_kisi ON sosyal_bildirim (chat_jid, user_jid, id DESC);

CREATE TABLE IF NOT EXISTS sosyal_durt (
  chat_jid TEXT    NOT NULL,
  kimden   TEXT    NOT NULL,
  kime     TEXT    NOT NULL,
  zaman    INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, kimden, kime)
);

-- Web Push abonelikleri (Faz 67). Cihaza aittir, kişiye numara/lid ile bağlanır
-- (bir kişi birden çok grupta olabilir). Push boş gider, servis işçisi özeti panelden çeker.
CREATE TABLE IF NOT EXISTS sosyal_push (
  endpoint TEXT    PRIMARY KEY,
  numara   TEXT    NOT NULL DEFAULT '',
  lid      TEXT    NOT NULL DEFAULT '',
  zaman    INTEGER NOT NULL
);

-- Gönderi XP'si günde SOSYAL_XP_HAKKI kez verilir.
CREATE TABLE IF NOT EXISTS sosyal_xp (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  adet     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);

-- Grup sohbeti (Faz 70): birden çok kişilik DM. son_okunan, üyenin okuduğu son mesaj id'sidir
-- (okunmamış sayısı ve "görenler" buradan çıkar). gonderen '' sistem notudur (kurdu, ekledi, ayrıldı).
CREATE TABLE IF NOT EXISTS sosyal_sohbet (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid TEXT    NOT NULL,
  ad       TEXT    NOT NULL,
  kuran    TEXT    NOT NULL,
  zaman    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sosyal_sohbet_uye (
  sohbet_id  INTEGER NOT NULL,
  user_jid   TEXT    NOT NULL,
  son_okunan INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sohbet_id, user_jid)
);
CREATE TABLE IF NOT EXISTS sosyal_sohbet_mesaj (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sohbet_id INTEGER NOT NULL,
  gonderen  TEXT    NOT NULL,
  metin     TEXT    NOT NULL DEFAULT '',
  medya     TEXT    NOT NULL DEFAULT '',
  zaman     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sosyal_sohbet_mesaj_akis ON sosyal_sohbet_mesaj (sohbet_id, id);

-- Etkinlik gönderisi (Faz 70). durum: evet | belki | hayir. hatirlatildi: başlamadan önce
-- katılanlara bildirim bir kez gitti.
CREATE TABLE IF NOT EXISTS sosyal_etkinlik (
  gonderi_id   INTEGER PRIMARY KEY,
  baslik       TEXT    NOT NULL,
  yer          TEXT    NOT NULL DEFAULT '',
  zaman        INTEGER NOT NULL,
  hatirlatildi INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sosyal_katilim (
  gonderi_id INTEGER NOT NULL,
  user_jid   TEXT    NOT NULL,
  durum      TEXT    NOT NULL,
  zaman      INTEGER NOT NULL,
  PRIMARY KEY (gonderi_id, user_jid)
);

-- Haftanın gönderisi (Faz 70): gazete seçer, sahibi XP alır. hafta: pazartesi (haftaAnahtari).
CREATE TABLE IF NOT EXISTS sosyal_hafta_gonderi (
  chat_jid   TEXT    NOT NULL,
  hafta      TEXT    NOT NULL,
  gonderi_id INTEGER NOT NULL,
  user_jid   TEXT    NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, hafta)
);

-- Panel oturumları (Faz 72): panel yeniden başlayınca kimse düşmesin. Jetonun kendisi değil
-- sha256 özeti saklanır, veritabanı sızsa da oturum çalınamaz. veri: oturumun sahibi (JSON).
CREATE TABLE IF NOT EXISTS panel_oturum (
  ozet  TEXT    PRIMARY KEY,
  veri  TEXT    NOT NULL,
  bitis INTEGER NOT NULL
);

-- Kaydedilen gönderiler (Faz 72): yalnızca kaydeden görür.
CREATE TABLE IF NOT EXISTS sosyal_kayit (
  chat_jid   TEXT    NOT NULL,
  user_jid   TEXT    NOT NULL,
  gonderi_id INTEGER NOT NULL,
  zaman      INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid, gonderi_id)
);

-- .sulymarket: kişinin kullanmadığı ürünleri (hacker, VPN, çilingir, firar planı).
CREATE TABLE IF NOT EXISTS karaborsa (
  chat_jid TEXT    NOT NULL,
  user_jid TEXT    NOT NULL,
  kod      TEXT    NOT NULL,
  adet     INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, user_jid, kod)
);
-- .hack: günlük hak, hacklenen kişinin korunması ve güvenlik duvarının bitişi.
CREATE TABLE IF NOT EXISTS hack (
  chat_jid      TEXT    NOT NULL,
  user_jid      TEXT    NOT NULL,
  day           TEXT    NOT NULL DEFAULT '',
  adet          INTEGER NOT NULL DEFAULT 0,
  korunma_until INTEGER NOT NULL DEFAULT 0,
  duvar_until   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, user_jid)
);
-- Çete cephaneliği ve baskın beklemeleri.
CREATE TABLE IF NOT EXISTS cete_silah (
  chat_jid TEXT    NOT NULL,
  anahtar  TEXT    NOT NULL,
  kod      TEXT    NOT NULL,
  adet     INTEGER NOT NULL,
  PRIMARY KEY (chat_jid, anahtar, kod)
);
CREATE TABLE IF NOT EXISTS cete_baskin (
  chat_jid      TEXT    NOT NULL,
  anahtar       TEXT    NOT NULL,
  son_saldiri   INTEGER NOT NULL DEFAULT 0,
  korunma_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, anahtar)
);
-- .nft: satılmış mahluklar. fiyat: istenen Suly (birim), 0 satılık değil.
CREATE TABLE IF NOT EXISTS nft (
  chat_jid TEXT    NOT NULL,
  no       INTEGER NOT NULL,
  user_jid TEXT    NOT NULL,
  fiyat    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_jid, no)
);

-- Gönderiye XP bahşişi (Faz 72). Para .devret ile aynı yoldan (xpDevret) geçer, satır yalnızca kayıttır.
CREATE TABLE IF NOT EXISTS sosyal_bahsis (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid   TEXT    NOT NULL,
  gonderi_id INTEGER NOT NULL,
  kimden     TEXT    NOT NULL,
  kime       TEXT    NOT NULL,
  xp         INTEGER NOT NULL,
  zaman      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sosyal_bahsis_gonderi ON sosyal_bahsis (gonderi_id);
`

/**
 * CREATE TABLE IF NOT EXISTS var olan tabloyu değiştirmez; önceki sürümden kalan
 * veritabanı burada yeni sütunlara taşınır, bakiyeler ve fiyatlar korunur.
 */
function eskiTablolariTasi(baglanti) {
  const sutunVar = (tablo, sutun) => baglanti.pragma(`table_info(${tablo})`).some((s) => s.name === sutun)
  const tabloVar = (ad) => Boolean(baglanti.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ad))

  baglanti.transaction(() => {
    if (sutunVar('banka', 'faiz_day')) {
      baglanti.exec(`
        ALTER TABLE banka ADD COLUMN faiz_saat INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE banka ADD COLUMN faiz_artik REAL NOT NULL DEFAULT 0;
        UPDATE banka SET faiz_saat = CAST(strftime('%s', faiz_day) AS INTEGER) / 3600 WHERE faiz_day != '';
        ALTER TABLE banka DROP COLUMN faiz_day;
      `)
    }
    // Faz 67: alıntı ve emoji tepkisi.
    if (tabloVar('sosyal_gonderi') && !sutunVar('sosyal_gonderi', 'alinti_id')) {
      baglanti.exec('ALTER TABLE sosyal_gonderi ADD COLUMN alinti_id INTEGER NOT NULL DEFAULT 0')
    }
    if (tabloVar('sosyal_gonderi') && !sutunVar('sosyal_gonderi', 'kaynak')) {
      baglanti.exec("ALTER TABLE sosyal_gonderi ADD COLUMN kaynak TEXT NOT NULL DEFAULT ''")
    }
    if (tabloVar('sosyal_yorum') && !sutunVar('sosyal_yorum', 'yanit_id')) {
      baglanti.exec('ALTER TABLE sosyal_yorum ADD COLUMN yanit_id INTEGER NOT NULL DEFAULT 0')
    }
    if (tabloVar('sosyal_begeni') && !sutunVar('sosyal_begeni', 'tepki')) {
      baglanti.exec("ALTER TABLE sosyal_begeni ADD COLUMN tepki TEXT NOT NULL DEFAULT '❤️'")
    }
    // Faz 70: hikâyeye yanıt DM olarak düşer, tepki izleyen satırında görünür.
    if (tabloVar('sosyal_dm') && !sutunVar('sosyal_dm', 'hikaye_id')) {
      baglanti.exec('ALTER TABLE sosyal_dm ADD COLUMN hikaye_id INTEGER NOT NULL DEFAULT 0')
    }
    if (tabloVar('sosyal_izleme') && !sutunVar('sosyal_izleme', 'tepki')) {
      baglanti.exec("ALTER TABLE sosyal_izleme ADD COLUMN tepki TEXT NOT NULL DEFAULT ''")
    }
    // Faz 72: düzenleme, kazanç kartı, sabit gönderi, durum, çevrimiçi ve okunan yer.
    if (tabloVar('sosyal_gonderi') && !sutunVar('sosyal_gonderi', 'duzenlendi')) {
      baglanti.exec('ALTER TABLE sosyal_gonderi ADD COLUMN duzenlendi INTEGER NOT NULL DEFAULT 0')
    }
    if (tabloVar('sosyal_gonderi') && !sutunVar('sosyal_gonderi', 'vurgun')) {
      baglanti.exec("ALTER TABLE sosyal_gonderi ADD COLUMN vurgun TEXT NOT NULL DEFAULT ''")
    }
    for (const [sutun, tanim] of [['sabit', 'INTEGER NOT NULL DEFAULT 0'], ['durum', "TEXT NOT NULL DEFAULT ''"], ['durum_bitis', 'INTEGER NOT NULL DEFAULT 0'],
      ['aktif', 'INTEGER NOT NULL DEFAULT 0'], ['akis_gorulen', 'INTEGER NOT NULL DEFAULT 0']]) {
      if (tabloVar('sosyal_profil') && !sutunVar('sosyal_profil', sutun)) baglanti.exec(`ALTER TABLE sosyal_profil ADD COLUMN ${sutun} ${tanim}`)
    }
    if (!sutunVar('banka', 'bekleyen')) {
      baglanti.exec('ALTER TABLE banka ADD COLUMN bekleyen INTEGER NOT NULL DEFAULT 0')
    }
    // Askıdaki tek makamlı seçimin tabloları. Taşınmaz: eski başkan geri gelmesin, ilk başkan bot
    // sahibidir (bot sahibinin kararı). Yeni seçim makam_* tablolarındadır.
    if (tabloVar('baskan')) {
      baglanti.exec(`
        DROP TABLE baskan;
        DROP TABLE IF EXISTS secim_aday;
        DROP TABLE IF EXISTS secim_oy;
      `)
    }
    // Haftalık makam seçiminden 30 dakikalığa. Bekleyen seçim ilk adaylık anında (sira, ms) başlamış
    // sayılır: süresi taşınırken dolmuşsa ilk okumada kapanır.
    if (sutunVar('makam_aday', 'hafta')) {
      baglanti.exec(`
        ALTER TABLE makam_aday RENAME COLUMN hafta TO secim;
        ALTER TABLE makam_oy RENAME COLUMN hafta TO secim;
      `)
      const secimler = baglanti.prepare('SELECT chat_jid, makam, secim, MIN(sira) AS ilk FROM makam_aday GROUP BY chat_jid, makam, secim').all()
      for (const { chat_jid: chat, makam, secim, ilk } of secimler) {
        baglanti.prepare('INSERT OR IGNORE INTO makam_secim (chat_jid, makam, baslangic) VALUES (?, ?, ?)').run(chat, makam, ilk)
        for (const tablo of ['makam_aday', 'makam_oy']) {
          baglanti.prepare(`UPDATE ${tablo} SET secim = ? WHERE chat_jid = ? AND makam = ? AND secim = ?`).run(String(ilk), chat, makam, secim)
        }
      }
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
