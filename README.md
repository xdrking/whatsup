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

# Web paneli şifresinin özeti; elle yazılmaz, `npm run panel:sifre` üretir
PANEL_SIFRE_HASH=

# Panelin dinlediği yerel port. Boş bırakılırsa 8787
PANEL_PORT=
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
npm run panel        # web panelini başlat (bottan ayrı süreç)
npm run panel:sifre  # panel şifresi üret
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
.help            kısa komut menüsü
.help oyun       bir bölümün açıklamalı listesi (medya, eğlence, grup, istatistik, araç, oyun, kumar, ekonomi, toplum)
.help sticker    tek komutun ayrıntısı
.help tümü       bütün komutlar açıklamalarıyla
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
| `.haber` | Rastgele parodi haber. `.news` |
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
| `.faizkararı 0,25` | **Yalnızca owner.** Grubun saatlik banka faizini belirler (0-50, en çok 2 ondalık), kredi 4 puan üstünde kalır. Mesaj günlük karşılığını da yazar (%0,25 saatlik ≈ günde %6). Birikmiş faiz eski orandan işlenir |
| `.teşvik 5000000` | **Yalnızca owner.** Kasadan son 7 günde yazan üyelere eşit dağıtır, bot hariç. Eksi cüzdana giden pay önce eksiyi kapatır |
| `.haciz @kişi ev` | **Yalnızca owner.** Kişinin bir mülkünü alır, değeri kasaya girer |
| `.haciz @kişi 2000` | **Yalnızca owner.** Önce bankadan, yetmezse cüzdandan alıp botun bankasına aktarır. Onlar da yetmezse kalanı cüzdana eksi yazar, eksi kısım kasaya girmez. `hepsi` ve `yarısı` banka hesabına göredir. Kesinti yoktur, kredi borcundan düşmez. Sonuç grupta yazılır |
| `.xpver <grup id> <numara ya da @lid id> <miktar>` | **Yalnızca owner, yalnızca özelden.** Gruptaki kişiye XP verir/alır (`-50`); grupta yazılırsa yok sayılır. Grup id'si ve kişinin id'si grupta `.id @kişi` ile öğrenilir (`Sohbet` ve `Hedef` satırları) |

Sayaçlar sohbet başına ayrı tutulur ve `data/stats.db` içinde kalıcıdır.
XP: mesaj +1, sticker +2, ses +2 (spam'e karşı cooldown'lu), `.günlük` 20-50 (seri 7. günde
tavana ulaşır). Oyun ve görev ödülleri kendi başlıklarındadır. Level = `floor(sqrt(xp / 50))`.

**Mesaj içeriği hiçbir yerde saklanmaz** — yalnızca sayaçlar.

### Oyunlar

Oyun ödülleri coin kuruyla büyür ama yavaş: tablodaki sayı tabandır, kur 2.300.000 iken 50 taban 230.000 XP eder, kur 4 katına çıkınca ödül 2 katına çıkar (kur 9.200.000 iken 460.000 XP). Oyun başlarken güncel ödül yazılır.

| Komut | Yapar | XP | Süre |
|---|---|---|---|
| `.kelime` | Türkçe kelime zinciri. Kelimeler TDK'de doğrulanır, aynı kişi art arda en çok 10 kelime söyler | kelime başına +30 | son kelimeden 1 saat |
| `.kimim` | Karakter tahmini; her 3 yanlışta yeni ipucu | +100 | 1 saat |
| `.quiz` | 4 şıklı bilgi sorusu; herkesin tek hakkı var, ilk bilen kazanır | +50 | 10 dk |
| `.düello @kişi` | İki kişilik hızlı matematik düellosu; ilk doğru cevap kazanır | +50 | 2 dk |
| `.emoji` | Emojilerden film/dizi/şarkı tahmini; her 3 yanlışta ipucu | +50 | 10 dk |
| `.adamasmaca` | Grupça adam asmaca: harf ya da kelimenin tamamı yazılır, 6 yanlışta adam asılır | +50 | son tahminden 10 dk |
| `.tahmin` | Botun tuttuğu 1-100 arası sayıyı bul | +50 | son tahminden 10 dk |
| `.karışık` | Harfleri karışmış kelimeyi bul | +50 | 5 dk |
| `.sayıoyunu` | 5 sayıyla hedefe ulaşan işlemi yaz | +100 | 5 dk |
| `.tabu` | Yazan kişi anlatıcı olur, kelime ve yasaklı sözcükler ona özelden gelir. İpucu ve tahminler tabu mesajına yanıt olarak yazılır, yasaklı sözcük oyunu bitirir | bilen +40, anlatan +20 | 3 dk |
| `.wordle kelime` | Günün 5 harfli kelimesini grupça bul: tek ortak tahta, 🟩🟨⬛ ile ipucu, ilk bilen kazanır ve kelime o gün kapanır. Kişi başı 3 hak | grup 1 tahminde bulursa +100 … 6+ tahminde +30 | gün boyu |

