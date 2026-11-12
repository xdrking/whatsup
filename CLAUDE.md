# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje Amacı ve Kapsamı

Kişisel, eğlence amaçlı bir WhatsApp botu. Tek bir arkadaş grubunda kullanılır.

- **Ticari değil.** Ücretli özellik, müşteri, SLA yok.
- **Toplu mesaj / spam / numara toplama yapılmaz.** Bot yalnızca kendisine gelen komutlara yanıt verir; kendiliğinden mesaj başlatmaz. İstisnalar sahibin `.darbe`'si (grup üyelerine özelden yazar, Faz 49) ve susturulduğu halde yazmaya devam edene özelden giden uyarıdır (Faz 54); ikisi de bot sahibinin kararıdır, ban riski bilerek kabul edildi.
- Kod kalitesi hedefi: bir kişinin altı ay sonra okuyup anlayabileceği sadelik. Üretim ölçekli soyutlama, DI container, mikroservis vb. **istenmiyor**.

## Stack

| Katman | Seçim |
|---|---|
| Runtime | Node.js 22+, **ESM** (`"type": "module"`) |
| WhatsApp | `@whiskeysockets/baileys` |
| Görsel işleme | `sharp` (statik sticker) |
| Sticker metadata | `node-webpmux` (WebP EXIF pack bilgisi) |
| Video/GIF | sistem `ffmpeg` (animasyonlu WebP) |
| TTS | `google-tts-api` (API key gerekmez) |
| Log | `pino` + `pino-pretty` |
| QR | `qrcode-terminal` |
| Config | `dotenv` |
| İstatistik veritabanı | `better-sqlite3` (tek dosya SQLite, senkron API) |

`ffmpeg` bir npm paketi değil, **sistem bağımlılığıdır**. Yoksa `.sticker` komutunun video kolu çalışmaz.

Alıntı sticker'ı da sistemdeki **fontlara** bağlıdır: `lib/quote.js` metni sharp/libvips üzerinden pango ile çizer, pango da fontconfig'ten okur. `DejaVu Sans` (Türkçe karakterler) ve renkli emoji fontu kurulu değilse metin kutu karakterlere döner. Kontrol: `fc-list | grep -i dejavu`.

### Baileys sürümü sabittir — yükseltme

`@whiskeysockets/baileys` **`6.7.24` olarak tam sabitlenmiştir** (`^` yok). Sebep:

- npm'in `latest` tag'i `7.0.0-rc14`'ü gösteriyor ve bu sürüm bağlantıyı QR üretmeden `428 Connection Terminated` ile kapatıyor (2026-08 itibarıyla test edildi). `6.7.24` sorunsuz QR üretiyor.
- `^6.7.24` yazılırsa npm `6.17.16`'ya çıkar; bu da doğrulanmamış bir sürümdür.

Yükseltme denenecekse: sürümü değiştir, `npm start` ile QR'ın gerçekten basıldığını gör, sonra bırak. QR basılmıyorsa `6.7.24`'e geri dön.

`better-sqlite3` yerine `node:sqlite` **kullanılmıyor**: Node 22'de hâlâ
`--experimental-sqlite` bayrağı gerektiriyor, `npm start` ise bayraksız çalışıyor.
`better-sqlite3` senkron olduğu için tek süreçli bu botta yazma sırası zaten
seriliş — ayrı bir kilit/kuyruk katmanı gerekmez.

`google-tts-api`, açığı bulunan `axios@0.21.4`'ü çekiyor. `package.json` içindeki `overrides` bloğu bunu `axios@1.x`'e yükseltir — bu blok silinmemeli (`npm audit`: 0 açık).

## Komutlar

```bash
npm install        # bağımlılıklar
npm start          # botu başlat (node index.js)
npm run dev        # otomatik yeniden başlatmalı geliştirme (node --watch index.js)
npm test           # node --test: test/*.test.js
npm run panel      # web panelini başlat (bottan ayrı süreç)
npm run panel:sifre  # panel şifresi üret, .env satırını yazar
```

Otomatik testler (`test/`) WhatsApp bağlantısı gerektirmeyen kısmı kapsar: hesap
ayrıştırıcısı, bekleme süresi, oyun cevap eşleştirme, XP/günlük seri, `.foto`
efektleri, komut sözleşmesi ve içerik havuzlarının biçimi. Testler `STATS_DB=:memory:`
ile çalışır, `data/stats.db`'ye dokunmaz. Soket davranışı (mesaj gönderme, medya
indirme, gruplar) hâlâ canlı bağlantıyla elle doğrulanır (aşağıya bak).

Yeni komut ya da havuz eklendiğinde `npm test` çalıştırılır: `test/komutlar.test.js`
kategori, ad çakışması, `details` biçimi ve `data/*.json` hatalarını yakalar.

## Klasör Yapısı

```
index.js        Giriş noktası: Baileys soketi, QR, yeniden bağlanma, event kaydı
lib/            Paylaşılan yardımcılar (logger, mesaj parse, komut yönlendirme)
commands/       Her komut ayrı dosya + index.js komutları otomatik yükler
games/          Oyun mantığı ve oyun veri havuzları (.kelime, .kimim, .quiz, .düello, .emoji, .adamasmaca, .evlen, .dava, .hilo, .kule, .yarış, .wordle, .tabu, .vampir)
panel/          Web paneli: bottan ayrı süreç, istatistiği salt okunur okur, kumarhane XP yazar (Faz 58)
scripts/        Tek seferlik bakım raporları, veritabanını salt okunur açar (`wordle-rapor.js`)
test/           node --test dosyaları (soket gerektirmeyen mantık)
data/           Eğlence komutlarının içerik havuzları (JSON dizileri) + stats.db
auth/           Baileys oturum dosyaları — GİT'E ASLA GİRMEZ
temp/           Medya işleme sırasında geçici dosyalar — her işlemden sonra silinir
```

`games/` içindeki `.js` dosyaları komut değildir; `commands/index.js` klasörü düz
tarar, alt klasöre inmez. Oyun komutları `commands/kelime.js`, `commands/kimim.js`,
`commands/quiz.js`, `commands/duello.js`, `commands/emoji.js`, `commands/adamasmaca.js` ve
`commands/oyunbitir.js`'tir; gövde `games/` altındadır.

`data/*.json` dosyaları **elle yazılmış içerik havuzlarıdır** (şaka, fal, roast…).
Biçim: düz string dizisi. Kod bu dosyaları asla yazmaz, yalnızca okur.
`data/stats.db` ise SQLite veritabanıdır ve commit edilmez.

## Mimari

Akış tek yönlü ve kısa:

```
index.js (soket + connection.update + messages.upsert)
   -> lib/handler.js       prefix kontrolü, yetki, komut çözümleme
      -> lib/messageParser.js   ham Baileys mesajını düz nesneye çevirir
      -> commands/<ad>.js       execute() çağrılır
```

**Bilinmesi gereken üç şey:**

1. **`commands/index.js` klasörü tarar.** Yeni komut eklemek = `commands/` içine dosya koymak. Router'a, `index.js`'e veya bir kayıt listesine dokunulmaz. Komut adı ve alias'ları dosyanın kendi export'undan okunur.

2. **Baileys mesaj nesnesi iç içedir** (`conversation`, `extendedTextMessage.text`, `imageMessage.caption`, `message.ephemeralMessage.message...`). Bu karmaşa **yalnızca `lib/messageParser.js` içinde** çözülür. Komut dosyaları asla `msg.message.extendedTextMessage...` şeklinde derine inmez; parse edilmiş nesneyi kullanır.

3. **Yanıtlanan mesaj (quoted) sticker için kritiktir.** Medya, komutun yazıldığı mesajda değil, yanıtlanan mesajda bulunur. Parser bunu `quoted` alanında hazır verir.

### `messages.upsert` olay tipleri

`event.type` **`notify` ve `append` olmak üzere ikisi de işlenmelidir.**

- `notify` — başkasından gelen yeni mesaj
- `append` — bu hesabın **kendi cihazından** gönderilen mesaj

Bot sahibi kendi telefonundan komut yazdığında olay `append` tipiyle düşer. Yalnızca `notify` kabul eden bir filtre, bot sahibi için **hiçbir komutun çalışmamasına** yol açar — belirti "bot tamamen sessiz" olduğu için bağlantı sorunu sanılır. Bu hata bir kez yapıldı, tekrar edilmemeli.

Geçmiş senkronu upsert'ten gelmez, `messaging-history.set` olayından gelir. Eski mesajların tekrar işlenmesine karşı doğru koruma tip filtresi değil, `messageTimestamp` yaş kontrolüdür (`index.js`, 90 sn).

Şifresi çözülemeyen mesajlar upsert'e `message: null` ile düşer; komut çıkarılamayacağı için atlanır.

### Ad önbelleği (`lib/contacts.js`)

Baileys, yanıtlanan mesajın **yazarının adını vermez** — `contextInfo` yalnızca JID taşır. Bu yüzden `lib/handler.js`, prefix kontrolünden önce her gelen mesajın `pushName`'ini `rememberName()` ile not eder; `.sticker` alıntı kartı adı oradan okur.

Adlar `isimler` tablosunda da kalıcıdır: grup ya da numara giderse kimin kim olduğu bilinsin diye bot sahibinin kararıyla eklendi. Her mesajda veritabanına gidilmesin diye bellekteki harita önde durur, tabloya yalnızca ad değişince yazılır. Hiç mesajı görülmemiş kişinin adı yoktur, çağıran taraf numaraya düşer.

### Durum (state) nerede tutulur

Komutlar durumsuzdur; durum yalnızca şu yerlerdedir:

| Yer | İçerik | Kalıcılık |
|---|---|---|
| `lib/contacts.js` | JID → pushName | bellek + `data/stats.db` (kalıcı) |
| `lib/activity.js` | sohbet başına son mesaj atanlar (`.son`, `.kimvar`) | bellek (süreçle ölür) |
| `lib/outgoing.js` | botun kendi gönderdiği son 300 mesajın id'si ve gövdesi | bellek (süreçle ölür) |
| `lib/cooldown.js` | kullanıcı+komut başına bekleme süresi | bellek (süreçle ölür) |
| `games/gameManager.js` | grup başına aktif oyun (`.kelime`, `.kimim`, `.quiz`, `.düello`, `.emoji`, `.adamasmaca`, `.blackjack`, `.mayın`, `.hilo`, `.kule`, `.yarış`, `.vs`, `.evlen` teklifi, `.dava`, `.vampir`…) | bellek (süreçle ölür) |
| `games/wordle.js` | grubun bugünkü wordle tahtası (tahmin satırları) | bellek (süreçle ölür) |
| `lib/db.js` + `lib/stats.js` | `.wordle` kişi başı günlük hak, grubun toplam tahmini ve bileni | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | mesaj/sticker/ses sayaçları, XP, saat dağılımı | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | `.günlük` son alınan gün + seri | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | `.çark` hak penceresi ve aktif oyun XP bonusu | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | kumar karnesi (toplam ve oyun başına), günlük kumar tavanı ve `.piyango` biletleri | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | `.görev` ilerlemesi, `.market` unvan/kalkan, `.soygun` hak/korunma, `.ödül` | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | `.kredi` açık borçları | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | coin bakiyesi, toplu soygun hakkı, sigorta, mülkler, günlük kur | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | hapis, seçim, başkan ve bakanlar, hazine aktarımı, evlilik, meslek, çete | `data/stats.db` (kalıcı) |
| `games/darbe.js` | süren darbenin oyları | bellek (süreçle ölür) |
| `lib/db.js` + `lib/stats.js` | `.pet` evcil hayvanlar | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | `.kripto` Suly bakiyeleri ve son Bitcoin fiyatı | `data/stats.db` (kalıcı) |
| `lib/kripto.js` | son çekilen Bitcoin fiyatı (60 sn) | bellek (süreçle ölür) |
| `lib/db.js` + `lib/sahipSans.js` | sahibin gizli kumar şansı açık mı (`.şans`) | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/mute.js` | `.sus` ile susturulan gruplar (bellekte de önbellekli) | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/uyeSustur.js` | `.sustur` ile susturulan üyeler ve bitişleri (bellekte de önbellekli) | `data/stats.db` (kalıcı) |
| `lib/uyeSustur.js` | susturulan üyenin silinen mesaj sayısı | bellek (süreçle ölür) |
| `lib/db.js` + `lib/turkishWords.js` | TDK kelime doğrulama önbelleği | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/panelHesap.js` | panel oyuncu hesapları (`.panel kayıt`) | `data/stats.db` (kalıcı) |
| `panel/kumar.js` | paneldeki açık blackjack/mayın/kule/hi-lo eli ve son sonuç | panel belleği (panelle ölür) |
| `panel/hesap.js` | paneldeki son hesap işleminin bildirimi | panel belleği (panelle ölür) |

Sayaçlar dışında hiçbir mesaj **içeriği** saklanmaz — ne diske ne belleğe. Tek istisna botun **kendi** gönderdiği son 300 mesajdır (`lib/outgoing.js`, yalnızca bellek): alıcının telefonu mesajı çözemeyip yeniden isterse Baileys gövdeyi `index.js`'teki `getMessage` ile alır. `getMessage` verilmezse botla daha önce özel yazışmamış kişide özel mesaj kalıcı olarak "Bu mesaj bekleniyor" der (`.vampir` rolleri böyle kayboldu). Bu kanca kaldırılmaz. Bilinmeyen id'ye `undefined` değil yer tutucu (`KAYIP_MESAJ`) döner: Baileys `undefined`'da yeniden deneme sayacını hiç artırmıyor, her istekte oturumu zorla yeniliyordu; bu döngü bütün oturumları bozup botu `Bad MAC` ile sağır bıraktı.

### Komut sözleşmesi

Her `commands/*.js` dosyası şunu export eder:

```js
export default {
  name: 'sticker',
  aliases: ['s'],
  description: 'Yanıtlanan görsel/video/gif dosyasını sticker yapar',
  usage: '.sticker (bir medyayı yanıtlayarak)',
  ownerOnly: false,
  cooldown: 10,          // opsiyonel, saniye; yoksa 3, 0 = sınırsız
  details: ['…'],        // opsiyonel, `.help <komut>` örnekli açıklaması
  category: 'medya',     // .help başlığı: medya|eğlence|grup|istatistik|araç|oyun|kumar|ekonomi|toplum
  async execute({ sock, msg, args, text, from, sender, parsed, commands, isOwner }) { }
}
```

- `args` — prefix ve komut adı ayrıldıktan sonraki kelime dizisi. Yazılı tutarlar handler'da
  `lib/sayi.js:miktarlariCoz()` ile rakama çevrilmiştir (`50 milyon`, `1,5 milyar`, `50m`, `50.000.000` →
  `50000000`), komut yalnızca rakam okur. Birimsiz ondalık (`0,25`) dokunulmadan gelir. `text` ham kalır
- `text` — aynı bölümün ham hali (`.tts` gibi serbest metin alan komutlar için)
- `from` — sohbetin JID'i (yanıt buraya gider)
- `sender` — mesajı yazan kişinin JID'i (grupta `from`'dan farklıdır)
- `parsed` — `lib/messageParser.js` çıktısı; `parsed.quoted.body` yanıtlanan mesajın metni,
  `parsed.quoted.message` medyası (`downloadMediaMessage`'a doğrudan verilebilir),
  `parsed.mentions` mesajda etiketlenen JID'ler
- `commands` — ad/alias → komut eşlemesi (`.help` bunu kullanır)
- `isOwner` — gönderen `OWNER_NUMBER` (ya da `OWNER_LID`) mı

`category` zorunludur; bilinmeyen kategori `.help`'te "Diğer" başlığına düşer ve
`npm test` hata verir. Başlıkların sırası `commands/help.js:KATEGORILER`'dedir.
`.help` yalnızca komut adlarını yazan kısa menüdür: WhatsApp'ta 100 satırlık liste okunmuyordu.
Açıklamalar `.help <bölüm>` ve `.help tümü`'dedir. Bölüm adı komutla çakışırsa (`.help grup`) bölüm kazanır,
komut `.help .grup` ile açılır.
Makam adları (`.help başkan`, `.help adalet`, `.help makamlar`) makamın görev metnini açar (`lib/devlet.js:makamRehberi`), `başkan` alias'ı olan `.seçim`'i ezer.
`createDatasetCommand` ile üretilen havuz komutları varsayılan olarak `eğlence`'dir.

`details` yalnızca kullanımı tek satıra sığmayan komutlara yazılır (`.tts`, `.efekt`,
oyunlar…); `.ping`, `.zar` gibi basit komutlarda yoktur. Değer koddan türetilebiliyorsa
elle tekrar yazılmaz: `.efekt`'in listesi `EFEKTLER`'den üretilir.

### Yetki

Komutlar varsayılan olarak herkese açıktır. `ownerOnly: true` işaretli komutlar yalnızca `.env` içindeki `OWNER_NUMBER` için çalışır. Yetkisiz kullanımda komut sessizce reddedilir, hata detayı sohbete yazılmaz.

Sahip kontrolü `parsed.senderPn` ile yapılır, `parsed.sender` ile **değil**. LID adreslemeli gruplarda `sender` "...@lid" gelir ve rakamları telefon numarası değildir; `senderPn`, Baileys'in `key.participantPn` / `key.senderPn` alanından gelen numaralı JID'dir (yoksa `sender`'a düşer). `sender` bilerek LID olarak kalır: istatistik ve etiketler WhatsApp'ın verdiği kimlikle çalışır.

WhatsApp bazen numarayı hiç vermez (LID'li hesaptan **özel sohbet**: `senderPn` de "...@lid" olur). Bu durumda sahip `.env`'deki `OWNER_LID` (virgülle ayrılmış liste, `@lid` eki isteğe bağlı) ile tanınır; eşleşme yalnızca `sender` gerçekten "...@lid" ise yapılır. Değer log'daki "Yetkisiz komut denemesi" satırından ya da grupta `.id` çıktısından alınır.

Grup admini kontrolü `lib/group.js:senderIsAdmin()` ile yapılır (`.oyunbitir`, `.sus`, `.konuş`, `.sustur`).

JID karşılaştırırken `jidNormalizedUser()` kullan. Baileys yeni sürümlerde grup katılımcısını LID (`@lid`) olarak verebilir; ham string eşitliği (`===`) güvenilir değildir.

### Prefix

`.` — `.env` içindeki `PREFIX` ile değiştirilebilir. Prefix'siz mesajlara bot hiç tepki vermez.

## Kod Stili

- `async/await`. `.then()` zinciri yok.
- Her `execute()` kendi `try/catch`'ini taşır. Hata: kullanıcıya kısa Türkçe mesaj, konsola `logger.error` ile teknik detay.
- Hatalar yutulmaz. Boş `catch {}` veya sessiz `return` yasak — en azından loglanır.
- Geçici dosya oluşturan her akış `finally` bloğunda temizler. Hata durumunda `temp/` dolu kalmamalı.
- Yorum satırı ancak "neden" açıklıyorsa yazılır; "ne" yaptığını kod söylesin.

## Güvenlik Kuralları

**`auth/` klasörü asla commit edilmez.** İçindeki oturum dosyaları telefon numarasını ve WhatsApp kimlik anahtarlarını taşır. Sızması, hesabın başkası tarafından ele geçirilmesi anlamına gelir. `.gitignore` içinde olduğu her `git status` öncesi varsayılan kabul edilmez, gerektiğinde doğrulanır.

**`.env` commit edilmez.** Paylaşılan şablon `.env.example`'dır ve içinde gerçek değer bulunmaz.

**`data/yedek/` commit edilmez**, `stats.db` ile aynı veriyi taşır.

**`data/stats.db` commit edilmez.** İçinde grup üyelerinin JID'leri, WhatsApp adları ve aktivite sayaçları vardır. Mesaj içeriği tutulmaz, ama JID listesi de paylaşılacak bir şey değildir. `data/*.json` havuzları commit edilir.

Oturum dosyalarının içeriği (creds, keys) hiçbir koşulda loglanmaz. `pino` logger'ı Baileys'e verilirken seviye `silent`/`warn` tutulur; `level: 'debug'` protokol mesajlarını ham haliyle konsola döker.

## Yapılmayacaklar

- `printQRInTerminal` kullanma — Baileys'te deprecated. QR, `connection.update` event'inden alınıp `qrcode-terminal` ile basılır.
- `DisconnectReason.loggedOut` sonrası yeniden bağlanmayı deneme — oturum ölmüştür, sonsuz döngüye girer. `auth/` temizlenip yeni QR okutulması gerekir; konsola bunu açıkça yaz.
- İndirilen medyayı `temp/` dışında bırakma, işlem sonrası silmeyi atlama.
- Komut dosyası içinde `process.env` okuma dışında global durum tutma — komutlar durumsuzdur.
- Mention'ı elle biçimlendirme: metinde `@<numara>` yazıp `mentions` dizisini boş bırakma ya da tam JID'i (`@...@s.whatsapp.net`) metne basma. İkisi de tıklanmayan çirkin metin üretir. `lib/target.js` içindeki `mentionOf()` kullanılır.
- Sıralama listelerinde etiket atma (`.top`, `.servet top`, `.kumartop`, `.tüik`, `.vergitop`, `.sezon`, `.özet`): ad `lib/target.js:displayName()` ile düz yazılır, `mentions` boş kalır. Her çağrıda listedeki herkese bildirim gidiyordu (bot sahibinin kararı). İstisna `.sezon` kapanışındaki ödül alanlardır, haftada bir kez etiketlenir.
- `.kimvar`'ı "online listesi" gibi sunma — bkz. Faz 8.
- `data/*.json` havuzlarını koddan yazma/düzenleme; bunlar elle bakılan içeriktir.

## Yol Haritası

Her komut kendi adımında eklenir; bir adım bitmeden sonrakine geçilmez.

- **Faz 1 (tamam):** CLAUDE.md
- **Faz 2:** `package.json`, `index.js` iskeleti, `lib/`, komut router'ı. Komut gövdeleri boş.
- **Faz 3 (tamam):** `.sticker` — `lib/sticker.js` dönüştürmeyi yapar. Görsel: `sharp` ile
  512x512 saydam dolgulu WebP. Video/GIF: `ffmpeg -c:v libwebp_anim`, ilk 6 sn, 800 KB
  sınırını aşarsa kalite basamakları (15/60 → 12/40 → 10/20) ile yeniden denenir.
- **Faz 4 (tamam):** `.tts <metin> | <dil kodu>` — `lib/tts.js`. Google TTS'ten parçalı MP3
  indirilir, `ffmpeg -c:a libopus` ile pipe üzerinden ogg/opus'a çevrilir ve `ptt: true` ile
  sesli mesaj olarak gönderilir (MP3 gönderilirse dosya eki gibi görünür). Sınır 500 karakter.
  Metin yazılmazsa yanıtlanan mesajın metni okunur (`parsed.quoted.body`); dil kodu yine
  komuttan gelir (`.tts | en`).
- **Faz 5 (tamam):** `.help` (kayıt defterinden otomatik liste, `ownerOnly` komutları
  gizler), `.ping`, `.al` (sticker → görsel/video)
- **Faz 6 (tamam):** `.sticker` metin dalı — yanıtlanan düz metin mesajı, yazarının adı ve
  profil fotoğrafıyla birlikte sohbet balonu sticker'ına çevrilir. Çizim `lib/quote.js`
  içinde sharp'ın pango tabanlı `text` girişiyle yapılır (satır kaydırma pango'ya bırakılır,
  karakter genişliği elle hesaplanmaz). Profil fotoğrafı yoksa/gizliyse baş harfli renkli
  daire üretilir. Medya her zaman önceliklidir: açıklamalı bir görsele yanıt verilirse
  görselin kendisi sticker olur, açıklamasının kartı değil.
- **Faz 7 (tamam):** eğlence komutları — `data/*.json` havuzlarından rastgele içerik +
  hedef alan (mention/reply) komutlar. Ayrıntı aşağıda.
- **Faz 8 (tamam):** grup yardımcı komutları — grup bilgisi, üye listesi, etiketleme,
  profil fotoğrafı. Ayrıntı aşağıda.
- **Faz 9 (tamam):** istatistik + XP/level sistemi (SQLite). Kalıcı veri katmanını
  getirdiği için en son yapıldı. Ayrıntı aşağıda.
- **Faz 10 (tamam):** `.kelime` ve `.kimim` grup oyunları — `games/` altında ayrı
  bir oyun katmanı, yanıt (reply) tabanlı cevap akışı. Ayrıntı aşağıda.
- **Faz 11 (tamam):** komut bekleme süresi, `.anket`, `.günlük`, `.quiz`. Ayrıntı aşağıda.
- **Faz 12 (tamam):** LID sahip düzeltmesi, `.sus`/`.konuş`, `.dc`, `.efekt`, `.hava`,
  `.düello`, `.seç`, `.hesap`. Ayrıntı aşağıda.
- **Faz 13 (tamam):** `.help` kategorileri, otomatik testler, `.foto`, `.yaz`,
  `.deprem`, `.döviz`, `.namaz`, `.8top`, `.burç`, `.rozet`. Ayrıntı aşağıda.
- **Faz 14 (tamam):** `.kimim` alternatif cevapları, `.emoji` ve `.adamasmaca`. Ayrıntı aşağıda.
- **Faz 15 (tamam):** XP kumar komutları: `.bahis`, `.slot`, `.rulet`. Ayrıntı aşağıda.
- **Faz 16 (tamam):** `.xpver` — sahibin özelden elle XP vermesi. Ayrıntı aşağıda.
- **Faz 17 (tamam):** `.devret` — kullanıcılar arası XP devri. Ayrıntı aşağıda.
- **Faz 18 (tamam):** `.çark` — günlük haklı şans çarkı ve oyun XP bonusu. Ayrıntı aşağıda.
- **Faz 19 (tamam):** yeni kumar: `.kazı`, `.blackjack`, `.mayın`, `.vs`, `.piyango`, `.çekiliş`, `.kumartop`. Ayrıntı aşağıda.
- **Faz 20 (tamam):** XP oyunları: `.tahmin`, `.karışık`, `.sayıoyunu`. Ayrıntı aşağıda.
- **Faz 21 (tamam):** XP ekonomisi: `.görev`, `.market`, `.soygun`. Ayrıntı aşağıda.
- **Faz 22 (tamam):** `.açıkartırma`. Ayrıntı aşağıda.
- **Faz 23 (tamam):** `.market` random key'leri. Ayrıntı aşağıda.
- **Faz 24 (tamam):** `.ödül`. Ayrıntı aşağıda.
- **Faz 25 (tamam):** `.banka` ve servet vergisi. Ayrıntı aşağıda.
- **Faz 26 (tamam):** `.sezon`. Ayrıntı aşağıda.
- **Faz 27 (tamam):** `.borsa`. Ayrıntı aşağıda.
- **Faz 28 (tamam):** `.kart`. Ayrıntı aşağıda.
- **Faz 29 (tamam):** `.market` vitrini. Ayrıntı aşağıda.
- **Faz 30 (tamam):** saatlik banka faizi, gerçekçi `.borsa`. Faz 25 ve Faz 27 bölümlerine işlendi.
- **Faz 31 (tamam):** web paneli ve günlük yedek. Ayrıntı aşağıda.
- **Faz 32 (tamam):** kumar kayıpları bot numarasının XP'sine gider. Ayrıntı aşağıda.
- **Faz 33 (tamam):** `.haber` parodi haberleri. Ayrıntı aşağıda.
- **Faz 34 (tamam):** `.kredi`, eksi bakiye ve kumar için 500 XP şartı. Ayrıntı aşağıda.
- **Faz 35 (tamam):** `.iflas`. Faz 34 bölümüne işlendi.
- **Faz 36 (tamam):** coin ve `.coinmarket`. Ayrıntı aşağıda.
- **Faz 37 (tamam):** coin kuru, haciz sigortası, `.tüik`, `.mülk`. Faz 36 bölümüne işlendi.
- **Faz 38 (tamam):** `.faizkararı`, `.teşvik`, artan oranlı vergi, panelde ekonomi kartı. Faz 36 bölümüne işlendi.
- **Faz 39 (tamam):** `.hapis`, `.kefalet`, `.seçim` (askıda), `.evlen`, `.boşan`, `.meslek`, `.çalış`, `.çete`, `.dava`, `.özet`. Ayrıntı aşağıda.
- **Faz 40 (tamam):** `.vergitop`, `.vergikaçır`, `.tüik` kasa ve maaş satırları. Faz 25 ve Faz 36 bölümlerine işlendi.
- **Faz 41 (tamam):** `.piyasa` olayları, `.yatırım`, `.tefeci`. Ayrıntı aşağıda.
- **Faz 42 (tamam):** `.plinko`, `.crash`, `.hilo`, `.kule`, `.yarış`, `.wordle`. Ayrıntı aşağıda.
- **Faz 43 (tamam):** `.istifa`, futbolcu onayı, `.coindevret`. Faz 36 ve Faz 39 bölümlerine işlendi.
- **Faz 44 (tamam):** yazılı tutarlar (`50 milyon`) ve `.devret hepsi`. Komut sözleşmesindeki `args` maddesine işlendi.
- **Faz 45 (tamam):** `.servet`, `.kumarkarnem`, `.tabu`. Ayrıntı aşağıda.
- **Faz 46 (tamam):** `.vampir`. Ayrıntı aşağıda.
- **Faz 47 (tamam):** `.pet`. Ayrıntı aşağıda.
- **Faz 48 (tamam):** sıfır atma betiği. Ayrıntı aşağıda.
- **Faz 49 (tamam):** `.seçim` geri döndü, bakanlıklar, `.hazine`, gizli `.darbe`. Ayrıntı aşağıda.
- **Faz 50 (tamam):** `.kripto` ve Suly. Ayrıntı aşağıda.
- **Faz 51 (tamam):** `.mülk devret` ve `.sustur`. Ayrıntı aşağıda.
- **Faz 52 (tamam):** `.kayyum`, Dışişleri ve ambargo, bakanlara günde 5 hak. Ayrıntı aşağıda.
- **Faz 53 (tamam):** günlük kumar kazanç tavanı. Ayrıntı aşağıda.
- **Faz 54 (tamam):** susturmayı dinlemeyenin varlığına el konur. Ayrıntı aşağıda.
- **Faz 55 (tamam):** panelin eksik kartları. Ayrıntı aşağıda.
- **Faz 56 (tamam):** `.coinver`. Ayrıntı aşağıda.
- **Faz 57 (tamam):** `.kumaraf`. Ayrıntı aşağıda.
- **Faz 58 (tamam):** panelde kumar ve `.panel`. Ayrıntı aşağıda.
- **Faz 59 (tamam):** kumarhane görünümü, ses ve animasyon. Faz 58 bölümüne işlendi.
- **Faz 60 (tamam):** kumarhanede yan menü, oyun başına sayfa, hesap bölümü; panelde kumar yasağı yok. Ayrıntı aşağıda.
- **Faz 61 (tamam):** panel blackjack'inde çift, böl, sigorta, teslim. Ayrıntı aşağıda.
- **Faz 62 (tamam):** slot geçiş hatası, lobide vurgun şeridi, telefonda alt menü. Ayrıntı aşağıda.
- **Faz 63+:** yeni komutlar, her biri ayrı adım

### Faz 7 — Eğlence komutları

Ortak altyapı:

- `lib/dataset.js` — `data/*.json` okur, **bir kez** yükleyip önbelleğe alır,
  biçimi doğrular (boş olmayan string dizisi olmalı). Bozuk/boş/eksik dosyada
  `throw` etmez; komut kullanıcıya kısa Türkçe hata yazar, konsola detay düşer.
  Aynı içeriğin arka arkaya çıkmasını engellemek için sohbet+havuz başına son
  seçilenlerin küçük bir geçmişi bellekte tutulur (havuzun ~üçte biri kadar).
- `lib/target.js` — komutun hedef kullanıcısını çözer. Öncelik sırası:
  **mention → yanıtlanan mesajın sahibi → (varsa) yazılan numara**. Hiçbiri
  yoksa komuta göre ya kullanıcının kendisi hedef olur ya da kullanım metni
  yazılır. Mention hep `mentionOf()` ile üretilir, JID ham basılmaz.
- `lib/messageParser.js` artık `mentions` alanı da döner
  (`contextInfo.mentionedJid`); komutlar `contextInfo`'ya elle inmez.

Komutlar:

| Komut | Havuz | Not |
|---|---|---|
| `.saka` | `sakalar.json` | — |
| `.kader` | `kader.json` | — |
| `.fal` | `fallar.json` | — |
| `.haber` | `haberler.json` | büyük harf kalın, altında "parodihaber" etiketi |
| `.kim` | `sorular.json` | — |
| `.gününsözü` | `sozler.json` | **rastgele değil**: tarih seed'li, gün boyu aynı |
| `.iltifat` | `iltifatlar.json` | `{user}` → hedefin mention'ı |
| `.roast` | `roast.json` | `{user}` → hedefin mention'ı |
| `.roastsert` | `roastsert.json` | `{user}` → hedefin mention'ı |
| `.ship` | — | iki hedefin JID'inden hash, **deterministik** yüzde |
| `.zar` | — | 1-6 |
| `.coin` | — | yazı/tura |
| `.meme` | — | ücretsiz `meme-api.com`, API key yok |

`.gününsözü` seed'i **Europe/Istanbul** takvim gününden üretilir
(`Intl.DateTimeFormat` ile, sunucu saat dilimine güvenilmez). Aynı gün içinde
kaç kez çağrılırsa çağrılsın aynı söz döner.

`.ship` yüzdesi iki JID'in **sıralanmış** çiftinden FNV-1a hash ile üretilir:
sıra değişse de sonuç aynıdır ve bot yeniden başlayınca değişmez.

`.meme`, `.hava`, `.deprem`, `.döviz`, `.namaz` ve `.kripto` dış servise bağlı komutlardır
(son dördü `lib/http.js:getJson` kullanır). Zaman aşımı verilir
(`AbortSignal.timeout`), NSFW işaretli gönderi atlanır, servis düşükse
kullanıcıya "meme servisi şu an cevap vermiyor" yazılır — bot çökmez.

**`data/*.json` içeriği değiştirilmez.** Yeni içerik eklemek dosyaya satır
eklemektir; kod tarafı dosyaları yazmaz.

### Faz 8 — Grup komutları

- `lib/group.js` — `sock.groupMetadata()` sonucunu kısa süre (60 sn) önbelleğe
  alır. Her komutta yeniden sorulursa WhatsApp hız sınırına takılır.
  Ayrıca grup dışı kullanımı tek yerden reddeden yardımcıyı barındırır:
  özel sohbette grup komutu **çalışmaz**, kısa bir mesajla döner.
- `lib/activity.js` — sohbet başına "en son kim yazdı" halkasını bellekte tutar.

| Komut | Yapar |
|---|---|
| `.id` | Kullanan kişinin (ve sohbetin) JID'ini gösterir |
| `.pp` | Hedefin profil fotoğrafını gönderir; yoksa/gizliyse açıkça söyler |
| `.grup` | Grup adı, ID, üye/admin sayısı, oluşturulma tarihi |
| `.admin` | Adminleri mention'layarak listeler |
| `.üyeler` | Üye listesi (uzun listede sayfalanmadan, sade metin) |
| `.say` | Üye sayısı |
| `.etiket` | Tüm üyeleri mention'lar |
| `.etiket 3` | Rastgele 3 üyeyi mention'lar |
| `.kimvar` | **Son mesaj atan** aktif kullanıcılar |
| `.son` | Grupta en son yazan kişi |

**`.kimvar` "online" göstermez.** Baileys'te presence bilgisi ancak
`presence.subscribe` + `presence.update` ile, kişi bazında ve WhatsApp'ın
verdiği ölçüde gelir; "şu an grupta online olan herkes" güvenilir biçimde
çıkarılamaz. Bu yüzden komut **taklit etmez**: son N dakikada mesaj atanları
listeler ve çıktıda bunun "son aktivite" olduğunu açıkça yazar. Bu davranışı
"online listesi"ne çevirme.

### Faz 9 — İstatistik + XP/level (SQLite)

Projedeki **tek** veritabanı `data/stats.db`'dir; ikinci bir depolama sistemi
eklenmez.

- `lib/db.js` — `better-sqlite3` bağlantısı, WAL modu, şema kurulumu.
- `lib/stats.js` — sayaç güncelleme, XP, level hesabı, sorgular.

Şema (sohbet başına ayrı sayılır; grup istatistiği gruba aittir):

```
stats(chat_jid, user_jid, messages, stickers, voices, xp, last_seen)   PK(chat_jid,user_jid)
hours(chat_jid, user_jid, hour, count)                                 PK(chat_jid,user_jid,hour)
```

Kayıt noktası `lib/handler.js`'tir — prefix kontrolünden önce, `rememberName`
ile aynı yerde.

**Botun kendi mesajları sayılmaz.** `sock.sendMessage` ile giden her mesaj
`messages.upsert`'e `append` tipiyle geri düşer; ayıklanmazsa bot kendi
yanıtlarını bot sahibinin mesajı sayar ve `.son` hep botu gösterir. `index.js`
soketi kurduktan sonra `trackOutgoing(sock)` çağırır: giden mesajların id'leri
`lib/outgoing.js` içinde tutulur, handler bunlara bakıp atlar. Bu, `index.js`'in
Faz 9'da değişen tek yeridir. Bir mesaj tipi birden fazla sayaca
girmez: sticker sticker'a, ses (`audioMessage`, `ptt` olsun olmasın) sese,
kalan her şey mesaja.

XP: normal mesaj +1, sticker +2, ses +2. **Cooldown**: aynı kullanıcıya
cooldown süresi içinde gelen mesajlar sayaçlara işlenir ama XP vermez — spam
ile level kasılmasın. Cooldown bellekte tutulur (`Map`), diske yazılmaz.

Level formülü tek yerde (`lib/stats.js`): `level = floor(sqrt(xp / 50))`.
Bir sonraki seviyeye kalan XP de aynı fonksiyondan hesaplanır.

Yazma maliyeti: her mesajda hazırlanmış (`prepare`) UPSERT çalışır, sorgu her
seferinde yeniden derlenmez. `better-sqlite3` senkron olduğu için iki mesaj
aynı satırı yarıda kesemez — race condition yoktur. Okuma yapan komutlar
(`.stats`, `.profil`, `.top`) yazma yolundan bağımsızdır.

| Komut | Yapar |
|---|---|
| `.stats` | Hedefin mesaj/sticker/ses/en aktif saat/XP dökümü |
| `.profil` | Ad, level, XP, sayaçlar |
| `.top` | Sohbetteki en yüksek XP'li kullanıcılar, mention'lı |

`.stats` ve `.profil` hedefi: **mention → reply sahibi → komutu yazan**.

İstatistikler bot yeniden başlayınca kaybolmaz; kaybolan tek şey XP cooldown
haritasıdır (zararsız).

### Faz 10 — `.kelime` ve `.kimim` grup oyunları

Oyunlar `commands/` içine değil, **`games/` altına** yazılır; `commands/kelime.js`
ve `commands/kimim.js` yalnızca grup kontrolü yapıp oyunu başlatır.
`commands/index.js` klasörü düz taradığı için `games/*.js` komut sanılmaz.

```
games/gameManager.js  grup başına aktif oyun state'i, zaman aşımı, yanıt yönlendirme
games/kelime.js       kelime zinciri
games/kimim.js        karakter tahmini
games/kelimeler.json  başlangıç kelimeleri (elle yazılır, kod yazmaz)
games/kimim.json      karakter + ipucu + alternatif cevap havuzu (elle yazılır, kod yazmaz)
```

**Bir grupta aynı anda tek oyun.** `startGame()` zaten oyun varsa `null` döner,
komut "⚠️ Bu grupta zaten aktif bir oyun var." yazar. Durum yalnızca bellektedir;
bot yeniden başlayınca yarım oyunlar düşer — beklenen davranış.

#### Yanıt (reply) tabanlı cevap akışı

Oyun cevapları prefix taşımaz, bu yüzden `lib/handler.js` prefix kontrolünden
**önce** `handleGameReply()` çağırır. Kanca yalnızca şu koşulların tamamı
sağlanırsa mesajı tüketir: grup + aktif oyun + mesaj bir yanıt + yanıtlanan id
oyunun `lastMessageId`'si + gövde prefix ile başlamıyor. Aksi halde `false`
döner ve mesaj hiç dokunulmadan normal akışa devam eder.

`lastMessageId`, botun **en son** oyun mesajının id'sidir ve her yeni oyun
mesajından sonra `setLastMessage()` ile güncellenir. Eski oyun mesajına verilen
yanıtlar sessizce yok sayılır.

Kancanın `sentByBot` kontrolü zorunludur: botun kendi oyun mesajları `append`
olarak geri düşer ve `{ quoted: msg }` ile gönderildiği için alıntı taşır —
süzülmezse bot kendi cevabını oyuncu tahmini sanar.

#### `.kelime`

Kabul sırası: tek kelime mi → doğru harfle mi başlıyor → daha önce kullanıldı mı
→ TDK'de var mı. **Ağ isteği en sona bırakılır.** Geçersiz cevapta `currentWord`,
`requiredLetter`, `lastMessageId` ve zaman aşımı sayacı **değişmez**.

Aynı kişinin art arda kelime sınırı yoktur (bot sahibinin kararı, önceden 10'du).

Doğrulama `lib/turkishWords.js:isValidTurkishWord()` üzerinden yapılır; oyun kodu
TDK'yı bilmez. Birincil kaynak `sozluk.gov.tr/gts` (Node yerleşik `fetch`,
6 sn timeout): madde dizisi → geçerli, `{error: "Sonuç bulunamadı"}` → geçersiz.
Yedek kaynak `tdk-all-api` paketidir ama **şu an çalışmıyor** (aşağıya bak).

Servise ulaşılamazsa `WordServiceError` atılır ve **kelime geçersiz sayılmaz**;
kullanıcıya "servise ulaşılamıyor" yazılır, oyun aynı noktadan devam eder.
Sonuçlar `data/stats.db` içindeki `word_cache` tablosunda saklanır — yalnızca
kesin sonuçlar, hata asla önbelleğe girmez.

Zincir harfi `lastLetter()` ile bulunur: kelime `ğ` ile bitiyorsa bir önceki
harfe düşülür, çünkü Türkçede hiçbir kelime `ğ` ile başlamaz.

Karşılaştırmalar `toLocaleLowerCase('tr')` / `toLocaleUpperCase('tr')` ile
yapılır (`trLower` / `trUpper`); varsayılan locale "İ" ve "ı" harflerini bozar.

**Eşzamanlı iki cevap:** TDK isteği bir `await` noktasıdır. Kilit yerine
"await sonrası yeniden doğrulama" kullanılır: oyun `lastMessageId` ve
`currentWord`'ü await'ten önce not eder, sonra değişmiş mi diye bakar.
Değişmişse geç kalan cevap sessizce düşer — **ilk geçerli cevap kazanır.**

#### `.kimim`

`games/kimim.json` biçimi: `[{ name, aliases?[], hints[] }]`. Bozuk kayıtlar elenir, hiç
kullanılabilir kayıt kalmazsa komut kısa bir Türkçe hata yazar, bot çökmez.

İlk ipucu başlangıçta gösterilir, sonrakiler **her 3 yanlış tahminde** açılır.
Yanlış tahmin oyunu bitirmez ve süreyi **uzatmaz** — 1 saat, doğru cevap
gelmediği sürece işler. Doğru cevap oyunu bitirir.

Cevap eşleştirme tamamen yereldir, ağ kullanılmaz: Türkçe harfler ASCII'ye
katlanır (`ç→c, ğ→g, ı/İ→i, ö→o, ş→s, ü→u`), noktalama atılır. Tam ad, soyad
(en az 4 harf) ve "ad + soyad" kabul edilir. Yabancı aksanlar da atılır
(`Timothée` → `timothee`). Bu kurala uymayan bilinen adlar (`Ronaldo`, `Tayyip
Erdoğan`, `İbo`) kayda `aliases` olarak yazılır; alternatif yalnızca tam eşleşir.

#### Zaman aşımı ve XP

Her iki oyun da **1 saat** sonra kapanır (`OYUN_TIMEOUT_MS` ile denemede
kısaltılabilir). `.kelime`'de sayaç her geçerli kelimede sıfırlanır
(`touchGame`), `.kimim`'de yalnızca doğru cevap oyunu bitirir. Zaman aşımı
mesajı gönderilemese bile oyun mutlaka temizlenir, yoksa grup kalıcı olarak
"zaten aktif bir oyun var" durumunda kilitlenir.

XP `lib/stats.js:oyunOdulu()` ile verilir: oyun taban sayı yazar (kelime 30, tahmin 100), XP'ye
`lib/coin.js:oyunOlcegi()` çevirir, kur 2.300.000 iken 50 taban 230.000 XP eder ve ödül kurun karekökü kadar büyür (bot sahibinin kararı): doğrusal olsaydı ödül arzı, arz kuru, kur ödülü büyütüp enflasyonu hızlandırırdı.
Sezon puanı taban kalır, kurla büyüseydi mesaj ve görev puanını ezerdi. `addXp` elle XP içindir, kurla büyümez. `recordMessage`'ın 30 sn'lik cooldown'u burada uygulanmaz (oyun XP'si
kazanılmış XP'dir) ve `hours` tablosuna yazılmaz. `.stats`, `.profil` ve `.top`
aynı `stats.xp` sütununu okuduğu için ek iş yoktur.

`.oyunbitir` oyunu erkenden kapatır; **oyunu başlatan kişi**, **grup adminleri**
ve `OWNER_NUMBER` çalıştırabilir. Admin kontrolü `lib/group.js:isGroupAdmin()`
ile yapılır (60 sn önbellekli grup bilgisi; katılımcının `id`/`lid`/`jid`
alanlarının hepsine bakılır). Grup bilgisi alınamazsa kişi admin sayılmaz.
Başlatan kişi ve sahip için grup bilgisi hiç sorulmaz.

#### `tdk-all-api` neden yedek ve neden şu an ölü

Paket kelime başına yedi ardışık TDK isteği atar, zaman aşımı yoktur ve tüm
gövdesi boş bir `catch` içindedir. Bu yüzden hem "kelime yok" hem "servis çöktü"
durumunda `undefined` döner — ikisi ayırt edilemez. Dahası, çağırdığı uçlardan
biri (`terim?eser_ad=tümü`) 2026-08 itibarıyla bağlantıyı reddediyor, yani paket
**her kelime için** `undefined` döndürüyor. Bu nedenle:

- birincil yol doğrudan `fetch`'tir,
- paketten yalnızca **olumlu** sonuç kabul edilir, `undefined` "karar veremedim"
  sayılır,
- import dinamiktir; paket silinse bile bot açılışta patlamaz.

Paket kaldırılırsa `lib/turkishWords.js` içindeki `yedekSorgula()` silinir,
başka hiçbir yer etkilenmez.

### Faz 11 — Bekleme süresi, `.anket`, `.günlük`, `.quiz`

#### Komut bekleme süresi (`lib/cooldown.js`)

`lib/handler.js`, yetki kontrolünden sonra `checkCooldown()` çağırır. Anahtar
**kullanıcı + komut adı**dır (alias'lar aynı komuta düşer). Süre komut
dosyasındaki `cooldown` alanından (saniye) okunur, yoksa 3 sn. Ağır komutlar:
`.sticker`/`.al`/`.tts`/`.meme`/`.anket` 10 sn, `.etiket` 30 sn.

- Bekleme penceresinde **ilk** reddedilen denemeye bir kez "⏳ biraz yavaş"
  yazılır, sonrakiler sessizce düşer — her spam'e cevap vermek de spam olurdu.
- Süre komut çalışmadan **önce** başlar: komut hatalı kullanılsa da bekleme
  işler. Bilinçli: aksi halde eşzamanlı iki çağrı ikisi de geçer.
- Bot sahibi (`OWNER_NUMBER`) muaftır.
- Oyun cevapları komut değildir, bekleme süresinden etkilenmez.

#### `.anket`

`.anket Soru | a | b | c` → Baileys'in yerel `poll` mesajı, tek seçimli
(`selectableCount: 1`). 2-12 seçenek; aynı seçenek iki kez yazılırsa reddedilir.
Oylar WhatsApp'ta kalır, bot oyları okumaz/saymaz.

#### `.günlük`

Günde bir kez XP. Gün sınırı `.gününsözü` ile aynıdır: `istanbulDay()`
(Europe/Istanbul). Ödül `20 + 5 × (seri − 1)`, seri 7'de tavan (50 XP). Dün
alınmadıysa seri 1'e döner. Hesap tek yerde: `lib/stats.js:claimDaily()`.

```
daily(chat_jid, user_jid, last_day 'YYYY-MM-DD', streak)   PK(chat_jid,user_jid)
```

Okuma + yazma + XP ekleme tek transaction'dadır. XP `stats.xp`'ye gider;
`.profil`/`.top` ek iş olmadan görür.

#### `.quiz`

`games/quiz.js` + `games/quiz.json` (`[{ question, options[2-4], answer }]`,
`answer` seçeneklerden birinin **metni**; tutmayan kayıt elenir). Seçenek
sırası her oyunda karışır.

- Cevap harf (`b`, `B)`), sıra numarası (`2`) ya da seçeneğin kendisi olabilir.
  Anlaşılmayan yanıta kısa bir hatırlatma yazılır, hak yanmaz.
- **Kişi başı tek hak**: yanlış cevap veren o soruda tekrar deneyemez —
  şıkları sırayla deneyerek kazanılmasın.
- Süre 10 dk: `startGame` state'inde `timeoutMs` verilirse `gameManager` onu
  kullanır; `OYUN_TIMEOUT_MS` daha kısaysa o kazanır. Diğer oyunlar 1 saatte.
- Doğru cevap taban +50 (`oyunOdulu`).

### Faz 12 — LID sahip, susturma, `.dc`, `.efekt`, `.hava`, `.düello`, `.seç`, `.hesap`

#### Susturma (`.sus` / `.konuş`, `lib/mute.js`)

Yalnızca grup adminleri ve `OWNER_NUMBER`. Durum `muted_chats` tablosundadır,
yeniden başlatmada korunur (yoksa her çökmede bot kendiliğinden konuşmaya başlar).

```
muted_chats(chat_jid PK, muted_at ms)
```

`lib/handler.js` susturulmuş grupta: sayaçlar **işlemeye devam eder**, oyun
cevap kancası çağrılmaz, komutlar düşer. Tek istisna `worksWhenMuted: true`
taşıyan komuttur (`.konuş`). `.sus` aktif oyunu da kapatır, aksi halde zaman
aşımı mesajı susturulmuş gruba kendiliğinden düşer.

#### `.efekt` ve `lib/audio.js`

`lib/audio.js:toVoiceNote()` ffmpeg ile her sesi ogg/opus sesli mesaja çevirir;
`.tts` ve `.efekt` aynı fonksiyonu kullanır. `.efekt` yanıtlanan `audioMessage`'ı
indirir, `-af` filtresi uygular; girdinin yalnızca ilk 60 sn'si işlenir (`-t`
girdiden önce, `areverse` tüm sesi belleğe aldığı için). Yeni efekt =
`commands/efekt.js` içindeki `EFEKTLER`'e bir satır.

#### `.dc`

`data/dogruluk.json` ve `data/cesaret.json` (düz string dizisi, elle yazılır).
`.dc d` / `.dc c` türü seçer, yoksa rastgele. Hedef: mention → reply sahibi →
komutu yazan.

#### `.hava`

Open-Meteo (API key yok, 6 sn timeout). Geocoding ilk sonucu küçük bir köy
olabildiği için ("Kadıköy" → Yalova'da bir köy) ilk 5 sonuçtan **nüfusu en
büyük** olan seçilir.

#### `.düello`

`games/duello.js`. İki oyuncu aynı tam sayılı işlemi görür (+, −, ×). Yalnızca
iki oyuncunun yanıtı sayılır, seyirci yanıtı yok sayılır. Kişi başı tek hak;
ikisi de yanarsa berabere biter. Galibe +50 XP, süre 2 dk (`timeoutMs`).

#### `.hesap` ve `lib/calc.js`

Elle yazılmış özyinelemeli ayrıştırıcı: `+ - * / % ^ ( )`, `×`/`x`, `÷`/`:`,
ondalık virgül. **`eval`/`Function` kullanılmaz** — grupta herkes yazabildiği için
girdi asla kod olarak çalışmamalı. Sıfıra bölme / sonsuz sonuç `CalcError` olur.

### Faz 13 — Kategoriler, testler, medya ve bilgi komutları

#### Görsel komutları

- `.foto <efekt>` — yanıtlanan `imageMessage`'a `sharp` efekti (sb, sepya, bulanık,
  keskin, ayna, ters, negatif, piksel). Önce `rotate()` (EXIF yönü) ve en fazla
  1280 px'e küçültme. `EFEKTLER` dışa açıktır, `test/foto.test.js` her efekti dener.
- `.yaz <metin>` — `lib/quote.js:renderTextSticker()`: beyaz kalın yazı, siyah
  kopyanın 8 yöne kaydırılmasıyla kenarlık (pango'da stroke yok), sonra
  `imageToSticker`. Metin yazılmazsa yanıtlanan mesajın metni kullanılır.

#### Bilgi komutları (API key yok)

| Komut | Servis | Not |
|---|---|---|
| `.deprem` | AFAD `apiv2/event/filter` | Tarihler UTC gönderilir/gelir, İstanbul saatine çevrilir. Varsayılan son 24 saat 2.5+, `.deprem 4` son 7 gün |
| `.döviz` | Frankfurter (ECB) | Günlük referans kur, anlık değil; EUR tabanlı gelir, TL'ye çevrilir |
| `.namaz` | Aladhan `timingsByAddress`, `method=13` | Diyanet hesabı; imsak = `Fajr` (Aladhan'ın `Imsak` alanı 10 dk ihtiyatlıdır, kullanılmaz). Bulunamayan adres 400 döner |

#### Eğlence ve istatistik

- `.8top` — `data/8top.json`, rastgele.
- `.burç` — `data/burclar.json`; seçim `fnv1a(burç|istanbulDay())`, yani aynı gün
  aynı burç aynı yorumu ve aynı yıldızları alır (`.gününsözü` gibi).
- `.rozet` — hiçbir şey saklamaz; `stats`, `hours` ve `daily`'den hesaplar. Yeni
  rozet = `commands/rozet.js:ROZETLER`'e bir satır. Seri için
  `lib/stats.js:getDailyStreak()` (son ödül bugün ya da dün değilse 0).

### Faz 14 — Alternatif cevaplar, `.emoji`, `.adamasmaca`

#### `.emoji`

`games/emoji.js` + `games/emoji.json` (`[{ emoji, type, answer, aliases?[] }]`,
`type` başlangıçta gösterilir: Film/Dizi/Şarkı). Eşleştirme `.kimim`'in
`katla()`'sını kullanır ama **yalnızca tam eşleşme** kabul eder — soyad kuralı
yok, "Kurtlar Vadisi" için "vadisi" geçmez. Yabancı yapımlar Türkçe adıyla
sorulur, bilinen özgün adı `aliases`'a yazılır. Her 3 yanlışta ipucu: önce harf
kalıbı (`_ _ _ _   _ _ _`), sonra baş harfler. Süre 10 dk (`timeoutMs`), +50 XP.

#### `.adamasmaca`

`games/adamasmaca.js`; ayrı havuz yok, `games/kelimeler.json`'daki 4-10 harfli
kelimeler kullanılır. Yanıt tek harf ya da tek kelime olmalı, başka her şeye
kısa bir hatırlatma yazılır ve ceza verilmez. Tekrar edilen harf ceza almaz;
yanlış harf ve yanlış kelime tahmini 1 yanlış sayılır, 6'da oyun biter.
Değerlendirme (`tahminEt`) senkron olduğu için eşzamanlı iki tahmin sırayla
işlenir. Süre her tahminde sıfırlanır (`touchGame`), 10 dk tahmin gelmezse
kapanır. Kelimeyi tamamlayan ya da bilen +50 XP.

### Faz 15 — XP kumarı (`.bahis`, `.slot`, `.rulet`)

Para birimi `stats.xp`'dir; ayrı bakiye tablosu yok. Oyun mantığı saf
fonksiyonlar olarak `lib/kumar.js`'tedir (rastgelelik `crypto.randomInt`,
testte dışarıdan verilir), üç komutun ortak akışı `kumarOyna()`'dadır.

- Bakiye kontrolü + çekiliş + XP yazımı tek transaction'dadır
  (`lib/stats.js:bahisOyna()`): çekiliş ancak XP yetiyorsa yapılır, aynı XP iki
  bahse basılamaz. Net fark `floor(miktar × çarpan) − miktar` olarak eklenir.
- XP hiçbir zaman negatife düşmez (bahis ≤ bakiye). Kaybeden seviye de düşer.
- En az 10 XP; `hepsi` / `yarısı` kabul edilir. Komut bekleme süresi 5 sn.
- Yazı-tura adildir (2x). Rulet Avrupa ruletidir (tek sıfır, renk/tek-çift 2x,
  sayı 36x). Slot'un beklenen dönüşü ~%96'dır; sembol ağırlığı ya da çarpanı
  değişirse `test/kumar.test.js` beklenen dönüşü %90-100 aralığında tutar.
- Grup komutudur; kasa her grupta ayrıdır (XP gibi).

### Faz 16 — `.xpver`

`.xpver <grup id> <numara> <miktar>`: `ownerOnly` **ve yalnızca özel sohbet**.
`hidden: true` taşır: `.help` onu sahibe bile listelemez, `.help xpver` "böyle
bir komut yok" der (sahip `.help`'i grupta yazınca liste herkese görünür).
Kullanımı yalnızca README'dedir.
Grupta yazılırsa sahip için bile sessizce düşer (yalnızca loglanır) — kimin XP
bastığı grupta görünmesin. Eksi miktar XP alır, `lib/stats.js:xpAyarla()` sıfırın
altına indirmez.

Numara doğrudan istatistik anahtarı **yapılmaz**: LID'li gruplarda istatistikler
"...@lid" kimliğiyle tutulur. `lib/group.js:uyeKimligiBul()` grup üyelerinde
numarayı (`id` ya da `jid` alanı) arar ve üyenin `id`'sini döner. WhatsApp
numarayı vermiyorsa üye bulunamaz ve hiçbir şey yazılmaz; bu durumda `.id @kişi`
çıktısındaki "...@lid" kimliği numara yerine verilebilir (üyelik yine doğrulanır).

### Faz 17 — `.devret`

`.devret @kişi <miktar>` (ya da mesaja yanıtla `.devret <miktar>`): gönderenin
XP'si hedefe geçer. `.devret @a @b <miktar>` yalnızca sahip içindir (`isOwner`,
yani `.env`'deki sahip; grup kurucusu ya da admini değil), iki etiketli kullanımı
sıradan üye yazarsa reddedilir. Sözdizimi bilerek `details`'te yok, README'dedir.

- Toplam XP değişmez: `lib/stats.js:xpDevret()` bakiye kontrolü ve iki yazmayı tek
  transaction'da yapar. Sahip de kaynağın bakiyesini aşamaz; XP basmak `.xpver`'in işi.
- `last_seen` değişmez (`xpAktar`): devir alan kişi mesaj yazmış görünmesin.
- Hedef `uyeKimligiBul()` ile gruptaki üye kimliğine çevrilir; üye değilse devir yapılmaz.
- `hepsi`/`yarısı` kaynağın o anki cüzdanıdır, sahip başkası adına da kullanabilir.
- `mentionedJid` sırasına güvenilmez: XP'nin yönü `etiketSirasi()` ile metindeki
  sıradan çıkar.

### Faz 18 — `.çark`

Ödül tablosu ve hak hesabı saf fonksiyonlar olarak `lib/cark.js`'tedir; yazma
`lib/stats.js:carkOyna()`'da tek transaction'dır. Grup komutudur.

```
cark(chat_jid, user_jid, window_start ms, spins, bonus_percent, bonus_until ms)   PK(chat_jid,user_jid)
```

- **Hak:** 24 saatte 2 ücretsiz çevirme. Pencere ilk ücretsiz çevirmeyle başlar;
  takvim günü kullanılmaz, yoksa gece yarısının iki yanında 4 hak kullanılabilirdi.
- **Ekstra:** `.çark ekstra` kur 2.300.000 iken 2.500.000 XP'dir (`EKSTRA_FIYATI`), `kurOlcegi()` ile kurla büyür,
  günde en çok 3 kez alınır (`cark_ekstra(chat_jid, user_jid, day, adet)`, bot sahibinin kararı): oyunlar kurla
  ödül verdiği için bonus sınırsız ve ucuz olursa XP basardı. Ücretsiz hak varken ekstra istense de
  XP alınmaz. Tek çevirmenin beklenen XP'si ücretin altında kalmalı; `test/cark.test.js` bunu denetler.
- **Bonus:** `addXp()` aktif bonusu uygular ve kazanılan miktarı döner, oyunlar mesajda
  bunu gösterir. `addXp` yalnızca oyun ödülü içindir; başka XP yolu bonus almaz.
  Ödüller katlıdır (3/5/10 kat): oyunlar o zaman 3-10 XP verdiği için %20 gibi yüzdeler
  yalnızca +1 XP ediyordu. `bonus_percent` yine yüzde tutar (200 = 3 kat). Yeni bonus
  gelince güçlü olan kalır, süre 1 saate döner.

### Faz 19 — Yeni kumar komutları

```
kumar(chat_jid, user_jid, won, lost, games)   PK(chat_jid,user_jid)
piyango(chat_jid, user_jid, xp)               PK(chat_jid,user_jid)
```

- **Karne:** bütün kumar sonuçları `kumarKaydet()` ile `kumar` tablosuna düşer,
  `.kumartop` buradan okur. Yeni kumar oyunu bu yoldan geçmelidir.
- **`.kazı`:** tek adımlı, `kumarOyna()` kullanır. Önce ödül çekilir, kart sonra ona
  göre dizilir; beklenen dönüş %95.
- **`.blackjack`, `.mayın`:** oyun katmanındadır (`games/`), gruptaki tek oyun yuvasını
  3 dk tutar, yalnızca başlatan kişi oynar. Bahis `xpCek()` ile baştan alınır,
  `kumarOde()` ile kapanır. Bot yeniden başlarsa yarım oyundaki bahis yanar.
- **Elle bitirme iade değildir:** `.oyunbitir` ve zaman aşımı eli `dur`, mayını `çek`
  sayar. İade olsaydı kötü eli gören başlatan kişi `.oyunbitir` ile kaçardı.
- **`.vs`:** XP'ye yalnızca kabulde dokunulur; bakiyeler `vsOyna()` transaction'ında
  yeniden denetlenir. `vs` önceden `.düello`'nun alias'ıydı, oradan kaldırıldı.
- **`.piyango`:** şans yatırılan XP oranındadır. Biletler gerçek XP olduğu için
  kalıcıdır. `.çekiliş` yalnızca admin ve sahip içindir, en az 2 kişi gerekir.

### Faz 20 — `.tahmin`, `.karışık`, `.sayıoyunu`

Üçü de `games/` altındadır, XP'yi `addXp()` ile verir (`.çark` bonusu işler).

- **`.karışık`:** havuz `games/kelimeler.json`, en az 4 harf. Her 3 yanlışta baştan bir harf açılır.
- **`.sayıoyunu`:** hedef sayılardan gerçekten hesaplandığı için her bulmacanın çözümü
  vardır. İşlem `islemDenetle()` ile denetlenir, hesabı `lib/calc.js` yapar; `eval` yok.
  `^`, `%` ve ondalık kabul edilmez.

### Faz 21 — `.görev`, `.market`, `.soygun`

```
gorev(chat_jid, user_jid, anahtar, day, sayac, alindi)    PK(chat_jid,user_jid,anahtar)
market(chat_jid, user_jid, unvan, kalkan_until ms)        PK(chat_jid,user_jid)
soygun(chat_jid, user_jid, day, deneme, korunma_until ms) PK(chat_jid,user_jid)
```

- **`.görev`:** tanımlar `lib/gorev.js`'tedir, gün hash'ine göre 5 görevden 3'ü çıkar.
  Sayaçlar `gorevIlerlet()` ile stats yazma yollarında artar (`recordMessage`, `addXp`,
  `kumarKaydet`, `carkOyna`, `soygunYap`). Bot kendiliğinden mesaj atmadığı için ödül
  `.görev` yazılınca verilir. Satır gün değişince sıfırlanır, tablo büyümez.
- **`.market`:** yeni ürün `lib/market.js:URUNLER`'e bir satır. `fiyat` kur 2.300.000 iken geçerli XP'dir, gerçek fiyat `lib/coin.js:kurOlcegi()` ile anlık kura göre hesaplanır (bot sahibinin kararı). Key ve vitrin de `kasaAc()`'ta aynı ölçeği alır, key'in XP ödülleri `odulOlcekle()` ile büyür: fiyat tek başına büyürse key beklentisi bozulur, ödül tek başına büyürse XP basılır. XP'nin ekonomiden çıktığı
  ana yerdir. Bonus ürünü `.çark` bonusuyla aynı alanı yazar, çark hakkına dokunmaz.
- **`.soygun`:** kurallar `lib/soygun.js`'tedir. Toplam XP değişmez. Engeller (kalkan,
  korunma, bakiye) deneme hakkı yakmaz. Başarıyla soyulan kişi 6 saat korunur.

### Faz 22 — `.açıkartırma`

`games/acikartirma.js`. Teklif yalnızca sayıdır; **bot XP aktarmaz ve teklifi tahsil
etmez**, süre bitince kazananı yazar, satıcı `.devret` ile kendisi gönderir. Bu bilinçli:
"otomatik aktarım" eklenmemeli.

- Satıcı yalnızca sahip olduğu XP'yi çıkarabilir; sahip muaftır, sonradan `.xpver` kullanabilir.
- Oyun yuvasını süre boyunca tutar. Diğer oyunların aksine `setLastMessage` teklifte
  çağrılmaz: herkes baştaki mesaja yanıt verir, yoksa aynı anda yazanların teklifi düşerdi.
- Her çağrı tüm gruba bildirim düşürdüğü için bekleme süresi 60 sn.

### Faz 23 — Random key'ler

`lib/kasa.js:KASALAR`, `URUNLER`'in sonuna eklenir: `.market al <numara>` ile açılır, açma
`lib/stats.js:kasaAc()`'ta tek transaction'dır. Yeni ödül = `oduller`'e bir satır.

- Satın alma sınırsızdır: her key'in beklenen XP'si fiyatının altında kalmalı,
  `test/ekonomi.test.js` denetler. Ağırlıkların toplamı 100'dür.
- Çıkan unvan var olan unvanı ezmez, yerine `yedekXp` verilir: pahalı unvan şansla silinmesin.
- Fazladan çark/soygun hakkı, harcanan hak sayısını eksiye indirir. Çark penceresi kapalıysa
  açılır, yoksa `hakDurumu()` eski sayıyı yok sayardı.
- Kumar karnesine ve `.görev` kumar sayacına yazılmaz: ödül XP olmayabilir.

### Faz 24 — `.ödül`

```
odul(chat_jid, user_jid, xp)   PK(chat_jid,user_jid)
```

Ödül `soygunYap()` içinde başarılı soygunda hırsıza geçer. %10 kesinti yanar. Başında ödül
olan kişiye `MIN_KURBAN_XP` uygulanmaz, yoksa fakir birinin ödülü sonsuza dek kalırdı.
`ödül` önceden `.günlük`'ün alias'ıydı, oradan kaldırıldı.

### Faz 25 — `.banka` ve servet vergisi

```
banka(chat_jid, user_jid, bakiye, faiz_saat, faiz_artik, bekleyen, vergi_day, son_vergi)   PK(chat_jid,user_jid)
```

Kurallar `lib/banka.js`'te saftır. Faiz saatliktir (varsayılan %15, sahip `.faizkararı` ile grup başına değiştirir), bileşiktir ve bakiyenin tamamına
işler, tavan yoktur. XP bastığı için boşta en çok 7 günlük (168 saat) birikir ve `.banka`
yazılınca işlenir. 1 XP'yi bulmayan küsurat `faiz_artik`'te devreder, yoksa küçük bakiye her
saat bakınca hiç faiz alamazdı. Faiz saat başlarında işler. O saat diliminde yatırılan para `bekleyen`'dedir, ilk saat başında faiz almaz: yoksa
saat başına bir dakika kala yatıran tam saatin faizini alırdı. Her işlem önce faizi işlediği için `bekleyen` hep `faiz_saat` dilimine aittir. Çekimde önce o düşer.
`BANKA_TAVANI` (1 katrilyon) kaldırılmaz: faiz bu oranda bakiyeyi günler içinde tam sayı sınırının üstüne çıkarır.
Çekimdeki %5 ile vergi bot hesabına gider (Faz 32).

Vergi artan oranlıdır (`servetVergisi`, dilimler `VERGI_DILIMLERI`, coin kuru cinsinden), cüzdan ve banka birlikte sayılır, önce cüzdandan alınır, bot muaftır.
Vergi `recordMessage()` içinde kişinin günün ilk mesajında kesilir: komutla kesilseydi
kaçılabilirdi. Bot kendiliğinden yazmadığı için vergiyi `.banka` gösterir. Mesaj başına DB'ye
gidilmesin diye denetim bellektedir, yeniden başlatmada `vergi_day` çift kesintiyi önler.

Kesilen her vergi `vergi(chat_jid, user_jid, toplam)` tablosunda birikir, `.vergitop` buradan okur. Tablodan önceki vergiler kayıtlı değildir.

`.vergikaçır` `vergi_kacak(chat_jid, user_jid, aktif, sonuc, tutar)` tablosuna plan yazar. Komut da mesaj olduğu için o günün vergisi çoktan kesilmiştir, plan bir sonraki kesime işler. Zar `vergiAl()` içinde atılır (`kacisSonucu`). Bot kendiliğinden yazmadığı için sonuç `.vergikaçır` yazılınca görünür. Yakalanmanın beklentisi vergiden kötü kalmalı (%60, 3 kat), yoksa herkes her gün kaçardı.

### Faz 26 — `.sezon`

```
sezon(chat_jid, user_jid, hafta, puan)           PK(chat_jid,user_jid,hafta)
sampiyon(chat_jid, user_jid, kez, son_hafta)     PK(chat_jid,user_jid)
```

Puan `sezonPuani()` ile yazılır: `recordMessage`, `addXp`, `claimDaily`, `gorevTopla`. Kumar ve
soygun bilerek girmez, yoksa zengin hep kazanırdı. Hafta `haftaAnahtari()` ile pazartesi başlar.
Kapanış `sezonDurumu()` içindedir ve yeni haftadaki ilk `.sezon`'da olur; ödül ve silme aynı
transaction'da olduğu için çift ödeme olmaz. Şampiyonluk unvan değildir, satın alınan unvanı ezmez.

### Faz 27 — `.borsa`

```
borsa(chat_jid, hisse, fiyat, onceki, adim, haber, haber_adim)   PK(chat_jid,hisse)
portfoy(chat_jid, user_jid, hisse, adet, maliyet)            PK(chat_jid,user_jid,hisse)
```

Hisseler `lib/borsa.js:HISSELER`'dedir. Fiyat, her grupta ayrı, simetrik rastgele yürüyüştür ve
`.borsa` çağrılınca geçen 15 dakikalık adımlar kadar ilerler (en çok 48 saat). Gerçekçiliği üç
yönsüz parça verir: 6 saatte bir değişen piyasa havası (`piyasaHavasi()`, sertliği belirler,
hash'le çıkar, saklanmaz), bütün hisseleri birlikte iten ortak hareket ve fiyatı sıçratan haberler.
**Ortalamaya dönen, trendi süren ya da tabanı olan bir fiyat yazılmamalı:** üçünde de "düşükte al,
yüksekte sat" XP basar. Bu yüzden hisse tabanda durmaz, batar ve paylar silinir. Kumar karnesine
yazılmaz. Her adım bir işlem günü kadar serttir (bot sahibinin kararı, gerçekçi hali sıkıcıydı): oynaklık
yüksek olduğu için hisseler sık batar, bu beklenen davranıştır.

### Faz 28 — `.kart`

```
kart(chat_jid, user_jid, no, adet)   PK(chat_jid,user_jid,no)
```

Kartlar `lib/kart.js`'tedir, `no` veritabanına yazılır: **sıra değiştirilmez**, yeni set sona eklenir.
Key'den çıkar (`kasaCek()` kartı çözer, `kasaAc()` yazar). Nadir kart darboğaz olduğu için kartın
değeri `set ödülü / setCekisi` sayılır ve key beklenti testine girer; set ödülü artırılırsa test uyarır.
Takasta bot XP'ye dokunmaz, aynı `.açıkartırma` gibi karşılık `.devret` ile verilir.

### Faz 29 — Haftalık vitrin

```
vitrin(chat_jid, hafta, user_jid)   PK(chat_jid,hafta,user_jid)
```

Ürünler `lib/vitrin.js:VITRIN`'dedir, `vitrinUrunu()` hafta hash'iyle seçer. Satış `kasaAc()`
üzerinden `vitrinHafta` ile yapılır, ödül key ödülleriyle aynı biçimdedir. Satır sayısı satılan
stoktur, eski haftalar satışta silinir. Liste numarası `URUNLER`'in hemen sonrasıdır, `URUNLER`'e
girmez: yeni ürün eklenince numarası kayar.

### Faz 31 — Web paneli

Numara ban yese ya da grup dağılsa da veriler görülsün diye vardır. Bottan ayrı süreçtir, WhatsApp'a
hiç bağlanmaz, istatistikleri `data/stats.db`'den **salt okunur** okur. Tek yazan özellik kumarhanedir (Faz 58, bot sahibinin kararı); başka veri değiştiren panel özelliği eklenmez.
Yeni npm paketi yoktur: Node `http` + sunucuda üretilen HTML + `panel/stil.css`.

```
panel/index.js     başlatma, saatlik yedek denetimi
panel/sunucu.js    HTTP, giriş, çerez
panel/guvenlik.js  scrypt, deneme sınırı, oturumlar
panel/veri.js      bütün sorgular
panel/kumar.js     kumarhane: oyun eli ve XP yazımı (Faz 58)
panel/oyunSayfalari.js  kumarhane HTML
panel/kumarhane.css  kumarhane stili ve animasyonlar
panel/oyun.js      kumarhane betiği: sayfa yenilemeden oynama, ses
panel/sayfalar.js  HTML
panel/yedek.js     günlük yedek
```

- **HTML yalnızca `h` şablonuyla üretilir.** Değerleri o kaçırır. WhatsApp adını üye kendisi yazar,
  elle birleştirilen HTML XSS açar. CSP satır içi betiğe kapalıdır: tek betik kumarhanenin `panel/oyun.js` dosyasıdır (Faz 59), istatistik sayfalarında JavaScript yoktur.
- **Panel yalnızca 127.0.0.1'i dinler**, dışarıya sunucudaki nginx açar, HTTPS'i certbot verir (`nginx-panel.conf.example`). `0.0.0.0` yapılmaz: gerçek IP
  `X-Forwarded-For`'dan okunduğu için doğrudan erişim deneme sınırını atlatırdı.
- **Şifre elle seçilmez**, `npm run panel:sifre` 24 karakter üretir. `.env`'e yalnızca scrypt özeti girer.
- **Deneme sayacı şifreye bakılmadan önce artar:** IP başına 5 hak, sonra 15 dk kilit, her kilit iki
  katına çıkar (en çok 24 saat). Genel sınır 10 dakikada 30 deneme. Sınır dolunca açık oturumlar etkilenmez.
- Oturumlar bellektedir, panel yeniden başlarsa herkes yeniden girer. Süre 7 gün.
- **Yedek:** panel açıkken günde bir `data/yedek/`'e alınır, 14 tane kalır. Aynı sunucuda durduğu için
  sunucu ölürse gider; bu yüzden panelde indirme düğmesi vardır.
- Banka ve portföy son işlenen değerdir: panel faiz işlemez, borsayı ilerletmez.
- Panel yazamadığı için grafik verisini bot yazar: `gecmis` (`recordMessage`, kişinin günlük mesajı ve
  XP'si), `borsa_gecmis` (`borsaGuncelle`, saat başı fiyat, 30 gün; yalnızca `.borsa` kullanılınca dolar),
  `gruplar` (`groupMetadata`, grup adı; `lib/handler.js` süreç başına bir kez sorar).
- Rozetler `lib/rozet.js`'tedir, `.rozet` ve panel ortak kullanır. Rekorlar `panel/veri.js:REKORLAR`'dadır.
- `/hisse` mum ve çizgi grafiğini sunucuda SVG olarak çizer. Yalnızca saat başı kapanış saklandığı için mumlar bu kapanışlardan türetilir. JavaScript olmadığı için ayrıntı SVG `<title>` ve fiyat tablosundadır. SVG'deki yazı küçülmesin diye grafik dar ve geniş iki boyutta üretilir, CSS seçer.
- `stil.css` tarayıcıda 1 saat önbelleklenir, bu yüzden adresi içerik özetiyle sürümlüdür (`STIL_SURUMU`). Sürüm kaldırılırsa güncellemeden sonra yeni HTML eski stille açılır. Panel denenirken CSS sayfaya gömülmez, gerçek sunucudan yüklenir.
- CSP satır içi `style` kabul etmez: yüzdeler SVG öznitelikleri ya da `<progress>` ile çizilir.

### Faz 32 — Bot hesabı

Bot hesabı, QR ile bağlı numaranın `stats` satırıdır: `jidNormalizedUser(sock.user.id)`, yani
`parseMessage`'ın bot numarasından yazılan mesaja verdiği kimlik. Ayrı tablo yoktur.

Bota karşı oynanan kumarda (`bahisOyna`, `kumarOde`) kaybedilen XP, banka çekim kesintisi, servet
vergisi ve borsa komisyonu `botaYaz()` ile o satıra eklenir. Bu kesintiler üyelerin elinden XP almaya
devam eder, bot harcamadığı sürece ekonomi dengesi değişmez. Kaynak ayrı tutulmaz.
Oyuncu kazancı ve kira hazineden (botun cüzdanı, sonra bankası) ödenir, yetmeyen kısım basılır (`hazinedenOde`, bot sahibinin kararı): hazine kumarın ve devletin ortak kasasıdır. `.vs` ve `.piyango` yazmaz, orada kayıp başka oyuncuya gider. Yarım kalan
oyunun yanan bahsi de yazılmaz. `lib/handler.js` her mesajda `botHesabiniTani()` çağırır.

LID'li grupta bot üye listesinde "...@lid" görünür. `xpDevret`, `xpAyarla` ve `getStats` bu kimliği `hesapKimligi()` ile ana hesaba çevirir. Eski devirlerin açtığı LID satırı `botHesabiniTani()` kimliği öğrenince ana hesaba taşınır ve silinir.

Bakiye gruba `.top`'ta ve `.tüik` kasa satırında görünür: `.profil` ve `.stats` başkasına "gizli" der, `.soygun` ve
`.devret` botu hedef alamaz, çünkü sonuç mesajları bakiye yazar. Sahip `.profil @bot` ile görebilir.

### Faz 33 — `.haber`

`data/haberler.json` elle yazılmış parodi başlıklarıdır, komut biçimi `commands/haber.js`'te verir. "parodihaber"
etiketi her mesajda olmalıdır: gerçek haber sanılmasın diye bot sahibinin şartıdır, kaldırılmaz.

Gerçek kişiler saçma ve zararsız şakayla yazılabilir. Havuza yazılmayanlar: inandırıcı yalan haber, afet, ölüm,
saldırı, gerçek kişiye uydurma suç isnadı, din ve etnik hedef, Erdoğan. Hatay yemekle anılır, deprem şakası yapılmaz.

### Faz 34 — `.kredi` ve eksi bakiye

```
kredi(chat_jid, user_jid, borc, faiz_saat, vade ms)   PK(chat_jid,user_jid)
```

Kurallar `lib/kredi.js`'te saftır. Bot sahibinin amacı kısa sürede bol para, sonra enflasyondur: banka %15 kalır, kredi saatlik %19'dur.
**Kredi faizi banka faizinin üstünde kalmalı**, yoksa kredi çekip bankaya yatıran XP basar; `test/kredi.test.js` denetler.

- **Kasa:** botun banka hesabıdır. Hazineden çıkan her para (kredi, kumar kazancı, kira, `.hazine ver`, `.teşvik`) önce botun cüzdanından, yetmezse bankasından alınır, ödemeler hep bankaya girer (`kasadanCek`, `kasayaYatir`). Sıra bot sahibinin kararıdır: banka önce harcanınca sahibin faiz için bankaya yatırdığı para gün içinde ödemelerle eriyordu. Limit 50.000 XP'dir (sıfır atmada 1000'e bölündü), tek kredi kasanın yarısını geçemez (`azamiKredi`): verilen kadar XP kasada kalmalı.
- **Vade:** `krediGuncelle()` faizi işler, vade geçtiyse tahsil eder. `recordMessage` her mesajda çağırır, çünkü bot kendiliğinden yazmaz. Tahsilat sırası cüzdan, banka, eksi. Satır silinir.
- **Eksi bakiye** `stats.xp`'nin eksi olmasıdır, ayrı alan yoktur. Faiz vadede durur, yoksa borç hiç kapanmazdı. Eksiyi kapatan XP bota gitmez, yanar.
- **`.banka yatır`** borçluyken önce borcu keser. `.devret` borçluyken kapalıdır, para arkadaşa aktarılıp borçtan kaçılmasın. Sahibin başkası adına yaptığı devir (`sahipDevri`) muaftır, grup adminleri değil.
- **Kumar şartı:** `kumarEngeli()` komut katmanındadır, `lib/stats.js` şart bilmez. Yeni kumar komutu bunu çağırmalı. Borsa kumar sayılmaz.
- **`.iflas`:** eksi cüzdanı sıfırlar, 12 saat kumar ve 24 saat kredi yasağı getirir (`iflas(chat_jid, user_jid, yasak_bitis)`; kumar bitişi saklanır, kredi bitişi ondan hesaplanır), silinen XP kimseye gitmez. Açık kredi silinmez, yoksa kredi çekip harcamak bedava olurdu. Hisse varken reddedilir, yoksa krediyle alınan hisse iflastan sonra borçsuz paraya dönerdi. Yasak `kumarEngeli()`'nin ikinci argümanıdır, yeni kumar komutu `kumarYasagi()` ile birlikte çağırmalı.
- **`.haciz`:** `ownerOnly`. Önce bankadan, sonra cüzdandan botun bankasına aktarır (`hacizEt`), kalanı cüzdana eksi yazar. Kasaya yalnızca gerçekten alınan girer, yoksa eksi kısım yoktan XP basardı (bot sahibinin kararı). Kesinti yoktur, kredi borcundan düşmez.
- Eksi XP `xpAyarla`'da eksiltilmez, `soygunYap`'ta soyulmaz. Panelde **Borçlular** kartı açık kredileri ve eksi cüzdanları listeler. Kredi tutarı orada yalnızca gösterim için hesaplanır, veritabanına yazılmaz. Servet çubuğu eksiyi atlar.

### Faz 36 — Coin ve `.coinmarket`

```
coin(chat_jid, user_jid, bakiye, toplu_hak)                  PK(chat_jid,user_jid)
ekonomi(chat_jid, day, arz, kur)                             PK(chat_jid,day)
sigorta(chat_jid, user_jid, bitis)                           PK(chat_jid,user_jid)
mulk(chat_jid, user_jid, kod, adet, kira_saat, bekleyen)     PK(chat_jid,user_jid,kod)
```

XP TL ise coin altındır (bot sahibinin benzetmesi). Kurallar ve ürünler `lib/coin.js`'tedir, yeni ürün `COIN_URUNLERI`'ne bir satırdır. Komut adı `.coinmarket`'tir: `.coin` yazı-tura komutudur.

- **Kur:** `coinKuru()` piyasadaki paranın yüzde biridir, en az 1.000.000 XP. Para, üyelerin artı cüzdanı ve bankasıdır (`paraArzi`). Bot sayılmaz: kasa kendi faiziyle büyür. Coin alışı ve gösterilen kur anlıktır (`anlikKur`, bot sahibinin kararı). Bozdurma anlık kurla günün kurundan düşük olanıdır (`bozdurmaKuru`), bu kaldırılmamalı: yoksa kredi çekip kuru %10 farkın üstüne şişiren kişi coinini bozup XP basardı. Maaş, kira, mülk satışı ve vergi günün ilk mesajında sabitlenen kuru kullanır (`gununEkonomisi`).
- **İşlenmemiş faiz arza yazılır,** veritabanına yazılmadan hesaplanır. Yazılmazsa faizi birikmiş kişi ucuza coin alır, `.banka` ile kuru sıçratır, bozdururdu.
- **Alış satış:** ödenen XP yanar. `.coinmarket sat` kurun %90'ını öder, bu fark kaldırılmamalı. Coin soyulmaz, hacizle alınmaz.
- **`.coindevret`:** bot sahibinin kararıyla eklendi (`coinDevret`). Borçlu (`borcluMu`: kredi ya da eksi cüzdan) gönderemez: coin tahsilata ve hacze girmediği için arkadaşa aktarılıp `.iflas` ile borçtan kaçılırdı. Bota yalnızca sahip gönderir. Sahip `.coindevret @a @b <adet>` ile a'nın coinini b'ye taşır (`.devret` gibi, `sahipDevri` borç ve ambargo engeline takılmaz), bot da a olabilir. Tefeci borcu `.devret`'teki gibi engel değildir.
- **`.iflas`** coin ya da mülk varken reddedilir, yoksa iflastan sonra borçsuz paraya dönerdi.
- **Sigorta:** yalnızca `.hacizall`'ı durdurur, sahibin `.haciz`'ini durdurmaz.
- **`.tüik`:** kasa, açık kredi ve gün maaşını da yazar (`maas_gun(chat_jid, day, toplam)`, `calis` yazar). Kasa toplamının gösterilmesi bot sahibinin kararıdır. Günlük ve haftalık enflasyon `ekonomi` kayıtlarından çıkar. Kayıt `recordMessage`'da günün ilk mesajıyla yazılır, sohbet başına denetim bellektedir. Enflasyon satırları bu açılış kaydına göredir, gün içinde değişmez; bu yüzden bülten anlık değişimi ayrıca yazar ve bozdurma kuru anlık kurun %80'inin altındaysa "bugün bozdurmayın" uyarısı verir (`uyariSatirlari`): hiperenflasyon gününde açılış kuru geride kalınca coin bozdurmak neredeyse değersizdi. "Resmi" oran şakadır, gerçeğin yarısıdır.
- **`.mülk`:** tanımlar `lib/mulk.js`'tedir, `kod` veritabanına yazılır, değiştirilmez. Fiyat coindir, satış coin gibi kurun %90'ıdır, kira günün kuruna bağlıdır ve saat başı `bekleyen`e işlenir. Toplanmazsa 24 saatte durur. Kira hazineden ödenir, hazine yetmezse basılır. Sahip `.haciz @kişi ev` ile bir tane siler, değeri kasaya girer, kira sahibinde kalır.
- **Kredi:** açık kredisi olan coin alamaz (`coinAl`), yoksa kredi parası tahsilatın dokunmadığı coine çevrilirdi.
- **Ürün fiyatları** 3-150 coin arasındadır (mülkler 9-250 coin). Coin zaten piyasanın yüzde biri olduğu için XP karşılığı kurla kendiliğinden artar. `.hacizall` fiyatı, alacağı paradan yüksek kalmalı: 1 coin piyasanın %1'idir, haciz en çok %50 alır. Etki alanları key ödülleriyle aynıdır (`soygunHakki`, `kalkanMs`, `bonus`, `unvan`).
- **`.soygun herkes`:** `topluSoygun()` her üyeye ayrı zar atar (%40, kurbanın %10'u). Hak coinle alındığı için yakalanma cezası yoktur, günlük hak harcanmaz. Kalkan, korunma ve fakir kuralı normal soygunla aynıdır (`kurbanEngeli`). Soyulacak kimse yoksa hak yanmaz.
- **`.hacizall`:** herkese açıktır, 90 coin yazıldığı an düşer, saklanan hak yoktur (`topluHaciz`). Listede görünür ama `.coinmarket al` ile alınmaz. Bankanın %45'i ve cüzdanın %50'si alıcının cüzdanına geçer. Botun kasasına dokunmaz. `.haciz` ayrı komuttur: yalnızca sahip kullanır, para bota gider. Kalkan korumaz, sigorta korur, bot hariçtir. Alınacak para yoksa coin düşmez.
- Mesajlardaki XP tutarları `lib/sayi.js:binlik()` ile yazılır. Kopyalanacak komut metninde (`.devret @kişi 1000`) ham sayı kalır, yoksa `.devret` okuyamaz.
- **`.faizkararı`:** `faiz(chat_jid, oran)`, satır yoksa varsayılan geçerlidir. Sınır -5 ile 50, en çok 2 ondalık basamak (`faizOranCoz`). Eksi faiz bankadaki parayı eritir, eriyen XP kimseye gitmez (bot sahibinin kararı, enflasyonla mücadele için); kredi faizi `KREDI_FAIZ_FARKI`'nın altına inmez: faiz saatlik ve bileşik olduğu için %1 bile günde 1,27 kat eder, tam sayı enflasyonu frenlemeye yetmiyordu (bot sahibinin kararı). `oran` sütunu `INTEGER` tanımlıdır ama SQLite ondalığı kayıpsız saklar, taşıma gerekmez. Kredi hep `KREDI_FAIZ_FARKI` üstündedir, toplam `krediFaizi()` ile yuvarlanır. Oran ekranda `oranYaz()` ile virgüllü yazılır. Karar önce gruptaki bütün faizi eski orandan işler, yoksa yeni oran geçmiş saatlere uygulanırdı.
- **`.teşvik`:** kasadan son 7 günde yazan üyelere eşit dağıtır (`tesvikDagit`), bölünmeyen artık kasada kalır.
- **Panel:** grup sayfasında Ekonomi kartı `ekonomi` kaydını gösterir, yani kur ve para bugünün kaydıdır, anlık değildir. Tablolar bot yeni sürümle açılmadan yoktur, `ekonomiTablolariVar()` bu yüzden vardır.

### Faz 39 — Toplum komutları

```
hapis(chat_jid, user_jid, bitis, kefalet)                    PK(chat_jid,user_jid)
evlilik(chat_jid, user_jid, es_jid, tarih)                   PK(chat_jid,user_jid)
meslek(chat_jid, user_jid, kod, secim, son_calisma)          PK(chat_jid,user_jid)
meslek_biten(chat_jid, user_jid, kod)                        PK(chat_jid,user_jid,kod)
cete(chat_jid, anahtar, ad, lider, kasa)                     PK(chat_jid,anahtar)
cete_uye(chat_jid, user_jid, anahtar, katilma)               PK(chat_jid,user_jid)
```

Kurallar `lib/hapis.js`, `lib/secim.js`, `lib/evlilik.js`, `lib/meslek.js`, `lib/cete.js`, `lib/dava.js`'te saftır, yazma `lib/stats.js`'tedir.

- **`.hapis`:** `.soygun`'da yakalanan 2 saat girer. Toplu soygunda yakalanma olmadığı için hapis de yoktur. `kumarYasagi()` iflas ve hapsin geç biteni döner, kumar komutları ayrıca bir şey çağırmaz. `.soygun` ve `.çalış` kendisi denetler.
- **`.kefalet`:** tutar yakalanırken cüzdan ve banka toplamının %20'sidir (bot sahibinin kararı) ve saklanır, sonradan harcamak düşürmez. Ödeyenin cüzdanından alınır, botun bankasına gider (`kasayaYatir`). Eş yarı fiyata öder.
- **`.seçim`, başkan ve bakanlar:** Faz 49'a taşındı.
- **`.evlen`:** teklif oyun yuvasını 2 dk tutar, yalnızca teklif edilen yanıtlar. Bonus `.çalış`'ta %20 maaş ve yarı fiyat kefalettir. `.günlük`'e konmadı: 50 XP'nin bonusu bu ekonomide bir şey etmez.
- **`.boşan`:** isteyen, cüzdan ve bankasının %20'sini eşine öder. `.boşan` tutarı gösterir, `.boşan onay` uygular. Borçluyken kapalıdır (`borcluMu`), yoksa evlenip boşanarak para borçtan kaçırılırdı.
- **`.meslek`:** tanımlar `lib/meslek.js`'tedir, `kod` veritabanına yazılır, değiştirilmez. Maaş kurun on binde payıdır, 30 dakikada bir alınır, XP basar. Maaşlar gerçek hayattaki kazanca göredir (bot sahibinin kararı): yazılımcının en düşük maaşı garsonun en yükseğinden az olmamalı, `test/toplum.test.js` denetler. `kariyerSaati` olan meslek (futbolcu, 24 saat) süresi dolunca `aktifMeslek()` ile kişinin ilk meslek okumasında kapanır, `meslek_biten`'e yazılır, bir daha seçilemez. Satır silindiği için kişi hemen yeni meslek seçebilir. Kariyerli meslek `onay` yazılmadan seçilmez (bot sahibinin kararı, insanlar bilmeden futbolcu seçip yakıyordu). `addXp`'den geçmez, sezon puanı yazmaz: maaş mesaj ve oyun puanlarını ezerdi.
- **`.istifa`:** satır silinmez, `kod` `ISSIZ` olur (`meslekIstifa`): silinseydi istifa edip hemen yeni meslek seçerek 24 saatlik değişim beklemesi atlanırdı. Kariyerli meslekte istifa kariyeri bitirir (`meslek_biten`) ve satırı siler, süresi dolan kariyer gibi yeni meslek hemen seçilir.
- **`.çete`:** kasa faiz almaz, vergi, soygun ve hacizden muaftır. Bu yüzden yatırırken %5 kesilir ve bota gider, borçlu yatıramaz, kasası dolu lider `.iflas` edemez. Kasa `paraArzi`'ne girer, yoksa yatırmak kuru düşürürdü. Sıralama üyelerin `sezon` puanı toplamıdır, ödül `sezonDurumu()` kapanışında puanlar silinmeden yazılır.
- **`.dava`:** `.anket` oyları okunamadığı için oylama yanıt tabanlıdır, `setLastMessage` oyda çağrılmaz (`.açıkartırma` gibi). Taraflar oy veremez. Kaybeden öder, davacı da. Miktar sanığın cüzdanının %25'iyle sınırlıdır, çoğunluk tek oylamayla birini sıfırlayamasın. Harç peşin bota gider, `.oyunbitir` dahil hiçbir durumda iade edilmez. Borçlu taraf kabul edilmez, kapanışta da denetlenir: dava para kaçırma yolu olmasın.
- **Panel:** grup sayfasında Çeteler, Hapishane, Evlilikler, Meslekler, kişi sayfasında Hayat kartı vardır. Veri yoksa kart çıkmaz. Tablolar bot yeni sürümle açılmadan yoktur, `toplumTablolariVar()` bu yüzden vardır. Hükümet kartı Faz 55'tedir.
- **`.özet`:** yeni tablo yoktur. Mesajlar `gecmis`'ten son 7 gündür, gece kuşu ve kumar tüm zamanlardır, çünkü o tablolar haftalık tutulmaz. Çıktı bunu ayrı başlıkla yazar.

### Faz 41 — Piyasa olayları, `.yatırım`, `.tefeci`

```
yatirim(chat_jid, user_jid, miktar, risk, carpan, bitis)                              PK(chat_jid,user_jid)
tefeci(chat_jid, borclu, alacakli, anapara, borc, saat, vade, durum, teklif_bitis)    PK(chat_jid,borclu)
```

Kurallar `lib/olay.js`, `lib/yatirim.js`, `lib/tefeci.js`'te saftır, yazma `lib/stats.js`'tedir.

- **Olay:** `piyasaOlayi()` grup ve 6 saatlik dilimden hash'le çıkar, saklanmaz (`.borsa` havası gibi). Dilim İstanbul 00/06/12/18'de başlar. Etkiler yüzdedir, `olayUygula()` uygular: maaş (`calis`), kira (`kiraIsle`, toplandığı andaki olay), market (`marketAl`, `marketFiyati`), oyun (`oyunOdulu`, `oyunTutari`), yatırım. **Coin kuru ve key fiyatı olaydan etkilenmez:** krizde ucuz coin alıp bozdurmak ve indirimde key beklentisini fiyatın üstüne çıkarmak XP basardı. Testler sabit zaman verir, olay hash'i bu yüzden belirlidir; market fiyatı bekleyen test `marketFiyati()` ile hesaplar.
- **`.yatırım`:** sonuç yatırılırken zarla belirlenir, `carpan` anaparanın yüzdesidir; olay yalnızca kâr kısmını büyütür ya da küçültür. Kilitli para `paraArzi`'ne girer, yoksa yatırmak kuru düşürürdü. Borçlu yatıramaz (kredi parası tahsilatın dokunmadığı yere kaçmasın), açık yatırımla `.iflas` edilmez.
- **`.tefeci`:** teklif tabloda `durum = 'teklif'` olarak 10 dk durur, para kabulde geçer ve alacaklının bakiyesi kabulde yeniden denetlenir. Faiz tek seferliktir (`geriOdeme`). Vade sonrası `tefeciTahsil()` `recordMessage`'da her mesajda borçlunun cüzdanından ve bankasından alır, yetmezse borç kalır, cüzdan eksiye düşmez. `.devret`'i etkilemez (bot sahibinin kararı): `borcluMu` tefeci borcunu saymaz. Kredi borcu ya da eksi bakiyesi olan borç veremez, yoksa kredi parası tahsilattan kaçırılırdı.

### Faz 42 — Yeni kumar oyunları ve `.wordle`

```
wordle(chat_jid, user_jid, day, deneme, cozuldu)   PK(chat_jid,user_jid)
wordle_grup(chat_jid, day, toplam, cozen)          PK(chat_jid)
```

Kumarın bütün kuralları (`kumarEngeli`, `kumarYasagi`, karne, bot hesabı) eski oyunlarla aynıdır. Her oyunun beklenen dönüşü %90-100 arasındadır, `test/kumar3.test.js` denetler.

- **`.plinko`, `.crash`:** tek adımlıdır, `kumarOyna()` kullanır, kurallar `lib/kumar.js`'tedir. Plinko 8 sıradır, kutu sağa sapma sayısıdır (binom). WhatsApp'ta canlı "şimdi çek" yazılamadığı için crash'te hedef baştan verilir. Patlama noktası `P(X ≥ x) = 0.96 / x` ile çekilir, bu yüzden her hedefin beklenen dönüşü aynıdır.
- **`.hilo`, `.kule`:** `.mayın` gibi oyun katmanındadır (`games/`), bahis `xpCek()` ile baştan alınır, zaman aşımı ve `.oyunbitir` kazancı çeker. Hi-lo'da deste sonsuzdur (her kart bağımsız), "yüksek" ve "düşük" eşit kartı da kapsar. Olasılığı 1 olan tahmin (As'ta yüksek) reddedilir. Çarpan her tahminde %97 ile çarpılır, `HILO_TAVAN`'da (1000x) kendiliğinden çekilir: tavan olmasa çarpan sınırsız büyürdü. Kule 8 kattır, çarpanı `.mayın` gibi adil oranın %96'sıdır. "Uzman" zorluğu (3 kutuda 1 yumurta) bilerek yok: tepe çarpanı 6.000x'i geçiyordu.
- **`.yarış`:** oyun yuvasını 60 sn tutar. Bahis yanıtla değil komutla verilir (`lastMessageId` hep null), kişi başı bir bahis. Oranlar sabit ve bota karşıdır, her atın beklenen dönüşü %96'dır: havuz paylaşımı olsaydı tek kişinin bastığı yarışta karşı taraf olmazdı. Kazanan önce çekilir, pist ona göre çizilir. Koşu bitip sonuç gönderilirken gelen bahis reddedilir (`finished`), yoksa ödenmeyecek bir bahis alınırdı. `.oyunbitir` koşuyu hemen yapar, iade yoktur.
- **Sahip şansı (gizli, bot sahibinin kararı):** `kumarOyna({ sahip: isOwner })` sahibin kaybeden çekilişini %30 olasılıkla bir kez daha atar, iyisi kalır (`sahipSansi`). Sahibin her 50. `.crash`'inde patlama noktası en az 100x'tir (`kumar_oyun.games` sayar). `.help`'te ve oyun mesajında görünmez. Sahip özelden `.şans aç|kapat` ile açıp kapatır (gizli, grupta iz bırakmadan düşer), durum `ayar` tablosundadır (`lib/sahipSans.js`), varsayılan açık. Yalnızca tek adımlı oyunlarda (`.bahis`, `.slot`, `.rulet`, `.kazı`, `.plinko`, `.crash`) vardır; `games/` altındaki kumar oyunlarında yoktur.
- **`.wordle`:** oyun yuvasını tutmaz, komutla oynanır. Kelime `games/kelimeler.json`'daki 5 harfli kelimelerden `fnv1a(wordle|gün)` ile seçilir, her grupta aynıdır. **Tahta gruba aittir:** herkes aynı tahtaya yazar, ilk bilen ödülü alır ve kelime o gün kapanır (`wordle_grup.cozen`). Kişi tahtası olmaz: tahminler grupta göründüğü için bilenin mesajı kopyalanıp herkes ödül alıyordu (bu hata bir kez yapıldı). Kişi başı günde 3 hak (`wordle`), tek kişi bütün tahminleri yapamasın. Ödül gruptaki toplam tahmin sayısına göre azalır (100 → 30 taban, `oyunOdulu`). Havuzda olmayan tahmin TDK'de doğrulanır, servis yoksa hak yanmaz. Hak ve çözen veritabanındadır, yeniden başlatma hak tazelemesin diye. Tahminler saklanmaz, tahta satırları yalnızca bellektedir. Sayım TDK isteğinden sonra `wordleKaydet()` transaction'ında yeniden denetlenir: bu arada başkası bilmiş olabilir.

### Faz 45 — `.servet`, `.kumarkarnem`, `.tabu`

```
kumar_oyun(chat_jid, user_jid, oyun, won, lost, games, en_buyuk, en_kotu)   PK(chat_jid,user_jid,oyun)
```

- **`.servet`:** `servetHesapla()` hiçbir şey yazmaz; faiz, kira ve kredi faizi yalnızca gösterim için hesaplanır (panel gibi). Her şey bugün nakde çevrilse ne edeceğiyle sayılır: coin `bozdurmaKuru`, mülk satış fiyatı, hisse son işlenen fiyat (borsa ilerletilmez). Çete kasası kişinin değildir, sayılmaz. `.servet top` bot hariç bütün üyeleri hesaplar, kurlar bir kez okunur.
- **`.kumarkarnem`:** `kumarKaydet()`'e verilen `oyun` adı `kumar_oyun`'a yazılır. Yeni kumar oyunu `kumarOyna({ oyun })` ya da `kumarOde({ oyun })` ile adını vermeli, yoksa yalnızca toplamda görünür. Tablodan önceki oyunlar dökümde yoktur. "Kasaya kaptırılan" `.vs` ve `.piyango` dışındaki oyunların netidir.
- **`.tabu`:** kart anlatana özelden gider (bot sahibinin onayıyla): mesajı anlatanın kendi komutu tetikler. `senderPn`'e gönderilir, LID'e özel mesaj her zaman ulaşmıyor. Gönderilemezse oyun kapanır. İpucu ve tahminler aynı tabu mesajına yanıttır, `setLastMessage` yalnızca başta çağrılır (`.açıkartırma` gibi). Anlatanın yanıtı ipucudur, yasaklı sözcük (4+ harfliler ekli haliyle, kısalar tam) oyunu bitirir. Anlatan da ödül alır ama bilenden az: kelimeyi özelden arkadaşına söyleyip XP kasmak cazip olmasın, bekleme süresi bu yüzden 5 dk. Kartlar `games/tabu.json`'dadır (`[{ kelime, yasak[] }]`, elle yazılır).

### Faz 46 — `.vampir`

Kurallar `lib/vampir.js`'te saftır, akış `games/vampir.js`'tedir. Veritabanına yalnızca kazanan takımın `oyunOdulu`'su yazılır.

- **Fazlar:** lobi (2 dk, `katıl`/`çık`/`başla`, 4-16 kişi) → gece (2 dk) → gündüz (3 dk) → gece… Her fazın kendi zamanlayıcısı vardır, `gameManager` zaman aşımı (10 dk, her fazda `touchGame`) yalnızca takılan oyunu kapatır. Faz geçişi `faz = 'gecis'` ile await'ten önce kilitlenir, geç gelen zamanlayıcı ya da son oy ikinci kez geçiş yapmaz.
- **Özel mesaj:** roller ve gece listeleri oyunculara özelden gider (bot sahibinin onayıyla, oyuncu `katıl` yazarak ister). `senderPn`'e gönderilir, `.tabu` gibi. Bir role ulaşılamazsa oyun başlamadan kapanır. Alıcının telefonu çevrimdışıyken mesaj tek tikte kalıp hiç düşmeyebiliyor: oyuncu özelden `.vampir` yazınca rolü ve gecenin listesi yanıt olarak yeniden gelir (`rolHatirlat`).
- **Gece eylemi** komutla ve özelden yazılır (`.vampir öldür|koru|bak <no>`): özel sohbet grubu söylemediği için oyuncunun oyunu `aktifOyunlar`'dan bulunur. Grupta yazılırsa bot uyarır, eylem işlenmez. Herkes eylemini yapınca gece erken biter.
- **Oylama** son gündüz mesajına yanıttır, `setLastMessage` oyda çağrılmaz. Tek başına en çok oyu alan asılır, beraberlikte ya da pas oyları yetişince kimse asılmaz: rastgele asmak masumu zarla öldürmek olurdu. Vampir oyları bölünürse kurban berabere kalanlardan çekilir.
- **Kazanma:** vampir kalmazsa köy, vampirler kalan köylülere yetişirse vampirler. Ölüler dahil kazanan takımın herkesi ödül alır, vampirin ödülü büyüktür. `.oyunbitir` ve zaman aşımı ödülsüzdür, rolleri açıklar.

### Faz 47 — `.pet`

```
pet(chat_jid, user_jid, tur, ad, tokluk, mutluluk, guncelleme ms, pet_xp, son_oyun ms, son_hediye ms, dogum ms)   PK(chat_jid,user_jid)
```

Kurallar `lib/pet.js`'te saftır, yazma `lib/stats.js`'in sonundaki pet bölümündedir (`petIslem` tek transaction). Kişi başı bir hayvan, tür `kod` ile yazılır, `TURLER` anahtarları değiştirilmez.

- **Zamanla azalma saklanmaz:** tokluk ve mutluluk `guncelleme` anındaki değerdir, `durum()` her okumada hesaplar (banka faizi gibi). Bot kendiliğinden yazmadığı için arka plan işi yoktur.
- **Kaçma:** tokluk sıfıra indikten 48 saat sonra hayvan kaçar, satır sahibinin ilk `.pet` okumasında silinir. Ücret geri gelmez.
- **Ekonomi:** hayvan ve mama `kurOlcegi()` ile doğrusal büyür, ücret yanar (market gibi). Hediye `oyunOdulu()`'dür, kurun kareköküyle büyür: düşük kurda hediye mamadan fazla XP getirebilir, yüksek kurda hayvan XP yakar. Hediye için tokluk ve mutluluk 30'un üstünde olmalı, günde bir kez alınır.
- `son_oyun`/`son_hediye` 0 "hiç" demektir, bekleme denetimi onu atlar.

### Faz 48 — Sıfır atma

`scripts/sifir-at.js` tek seferliktir, bot sahibi elle ve **bot kapalıyken** çalıştırır: XP cinsinden her tutarı 1000'e böler (`lib/sifirAt.js:SIFIR_AT_SUTUNLARI`). Argümansız önizler, `--uygula` önce `data/yedek/sifir-at-oncesi-*.db` yedeği alır, sonra tek transaction'da yazar; grup id verilirse yalnızca o grup. Coin, mülk adedi ve hisse fiyatı bölünmez: kur paradan hesaplandığı için kendiliğinden düşer, hissede pay adedi bölünür. Level XP'den hesaplandığı için düşer. `--bolen=10` bir sıfır atar, `--bot-haric` botun cüzdanını ve bankasını (hazine) bölmez (bot sahibinin kararı, `ayar.bot_jid`'den okunur); botun öteki satırları (mülk kirası, karne) yine bölünür. Bot hariç tutulunca hazine piyasaya göre büyür. Yeni bir XP sütunu eklenirse listeye yazılır, `test/sifirat.test.js` listedeki sütunların şemada olduğunu denetler.

**Enflasyonu durdurmaz**, yalnızca rakamları küçültür: maaş ve kira kurla doğrusal büyüdüğü için para kendini besler.

### Faz 49 — Seçim, bakanlıklar, hazine, darbe

```
makam_secim(chat_jid, makam, baslangic ms)                   PK(chat_jid,makam)
makam_aday(chat_jid, secim, makam, user_jid, oy, sira)       PK(chat_jid,secim,makam,user_jid)
makam_oy(chat_jid, secim, makam, user_jid)                   PK(chat_jid,secim,makam,user_jid)
makam(chat_jid, makam, user_jid, kalici, karar_gun)          PK(chat_jid,makam)
hazine_aktarim(chat_jid, day, user_jid, miktar)              PK(chat_jid,day,user_jid)
```

Kurallar `lib/devlet.js` ve `lib/secim.js`'te saftır, yazma `lib/stats.js`'tedir. Makamlar `MAKAMLAR`'dadır, `kod` veritabanına yazılır, değiştirilmez.

- **Seçim:** her makamın (başkan, İçişleri, Adalet, Savunma) ayrı seçimi vardır. Makama ilk aday olan seçimi başlatır (`makam_secim`), sandık **30 dakika** sonra kapanır (`SECIM_SURE_MS`, bot sahibinin kararı: haftalık seçimi grup bekleyemiyordu). `secim` sütunu seçimin başlangıcıdır (ms, metin). En çok oy alan (en az 1) kazanır, eşitlikte önce aday olan; kazanan **yenisi seçilene kadar** makamda kalır, oy çıkmazsa makam değişmez. Kapanış her seçim okumasında `secimKapat`'tadır; ayrıca `games/secim.js` adaylıkta kurulan zamanlayıcıyla sonucu gruba yazar (susturulmuş grupta yazmaz). Bot yeniden başlarsa zamanlayıcı ölür, sonuç bir sonraki `.seçim`'de görünür. Oy gizlidir: kimin verdiği tutulur, kime verdiği tutulmaz. Seçim başına tek oy, oy satın alınamaz. Haftalık sürümden kalan `hafta` sütunları taşınırken bekleyen seçim ilk adaylık anında (`sira`) başlamış sayılır. Eski tek makamlı tablolar (`baskan`, `secim_*`) taşınmadan silinir: ilk başkan bot sahibidir (bot sahibinin kararı). Başkan satırı yokken başkan sahiptir, bunu komut katmanı `sahipUyeKimligi()` ile gösterir, veritabanına yazılmaz.
- **Başkan:** günde bir `.faizkararı` (`karar_gun`), sahip sınırsız. `.hazine ver`: günde en çok 10 kişi, kişi başı **anlık piyasanın %20'si** (`hazineLimiti(paraArzi)`), kendine yok. Günün açılışı değil anlık piyasa: hiperenflasyonda açılış çok geride kalıyordu. Bugün hazineden aktarılan para piyasadan düşülerek hesaplanır: düşülmeseydi her aktarım sınırı büyütür, 5 ya da daha çok alıcıya tur tur verilerek kasa bir günde boşaltılırdı (bu açık bir kez kullanıldı). Böylece bir günde piyasa en çok 3 katına çıkar. Hazinenin yüzdesi değildir: hazine piyasadan kat kat büyük olduğu için kur bir günde katlanırdı (bot sahibinin kararı). Sahip `.hazine ver`'i başkan gibi kullanır. `.teşvik` ve `.haciz` yalnızca sahibindir.
- **Bakanlar:** yetki günde 5 (Faz 52), para basmaz: İçişleri `af` (hapis satırını siler), Adalet `tutukla` (1 saat, kefalet soygundaki gibi), Savunma `kalkan` (24 saat, `market.kalkan_until`). Hedef engeli hakkı yakmaz.
- **`.darbe` (gizli):** `hidden: true`, `ownerOnly`, yalnızca özelden; grupta yazılırsa iz bırakmadan düşer (`.xpver` gibi). `.help`'te görünmez, satılmaz. Rehberi `details`'tedir: `.help darbe` yalnızca sahip özelden yazınca açılır, grupta ve başkasına "böyle bir komut yok" der (`commands/help.js:sahibeOzel`, `details` taşıyan gizli komutlar için). `.darbe <grup id>` yönetimi **hemen** sahibe verir (`makam.kalici = 1`), başkan seçimi askıya alınır; bakanlıklar sürer. `.darbe bitir <grup id>` bütün askıları (kayyumlar dahil) kaldırır, başkan yenisi seçilene kadar sahiptir.
- **Darbe akışı** (`games/darbe.js`): oyun yuvasını tutmaz, `.oyunbitir` durduramaz. Grupta herkes etiketlenir, her üyeye özelden yazılır (aralarında 3 sn, numara biliniyorsa numaraya). Duyuru mesajına `destek`/`karşı` yanıtı oydur, son yanıt geçerli, tepki emojisiyle onaylanır. Kanca `lib/handler.js`'te oyun kancasından öncedir ve susturulmuş grupta da çalışır. 10 dk sonra `darbeSonuc()`: destekçiye 1 coinin XP karşılığı hazineden (yetmezse azı), **destek vermeyen herkesten** (karşı ve sessiz) bot hesabına geçer, hiçbir şey yanmaz (bot sahibinin kararı): banka ve cüzdanın %60'ı hazineye (botun bankası), coinin ve Suly'nin %60'ı botun coin ve Suly bakiyesine, mülklerin toplam adedinin 3'te 2'si (aşağı yuvarlanır, en pahalıdan başlanır) botun mülküne. Birikmiş kira eski sahibinde kalır, bot kirayı alındığı andan biriktirir (toplayan olmadığı için 24 saatte durur). Ardından borsa bugüne getirilir ve her hisse %45-55 düşer (`DARBE_BORSA_DUSUS`); düşüş yalnızca bir kez, darbede uygulanır, sonrası yine yönsüz yürüyüştür. Eksi cüzdan alınmaz. Sigorta ve kalkan korumaz. Bot yeniden başlarsa yönetim sahipte kalır, ceza ve ödül işlenmez.

### Faz 50 — `.kripto` ve Suly

```
kripto(chat_jid, user_jid, birim)          PK(chat_jid,user_jid)
kripto_fiyat(sembol, usd, zaman ms)        PK(sembol)
```

Kurallar `lib/kripto.js`'te, yazma `lib/stats.js`'in sonundaki kripto bölümündedir. Suly gerçek Bitcoin'in dolar fiyatına endekslidir (bot sahibinin kararı).

- **Birim:** 1 Suly = 100.000.000 `birim` (satoshi gibi), tam sayı saklanır. Miktar en çok 8 ondalıktır, virgül ve nokta ikisi de ondalıktır. Miktar `args`'tan değil ham `text`'ten okunur (`miktarMetni`): `miktarlariCoz` "0.001"i binlik sanıp 1 yapardı.
- **Fiyat:** Coinbase, düşerse Binance (BTCUSDT), API key yok, 60 sn bellekte. Fiyat alınamazsa alım satım ve haciz yapılmaz, `.kripto` son bilinen fiyatı "alım satım kapalı" notuyla gösterir. Bayat fiyatla işlem yapılmaz: gerçek fiyatı gören kişi bayat fiyattan alıp satardı.
- **XP fiyatı:** `usd × kur / REFERANS_KUR` (bot sahibinin kararı, market fiyatları gibi kurla büyür). Kur `kriptoKuru()`: günün kaydı, yoksa son kayıt. Anlık kur kullanılmaz: kur arzdan, arz Suly'den hesaplanır, birbirini çağırırdı. Alışta ücret yukarı, satışta ödeme aşağı yuvarlanır.
- **Piyasa:** Suly `paraArzi`'ne son işlem fiyatıyla (`kripto_fiyat`) girer (bot sahibinin kararı). Girmeseydi Suly alıp kuru düşüren kişi ucuza coin alır, Suly'yi satıp kuru geri çıkarırdı. Alışta ödenen XP yanar, satışta basılır; arz değişmez. Bot Suly'yi yalnızca darbeden alır, onunki sayılmaz.
- **Satış:** %1 kesinti hazineye (`kasayaYatir`). Kesinti kaldırılmamalı: fiyat herkese açık, dakikalık oynama bedava kâr olurdu.
- **Haciz:** yalnızca sahibin `.haciz @kişi suly <miktar|hepsi>`'i alır (bot sahibinin kararı), kesintisiz değer hazineye girer. `.hacizall`, soygun, bakanlar ve sigorta Suly'ye dokunmaz. Darbe %60'ını bot hesabına geçirir; bot Suly'si `paraArzi`'ne girmez (bot parası gibi).
- Borçlu (`borcluMu`) alamaz, Suly varken `.iflas` reddedilir: Suly tahsilata girmediği için borçtan kaçış olurdu. `.servet` satış değeriyle sayar. Panelde Suly kartı vardır (Faz 55). Sıfır atma Suly'ye dokunmaz: XP fiyatı kurla kendiliğinden düşer.

### Faz 51 — `.mülk devret` ve `.sustur`

```
susturulan_uye(chat_jid, user_jid, bitis ms)   PK(chat_jid,user_jid)
```

- **`.mülk devret @kişi <mülk> [adet]`:** `mulkDevret()` tek transaction'dır. Birikmiş kira verende kalır: son tanesi giderse kira ona ödenir (hazineden, `kiraTopla` gibi), alan kirayı devir anından biriktirir. Borçlu (`borcluMu`) veremez, yoksa mülk arkadaşa aktarılıp `.iflas` ile borçtan kaçılırdı. Bota verilmez. Adet en çok 4 hanedir, elle yazılmış numara adet sanılmasın.
- **`.sustur @kişi [dakika]`:** yalnızca grup adminleri içindir, sahip de admin değilse kullanamaz (bot sahibinin kararı). Susturulan üyenin her mesajını `lib/handler.js` istatistikten **önce** `{ delete: msg.key }` ile siler: mesaj sayılmaz, komutu çalışmaz. Silmek için bot grupta admin olmalı, komut bunu baştan denetler; sonradan adminlik alınırsa silme yalnızca loglanır. Dakika verilmezse kaldırılana kadar sürer (`bitis = 0`), süre dolunca ilk mesajda kendiliğinden düşer, bot kendiliğinden duyurmaz. Bot sahibi, bot ve adminler susturulamaz; botu susturmak `.sus`'un işidir. Kişi LID ya da numarayla gelebildiği için `sender` ve `senderPn` ikisine de bakılır. `.sus` (grubu susturma) ile karışmaz; susturulmuş grupta da silme sürer.

### Faz 52 — Kayyum, Dışişleri, günde 5 hak

```
bakan_hak(chat_jid, makam, user_jid, day, adet)   PK(chat_jid,makam)
ambargo(chat_jid, user_jid, bitis ms)             PK(chat_jid,user_jid)
```

- **`.kayyum <bakanlık> @kişi`:** başkan kullanır, sahip başkan sayılır (`.hazine` gibi, bot sahibinin kararı). `kayyumAta()` makamı hemen hedefe verir, `makam.kalici = 1` yazar: kalici artık her makamda "seçim askıda" demektir (başkanda darbe, bakanlıkta kayyum). Açık seçim iptal olur, adaylık ve oy ücretleri yanar. Eski bakan sıradan üye olur. `.kayyum kaldır <bakanlık>` askıyı kaldırır, kayyum yenisi seçilene kadar kalır. Başkanlığa kayyum atanmaz.
- **Günlük hak:** her bakanlık günde `BAKAN_GUNLUK` (5) kez kullanılır, sayaç `bakan_hak`'tadır (bot sahibinin kararı). Sayaç kişiye bağlıdır: makama yeni gelen sıfırdan başlar. `makam.karar_gun` artık yalnızca başkanın `.faizkararı`'dır.
- **Dışişleri (`ambargo`):** hedef 24 saat `.devret`, `.coindevret`, `.mülk devret` yapamaz (`ambargoBitisi`, gönderen tarafta denetlenir). Sahibin başkası adına devri (`sahipDevri`) muaftır. Alması engellenmez. `.tefeci`, `.çete yatır`, `.ödül` ambargoya girmez.

### Faz 53 — Günlük kumar tavanı

```
kumar_gun(chat_jid, user_jid, day, net, tavan)   PK(chat_jid,user_jid)
```

Darbeden sonra kasa piyasadan kat kat büyüdü, bir üye bir gecede hi-lo ile kasadan 1 trilyon çekip kuru şişirdi (bot sahibinin kararı). Kişinin bota karşı oyunlardan (`bahisOyna`, `kumarOde`) günlük net kazancı `KUMAR_GUNLUK_TAVAN` (anlık piyasanın %50'si, %10 az bulundu) ile sınırlıdır. `.vs` ve `.piyango` girmez, orada para kasadan çıkmaz.

- Tavanı aşan kazanç ödenmez, kasada kalır (`kumarTavaniUygula`), mesaj bunu yazar. Kayıp net'i düşürür.
- Tavan günün ilk kumarında sabitlenir: kazanç piyasayı büyüttüğü için kayan tavan hiç dolmazdı.
- Dolunca `kumarYasagi()` İstanbul gece yarısını döner, bütün kumar komutları kendiliğinden kapanır. Sahip muaf değildir, bot hesabı muaftır.

### Faz 54 — Susturmayı dinlemeyene el koyma

`.sustur` komutunun parçası değildir, `lib/spamCeza.js`'te ayrı bir özelliktir; `lib/handler.js` susturulan üyenin mesajını sildikten sonra `susturmaIhlali()` çağırır. Silinen mesajlar `lib/uyeSustur.js:ihlalSay()` ile sayılır (yalnızca bellek, yeniden başlatmada sıfırlanır; `.sustur` ve `.sustur kaldır` da sıfırlar).

- `UYARI_ESIGI`'nci (3) silinen mesajda kişiye özelden "`CEZA_ARALIGI` (3) mesaj daha yazarsan tüm mal varlığının yarısına el koyarım" yazılır. Numara biliniyorsa numarasına gider (`.tabu` gibi).
- 3 mesaj daha yazarsa `spamElKoy()` her şeyin yarısını alır (`SPAM_YUZDE`): banka ve cüzdan hazineye, coin, Suly ve mülklerin yarısı (aşağı yuvarlanır, en pahalıdan) bot hesabına. Darbeyle aynı yoldur (`varlikElKoy`). Eksi cüzdan alınmaz, sigorta ve kalkan korumaz. Sonuç özelden yazılır, gruba duyurulmaz.
- Sonra sayım sıfırlanır, yazmaya devam ederse döngü baştan başlar (yeni uyarı, yeni ceza).
- **Özel mesaj kişi başı 10 dakikada birdir** (`DM_ARALIGI_MS`, `dmIzni`): el koyma sürer, yalnızca mesaj atlanır. 150 mesajlık spam kişiye art arda 50 özel mesaj attırmıştı; alıcının telefonu çözemeyip yeniden istedikçe Signal oturumları bozuldu, bot `Bad MAC` yüzünden hiçbir mesajı okuyamaz oldu. Bu sınır kaldırılmaz.

### Faz 55 — Panelin eksik kartları

Faz 36'dan sonra eklenen her şey panele işlendi. Yeni tablolar `tum()`/`tek()` ile sorulur: tablo yoksa boş döner, eski veritabanında panel çökmez.

- **Hazine:** panel WhatsApp'a bağlanmadığı için bot hesabını bilmez; bot kimliğini `ayar.bot_jid`'e yazar (`botHesabiniTani`). Grup sayfasında kasa, bot cüzdanı, coini ve mülkü, bugünkü maaş, toplam vergi ve bugünkü `.hazine ver` aktarımları. Sıralamada bot "🤖 Hazine" yazar, rekorlara girmez.
- **Grup:** Hükümet (makamlar, darbe ya da kayyum, açık seçimler ve adayların oyu), Kumarhane (en çok kazanan ve kaybeden 3), vergi rekortmenleri, 🟠 Suly (son işlem fiyatı, sahipler), bugünün wordle'ı, evcil hayvanlar (kaçanlar hariç), Cezalılar (`.sustur` ve ambargo). Borçlulara açık tefeci borçları eklendi. Yeni rekorlar: coin baronu, emlak kralı.
- **Servet** artık `.servet` gibi coin, Suly, mülk (toplanmamış kira dahil) ve yatırımı da sayar. Panel anlık kuru hesaplamaz: coin ve mülk son `ekonomi` kaydının kuruyla `bozdurmaDegeri`, Suly `sulySatisDegeri` ile sayılır. Servet çubuğu bu parçaları da çizer.
- **Kişi:** Varlıklar (coin, Suly, mülkler, yatırım, ödenen vergi), Borç ve alacak (kredi, tefeci borcu, verdiği tefeci borçları), kumar karnesinde oyun dökümü (`kumar_oyun`), Hayat kartında makam, susturma, ambargo, kalkan, sigorta ve pet.
- Fiyat grafiğinde `.vuru` dikdörtgenine `fill="transparent"`, yazılara `font-size` özniteliği verildi: stil yüklenmezse grafik siyah dikdörtgen ve dev yazıya dönüyordu (`test/panelhata/` ekran görüntüsü). CSP öznitelikleri engellemez, yalnızca satır içi `style`'ı engeller.

### Faz 56 — `.coinver`

`.xpver`'in coin hali (`commands/coinver.js`, `lib/stats.js:coinAyarla()`): `ownerOnly`, `hidden`, yalnızca özelden, grupta iz bırakmadan düşer. Numara ve grup ayrıştırması `xpver.js`'ten alınır, üye `uyeKimligiBul()` ile bulunur. Eksi adet coin alır, bakiye sıfırın altına inmez. Basılan coin bozdurulunca XP olur, kuru doğrudan etkilemez (coin `paraArzi`'ne girmez).

### Faz 57 — `.kumaraf`

`.kumaraf @kişi` günlük kumar tavanını (Faz 53) dolduranın yasağını kaldırır (`lib/stats.js:kumarAffet()`). Etiket yoksa yazan kendini affeder (WhatsApp kendini etiketlemeye izin vermiyor). Yalnızca bot sahibi ve İçişleri Bakanı kullanır (bot sahibinin kararı). Bakan için `.bakan af` ile aynı `bakan_hak` sayacını harcar, sahip sınırsızdır. Yasak `kumar_gun.net` sıfırlanarak kalkar, tavan aynı kalır: net silinmeseydi tavan dolu olduğu için her kazanç kasada kalırdı. Yani af kişiye o gün bir tavan daha açar. Tavana takılmamış hedef hak yakmaz. İflas ve hapis yasağına dokunmaz, hapis `.bakan af`'ın işidir.

### Faz 58 — Panelde kumar, `.panel`

```
panel_hesap(chat_jid, user_jid, numara, lid, sifre, surum ms)   PK(chat_jid,user_jid)
```

Bot sahibinin kararıyla panel salt okunur olmaktan çıktı: grup üyeleri kumar oyunlarını panelden de oynar. Her hamle bir form gönderimidir, sonuç yönlendirmeden sonra bir kez gösterilir; `oyun.js` bunu sayfa yenilemeden yapar (Faz 59).

- **Kayıt:** `.panel kayıt <şifre>` yalnızca özelden. Kimliği WhatsApp verir, kimse başkasının numarasıyla hesap açamaz. Bot `groupFetchAllParticipating()` ile kişinin üye olduğu grupları bulur, her grup için bir satır yazar (`user_jid` gruptaki üye kimliği, `numara`/`lid` giriş adı, rakamlar). Grupta yazılırsa şifre kaydedilmez, mesaj silinmeye çalışılır. Şifre `args`'tan değil `text`'ten okunur (`miktarlariCoz` "50m"i sayıya çevirirdi).
- **Gruptan çıkan girmez:** `index.js` `group-participants.update`'te `remove` gelince satırı siler, bot çıkarılırsa grubun bütün satırlarını. Panel her istekte satırları yeniden okur, `surum` oturumdakiyle tutmazsa (şifre değişti) oturum düşer.
- **Giriş:** numara alanı boşsa eski yönetici şifresi, doluysa oyuncu. Oyuncu oturumu yalnızca `/oyun` yollarını görür. Hesap yoksa da scrypt çalışır (`sahteHash`). Deneme sınırı ikisinde ortaktır.
- **Kumar:** `panel/kumar.js` WhatsApp'la aynı fonksiyonları çağırır (`kumarEngeli`, `kumarYasagi`, `miktarCoz`, `bahisOyna`, `xpCek`, `kumarOde`); oyun mantığı `lib/kumar.js` ve `games/*.js`'in dışa açık saf fonksiyonlarıdır, kopyalanmaz. Panel bot kimliğini `ayar.bot_jid`'den öğrenip `botHesabiniTani()`'ya verir; kayıt yoksa kumar kapalıdır, yoksa kayıp ve kazanç hazineye yazılmazdı. İki süreç aynı dosyaya yazar: WAL ve better-sqlite3'ün 5 sn bekleme süresi yeter, her işlem zaten tek transaction.
- **Çok adımlı el** panel belleğindedir, gruptaki oyun yuvasını tutmaz. 3 dk hamle gelmezse WhatsApp'taki gibi kapanır (blackjack `dur`, öteki `çek`). Panel yeniden başlarsa yarım bahis yanar. Açık el varken başka oyun açılmaz. Aynı kişinin iki işlemi arasında 700 ms olmalı: form iki kez gönderilmesin.
- Oyun adı formdan gelir, `Object.hasOwn` ile denetlenir (`constructor` gibi adlar nesne alanı sayılmasın).
- Sahip şansı panelde yoktur. `.yarış`, `.vs`, `.piyango` panelde yoktur.
- **Görünüm (Faz 59, bot sahibinin isteği: grup aktif kalsın):** `panel/kumarhane.css` yalnızca `body.kumarhane`'yi etkiler. Animasyonlar CSS'tedir, betik olmadan da oynar; gecikmeler satır içi `style` yerine sınıflarla verilir (`d1…d9`, `m1…m3`), çünkü CSP satır içi stili engeller. Sonuç metni (`.gecikmeli`) animasyon bitince açılır, süreler oyuna göre CSS'tedir. Slot şeridi 15 semboldür, son sembol sonuçtur (`SERIT_UZUNLUGU`); uzunluk değişirse `@keyframes makara` da değişir.
- **Bakiye sayacı:** `oyun.js` bakiyeyi eski değerde tutar, animasyon bitince yeni değere sayar (`bakiyeSay`); hemen yazılsaydı makaralar durmadan sonuç belli olurdu. Kazanç ve kayıp halesi de aynı gecikmeyle yanar (`kumarhane.css`'teki `animation-delay` çiftleri).
- **Hızlı bahis:** ½, 2x, Hepsi düğmeleri (`.cipler`) sunucudan `hidden` gelir, `oyun.js` açar; bir karta yazılan bahis bütün kartlara geçer. Betik yoksa düğmeler görünmez, alan elle doldurulur.
- **Duyarlı düzen:** ölçüler `clamp()` iledir, 320 px'te yatay taşma olmamalı. Tek düğmeli oyunlarda (`.masa-kart.tek`) bahis alanı ile düğme yan yanadır. Kart üstüne gelme efekti yalnızca `@media (hover: hover)` içindedir, telefonda dokununca yapışıp kalıyordu.
- **`panel/oyun.js`:** CSP `script-src 'self'; connect-src 'self'` yalnızca bu dosya içindir, satır içi betik yasak kalır. Formu `fetch` ile gönderir, gelen sayfanın `<main>`'ini yerine koyar; hata olursa sayfayı yeniler. Betik yoksa formlar normal çalışır, bu korunmalı. Sesler Web Audio ile üretilir, ses dosyası yoktur; tarayıcı sesi tıklamadan sonra açtığı için bağlam form gönderiminde kurulur. Ses tercihi yalnızca `localStorage`'dadır. Sesin zamanlaması CSS animasyonuna bağlıdır (`canlandir`): biri değişirse öbürü de değişir.

### Faz 60 — Kumarhane düzeni, hesap bölümü, panelde yasak yok

Bot sahibinin isteğiyle kumarhane gerçek bir oyun sitesi gibi düzenlendi ve WhatsApp'taki para komutları panele taşındı. Panele betik yazılabilir (bot sahibinin kararı); satır içi betik ve stil yine yasaktır, CSP değişmedi.

```
panel/hesap.js           hesap işlemleri: banka, kredi, coin, günlük, çalış, kira
panel/hesapSayfalari.js  hesap bölümünün HTML'i
```

- **Sayfalar:** `/oyun?grup=` lobi (kategorili oyun kutuları), `/oyun?grup=&oyun=` tek oyunun sayfası, `/oyun/hesap|banka|coin` hesap bölümü. Oyun ve kategori tanımları `panel/oyunSayfalari.js:VITRIN` ve `KATEGORILER`'dedir; yeni oyun ikisine de yazılır. `POST /oyun/oyna` ve `/oyun/hamle` oyunun kendi sayfasına döner, hamle formu bu yüzden `oyun` alanını taşır.
- **Yan menü** (`yanMenu`) `kabuk`'un `yan` seçeneğiyle `<main>`'in dışına çizilir: `oyun.js` yalnızca `<main>`'i değiştirir. Telefonda `menu-ac` onay kutusuyla açılan çekmecedir, betik gerekmez; 960 px üstünde sabittir.
- **Açık el** hangi sayfada olursa olsun tektir. Başka oyunun sayfasında bahis formu yerine ele dönen bağlantı çıkar, lobide de aynı bağlantı vardır.
- **Hesap işlemleri** (`POST /oyun/islem`) kural kopyalamaz, komutların çağırdığı `lib/stats.js` fonksiyonlarını çağırır (`bankaYatir`, `bankaCek`, `krediCek`, `krediOde`, `coinAl`, `coinSat`, `claimDaily`, `calis`, `kiraTopla`). İşlem adı `Object.hasOwn` ile denetlenir. Sonuç bir kez gösterilir (`bildirim`). Tutar alanının adı `tutar`'dır: `oyun.js` `miktar` adlı bahis alanlarını birbirine eşitler.
- Hesap sayfası açılınca faiz ve kira işlenir (`bankaDurumu`, `mulkDurumu`), `.banka` ve `.mülk` yazmak gibi. Servet `servetDurumu` ile hesaplanır, yazmaz.
- Meslek seçimi, market, mülk alım satımı, borsa, Suly, soygun ve grup oyunları panelde yoktur, WhatsApp'ta kalır.
- **Panelde kumar yasağı yoktur (bot sahibinin kararı, "enflasyon umrumuzda değil"):** `panel/kumar.js` `kumarYasagi()` çağırmaz; iflas, hapis ve dolan günlük tavan yalnızca WhatsApp komutlarını kapatır. `bahisOyna` ve `kumarOde` panelden `tavansiz: true` ile çağrılır: kazanç kırpılmaz ve `kumar_gun.net`'e yazılmaz, yani panel kazancı WhatsApp'taki tavanı da doldurmaz. 500 XP şartı (`kumarEngeli`) panelde de geçerlidir. Faz 53 ve Faz 58'deki "tavan ve yasaklar ortaktır" notları panel için artık geçerli değildir.

### Faz 61 — Panel blackjack'i: çift, böl, sigorta, teslim

Yalnızca paneldedir (`panel/kumar.js:blackjackHamle`); WhatsApp'taki `.blackjack` hâlâ `kart`/`dur`'dur, çünkü orada her hamle bir yanıt mesajıdır. El artık `el.eller` dizisidir (bölününce iki el), `el.aktif` sıradaki eldir.

- **Ek bahis** (çift, böl, sigorta) `ekBahis()` ile o an cüzdandan çekilir; XP yetmezse hamle reddedilir, el bozulmaz. `el.bahis` toplam yatırılandır ve `kumarOde`'ye o gider, `el.taban` masaya oturulan tutardır (sonraki elin bahis alanı bununla dolar).
- **Çift:** yalnızca iki kartlı elde, bahis ikiye katlanır, tek kart gelir, el kapanır. Bölünmüş elde de yapılır.
- **Böl:** aynı puanlı iki kart (10, J, Q, K eşittir), el başına bir kez. Bölünen aslara birer kart gelir ve eller kapanır. Bölünen elde 21 doğal blackjack sayılmaz, 2x öder (`bjElOdemesi`): sayılsaydı as bölmek 2,5x basardı.
- **Sigorta:** krupiyenin açık kartı as ise ilk hamleden önce sorulur (`sigortaSor`), tutarı bahsin yarısıdır, krupiye blackjack yaparsa 3 katı döner.
- **Krupiye kapalı karta bakar:** açık kart 10'luksa el başlarken, as ise sigorta kararından sonra. Blackjack'i varsa el hemen biter; bakmasaydı çift ve böl parası baştan kaybedilmiş ele yatırılırdı.
- **Teslim:** yalnızca ilk hamlede, bahsin yarısı geri döner.
- Süre dolunca açık bütün eller "dur" sayılır, sorulan sigorta alınmamış sayılır.
- Sayfa yalnızca yapılabilecek hamlenin düğmesini çizer (`gorunum`'daki `cift`, `bol`, `teslim`); denetim yine motordadır. Testler `kumarMotoru({ deste })` ile sabit deste verir, kartlar dizinin sonundan çekilir.

### Faz 62 — Slot geçişi, vurgun şeridi, alt menü

- **Bekleme kutusu** (`oyun.js:beklemeGoster`) gelecek sonuç kartıyla aynı yerde ve ölçüdedir: eski `#sonuc`'un yerine geçer, başlığı ve sonuç yazısı kadar boşluğu (`.bekleme-bosluk`) vardır. Önceden eski sonuç ile dönen makine birlikte görünüyor, yanıt gelince makine aşağı zıplayıp kart yeniden açılıyordu. Sonuç bekleme kutusunun yerine geliyorsa `main.yerinde` yazılır, kartın giriş animasyonu (`--giris`) kapanır; makara şeridi bulanık başlar ki geçişte net kare görünmesin. `.bekleme-bosluk` yüksekliği sonuç yazısı değişirse onunla değişir.
- **Vurgun şeridi:** lobide `kumar_oyun.en_buyuk`'tan grubun en büyük tek el kazançları kayar (`panel/kumar.js:buyukVurgunlar`), bot yoktur. Ad `isimler`'den gelir, `h` kaçırır. Liste dikişsiz dönsün diye iki kez yazılır.
- **Alt menü** (`.alt-menu`) telefonda sabittir, 960 px üstünde gizlenir; `yanMenu` ile birlikte `<main>`'in dışında çizilir.

## Elle Doğrulama

`npm test` soket davranışını kapsamaz. Değişiklik sonrası:

1. `npm start` → QR terminale düşer, telefondan okutulur
2. Süreç durdurulup tekrar başlatılır → QR **sormamalı** (oturum kalıcı)
3. Geçerli komut → beklenen yanıt
4. Var olmayan komut → bot sessiz kalır, süreç çökmez
5. Prefix'siz mesaj → hiç tepki yok
6. Grup komutu (`.grup`, `.etiket`…) özel sohbette → "yalnızca grup içinde" mesajı
7. `.gününsözü` iki kez → aynı söz; `.ship @a @b` iki kez → aynı yüzde
8. Birkaç mesaj yazılıp `.stats` → sayaçlar artmış; bot yeniden başlatılıp
   `.stats` → **sayılar duruyor** (SQLite kalıcı)
9. Bot bir komuta yanıt verdikten hemen sonra `.son` → botu değil, son yazan
   kişiyi göstermeli
10. `.kelime` → gruba **yanıtsız** normal mesaj yaz: bot sessiz kalmalı. Aynı
    kelimeyi botun oyun mesajına **yanıt olarak** yaz: işlenmeli.
11. Botun **eski** bir oyun mesajına yanıt → hiç tepki yok; yalnızca en son
    oyun mesajına verilen yanıt işlenir
12. Oyun açıkken ikinci bir `.kelime`/`.kimim` → "zaten aktif bir oyun var"
13. `.oyunbitir` sıradan üye tarafından → reddedilir; başlatan kişi, grup admini
    ya da bot sahibi tarafından → oyun kapanır ve özet gelir
14. Aynı komut 3 sn içinde üç kez → ilki çalışır, ikincisine "⏳" uyarısı,
    üçüncüsüne hiç tepki yok; bot sahibi için bekleme yok
15. `.anket Soru | a | b` → yerel anket; tek seçenekle → kullanım metni
16. `.günlük` iki kez → ikincisi "zaten aldın"; `.profil` XP'yi göstermeli
17. `.quiz` → yanlış cevap veren aynı soruda tekrar deneyemez; doğru cevapta
    oyun kapanır, +50 XP
18. Sahip LID'li bir grupta `ownerOnly` komut yazar → çalışmalı
19. Admin `.sus` → `.zar` sessiz, sıradan üye `.konuş` → reddedilir; admin
    `.konuş` → bot döner. Bot yeniden başlatılırsa susturma korunur
20. Bir sesli mesaja `.efekt ters` → tersten çalan sesli mesaj gelir
21. `.hava İzmir` → hava kartı; uydurma şehir → "bulamadım"
22. `.düello @kişi` → seyirci yanıtı yok sayılır; ilk doğru cevap kazanır
23. `npm test` → hepsi geçer; sonrasında `data/stats.db` değişmemiş olmalı
24. Bir fotoğrafa `.foto sb` → siyah-beyaz hali gelir; telefonla çekilmiş dikey
    fotoğraf yan dönmemeli
25. `.yaz merhaba` → yazı sticker'ı; `.deprem`, `.döviz`, `.namaz Ankara` → veri gelir
26. `.emoji` → 3 yanlışta harf kalıbı gelir; doğru cevap (ya da İngilizce adı) oyunu bitirir
27. `.adamasmaca` → harf yanıtı tahtayı günceller, aynı harf tekrar ceza almaz; 6 yanlışta adam asılır
28. `.bahis 100 tura` → sonuç ve yeni XP; bakiyeden fazla bahis → "o kadar XP'n yok"; `.profil` aynı XP'yi göstermeli
29. Sahip özelden `.xpver <grup id> <numara> 100` → onay gelir, kişi grupta `.profil`'de XP'yi görür;
    aynı komut grupta → hiç tepki yok; başkası özelden yazarsa → hiç tepki yok
30. `.devret @kişi 10` → iki bakiye de değişir; bakiyeden fazlası → "o kadar XP'n yok"; sıradan üye
    `.devret @a @b 10` → reddedilir, sahip yazınca a'dan b'ye geçer (yön metindeki sırayla aynı olmalı)
31. `.çark` iki kez → hak 0'a iner, üçüncüsü "hakkın bitti"; `.çark ekstra` → yazan ücret düşer, dördüncü ekstra reddedilir; `.çark durum` → kalan
    süre ve bonus; bonus varken oyun kazanılınca mesajdaki XP ile `.profil` artışı tutmalı
32. `.blackjack 10` → `kart`/`dur` yanıtları çalışır, başkasının yanıtı yok sayılır; `.oyunbitir` iade etmez
33. `.mayın 10` → kutu yanıtı çarpanı artırır, `çek` kazancı verir; mayında bahis yanar
34. `.vs @kişi 10` → yalnızca rakibin `kabul`ü sayılır; cevapsız kalırsa XP değişmez
35. `.piyango 10` iki kişiden → sıradan üye `.çekiliş` reddedilir, admin çekince havuz kazananın olur; `.kumartop` sonucu gösterir
36. `.tahmin`, `.karışık`, `.sayıoyunu` → son mesaja yanıt işlenir, doğru cevap XP verir; `.sayıoyunu`'nda verilmeyen sayı reddedilir
37. `.görev` → görevler listelenir; biten görevin XP'si bir kez verilir
38. `.market al 1` → XP düşer; kalkanlı kişiye `.soygun` → engellenir, hak yanmaz; `.soygun` üçüncü kez → "hakkın bitti"
39. `.açıkartırma 10 30` → herkes etiketlenir; ilk mesaja yanıt teklif olur, düşük teklif reddedilir; süre bitince kazanan yazılır, XP değişmez
40. `.market` → key'ler ayrı başlıkta listelenir; `.market al 7` → `.market`'te yazan fiyat düşer, ödül yazılır; XP yetmezse ödül çıkmaz
41. `.ödül @kişi 100` → 100 XP düşer, listede 90 XP görünür; o kişi soyulunca hırsız ödülü alır, liste boşalır
42. `.banka yatır 100` → cüzdan düşer; `.banka çek 100` → 95 XP geri gelir; bir saat sonra `.banka` faizi gösterir
43. `.sezon` → sıralama ve kalan gün gelir; oyun kazanınca puan artar, kumar kazanınca artmaz
44. `.borsa al muz 100` → XP düşer, `.borsa` portföyü gösterir; hemen `.borsa sat muz hepsi` → komisyon kadar zarar
45. `.kart` → koleksiyon; `.kart ver @kişi 1` → kart geçer, elinde yoksa reddedilir; eksikle `.kart tamamla 1` → eksikler yazılır
46. `.market` → vitrin stoğu görünür; `.market al 13` iki kez → ikincisi "zaten aldın"
47. `.borsa` 15 dakika arayla iki kez → fiyatlar değişmiş, başta piyasa havası yazıyor
48. Panel adresi telefonda → HTTPS, şifre ekranı; yanlış şifre 6 kez → kilit mesajı; `curl http://sunucu-ip:8787` → bağlanamaz
49. `.bahis 10 tura` kaybedilince `.top`'ta bot numarasının XP'si 10 artar, yeni satır açılmaz; kazanınca değişmez; sıradan üye `.profil @bot` → "gizli"; `.soygun @bot` → reddedilir
50. `.haber` → büyük harf kalın başlık, altında küçük "parodihaber"; `.news` aynı
51. `.kredi çek 500` → cüzdan artar, `.kredi` borcu gösterir; ikinci kredi reddedilir; `.devret` reddedilir
52. Borçluyken `.banka yatır 100` → borç 100 azalır, hesap değişmez; `.kredi öde hepsi` → borç biter
53. Cüzdanda 500 XP yokken `.bahis`, `.blackjack`, `.piyango`, `.vs` → "en az 500 XP" mesajı
54. Eksi cüzdanla `.iflas` → cüzdan 0, `.bahis` "kumar yasağın var" der; artı cüzdanla `.iflas` → reddedilir; hisse varken → "önce sat"
55. Sahip `.haciz @kişi 100` → kişinin hesabı 100 azalır; parası yetmezse cüzdanı eksiye düşer, kasaya yalnızca alınan girer; sıradan üye yazarsa hiç tepki yok
56. Kumarda büyük kazanç → mesajda `2.000.000` biçimi; `.açıkartırma` sonundaki `.devret` örneği noktasız kalır
57. `.coinmarket coin 1` → 1.000.000 XP düşer, `.profil` coini gösterir; açık krediyle → reddedilir; `.coin` yazı-tura atmaya devam eder
58. `.coinmarket al 2` sonra `.soygun herkes` → kalkanlı üye listede yok, bot soyulmaz, hak biter; hakkı olmayan → "hakkın yok"
59. `.hacizall` → herkesin hesabı ve cüzdanı düşer, para alıcının cüzdanına geçer; 90 coin yoksa hiçbir şey değişmez; sigortalı üye "sigortalı" yazar, parası düşmez
60. `.tüik` → para, kur, "bugün açılıştan beri" satırı ve zenginler gelir, bot listede yok; ertesi gün enflasyon yüzdesi görünür; `.coinmarket` aynı kuru yazar
61. `.coinmarket sat 1` → kurun %90'ı gelir; eksi cüzdan ve coinle `.iflas` → "önce coinlerini boz"
62. `.mülk al ev` → 15 coin düşer, `.profil`'de görünür; bir saat sonra `.mülk topla` → kira gelir; sahip `.haciz @kişi ev` → ev gider, kasa artar
63. `.top` → bot tek satır; sahip `.devret @bot 10` → botun satırı artar, ikinci satır açılmaz
64. Sahip `.faizkararı 25` → banka %25, kredi %29; `.faizkararı 0,25` → banka %0,25, kredi %4,25, günlük karşılığı yazar; `0,125` → reddedilir; `-0,5` → `.banka` bir saat sonra 📉 eksi faiz yazar, kredi %4; sıradan üye yazarsa tepki yok; `.banka` ve `.kredi çek` yeni oranı yazar
65. Sahip `.teşvik 1000` → aktif üyeler eşit pay alır, kasa azalır; kasadan fazlası reddedilir
66. Servet 1 coin değerini geçen kişi günün ilk mesajında vergi öder, `.banka` son vergiyi yazar; panelde Ekonomi kartı görünür
67. `.soygun`'da yakalanınca `.hapis` listeler; `.bahis`, `.soygun`, `.çalış` reddedilir; başkası `.kefalet @kişi` yazınca çıkar
68. `.seçim` → hükümet ve dört seçim; sıradan üye `.faizkararı 25` → "yalnızca başkan"; başkan ikinci kararda "yarın tekrar"
69. `.evlen @kişi` → yalnızca hedefin `evet`i sayılır, `.profil` eşi gösterir; `.boşan` tutarı yazar, `.boşan onay` parayı aktarır
70. `.meslek seç kurye`, `.çalış` → maaş gelir; ikinci `.çalış` kalan süreyi yazar
71. `.çete kur Ad`, başkası `.çete katıl Ad`, `.çete yatır 1000` → kasaya 950 girer; üye `.çete çek` reddedilir, lider çeker
72. `.dava @kişi 1000 sebep` → taraflar oy veremez, iki üye `haklı` yazınca 5 dk sonra XP geçer; tek oyda dava düşer
73. `.özet` → son 7 günün mesajları ve tüm zamanlar başlığı gelir, bot listede yok
74. `.help` → kısa menü; `.help kumar` → açıklamalı bölüm; `.help sticker` → komut ayrıntısı; `.help tümü` → uzun liste
75. Panelde grup sayfası çete, hapis, evlilik ve meslek kartlarını, kişi sayfası Hayat kartını gösterir; verisi olmayan kart çıkmaz
76. Vergi ödeyen kişi `.vergitop`'ta görünür, bot listede yok; kimse ödemediyse "henüz kimse" yazar
77. `.vergikaçır` → plan kurulur, ikinci yazışta "zaten hazır"; ertesi gün ilk mesajdan sonra `.vergikaçır` sonucu yazar, yakalanınca `.hapis` listeler; `.tüik` kasa, açık kredi ve maaş satırlarını gösterir
78. `.piyasa` → olay ve bitişine kalan süre; `.tüik` aynı olayı yazar; Kara Cuma'da `.market` ürün fiyatları düşük, key fiyatı aynı
79. `.yatırım 1000 yüksek` → cüzdan düşer; hemen `.yatırım` → kalan süre; 6 saat sonra `.yatırım` → sonuç ve ödeme; ikinci yatırım reddedilir
80. `.tefeci ver @kişi 1000 20 1` → teklif; başkası `.tefeci kabul` yazarsa "teklifin yok"; hedef kabul edince para geçer, `.devret` çalışır; 1 saat sonra borçlu mesaj yazınca borç alacaklıya geçer
81. `.plinko 100 yüksek` → yol ve kutu gelir; `.crash 100 2` → patlama noktası ve sonuç; hedefsiz `.crash 100` → kullanım
82. `.hilo 100` → `yüksek`/`düşük` kartı açar, `geç` çarpanı değiştirmez, `çek` kazancı verir; As'ta `yüksek` reddedilir
83. `.kule 100 zor` → kutu yanıtı kat çıkarır, ejderhada bahis yanar, `çek` kazancı verir; başkasının yanıtı yok sayılır
84. `.yarış 100 1`, başkası `.yarış 200 3` → ikisi listede; aynı kişi ikinci bahiste "zaten bastın"; 60 sn sonra pist ve sonuçlar gelir
85. `.wordle kalem` → ortak tahtaya satır eklenir, yazanın adıyla; 3 hak bitince dördüncü reddedilir; biri bilince başkası aynı kelimeyi yazarsa "… bildi" der, XP almaz; bot yeniden başlayınca hak tazelenmez
86. `.meslek seç futbolcu` → uyarı gelir, meslek değişmez; `onay` ile seçilir; `.istifa` → kariyer biter, `.meslek seç kurye` hemen çalışır. Kuryeyken `.istifa` → `.meslek seç garson` kalan süreyi yazar
87. `.coindevret @kişi 1` → iki coin bakiyesi yazılır; coinden fazlası → "o kadar coinin yok"; açık krediyle → reddedilir; sıradan üye `@bot` → reddedilir, sahip `.coindevret @bot 1` → botun coini artar; sahip `.coindevret @bot @kişi 1` → bottan kişiye geçer
88. `.servet` → cüzdan, banka, coin, mülk satırları ve net; `.servet top` → bot yok, coinli kişi `.tüik`'ten farklı sırada olabilir; `.servet @bot` sıradan üyeye "gizli"
89. `.slot 100` ve `.mayın 100` sonrası `.kumarkarnem` → iki oyun ayrı satırda, en büyük vurgun ve kasaya kaptırılan yazılır
90. `.tabu` → kart özelden gelir, grupta tabu mesajı; anlatan yasaklı sözcüğü yanıtlarsa "TABU!"; başkası kelimeyi yanıtlarsa ikisi de XP alır; anlatan `pas` → yeni kart özelden
91. `.vampir` → 4 kişi `katıl`, kuran `başla`; herkese rol özelden gelir; grupta `.vampir öldür 2` → "özelden yaz"; vampir özelden öldürünce sabah ölen ve rolü yazar; gündüz oylamasında herkes oy verince sonuç hemen gelir; vampir asılınca köy XP alır; oyun sürerken özelden `.vampir` → rol (gecede liste de) yeniden gelir
92. `.pet sahiplen kedi Pamuk` → XP düşer, `.pet` kartı gösterir; hemen `.pet besle` → "tok"; `.pet oyna` iki kez → ikincisi kalan süreyi yazar; `.pet hediye` → XP gelir, ikincisi bekletir; `.pet @kişi` başkasının kartını açar
93. `.seçim aday adalet` → "seçim başladı", başkası `.seçim oy adalet @kişi`; 30 dk sonra bot sonucu kendiliğinden yazar ve kazananı etiketler; açık seçim yokken `.seçim oy` → "açık seçim yok"; `.bakan tutukla @x` → 1 saat hapis, ikincisi "yarın"; İçişleri `.bakan af @x` → çıkar
94. Seçilmiş başkan yokken `.hazine` başkanı sahip yazar; `.hazine ver @kişi 1000` → kasa azalır; on birinci kişi "yarın"; kişi başı limit üstü → o kişiye kalanı yazar; `.bahis` kazanınca `.hazine` kasası kazanç kadar azalır; sıradan üye → "yalnızca başkan"
95. Sahip özelden `.darbe <grup id>` → grupta herkes etiketlenir, üyelere özelden mesaj gelir; `destek` yanıtı ✅ alır; 10 dk sonra sonuç, `.seçim aday` → "askıda"; grupta `.darbe` → hiç tepki yok; sahip özelden `.help darbe` → rehber, grupta ya da başkası yazınca → yok; `.darbe bitir <grup id>` → seçim açılır
96. `.help savunma` → Savunma Bakanı'nın görevi; `.help başkan` → `.faizkararı` ve `.hazine ver`; `.help makamlar` → dört makam
97. `.kripto` → Suly'nin dolar fiyatı ve XP karşılığı; `.kripto al suly 0.001` → XP düşer, `.kripto` 0,001 gösterir; `.kripto al suly 0,000000001` → kullanım; `.kripto sat suly hepsi` → %1 kesintiyle XP gelir; Suly varken eksi cüzdanla `.iflas` → "önce sat"; sahip `.haciz @kişi suly hepsi` → Suly kasaya; `.hacizall` Suly'ye dokunmaz
98. `.mülk devret @kişi ev` → ev geçer, iki adet yazılır; son evde birikmiş kira verene ödenir; borçluyken → reddedilir; `@bot` → reddedilir
99. Bot admin değilken `.sustur @kişi` → "beni admin yapın"; admin yapılınca `.sustur @kişi 1` → kişinin mesajları silinir, `.stats`'ı artmaz; 1 dk sonra mesajı kalır; sıradan üye `.sustur` → reddedilir; `.sustur kaldır @kişi` → açılır; `.sustur @sahip` → reddedilir
100. Başkan `.kayyum dışişleri @mert` → eski bakan görevden alınır, Mert bakan; `.seçim aday dışişleri` → "kayyumla yönetiliyor"; `.seçim` hükümette "(kayyum)" yazar; sıradan üye `.kayyum` → "yalnızca başkan"; `.kayyum kaldır dışişleri` → seçim açılır
101. Adalet Bakanı `.bakan tutukla` beş kişiye → her mesajda kalan hak, altıncısı "yarın"; Dışişleri `.bakan ambargo @x` → x `.devret` ve `.coindevret` yazınca "ambargodasın"
102. Bir günde piyasanın %50'sinden fazla kumar kazanan → son kazancın fazlası "kasada kaldı" yazar, sonraki `.bahis` "kumar yasağın var" der; ertesi gün açılır
103. `.sustur @kişi` sonra kişi 3 mesaj yazar → özelden "3 mesaj daha yazarsan" uyarısı gelir; 3 mesaj daha → özelden el konulanlar listesi gelir, `.servet`'i yarıya iner, `.top`'ta bot artar; `.sustur kaldır @kişi` → sayım sıfırlanır
104. Panelde grup sayfası → Hükümet, Hazine, Kumarhane, Suly, Cezalılar kartları; bot sıralamada "🤖 Hazine"; kişi sayfası → Varlıklar, Borç ve alacak, kumar oyun dökümü; servet coin ve mülkü sayar
105. Sahip özelden `.coinver <grup id> <numara> 5` → onay gelir, kişi `.coinmarket`'te 5 coin görür; `-10` → bakiye 0; grupta yazılırsa hiç tepki yok; `.help coinver` → yok
106. Tavanı dolduran kişiye İçişleri Bakanı `.kumaraf @kişi` → yasak kalkar, kalan hak 4 yazar, `.bahis` çalışır; tavanı dolduran sahip etiketsiz `.kumaraf` → kendi yasağı kalkar; sıradan üye → "yalnızca İçişleri Bakanı"; yasaksız kişiye → "takılmamış", hak yanmaz; sahip için kalan hak yazmaz
107. Bota özelden `.panel kayıt deneme-sifre` → giriş adları yazılır; grupta yazılırsa → kaydedilmez. Panelde numarayla girince yalnızca kumarhane açılır, `/grup` kumarhaneye döner; slot oynayınca WhatsApp'ta `.profil` aynı XP'yi gösterir; mayında kutu açılır, `çek` öder; kişi gruptan atılınca sayfa yenilenince giriş ekranına düşer; numara alanı boş + yönetici şifresi → eski panel
108. Panelde oyuncu girişi → lobi kategorili; telefonda ☰ yan menüyü açar, bilgisayarda menü hep açık; Slot'a tıklayınca oyun kendi sayfasında açılır. Mayın eli açıkken Crash sayfası → "önce elini bitir" bağlantısı
109. Panelde Banka ve kredi → `100 bin` yatır → bildirim gelir, WhatsApp'ta `.banka` aynı bakiyeyi gösterir; Hesabım → net servet `.servet` ile aynı; günlük ödül ikinci kez → "zaten aldın"
110. WhatsApp'ta `.bahis` "kumar yasağın var" diyen kişi panelde oynayabilir; panelde büyük kazanç WhatsApp'taki tavanı doldurmaz
111. Panelde blackjack: iki kartla ✖️2 ÇİFT → bahis katlanır, tek kart gelir, el biter; 8-8 gelince ✂️ BÖL → iki el yan yana, sıradaki el çerçeveli; krupiyenin açık kartı as → önce sigorta sorulur; 🏳️ TESLİM → bahsin yarısı döner; XP yetmezken çift → "XP'n yetmiyor", el sürer
