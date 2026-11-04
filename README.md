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
OWNER_LID=

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

`OWNER_LID` isteğe bağlıdır. WhatsApp bazı hesaplarda özel sohbette numarayı
göstermez, yalnızca `...@lid` kimliği gönderir; o zaman owner komutları sessiz
kalır ve log'a `Yetkisiz komut denemesi` + `sender: "...@lid"` düşer. O değer
(ya da grupta `.id` yazınca "Sen" satırındaki değer) `OWNER_LID`'e yazılır.

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
| `.devret @kişi 100` | Kendi XP'nden başkasına devreder (mesajı yanıtlayarak `.devret 100` da olur) |
| `.devret @a @b 50` | **Yalnızca owner.** a'nın XP'sinden b'ye aktarır; owner'ın kendi XP'si değişmez. `.help`'te görünmez |
| `.xpver <grup id> <numara ya da @lid id> <miktar>` | **Yalnızca owner, yalnızca özelden.** Gruptaki kişiye XP verir/alır (`-50`); grupta yazılırsa yok sayılır. Grup id'si ve kişinin id'si grupta `.id @kişi` ile öğrenilir (`Sohbet` ve `Hedef` satırları) |

Sayaçlar sohbet başına ayrı tutulur ve `data/stats.db` içinde kalıcıdır.
XP: mesaj +1, sticker +2, ses +2 (spam'e karşı cooldown'lu),
geçerli oyun kelimesi +3, doğru quiz cevabı, düello galibiyeti, emoji tahmini ve adam asmacada
kelimeyi bulmak +5, doğru kimim tahmini +10,
`.günlük` 20-50 (seri 7. günde tavana ulaşır). Level = `floor(sqrt(xp / 50))`.

**Mesaj içeriği hiçbir yerde saklanmaz** — yalnızca sayaçlar.

### Oyunlar

| Komut | Yapar |
|---|---|
| `.kelime` | Türkçe kelime zinciri. Kelimeler TDK'de doğrulanır |
| `.kimim` | Karakter tahmini; her 3 yanlışta yeni ipucu |
| `.quiz` | 4 şıklı bilgi sorusu; herkesin tek hakkı var, ilk bilen kazanır (10 dk) |
| `.düello @kişi` | İki kişilik hızlı matematik düellosu; ilk doğru cevap kazanır (2 dk) |
| `.emoji` | Emojilerden film/dizi/şarkı tahmini; her 3 yanlışta ipucu, ilk bilen kazanır (10 dk) |
| `.adamasmaca` | Grupça adam asmaca: harf ya da kelimenin tamamı yazılır, 6 yanlışta adam asılır |
| `.tahmin` | Botun tuttuğu 1-100 arası sayıyı bul; ilk bilen +5 XP (son tahminden 10 dk) |
| `.karışık` | Harfleri karışmış kelimeyi bul; ilk bilen +5 XP (5 dk) |
| `.sayıoyunu` | 5 sayıyla hedefe ulaşan işlemi yaz; ilk bulan +10 XP (5 dk) |
| `.oyunbitir` | Aktif oyunu kapatır (başlatan kişi, grup admini veya owner) |

### Kumar (XP ile)

Gerçek para yok; basılan ve kazanılan yalnızca XP'dir. Kaybeden seviye de kaybedebilir.
Miktar sayı, `hepsi` ya da `yarısı` olabilir, en az 10 XP. Her komut 5 sn beklemelidir.

| Komut | Yapar |
|---|---|
| `.bahis 100 tura` | Yazı-tura; bilirsen bahis ikiye katlanır |
| `.slot 50` | Üç makaralı slot; üçlü 3x-50x (💎 50x), ikili 1.5x |
| `.rulet 100 kırmızı` | Avrupa ruleti; renk ve tek/çift 2x, sayı (`.rulet 20 17`) 36x |
| `.kazı 50` | Kazı kazan; 3 aynı sembol 1x-50x |
| `.blackjack 100` | Krupiyeye karşı 21; mesaja `kart` ya da `dur`. Kazanç 2x, blackjack 2.5x |
| `.mayın 100` | 12 kutuda 3 mayın; her kutu çarpanı artırır, `çek` ile kazancı alırsın |
| `.vs @kişi 100` | İki kişilik bahis; rakip `kabul` yazarsa yazı-tura, kazanan rakibinkini alır |
| `.piyango 50` | Ortak havuza XP yatırır, şans yatırılan XP oranındadır. Yalnız `.piyango` havuzu gösterir |
| `.çekiliş` | Piyangoyu çeker, havuzun tamamı kazananın olur (grup admini veya owner) |
| `.kumartop` | Kumarda en çok kazananlar ve kaybedenler |