`.oyunbitir` aktif oyunu kapatır (başlatan kişi, grup admini veya owner).

`.wordle` yanıtla değil komutla oynanır ve oyun yuvasını tutmaz: başka oyun açıkken de oynanır. Sözlükte olmayan kelime hak yakmaz.

Çark ve market bonusları bu ödüllerin üstüne işler: 10 kat bonusu olan kişi `.quiz`'den 500 XP, `.kimim`'den 1.000 XP alır.

Oyun cevapları prefix taşımaz: botun **en son** oyun mesajını **yanıtlayarak**
yazılır. Başka bir mesaja verilen yanıtlar ya da yanıtsız mesajlar yok sayılır.
Bir grupta aynı anda tek oyun çalışır. Durum yalnızca bellektedir: bot yeniden başlarsa yarım oyunlar düşer.

### Kumar (XP ile)

Gerçek para yok; basılan ve kazanılan yalnızca XP'dir. Kaybeden seviye de kaybedebilir.
Kumar için cüzdanda en az 500 XP olmalıdır, `.vs`'te iki oyuncuda da. Bankadaki XP sayılmaz.
Miktar sayı, `hepsi` ya da `yarısı` olabilir, en az 10 XP. Her komut 5 sn beklemelidir.

| Komut | Yapar |
|---|---|
| `.bahis 100 tura` | Yazı-tura; bilirsen bahis ikiye katlanır |
| `.slot 50` | Üç makaralı slot; üçlü 3x-50x (💎 50x), ikili 1.5x |
| `.rulet 100 kırmızı` | Avrupa ruleti; renk ve tek/çift 2x, sayı (`.rulet 20 17`) 36x |
| `.kazı 50` | Kazı kazan; 3 aynı sembol 1x-50x |
| `.blackjack 100` | Krupiyeye karşı 21; mesaja `kart` ya da `dur`. Kazanç 2x, blackjack 2.5x |
| `.mayın 100` | 12 kutuda 3 mayın; her kutu çarpanı artırır, `çek` ile kazancı alırsın |
| `.plinko 100 yüksek` | Top 8 sıra çividen düşer; risk `düşük` (0.6x-5x), `orta` (0.4x-13x), `yüksek` (0.2x-29x) |
| `.crash 100 2.5` | Roket hedef çarpana varmadan patlamazsa hedefin katını alırsın (1.01x-1000x) |
| `.hilo 100` | Sıradaki kart `yüksek` mi `düşük` mü; bildikçe çarpan katlanır, `geç` kartı değiştirir, `çek` kazancı alır |
| `.kule 100 zor` | Ejderha kulesi: 8 kat, her katta yumurtayı bul. `kolay` / `orta` / `zor`, tepe 9.58x / 24.6x / 245.76x |
| `.yarış 100 3` | At yarışı: ilk bahis yarışı açar, 60 sn içinde herkes katılabilir. Oranlar 2.74x-12x |
| `.vs @kişi 100` | İki kişilik bahis; rakip `kabul` yazarsa yazı-tura, kazanan rakibinkini alır |
| `.piyango 50` | Ortak havuza XP yatırır, şans yatırılan XP oranındadır. Yalnız `.piyango` havuzu gösterir |
| `.çekiliş` | Piyangoyu çeker, havuzun tamamı kazananın olur (grup admini veya owner) |
| `.kumartop` | Kumarda en çok kazananlar ve kaybedenler |
| `.kumarkarnem` | Kendi kumar geçmişin: oyun oyun net sonuç, en büyük vurgun, kasaya kaptırılan |

Bota karşı oynanan kumarda kaybedilen XP, banka kesintisi, servet vergisi ve borsa komisyonu QR ile bağlı numaranın hesabına gider. `.vs` ve `.piyango` hariçtir, oradaki kayıp diğer oyuncuya geçer. Bakiye yalnızca `.top`'ta görünür.

### Görev, market, soygun

| Komut | Yapar |
|---|---|
| `.görev` | Günün 3 görevini gösterir, bitenlerin XP'sini verir (ödül bu komutla alınır) |
| `.market` | Ürünleri listeler; `.market al 1` satın alır |
| `.soygun @kişi` | %40 şansla kurbanın XP'sinin %10'unu çalar; yakalanan kendi %10'unu kurbana öder |
| `.soygun herkes` | Coinle alınan hakla gruptaki herkesi tek tek soymayı dener |

Her gün aşağıdaki görevlerden 3'ü çıkar, gruptaki herkese aynıdır. Günde 1.200-1.850 XP eder:

| Görev | Ödül |
|---|---|
| 20 mesaj yaz | 400 XP |
| Oyunlardan 3 kez XP kazan | 750 XP |
| 5 kez kumar oyna | 600 XP |
| Çarkı çevir | 300 XP |
| 1 soygun dene | 500 XP |

