# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje Amacı ve Kapsamı

Kişisel, eğlence amaçlı bir WhatsApp botu. Tek bir arkadaş grubunda kullanılır.

- **Ticari değil.** Ücretli özellik, müşteri, SLA yok.
- **Toplu mesaj / spam / numara toplama yapılmaz.** Bot yalnızca kendisine gelen komutlara yanıt verir; kendiliğinden mesaj başlatmaz.
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
```

Test altyapısı yok — bot davranışı canlı WhatsApp bağlantısıyla elle doğrulanır (aşağıya bak).

## Klasör Yapısı

```
index.js        Giriş noktası: Baileys soketi, QR, yeniden bağlanma, event kaydı
lib/            Paylaşılan yardımcılar (logger, mesaj parse, komut yönlendirme)
commands/       Her komut ayrı dosya + index.js komutları otomatik yükler
games/          Oyun mantığı ve oyun veri havuzları (.kelime, .kimim, .quiz, .düello)
data/           Eğlence komutlarının içerik havuzları (JSON dizileri) + stats.db
auth/           Baileys oturum dosyaları — GİT'E ASLA GİRMEZ
temp/           Medya işleme sırasında geçici dosyalar — her işlemden sonra silinir
```

`games/` içindeki `.js` dosyaları komut değildir; `commands/index.js` klasörü düz
tarar, alt klasöre inmez. Oyun komutları `commands/kelime.js`, `commands/kimim.js`,
`commands/quiz.js`, `commands/duello.js` ve `commands/oyunbitir.js`'tir; gövde `games/` altındadır.

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

Bilerek yalnızca bellekte tutulur, diske yazılmaz: grup üyelerinin adlarını bir dosyada biriktirmek istenmiyor. Süreç yeniden başlarsa harita boşalır ve çağıran taraf numaraya düşer — bu bir hata değil, beklenen davranış.

### Durum (state) nerede tutulur

Komutlar durumsuzdur; durum yalnızca şu yerlerdedir:

| Yer | İçerik | Kalıcılık |
|---|---|---|
| `lib/contacts.js` | JID → pushName | bellek (süreçle ölür) |
| `lib/activity.js` | sohbet başına son mesaj atanlar (`.son`, `.kimvar`) | bellek (süreçle ölür) |
| `lib/outgoing.js` | botun kendi gönderdiği son mesaj id'leri | bellek (süreçle ölür) |
| `lib/cooldown.js` | kullanıcı+komut başına bekleme süresi | bellek (süreçle ölür) |
| `games/gameManager.js` | grup başına aktif oyun (`.kelime`, `.kimim`, `.quiz`, `.düello`) | bellek (süreçle ölür) |
| `lib/db.js` + `lib/stats.js` | mesaj/sticker/ses sayaçları, XP, saat dağılımı | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/stats.js` | `.günlük` son alınan gün + seri | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/mute.js` | `.sus` ile susturulan gruplar (bellekte de önbellekli) | `data/stats.db` (kalıcı) |
| `lib/db.js` + `lib/turkishWords.js` | TDK kelime doğrulama önbelleği | `data/stats.db` (kalıcı) |

Sayaçlar dışında hiçbir mesaj **içeriği** saklanmaz — ne diske ne belleğe.

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
  async execute({ sock, msg, args, text, from, sender, parsed, commands, isOwner }) { }
}
```