### Görev, market, soygun

| Komut | Yapar |
|---|---|
| `.görev` | Günün 3 görevini gösterir, bitenlerin XP'sini verir (ödül bu komutla alınır) |
| `.market` | Ürünleri listeler; `.market al 1` satın alır |
| `.soygun @kişi` | %40 şansla kurbanın XP'sinin %10'unu çalar (en çok 500); yakalanan kendi %10'unu kurbana öder |

Market: soygun kalkanı 300 XP, 1 saat 3 kat XP 500, 1 saat 5 kat XP 900, unvanlar 1.000 / 5.000 / 25.000 XP.
Unvan `.profil`'de görünür. Soygun günde 2 deneme; soyulan kişiye 6 saat dokunulamaz.

Random key'ler de `.market al <numara>` ile açılır, içinden rastgele ödül çıkar:

| Key | Fiyat | Boş | XP | Diğer ödüller |
|---|---|---|---|---|
| 🥉 Bronz | 50 | %20 | 20-250 | çark hakkı, soygun hakkı, 6 saat kalkan |
| 🥈 Gümüş | 100 | %13 | 50-500 | çark hakkı, soygun hakkı, 6 saat kalkan |
| 🥇 Altın | 250 | %12 | 100-1.000 | 3 kat XP, çark hakkı, soygun hakkı, 12 saat kalkan |
| 💠 Platin | 500 | %7 | 250-2.500 | 3 ve 5 kat XP, 24 saat kalkan, 🍀 Şanslı unvanı |
| 💎 Elmas | 750 | %6 | 250-2.500 | 5 ve 10 kat XP, 48 saat kalkan, 🗝️ Key Avcısı unvanı |
| 🐉 Efsane | 1.000 | %5 | 500-10.000 | 5 ve 10 kat XP, 48 saat kalkan, 🐉 Efsane unvanı |

Hepsinden `.kart` da çıkar. Unvan çıktığında zaten unvanın varsa unvanın değişmez, yerine key fiyatı kadar XP gelir.
Soygun hakkı o gün için geçerlidir; çark hakkı 24 saatlik pencereye eklenir.

### Ödül avı

`.ödül @kişi 500` birinin başına XP koyar, onu ilk başarıyla soyan ödülü de alır. Yalnız `.ödül` aranan listesini gösterir.
En az 50 XP, koyarken %10'u kesilir. Aynı kişiye koyulan ödüller birikir.

### Banka ve servet vergisi

| Komut | Yapar |
|---|---|
| `.banka` | Hesabı ve cüzdanı gösterir, biriken faizi işler |
| `.banka yatır 500` | XP'yi hesaba koyar; `hepsi` ve `yarısı` da olur |
| `.banka çek 500` | Hesaptan çeker, %5'i kesilir |

Bankadaki XP soyulamaz, vergilenmez, günlük %1 faiz alır (ilk 10.000 XP için, en çok 7 günlük birikir).
Bankadaki XP seviyeye ve `.top`'a sayılmaz, `.profil`'de ayrı görünür.
Cüzdandaki XP'nin 10.000'in üstündeki kısmı, kişinin o günkü ilk mesajında %1 vergilenir ve yanar. `.banka` son vergiyi gösterir.

### Sezon

`.sezon` bu haftanın en çok XP kazananlarını gösterir. Her pazartesi sıfırlanır, yalnızca mesaj, oyun, `.günlük` ve `.görev` XP'si sayılır.
İlk üç 1.000 / 500 / 250 XP alır, birincinin şampiyonluk sayısı `.profil`'de görünür. Bot kendiliğinden yazmadığı için ödüller yeni haftada `.sezon` ilk yazıldığında dağıtılır.