**Market fiyatları coin kuruna bağlıdır:** aşağıdaki fiyatlar kur 2.300.000 XP iken geçerlidir, kur artınca aynı oranda artar, düşünce düşer. Key'lerin XP ödülleri ve vitrin de aynı orandadır. `.market` güncel fiyatı yazar.

Market: 24 saatlik soygun kalkanı 5.000.000 XP, 1 saat 3 kat XP 6.000.000, 1 saat 5 kat XP 12.000.000, vitrindeki 10 kat XP 25.000.000, unvanlar 2.300.000 / 11.500.000 / 57.500.000 XP.
Unvan `.profil`'de görünür. Soygun günde 2 deneme; soyulan kişiye 6 saat dokunulamaz.

Random key'ler de `.market al <numara>` ile açılır, içinden rastgele ödül çıkar:

| Key | Fiyat | Boş | XP | Diğer ödüller |
|---|---|---|---|---|
| 🥉 Bronz | 1.000.000 | %20 | 400.000-5.000.000 | çark hakkı, soygun hakkı, 6 saat kalkan |
| 🥈 Gümüş | 2.000.000 | %13 | 1.000.000-10.000.000 | çark hakkı, soygun hakkı, 6 saat kalkan |
| 🥇 Altın | 5.000.000 | %12 | 2.000.000-20.000.000 | 3 kat XP, çark hakkı, soygun hakkı, 12 saat kalkan |
| 💠 Platin | 10.000.000 | %7 | 5.000.000-50.000.000 | 3 ve 5 kat XP, 24 saat kalkan, 🍀 Şanslı unvanı |
| 💎 Elmas | 15.000.000 | %6 | 5.000.000-50.000.000 | 5 ve 10 kat XP, 48 saat kalkan, 🗝️ Key Avcısı unvanı |
| 🐉 Efsane | 20.000.000 | %5 | 10.000.000-200.000.000 | 5 ve 10 kat XP, 48 saat kalkan, 🐉 Efsane unvanı |

Marketin son satırı haftanın vitrinidir: ürün her pazartesi değişir, stoğu sınırlıdır, kişi başı haftada bir alınır.
10 kat XP, 7 gün kalkan, 3 çark hakkı, 3 soygun hakkı ya da nadir kart çıkabilir.

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
| `.vergitop` | En çok vergi ödeyen 10 kişiyi listeler |
| `.vergikaçır` | Bir sonraki vergiyi kaçırmayı dener: %60 hiç ödemez, yakalanırsa 3 kat ceza ve 2 saat hapis |

Bankadaki XP soyulamaz, her saat tüm bakiyeye %15 bileşik faiz alır (oranı owner `.faizkararı` ile değiştirebilir) (günde yaklaşık 28 kat). Faiz saat başlarında işler, yeni yatırılan para tam bir saat durmadan faiz almaz. Bakiye en çok 1 katrilyon XP olabilir. Faiz `.banka` yazınca işlenir, en çok 7 günlük birikir.
Bankadaki XP seviyeye ve `.top`'a sayılmaz, `.profil`'de ayrı görünür.
Servet vergisi artan oranlıdır: cüzdan ve banka birlikte sayılır, kişinin o günkü ilk mesajında kesilir ve botun hesabına gider. Önce cüzdandan, yetmezse bankadan alınır. Dilimler coin kuruna bağlıdır, enflasyonda büyür. Her dilim yalnızca kendi aralığından alınır:

| Servet (kur cinsinden) | Kur 1.000.000 iken | Günlük vergi |
|---|---|---|
| 1 coine kadar | 1M XP | yok |
| 1-5 coin | 1M-5M XP | %2 |
| 5-20 coin | 5M-20M XP | %5 |
| 20-100 coin | 20M-100M XP | %10 |
| 100 coin üstü | 100M XP üstü | %20 |

Örnek: 12M XP servet 430.000 XP vergi öder. Coin ve mülk vergilenmez, bot muaftır.

Yatırılan paranın hiç dokunulmazsa ne kadar olacağı (çekim kesintisi öncesi, XP):

| Yatırılan | 1 saat | 6 saat | 12 saat | 1 gün | 2 gün | 3 gün | 7 gün |
|---|---|---|---|---|---|---|---|
| 100 | 115 | 231 | 535 | 2.862 | 81.940 | 2,3 milyon | 1,6 trilyon |
| 1.000 | 1.150 | 2.313 | 5.350 | 28.625 | 819.400 | 23,5 milyon | 15,7 trilyon |
| 10.000 | 11.500 | 23.130 | 53.502 | 286.251 | 8,2 milyon | 234,6 milyon | 157,5 trilyon |
| 100.000 | 115.000 | 231.306 | 535.025 | 2,9 milyon | 81,9 milyon | 2,3 milyar | 1 katrilyon (tavan) |

Süre, faiz alınan saat başı sayısıdır. Yatırdıktan sonraki ilk saat başı sayılmaz.