- `args` — prefix ve komut adı ayrıldıktan sonraki kelime dizisi
- `text` — aynı bölümün ham hali (`.tts` gibi serbest metin alan komutlar için)
- `from` — sohbetin JID'i (yanıt buraya gider)
- `sender` — mesajı yazan kişinin JID'i (grupta `from`'dan farklıdır)
- `parsed` — `lib/messageParser.js` çıktısı; `parsed.quoted.body` yanıtlanan mesajın metni,
  `parsed.quoted.message` medyası (`downloadMediaMessage`'a doğrudan verilebilir),
  `parsed.mentions` mesajda etiketlenen JID'ler
- `commands` — ad/alias → komut eşlemesi (`.help` bunu kullanır)
- `isOwner` — gönderen `OWNER_NUMBER` mı

### Yetki

Komutlar varsayılan olarak herkese açıktır. `ownerOnly: true` işaretli komutlar yalnızca `.env` içindeki `OWNER_NUMBER` için çalışır. Yetkisiz kullanımda komut sessizce reddedilir, hata detayı sohbete yazılmaz.

Sahip kontrolü `parsed.senderPn` ile yapılır, `parsed.sender` ile **değil**. LID adreslemeli gruplarda `sender` "...@lid" gelir ve rakamları telefon numarası değildir; `senderPn`, Baileys'in `key.participantPn` / `key.senderPn` alanından gelen numaralı JID'dir (yoksa `sender`'a düşer). `sender` bilerek LID olarak kalır: istatistik ve etiketler WhatsApp'ın verdiği kimlikle çalışır.

Grup admini kontrolü `lib/group.js:senderIsAdmin()` ile yapılır (`.oyunbitir`, `.sus`, `.konuş`).

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

**`data/stats.db` commit edilmez.** İçinde grup üyelerinin JID'leri ve aktivite sayaçları vardır. Mesaj içeriği tutulmaz, ama JID listesi de paylaşılacak bir şey değildir. `data/*.json` havuzları commit edilir.

Oturum dosyalarının içeriği (creds, keys) hiçbir koşulda loglanmaz. `pino` logger'ı Baileys'e verilirken seviye `silent`/`warn` tutulur; `level: 'debug'` protokol mesajlarını ham haliyle konsola döker.

## Yapılmayacaklar

- `printQRInTerminal` kullanma — Baileys'te deprecated. QR, `connection.update` event'inden alınıp `qrcode-terminal` ile basılır.
- `DisconnectReason.loggedOut` sonrası yeniden bağlanmayı deneme — oturum ölmüştür, sonsuz döngüye girer. `auth/` temizlenip yeni QR okutulması gerekir; konsola bunu açıkça yaz.
- İndirilen medyayı `temp/` dışında bırakma, işlem sonrası silmeyi atlama.
- Komut dosyası içinde `process.env` okuma dışında global durum tutma — komutlar durumsuzdur.
- Mention'ı elle biçimlendirme: metinde `@<numara>` yazıp `mentions` dizisini boş bırakma ya da tam JID'i (`@...@s.whatsapp.net`) metne basma. İkisi de tıklanmayan çirkin metin üretir. `lib/target.js` içindeki `mentionOf()` kullanılır.
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
- **Faz 13+:** yeni komutlar, her biri ayrı adım

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

`.meme` (ve Faz 12'de eklenen `.hava`) dış servise bağlı komutlardır. Zaman aşımı verilir
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
games/kimim.json      karakter + ipucu havuzu (elle yazılır, kod yazmaz)
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

`games/kimim.json` biçimi: `[{ name, hints[] }]`. Bozuk kayıtlar elenir, hiç
kullanılabilir kayıt kalmazsa komut kısa bir Türkçe hata yazar, bot çökmez.

İlk ipucu başlangıçta gösterilir, sonrakiler **her 3 yanlış tahminde** açılır.
Yanlış tahmin oyunu bitirmez ve süreyi **uzatmaz** — 1 saat, doğru cevap
gelmediği sürece işler. Doğru cevap oyunu bitirir.

Cevap eşleştirme tamamen yereldir, ağ kullanılmaz: Türkçe harfler ASCII'ye
katlanır (`ç→c, ğ→g, ı/İ→i, ö→o, ş→s, ü→u`), noktalama atılır. Tam ad, soyad
(en az 4 harf) ve "ad + soyad" kabul edilir.

#### Zaman aşımı ve XP

Her iki oyun da **1 saat** sonra kapanır (`OYUN_TIMEOUT_MS` ile denemede
kısaltılabilir). `.kelime`'de sayaç her geçerli kelimede sıfırlanır
(`touchGame`), `.kimim`'de yalnızca doğru cevap oyunu bitirir. Zaman aşımı
mesajı gönderilemese bile oyun mutlaka temizlenir, yoksa grup kalıcı olarak
"zaten aktif bir oyun var" durumunda kilitlenir.

XP mevcut sistemden verilir: `lib/stats.js:addXp()` — geçerli kelime +3, doğru
tahmin +10. `recordMessage`'ın 30 sn'lik cooldown'u burada uygulanmaz (oyun XP'si
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
- Doğru cevap +5 XP (`addXp`).

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
ikisi de yanarsa berabere biter. Galibe +5 XP, süre 2 dk (`timeoutMs`).

#### `.hesap` ve `lib/calc.js`

Elle yazılmış özyinelemeli ayrıştırıcı: `+ - * / % ^ ( )`, `×`/`x`, `÷`/`:`,
ondalık virgül. **`eval`/`Function` kullanılmaz** — grupta herkes yazabildiği için
girdi asla kod olarak çalışmamalı. Sıfıra bölme / sonsuz sonuç `CalcError` olur.

## Elle Doğrulama

Otomatik test yok. Değişiklik sonrası:

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
    oyun kapanır, +5 XP
18. Sahip LID'li bir grupta `ownerOnly` komut yazar → çalışmalı
19. Admin `.sus` → `.zar` sessiz, sıradan üye `.konuş` → reddedilir; admin
    `.konuş` → bot döner. Bot yeniden başlatılırsa susturma korunur
20. Bir sesli mesaja `.efekt ters` → tersten çalan sesli mesaj gelir
21. `.hava İzmir` → hava kartı; uydurma şehir → "bulamadım"
22. `.düello @kişi` → seyirci yanıtı yok sayılır; ilk doğru cevap kazanır
