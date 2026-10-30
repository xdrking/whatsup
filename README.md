# wp-bot

Tek bir arkadaş grubunda kullanılan, kişisel ve eğlence amaçlı bir WhatsApp botu.
[Baileys](https://github.com/WhiskeySockets/Baileys) ile WhatsApp Web protokolüne
bağlanır; sticker yapar, metni sese çevirir, istatistik tutar ve grup oyunları oynatır.

Ticari değildir. Toplu mesaj, spam ya da numara toplama yapmaz — bot yalnızca kendisine
yazılan komutlara yanıt verir, kendiliğinden mesaj başlatmaz.

## Gereksinimler

| Gereksinim | Not |
|---|---|
| Node.js 20+ (22 önerilir) | `package.json` → `"type": "module"`, ESM |
| `ffmpeg` | **Sistem paketi**, npm paketi değil. Yoksa `.sticker`'ın video/GIF kolu, `.tts` ve `.efekt` çalışmaz |
| `DejaVu Sans` + renkli emoji fontu | `.sticker`'ın metin (alıntı kartı) kolu için |
| WhatsApp hesabı olan bir telefon | QR okutmak için |

Kurulum (Debian/Ubuntu):

```bash
sudo apt install ffmpeg fonts-dejavu fonts-noto-color-emoji
```

Doğrulama:

```bash
ffmpeg -version
fc-list | grep -i dejavu
```

`better-sqlite3` ve `sharp` derlenmiş modüller getirir; `npm install` sırasında
platformunuza uygun hazır ikili indirilir, normalde ek bir derleyiciye gerek yoktur.

## Kurulum

```bash
git clone https://github.com/xdrking/whatsup.git
cd whatsup
npm install
cp .env.example .env
```

Ardından `.env` dosyasını doldurun:

```ini
# Ülke koduyla, + ve boşluk olmadan. Örnek: 905551112233
OWNER_NUMBER=905551112233

# Komut ön eki
PREFIX=.

# Sticker paketinde ve yardım metninde görünen ad
BOT_NAME=wp-bot

# Oyun zaman aşımı (ms). Boş bırakılırsa .kelime/.kimim 1 saat, .quiz 10 dk,
# .düello 2 dk. Daha kısa bir değer verilirse tüm oyunlar için o geçerli olur.
OYUN_TIMEOUT_MS=

# trace | debug | info | warn | error | silent
LOG_LEVEL=info
```

`OWNER_NUMBER` bot sahibini tanımlar: `ownerOnly` komutlarını yalnızca o çalıştırır,
bekleme süresine takılmaz ve her grupta `.oyunbitir`, `.sus`, `.konuş` yetkisi vardır
(grup admini olmasa bile). Boş bırakılabilir; o zaman bu yetkiler kimsede olmaz,
grup adminlerinin yetkileri yine çalışır.

## Çalıştırma

```bash
npm start      # botu başlat
npm run dev    # dosya değişince otomatik yeniden başlat (node --watch)
npm test       # otomatik testler (WhatsApp bağlantısı gerekmez)
```

İlk çalıştırmada terminale bir QR kodu basılır:

1. Telefonda WhatsApp → **Ayarlar → Bağlı cihazlar → Cihaz bağla**
2. Terminaldeki QR'ı okut
3. Bağlantı onayını konsolda gör

Oturum `auth/` klasörüne yazılır. Bot durdurulup tekrar başlatıldığında **QR tekrar
sorulmaz**. Sorulursa oturum düşmüştür; `auth/` klasörünü silip yeniden okutun.

Botu durdurmak: `Ctrl+C`.

### Kullanım

Bot yalnızca **prefix ile başlayan** mesajlara tepki verir. Prefix'siz mesajlar
sessizce yok sayılır (yalnızca istatistik sayaçlarına işlenir).

```
.help            komut listesi (medya, eğlence, grup… başlıklarıyla)
.help sticker    tek komutun ayrıntısı
```

Bazı komutlar bir mesajı **yanıtlayarak** çalışır (`.sticker`, `.al`, `.tts`, `.efekt`),
bazıları etiket alır (`.roast @kişi`, `.düello @kişi`). Etiket alan komutlar
etiket yerine yanıtla da çalışır.

## Komutlar

Aşağıdaki liste `.help` çıktısının özetidir; her komutun alias'ları da vardır
(örneğin `.s` = `.sticker`, `.yardım` = `.help`).

### Medya

| Komut | Yapar |
|---|---|
| `.sticker` | Yanıtlanan görsel/video/GIF'i sticker yapar; düz metni yanıtlarsan sohbet balonu sticker'ı üretir |
| `.al` | Sticker'ı görsele (animasyonluysa videoya) geri çevirir |
| `.tts <metin> \| <dil>` | Metni sesli mesaj olarak gönderir. Örn. `.tts merhaba \| tr` |
| `.efekt <ad>` | Yanıtlanan sese efekt: ters, hızlı, yavaş, incelt, kalın, yankı, robot, telefon, bas |
| `.foto <efekt>` | Yanıtlanan fotoğrafa efekt: sb, sepya, bulanık, keskin, ayna, ters, negatif, piksel |
| `.yaz <metin>` | Metinden kenarlıklı yazı sticker'ı |

### Eğlence

| Komut | Yapar |
|---|---|
| `.saka` | Rastgele şaka |
| `.fal` | Rastgele fal |
| `.kader` | Rastgele kader mesajı |
| `.kim` | "Bu grupta en çok kim..." sorusu |
| `.gününsözü` | Günün sözü — gün boyunca değişmez |
| `.iltifat @kişi` | Hedefe iltifat |
| `.roast @kişi` | Hafif kızartma |
| `.roastsert @kişi` | Ağır kızartma (küfürlü) |
| `.ship @a @b` | Uyum yüzdesi — aynı çift için hep aynı sonuç |
| `.zar` | 1-6 zar |
| `.coin` | Yazı tura |
| `.meme` | İnternetten rastgele meme |
| `.anket Soru \| a \| b` | Tek seçimli WhatsApp anketi (2-12 seçenek) |
| `.dc` | Doğruluk mu cesaret mi. `.dc d @kişi`, `.dc c` |
| `.seç a \| b \| c` | Seçeneklerden birini rastgele seçer |
| `.hesap <ifade>` | Dört işlem, üs, mod, parantez. Örn. `.hesap (12+3)*4` |
| `.hava <şehir>` | Anlık hava durumu (Open-Meteo) |
| `.deprem` | AFAD'a göre son depremler. `.deprem 4` → son 7 günün 4+ depremleri |
| `.döviz` | Dolar/euro/sterlin TL karşılığı. `.döviz 100 dolar` |
| `.namaz <şehir>` | Bugünkü namaz vakitleri (Diyanet hesabı) |
| `.8top <soru>` | Sihirli 8 top evet/hayır cevabı |
| `.burç <burç>` | Günlük burç yorumu, gün boyu aynı |

### Grup

| Komut | Yapar |
|---|---|
| `.grup` | Grup adı, ID, üye/admin sayısı, oluşturulma tarihi |
| `.admin` | Adminleri etiketleyerek listeler |
| `.üyeler` | Üye listesi (etiketlemeden) |
| `.say` | Üye sayısı |
| `.etiket` | Herkesi etiketler. `.etiket 3` → rastgele 3 kişi |
| `.kimvar` | Son bir saatte yazanlar (**online listesi değildir**) |
| `.son` | En son yazan kişi |
| `.pp` | Profil fotoğrafı |
| `.id` | JID bilgisi |
| `.ping` | Botun ayakta olduğunu ve gecikmeyi gösterir |
| `.sus` / `.konuş` | Botu bu grupta susturur / açar (yalnızca admin veya owner) |

Grup komutları özel sohbette çalışmaz, kısa bir uyarıyla döner.

### İstatistik

| Komut | Yapar |
|---|---|
| `.stats` | Mesaj/sticker/ses sayıları ve en aktif saat |
| `.profil` | Ad, level, XP |
| `.top` | Sohbetteki XP sıralaması. `.top 5` |
| `.günlük` | Günde bir kez XP ödülü; üst üste gelirsen seri büyür |
| `.rozet` | Kazanılan rozetler ve sıradakilerin ilerlemesi |

Sayaçlar sohbet başına ayrı tutulur ve `data/stats.db` içinde kalıcıdır.
XP: mesaj +1, sticker +2, ses +2 (spam'e karşı cooldown'lu),
geçerli oyun kelimesi +3, doğru quiz cevabı ve düello galibiyeti +5, doğru kimim tahmini +10,
`.günlük` 20-50 (seri 7. günde tavana ulaşır). Level = `floor(sqrt(xp / 50))`.

**Mesaj içeriği hiçbir yerde saklanmaz** — yalnızca sayaçlar.

### Oyunlar

| Komut | Yapar |
|---|---|
| `.kelime` | Türkçe kelime zinciri. Kelimeler TDK'de doğrulanır |
| `.kimim` | Karakter tahmini; her 3 yanlışta yeni ipucu |
| `.quiz` | 4 şıklı bilgi sorusu; herkesin tek hakkı var, ilk bilen kazanır (10 dk) |
| `.düello @kişi` | İki kişilik hızlı matematik düellosu; ilk doğru cevap kazanır (2 dk) |
| `.oyunbitir` | Aktif oyunu kapatır (başlatan kişi, grup admini veya owner) |

Oyun cevapları prefix taşımaz: botun **en son** oyun mesajını **yanıtlayarak**
yazılır. Başka bir mesaja verilen yanıtlar ya da yanıtsız mesajlar yok sayılır.
Bir grupta aynı anda tek oyun çalışır; oyunlar 1 saat (quiz 10 dk) sonra kendiliğinden kapanır.
Durum yalnızca bellektedir — bot yeniden başlarsa yarım oyunlar düşer.

### Bekleme süresi

Aynı kişi aynı komutu art arda yazarsa komut çalışmaz; ilk denemede bir kez
"⏳ biraz yavaş" uyarısı gelir, sonrakiler sessizce yok sayılır. Varsayılan 3 sn;
medya ve dış servis komutları (`.sticker`, `.al`, `.tts`, `.efekt`, `.foto`, `.yaz`,
`.meme`, `.hava`, `.deprem`, `.döviz`, `.namaz`) ve `.anket` 10 sn, `.etiket` 30 sn. Bot sahibi muaftır.

## Yeni komut ekleme

`commands/` klasörüne bir dosya koymak yeterli; router'a veya `index.js`'e
dokunulmaz — `commands/index.js` klasörü açılışta tarar.

```js
// commands/selam.js
export default {
  name: 'selam',
  aliases: ['merhaba'],
  description: 'Selam verir',
  usage: '.selam',
  ownerOnly: false,
  // Opsiyonel alanlar:
  // cooldown: 10,          bekleme süresi (sn); yoksa 3, 0 = sınırsız
  // details: ['…'],        .help selam yazınca gösterilen örnekli açıklama
  // category: 'eğlence',   .help başlığı: medya | eğlence | grup | istatistik | araç | oyun
  // worksWhenMuted: true,  .sus ile susturulmuş grupta da çalışır (yalnızca .konuş)
  async execute({ sock, from, msg }) {
    await sock.sendMessage(from, { text: 'Selam!' }, { quoted: msg })
  }
}
```

`execute()` şunları alır: `sock, msg, args, text, from, sender, parsed, commands, isOwner`.
Ayrıntı ve komut sözleşmesinin tamamı için `CLAUDE.md`'ye bakın.

## Klasör yapısı

```
index.js        Giriş noktası: Baileys soketi, QR, yeniden bağlanma
lib/            Paylaşılan yardımcılar (parse, router, sticker, ses, db, stats,
                bekleme süresi, susturma, hesap makinesi)
commands/       Her komut ayrı dosya; index.js klasörü otomatik tarar
games/          Oyun mantığı ve oyun havuzları (.kelime, .kimim, .quiz, .düello)
test/           Otomatik testler (npm test)
data/           İçerik havuzları (JSON) + stats.db (sayaçlar, XP, günlük seri, susturulan gruplar)
auth/           Baileys oturum dosyaları — commit edilmez
temp/           Medya işleme geçici dosyaları — işlem sonrası silinir
```

`data/*.json` dosyaları elle yazılan içerik havuzlarıdır (şaka, fal, roast…).
Biçim: düz string dizisi. Yeni içerik eklemek = dosyaya satır eklemek.

## Güvenlik

**`auth/` ve `.env` asla commit edilmez.** `auth/` içindeki oturum dosyaları telefon
numaranızı ve WhatsApp kimlik anahtarlarınızı taşır; sızması hesabın başkası
tarafından ele geçirilmesi demektir. `data/stats.db` de commit edilmez, çünkü grup
üyelerinin JID'lerini içerir. Üçü de `.gitignore` içindedir — yine de `git status`
öncesi doğrulamak iyi bir alışkanlıktır.

Log seviyesini `debug` yapmayın: Baileys protokol mesajlarını ham haliyle konsola
döker.

WhatsApp resmi olmayan istemcileri hoş karşılamaz. Bu bot tek bir grupta, insan
hızında ve yalnızca yanıt vererek çalışacak şekilde yazılmıştır; kötüye kullanım
(toplu mesaj, otomatik davet, numara tarama) hesabın banlanmasıyla sonuçlanır.

## Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| QR basılmıyor, `428 Connection Terminated` | Baileys sürümü. `6.7.24` sabittir, `^` eklemeyin |
| Bot tamamen sessiz, kendi telefonunuzdan komut çalışmıyor | `messages.upsert`'te `append` tipi de işlenmeli (kendi cihazınızdan giden mesaj) |
| `.sticker` video/GIF'te hata veriyor | `ffmpeg` kurulu değil |
| Sticker metninde kutu karakterler | Font eksik: `fonts-dejavu`, `fonts-noto-color-emoji` |
| Her açılışta QR soruyor | Oturum düşmüş. `auth/` sil, yeniden okut |
| Bot bir grupta hiçbir komuta cevap vermiyor | Grup `.sus` ile susturulmuş olabilir. Bir admin `.konuş` yazsın |
| `.hava` "servis cevap vermiyor" diyor | Open-Meteo'ya ulaşılamıyor; bot çökmez, biraz sonra tekrar deneyin |
| `.kelime` "servise ulaşılamıyor" diyor | `sozluk.gov.tr` yanıt vermiyor. Kelime geçersiz sayılmaz, oyun devam eder |
| Konsolda `logged out` | Oturum ölmüştür, yeniden bağlanma denenmez. `auth/` temizleyip yeni QR okutun |

## Test

```bash
npm test
```

WhatsApp bağlantısı gerektirmeyen kısımları dener: hesap makinesi, bekleme süresi,
oyun cevapları, XP ve günlük seri, fotoğraf efektleri, komutların ve `data/*.json`
havuzlarının biçimi. Gerçek `data/stats.db`'ye dokunmaz. Yeni komut ya da havuz
satırı ekledikten sonra çalıştırmak, botu açmadan önce hataları yakalar.

Mesaj gönderme, medya indirme ve grup davranışı canlı bağlantıyla elle
doğrulanır: adım adım liste `CLAUDE.md` → **Elle Doğrulama** bölümündedir.