Örnek: 14:20'de 1.000 XP yatırılır. 15:00'te faiz işlemez, 16:00'da hesap 1.150 olur, ertesi gün 15:00'te 28.625 olur.
`.banka çek hepsi` yazılırsa 1.432 XP kesilir, cüzdana 27.193 XP gelir.

`.banka` en az haftada bir yazılmalı: 7 günden uzun süren boşlukta fazla günler faiz almaz.

### Kredi ve eksi bakiye

Botun bankasından faizli XP çekilir. Ödenmeyen borç cüzdanı eksiye düşürür.

| Komut | Yapar |
|---|---|
| `.kredi` | Borcu, vadeye kalan süreyi ve güncel limiti gösterir |
| `.kredi çek 1000` | Kredi çeker, XP cüzdana gelir. En az 100 XP |
| `.kredi öde 500` | Cüzdandan borç öder; `hepsi` ve `yarısı` da olur |
| `.iflas` | Eksi cüzdanı sıfırlar, karşılığında yasak alınır |

#### Kurallar

| Konu | Değer |
|---|---|
| Faiz | Saatlik %19 bileşik, her saat başında işler. Hep banka faizinin 4 puan üstündedir |
| Vade | 12 saat, sonrasında faiz durur |
| Aynı anda | Tek kredi |
| Limit | 50.000.000 XP, ama kasanın yarısını geçemez |
| Erken ödeme | Serbest, cezası yok, kalan borca faiz işlemeye devam eder |

Kasa, botun bankası ve cüzdanıdır. Kredi önce bankadan, yetmezse cüzdandan çıkar, ödemeler hep botun bankasına gider. Kasada 90.000 XP varsa tek seferde en çok 45.000 XP çekilir, fazlası istenirse bot sınırı yazar.

Faiz bankanın %15'inden yüksektir, bu yüzden kredi çekip bankaya yatırmak kazandırmaz.

#### Borç nasıl büyür

Hiç ödeme yapılmazsa:

| Çekilen | 1 saat | 6 saat | 12 saat (vade) |
|---|---|---|---|
| 1.000 | 1.190 | 2.840 | 8.065 |
| 5.000 | 5.950 | 14.199 | 40.322 |
| 10.000 | 11.900 | 28.398 | 80.643 |
| 50.000.000 | 59.500.000 | 141.988.043 | 403.212.086 |

Süre, geçen saat başı sayısıdır. Bankadan farklı olarak ilk saat başı da sayılır: 14:50'de çekilen kredi 15:00'te faiz alır.

#### Ödeme yolları

1. **`.kredi öde`:** cüzdandan öder. Borçtan fazlası yazılırsa yalnızca borç kadarı alınır.
2. **`.banka yatır`:** borç varken yatırılan XP önce borcu keser, artanı hesaba girer. Borcu 1.417 XP olan kişi `.banka yatır 2000` yazarsa 1.417 XP borca, 583 XP hesabına gider.
3. **Vade tahsilatı:** vade dolunca borç önce cüzdandan, sonra banka hesabından alınır. Yetmezse kalanı cüzdana eksi yazılır.

Bankadaki XP doğrudan borca sayılmaz. Vadeden önce ödemek için `.banka çek` ile cüzdana alınmalı, burada %5 kesinti vardır.

Örnek: 14:20'de 1.000 XP çekilir.

| Saat | Olay | Borç |
|---|---|---|
| 14:20 | Kredi çekilir | 1.000 |
| 15:00 | Faiz işler | 1.190 |
| 16:00 | Faiz işler | 1.417 |
| 16:05 | `.kredi öde 500` | 917 |
| 17:00 | Faiz işler | 1.092 |
| 17:10 | `.kredi öde hepsi` | Borç biter |

Örnek: vadede borç 8.065 XP, cüzdanda 1.000 XP, bankada 2.000 XP olsun. İkisi de sıfırlanır, 3.000 XP botun bankasına gider, cüzdan **−5.065 XP** olur.

Bot kendiliğinden yazmadığı için tahsilat kişinin vadeden sonraki ilk mesajında olur. Geç yazmak borcu büyütmez, tutar vade anında kalır.

#### Borçluyken ve ekside

| Durum | Kapalı olanlar |
|---|---|
| Açık kredi | `.devret`, ikinci kredi, `.iflas` |
| Eksi cüzdan | Kumar, market, `.borsa al`, `.soygun`, `.devret`, `.banka yatır`, kredi. Eksideki kişi soyulamaz |

Eksi bakiye faiz almaz. Oyun ve `.görev` XP'siyle kapanır, hisse satışı ve mesaj XP'si de eksiyi azaltır. Kumar için cüzdanın yeniden +500 XP'ye gelmesi gerekir. Eksiyi kapatan XP bota gitmez.

#### İflas

`.iflas` yalnızca cüzdan ekside iken çalışır: borç silinir, cüzdan 0 olur, kişi 12 saat kumar oynayamaz, 24 saat kredi çekemez.
Açık kredi iflasla silinmez, vadenin dolması gerekir. Elde hisse varsa önce satılmalıdır.

