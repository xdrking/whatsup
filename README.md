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
| `ffmpeg` | **Sistem paketi**, npm paketi değil. Yoksa `.sticker`'ın video/GIF kolu ve `.tts` çalışmaz |
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

# Oyun zaman aşımı (ms). Boş bırakılırsa 1 saat.
OYUN_TIMEOUT_MS=

# trace | debug | info | warn | error | silent
LOG_LEVEL=info
```

`OWNER_NUMBER` yalnızca `ownerOnly` işaretli komutlar için kullanılır; başka bir
işlevi yoktur. Boş bırakılabilir, o zaman owner komutu kimsede çalışmaz.

## Çalıştırma

```bash
npm start      # botu başlat
npm run dev    # dosya değişince otomatik yeniden başlat (node --watch)
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
.help            komut listesi
.help sticker    tek komutun ayrıntısı
```

Bazı komutlar bir mesajı **yanıtlayarak** çalışır (`.sticker`, `.al`, `.tts`),
bazıları etiket alır (`.roast @kişi`).

## Komutlar

Aşağıdaki liste `.help` çıktısının özetidir; her komutun alias'ları da vardır
(örneğin `.s` = `.sticker`, `.yardım` = `.help`).

### Medya

| Komut | Yapar |
|---|---|
| `.sticker` | Yanıtlanan görsel/video/GIF'i sticker yapar; düz metni yanıtlarsan sohbet balonu sticker'ı üretir |
| `.al` | Sticker'ı görsele (animasyonluysa videoya) geri çevirir |
| `.tts <metin> \| <dil>` | Metni sesli mesaj olarak gönderir. Örn. `.tts merhaba \| tr` |

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

Grup komutları özel sohbette çalışmaz, kısa bir uyarıyla döner.

### İstatistik

| Komut | Yapar |
|---|---|
| `.stats` | Mesaj/sticker/ses sayıları ve en aktif saat |
| `.profil` | Ad, level, XP |
| `.top` | Sohbetteki XP sıralaması. `.top 5` |

Sayaçlar sohbet başına ayrı tutulur ve `data/stats.db` içinde kalıcıdır.
XP: mesaj +1, sticker +2, ses +2 (spam'e karşı cooldown'lu),
geçerli oyun kelimesi +3, doğru oyun tahmini +10. Level = `floor(sqrt(xp / 50))`.

**Mesaj içeriği hiçbir yerde saklanmaz** — yalnızca sayaçlar.

### Oyunlar

| Komut | Yapar |
|---|---|
| `.kelime` | Türkçe kelime zinciri. Kelimeler TDK'de doğrulanır |
| `.kimim` | Karakter tahmini; her 3 yanlışta yeni ipucu |
| `.oyunbitir` | Aktif oyunu kapatır (yalnızca başlatan kişi veya owner) |

Oyun cevapları prefix taşımaz: botun **en son** oyun mesajını **yanıtlayarak**
yazılır. Başka bir mesaja verilen yanıtlar ya da yanıtsız mesajlar yok sayılır.
Bir grupta aynı anda tek oyun çalışır; oyunlar 1 saat sonra kendiliğinden kapanır.
Durum yalnızca bellektedir — bot yeniden başlarsa yarım oyunlar düşer.

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
lib/            Paylaşılan yardımcılar (parse, router, sticker, tts, db, stats)
commands/       Her komut ayrı dosya; index.js klasörü otomatik tarar
games/          Oyun mantığı ve oyun havuzları (.kelime, .kimim)
data/           İçerik havuzları (JSON) + stats.db
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
| `.kelime` "servise ulaşılamıyor" diyor | `sozluk.gov.tr` yanıt vermiyor. Kelime geçersiz sayılmaz, oyun devam eder |
| Konsolda `logged out` | Oturum ölmüştür, yeniden bağlanma denenmez. `auth/` temizleyip yeni QR okutun |

## Test

Otomatik test yoktur; bot davranışı canlı bağlantıyla elle doğrulanır. Adım adım
doğrulama listesi `CLAUDE.md` → **Elle Doğrulama** bölümündedir.