### Borsa

| Komut | Yapar |
|---|---|
| `.borsa` | Fiyatları ve portföyünü gösterir |
| `.borsa al kedi 500` | 500 XP'lik hisse alır; `hepsi` ve `yarısı` da olur |
| `.borsa sat kedi hepsi` | Payını satar; XP miktarı da yazılabilir |

Hisseler uydurmadır: `muz`, `cay`, `simit`, `kedi`, `roket`. Fiyatlar saatte bir rastgele oynar, sağa gittikçe sertleşir (saatte en çok %2'den %12'ye).
Alışta ve satışta %2 komisyon kesilir. Fiyatı 5 XP'nin altına düşen hisse batar: elindeki paylar silinir, hisse 100 XP'den açılır.

### Kart koleksiyonu

Kartlar random key'lerden çıkar: Bronz ve Gümüş 1. seti, Altın ve Platin 2. seti, Elmas ve Efsane 3. seti verir. ⭐ kartlar nadirdir.

| Komut | Yapar |
|---|---|
| `.kart` | Koleksiyonunu gösterir; `.kart @kişi` başkasınınkini |
| `.kart ver @kişi 7` | 7 numaralı kartı verir; karşılığı `.devret` ile alınır, bot arada durmaz |
| `.kart tamamla 1` | Setin her kartından birini harcar, ödülü verir |

Set ödülleri: 🍢 Sokak Lezzetleri 1.500 XP, 🏛️ Antik Şehirler 7.500 XP, 🐉 Efsaneler 25.000 XP. Set tekrar toplanabilir.

### Açık artırma

`.açıkartırma 500 60` kendi 500 XP'ni 60 saniyeliğine artırmaya çıkarır, bot herkesi etiketler.
Teklifler botun ilk mesajına sayıyla yanıt olarak yazılır, süre bitince en yüksek sayıyı veren kazanır.
Bot XP aktarmaz ve teklifi tahsil etmez: satıcı `.devret` ile kendisi gönderir.
Kullanıcılar yalnızca sahip oldukları XP'yi satabilir; owner bakiyesiz başlatıp sonra `.xpver` kullanabilir.
Süre 10-600 sn, komut 60 sn'de bir kullanılabilir.

### Çark

24 saatte 2 ücretsiz çevirme hakkı vardır; süre o turdaki ilk çevirmeyle başlar. Hak ve bonus her grupta ayrıdır.

| Komut | Yapar |
|---|---|
| `.çark` | Ücretsiz hakla çarkı çevirir |
| `.çark ekstra` | Hak bitince 100 XP karşılığında çevirir |
| `.çark durum` | Kalan hak ve aktif bonus |

| Ödül | Olasılık |
|---|---|
| Boş | %25 |
| +25 XP | %36 |
| +100 XP | %12 |
| +300 XP | %4 |
| +1000 XP | %1 |
| +2500 XP | %2 |
| 1 saat oyunlardan 3 kat XP | %10 |
| 1 saat oyunlardan 5 kat XP | %7 |
| 1 saat oyunlardan 10 kat XP | %3 |

Bonus `.kelime`, `.kimim`, `.quiz`, `.düello`, `.emoji` ve `.adamasmaca` XP'sine işler; mesaj, `.günlük` ve kumar etkilenmez.
Bonus varken yenisi çıkarsa güçlü olan kalır, süre 1 saate döner.

Oyun cevapları prefix taşımaz: botun **en son** oyun mesajını **yanıtlayarak**
yazılır. Başka bir mesaja verilen yanıtlar ya da yanıtsız mesajlar yok sayılır.
Bir grupta aynı anda tek oyun çalışır; oyunlar 1 saat (quiz ve emoji 10 dk, adam asmaca son
tahminden 10 dk) sonra kendiliğinden kapanır.
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
games/          Oyun mantığı ve oyun havuzları (.kelime, .kimim, .quiz, .düello, .emoji, .adamasmaca)
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