Owner, `.devret @a @b 50` ile borçlunun XP'sini taşıyabilir, `.haciz` ile parasını kasaya alabilir, parası yetmezse kişi eksiye düşer. Haciz kredi borcundan düşmez.

### Coin ve coin market

XP TL ise coin altındır. Kur piyasadaki paraya göre anlık değişir: üyelerin cüzdan ve bankalarındaki toplam XP'nin yüzde biri, en az **1.000.000 XP**. Bot sayılmaz. Coin anlık kurdan alınır. Bozdurmada anlık kurla günün ilk kurundan düşük olanı geçerlidir, kredi çekip kuru şişirerek XP basılmasın. Maaş, kira, mülk satışı ve vergi günün ilk kurunu kullanır.

| Piyasadaki para | 1 coin |
|---|---|
| 100 milyon XP ve altı | 1.000.000 XP |
| 250 milyon XP | 2.500.000 XP |
| 1 milyar XP | 10.000.000 XP |

| Komut | Yapar |
|---|---|
| `.coinmarket` | Ürünleri, coinini ve XP'ni gösterir (kısa yol `.cm`) |
| `.coinmarket coin 2` | Cüzdandaki XP ile 2 coin alır |
| `.coinmarket sat 2` | 2 coini kurun %90'ına bozdurur |
| `.coindevret @kişi 5` | Kendi coininden 5 tanesini gönderir; kredi borcu ya da eksi cüzdanla kapalı |
| `.coinmarket al 1` | Ürünü coinle alır |
| `.tüik` | Piyasadaki para, enflasyon, coin kuru ve en zenginler (`.enflasyon` da olur) |
| `.servet` | Cüzdan, banka, coin, mülk, hisse, yatırım ve borçlarla net servet. `.servet top` gerçek zengin sıralaması |
| `.mülk` | Mülkleri ve kiranı gösterir; `.mülk al ev`, `.mülk sat ev`, `.mülk topla` |
| `.hacizall` | 90 coin karşılığı toplu haciz yapar |

| No | Ürün | Fiyat |
|---|---|---|
| 1 | 3 fazladan soygun hakkı | 3 coin |
| 2 | Toplu soygun (`.soygun herkes`, tek kullanımlık) | 6 coin |
| 3 | 7 günlük soygun kalkanı | 9 coin |
| 4 | 1 saat oyunlardan 30 kat XP | 30 coin |
| 5 | 3 günlük haciz sigortası (`.hacizall` işlemez) | 30 coin |
| 6 | Unvan: Altın Babası | 30 coin |
| 7 | Unvan: Merkez Bankası Başkanı | 75 coin |
| 8 | Toplu haciz (`.hacizall` yazınca coin düşer ve işler) | 90 coin |
| 9 | Unvan: Ekonominin Efendisi | 150 coin |

- Ödenen XP yanar. Coin kurun %90'ına geri bozdurulur.
- Coin `.coindevret` ile gönderilir ama soyulmaz, hacizle alınmaz. Borçlu gönderemez.
- Coin ya da mülk varken `.iflas` yapılamaz, önce satılır.
- Açık kredin varken coin alamazsın.
- Toplu soygunda her üye için ayrı zar atılır: %40 şansla XP'sinin %10'u senin olur, başındaki ödül de gelir. Yakalanma cezası yoktur, günlük soygun hakkın harcanmaz.
- Kalkanlı, yeni soyulmuş ve fakir üyeler atlanır. Soyulacak kimse yoksa hak yanmaz.
- `.hacizall` herkesin bankasının %45'ini ve cüzdanının %50'sini alıcının cüzdanına geçirir. Kalkan korumaz, haciz sigortası korur. Bot etkilenmez, eksi cüzdandan bir şey alınmaz. Alınacak para yoksa coin harcanmaz. Sigorta owner'ın `.haciz`'ini durdurmaz.

#### Mülk

| Mülk | Fiyat | Saatlik kira |
|---|---|---|
| 🚗 Araba | 9 coin | yok |
| 🏠 Ev | 15 coin | fiyatın %2'si |
| 🏪 Dükkan | 45 coin | fiyatın %2,5'i |
| 🏰 Villa | 120 coin | fiyatın %3'ü |

Kira günün coin kuruyla hesaplanır: kur 1.000.000 XP iken ev saatte 300.000 XP getirir, kur 2 katına çıkınca kira da iki katına çıkar. Kira saat başı birikir, 24 saatte durur, `.mülk topla` ile alınır. Mülk satılınca kurun %90'ı üstünden XP gelir. Owner `.haciz @kişi ev` ile bir mülke el koyar, değeri botun kasasına girer.

### Hapis, evlilik, meslek, çete, dava

| Komut | Yapar |
|---|---|
| `.hapis` | Hapistekileri, kalan süreyi ve kefaleti gösterir |
| `.kefalet` | Hapisten çıkarır; `.kefalet @kişi` başkası için öder |
| `.evlen @kişi` | Evlenme teklif eder; `.evlen` durumunu gösterir |
| `.boşan` | Nafakayı gösterir; `.boşan onay` boşar |
| `.meslek` | Meslekleri gösterir; `.meslek seç kurye` |
| `.istifa` | Meslekten çıkar; yeni meslek yine 24 saat dolunca seçilir |
| `.çalış` | 30 dakikada bir maaş alır |
| `.çete` | Çeten ve haftalık sıralama; `kur`, `katıl`, `ayrıl`, `yatır`, `çek`, `at` |
| `.dava @kişi 1000 sebep` | Grup 5 dakika `haklı` ya da `haksız` oylar, kaybeden öder |
| `.özet` | Son 7 günün mesajları, tüm zamanların gece kuşu ve kumarcıları |

**Hapis:** `.soygun`'da yakalanan 2 saat hapse girer, bu sürede soygun, kumar ve `.çalış` kapalıdır. Kefalet yakalanma anındaki cüzdan ve banka toplamının %20'sidir, en az 100 XP. Ödeyenin cüzdanından alınır, botun bankasına gider.

**Evlilik:** evliler `.çalış`'ta %20 fazla maaş alır, eşinin kefaletini yarı fiyata öder. Boşanan, cüzdan ve bankasının %20'sini eşine öder. Borçluyken boşanılamaz.

**Meslek:** maaş coin kuruna bağlıdır, gerçek hayattaki kazanca göre sıralanır. Meslek 24 saatte bir değişir. Kur 1.000.000 XP iken bir mesainin maaşı:

| Meslek | Maaş (XP) |
|---|---|
| Garson | 45.000-55.000 |
| Kurye | 40.000-70.000 |
| Çiftçi | 30.000-90.000 |
| Berber | 50.000-90.000 |
| Şoför | 65.000-85.000 |
| Aşçı | 60.000-100.000 |
| Öğretmen | 90.000-110.000 |
| Hemşire | 100.000-130.000 |
| Polis | 100.000-130.000 |
| Sanatçı | 0-300.000 |
| Mühendis | 150.000-210.000 |
| Yazılımcı | 150.000-300.000 |
| Avukat | 100.000-400.000 |
| Doktor | 250.000-350.000 |
| Pilot | 350.000-450.000 |
| Futbolcu (24 saatlik kariyer) | 0-2.000.000 |

Futbolcu kariyeri seçimden 24 saat sonra biter, aynı kişi o grupta bir daha futbolcu olamaz. Seçmeden önce bot uyarı yazar, `.meslek seç futbolcu onay` gerekir. Futbolcu `.istifa` ederse kariyeri o an biter ve hemen yeni meslek seçebilir; diğer mesleklerde istifa 24 saatlik beklemeyi kısaltmaz.

**Çete:** kurmak coin kurunun %1'idir, en çok 10 üye olur. Kasaya yatırılan XP'den %5 kesilir, kasadan yalnızca lider çeker. Sıralama üyelerin `.sezon` puanı toplamıdır, haftanın birincisi kasaya 5.000 XP alır.

**Dava:** en az 100 XP, en çok sanığın cüzdanının %25'i. %5 harç peşin alınır, iade edilmez. En az 2 oy gerekir, taraflar oy veremez. Borçlular mahkemelik olamaz.

Panelde grup sayfası Çeteler, Hapishane, Evlilikler ve Meslekler kartlarını, kişi sayfası Hayat kartını gösterir.

### Piyasa olayları, yatırım, tefeci

| Komut | Yapar |
|---|---|
| `.piyasa` | Şu anki piyasa olayını ve bitişine kalan süreyi gösterir. Olay her grupta 6 saatte bir değişir (00, 06, 12, 18) |
| `.yatırım <miktar> <düşük\|orta\|yüksek>` | Parayı 6 saat kilitler, sonuç yatırdığın an belirlenir |
| `.yatırım` | Açık yatırımı gösterir, vadesi dolduysa sonucu açıklar ve parayı öder |
| `.tefeci ver @kişi <miktar> <faiz> <saat>` | Faizli borç teklifi: `.tefeci ver @kişi 100000 20 12` 100.000 verir, 12 saat sonra 120.000 ister |
| `.tefeci kabul` / `.tefeci red` | Teklifi alan 10 dk içinde cevaplar, kabulde para geçer |
| `.tefeci öde <miktar\|hepsi>` | Borcu cüzdandan öder |
| `.tefeci` | Borcunu ve alacaklarını gösterir |

Olaylar: 😐 sakin, 📈 patlama (maaş ve kira 1,5 kat), 📉 kriz (maaş ve kira %30 düşük, market %20 indirim), 🎮 oyun festivali (oyun ödülü 2 kat), 🛍️ Kara Cuma (market %30 indirim), 🏠 emlak patlaması (kira 2 kat), 💸 zam yağmuru (market %30 pahalı), ✊ genel grev (maaş yarı, oyun 1,5 kat). Coin kuru ve key fiyatı olaydan etkilenmez. Kira toplandığı andaki olaya göre ödenir.

Yatırım sonuçları anaparanın katıdır: düşük risk ×0,9 / ×1,1 / ×1,3, orta ×0,5 / ×1,2 / ×2, yüksek ×0 / ×1,5 / ×4. Patlamada kâr %20 büyür, krizde %20 küçülür, zarar değişmez. Borçluyken yatırım yapılmaz, açık yatırımla `.iflas` edilmez.

Tefeci faizi tek seferliktir (en çok %100), vade 1-72 saat. Vade dolunca borç borçlunun cüzdanından ve bankasından alınır, yetmezse kalan borç sonradan gelen paradan kesilir; cüzdan eksiye düşmez. Kişinin aynı anda tek tefeci borcu olur. `.devret` tefeci borcundan etkilenmez, kredi borcu olan borç veremez.

### Sezon

`.sezon` bu haftanın en çok XP kazananlarını gösterir. Her pazartesi sıfırlanır, yalnızca mesaj, oyun, `.günlük` ve `.görev` XP'si sayılır.
İlk üç 1.000 / 500 / 250 XP alır, birincinin şampiyonluk sayısı `.profil`'de görünür. Bot kendiliğinden yazmadığı için ödüller yeni haftada `.sezon` ilk yazıldığında dağıtılır.

### Borsa

| Komut | Yapar |
|---|---|
| `.borsa` | Fiyatları ve portföyünü gösterir |
| `.borsa al kedi 500` | 500 XP'lik hisse alır; `hepsi` ve `yarısı` da olur |
| `.borsa sat kedi hepsi` | Payını satar; XP miktarı da yazılabilir |

Hisseler uydurmadır: `muz`, `cay`, `simit`, `kedi`, `roket`. Her 15 dakika borsada bir gün gibidir: fiyatlar sert oynar, sağa gittikçe daha da sertleşir, `roket` bir adımda %50 oynayabilir ve birkaç günde bir batar. Piyasa 6 saatte bir sakin, normal ya da fırtınalı olur, hisseler çoğu zaman birlikte hareket eder, haberler fiyatı sıçratır. Hiçbiri yönü önceden söylemez.
Alışta ve satışta %2 komisyon kesilir. Fiyatı 5 XP'nin altına düşen hisse batar: elindeki paylar silinir, hisse 100 XP'den açılır.

Örnek: fiyat 100'ken `.borsa al kedi 1000` yazılır. 20 XP komisyon kesilir, 980 XP'lik pay alınır.

| Satış anındaki fiyat | Pay değeri | Satış komisyonu | Eline geçen | Sonuç |
|---|---|---|---|---|
| 150 | 1.470 | 30 | 1.440 | +440 XP |
| 100 | 980 | 20 | 960 | −40 XP |
| 60 | 588 | 12 | 576 | −424 XP |
| Hisse battı | 0 | yok | 0 | −1.000 XP |

Borsada sabit getiri yoktur. Aşağıdaki tablo 1.000 XP'lik alımın süre sonunda satılınca ne getirdiğini gösterir, komisyonlar dahildir.
Değerler 40.000 denemelik simülasyondandır ve yaklaşıktır. Hücreler **kötü / orta / iyi** sırasındadır: denemelerin %10'u kötüden aşağıda, yarısı ortadan aşağıda, %10'u iyiden yukarıda kalır.

| Hisse | 1 saat | 6 saat | 1 gün | 3 gün | 1 günde batma | 3 günde batma |
|---|---|---|---|---|---|---|
| `muz` | 890 / 960 / 1.030 | 790 / 950 / 1.140 | 620 / 920 / 1.340 | 430 / 840 / 1.640 | %0 | %0 |
| `cay` | 860 / 960 / 1.060 | 700 / 940 / 1.240 | 480 / 870 / 1.530 | 250 / 710 / 1.940 | %0 | %0,1 |
| `simit` | 790 / 960 / 1.130 | 540 / 910 / 1.420 | 260 / 730 / 1.890 | 60 / 400 / 2.180 | %0,1 | %9 |
| `kedi` | 710 / 950 / 1.220 | 370 / 860 / 1.640 | 100 / 500 / 2.190 | 0 / 110 / 1.740 | %5 | %43 |
| `roket` | 580 / 940 / 1.330 | 160 / 710 / 1.940 | 0 / 190 / 2.000 | 0 / 0 / 350 | %33 | %83 |

Uzun beklemek sert hisselerde çoğu zaman kaybettirir, ama nadir denemeler çok büyük kazanır. Her hissede ortalama sonuç komisyon yüzünden 1.000 XP'nin biraz altındadır, bu yüzden garantili kazanç yolu yoktur.

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
| `.çark ekstra` | Hak bitince çevirir: kur 2.300.000 iken 2.500.000 XP, kurla artar; günde en çok 3 kez |
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

Bonus yalnızca oyun ödüllerine işler (`.kelime`, `.kimim`, `.quiz`, `.düello`, `.emoji`, `.adamasmaca`, `.tahmin`, `.karışık`, `.sayıoyunu`); mesaj, `.günlük`, `.görev` ve kumar etkilenmez.
Bonus varken yenisi çıkarsa güçlü olan kalır, süre 1 saate döner.

### Bekleme süresi

Aynı kişi aynı komutu art arda yazarsa komut çalışmaz; ilk denemede bir kez
"⏳ biraz yavaş" uyarısı gelir, sonrakiler sessizce yok sayılır. Varsayılan 3 sn;
medya ve dış servis komutları (`.sticker`, `.al`, `.tts`, `.efekt`, `.foto`, `.yaz`,
`.meme`, `.hava`, `.deprem`, `.döviz`, `.namaz`) ve `.anket` 10 sn, `.etiket` 30 sn. Bot sahibi muaftır.

## Web paneli

Herkesin adını ve istatistiğini gösteren şifreli panel. Bottan ayrı çalışır, numara ban yese de açılır, veriye yalnızca bakar.

Sunucuda bir kez:

1. Alan adını sunucunun IP'sine yönlendir. Cloudflare kullanılıyorsa kayıt **DNS only** olmalı: turuncu bulutta panel gerçek IP'yi göremez, deneme sınırı bozulur.
2. `npm run panel:sifre` çalıştır. Çıkan şifreyi sakla, `PANEL_SIFRE_HASH=...` satırını `.env` dosyasına ekle.
3. Önce botu yeniden başlat (veritabanı yeni yapıya geçer), sonra `npm run panel` ile paneli açık tut.
4. `nginx-panel.conf.example` içeriğini kendi alan adınla `/etc/nginx/sites-available/panel` dosyasına yaz, `sites-enabled` altına bağla, `sudo nginx -t` ve `sudo systemctl reload nginx` çalıştır.
5. `sudo certbot --nginx -d panel.alanadin.com --redirect` ile HTTPS sertifikasını al. Giriş ancak HTTPS'te çalışır.

Panelde sıralama, borçlular, grup rekorları, son 30 günün grafiği, borsa fiyat çizgileri, kişi sayfasında seviye, rozet, servet dağılımı ve XP gelişimi var. Grafikler güncellemeden sonra birikmeye başlar; borsa çizgileri `.borsa` kullanıldıkça dolar.

Panel her gün `data/yedek/` altına yedek alır, son 14'ü kalır. Yedekler aynı sunucuda durduğu için ara ara panelden **Son yedeği indir** ile bilgisayarına al.

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
  // category: 'eğlence',   .help başlığı: medya | eğlence | grup | istatistik | araç | oyun | kumar | ekonomi | toplum
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
games/          Oyun mantığı ve oyun havuzları (.kelime, .kimim, .quiz, .blackjack, .mayın, .kule, .wordle…)
panel/          Web paneli: bottan ayrı süreç, veritabanını salt okunur açar
test/           Otomatik testler (npm test)
data/           İçerik havuzları (JSON) + stats.db (sayaçlar, XP, banka, borsa…) + yedek/
auth/           Baileys oturum dosyaları — commit edilmez
temp/           Medya işleme geçici dosyaları — işlem sonrası silinir
```

`data/*.json` dosyaları elle yazılan içerik havuzlarıdır (şaka, fal, roast…).
Biçim: düz string dizisi. Yeni içerik eklemek = dosyaya satır eklemek.

## Güvenlik

**`auth/` ve `.env` asla commit edilmez.** `auth/` içindeki oturum dosyaları telefon
numaranızı ve WhatsApp kimlik anahtarlarınızı taşır; sızması hesabın başkası
tarafından ele geçirilmesi demektir. `data/stats.db` de commit edilmez, çünkü grup
üyelerinin JID'lerini içerir, `data/yedek/` de aynı veriyi taşır. Hepsi `.gitignore` içindedir — yine de `git status`
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
| Panele giriş olmuyor | Giriş yalnızca HTTPS'te çalışır. `.env`'de `PANEL_SIFRE_HASH` dolu olmalı |
| Konsolda `logged out` | Oturum ölmüştür, yeniden bağlanma denenmez. `auth/` temizleyip yeni QR okutun |

## Test

```bash
npm test
```

WhatsApp bağlantısı gerektirmeyen kısımları dener: hesap makinesi, bekleme süresi,
oyun cevapları, XP ve günlük seri, ekonomi (banka, borsa, market, çark), panel,
fotoğraf efektleri, komutların ve `data/*.json` havuzlarının biçimi. Gerçek `data/stats.db`'ye dokunmaz. Yeni komut ya da havuz
satırı ekledikten sonra çalıştırmak, botu açmadan önce hataları yakalar.

Mesaj gönderme, medya indirme ve grup davranışı canlı bağlantıyla elle
doğrulanır: adım adım liste `CLAUDE.md` → **Elle Doğrulama** bölümündedir.
