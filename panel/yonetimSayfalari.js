// Yönetim panelinin HTML'i (Faz 90). Değerler `h` ile kaçırılır; satır içi stil ve betik yoktur (CSP).
// Kurallar ve yazma lib/ ve panel/yonetim.js'tedir, burada yalnızca çizilir.
import { readFileSync } from 'node:fs'
import { oranYaz } from '../lib/banka.js'
import { fnv1a } from '../lib/hash.js'
import { KASALAR } from '../lib/sandik.js'
import { DUYURU_ARALIGI_MS, DUYURU_AZAMI, IZINLER, izinVar, ROLLER, UYARI_TURLERI } from '../lib/yonetim.js'
import { MAKAMLAR } from '../lib/devlet.js'
import { HEPSI } from '../lib/komutKilit.js'
import { sulyYaz } from '../lib/kripto.js'
import { MULKLER } from '../lib/mulk.js'
import { h } from './sayfalar.js'
import { anahtarFiyati, kasaFiyati } from '../lib/ayarlar.js'

const STIL_SURUMU = fnv1a(readFileSync(new URL('./yonetim.css', import.meta.url), 'utf8'))
const BETIK_SURUMU = fnv1a(readFileSync(new URL('./yonetim-istemci.js', import.meta.url), 'utf8'))
const sayi = new Intl.NumberFormat('tr-TR')
const kompakt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
const kisa = (n) => kompakt.format(n).replace(/B$/, 'bin')
const tarih = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const saat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
const zaman = (ms) => (ms ? tarih.format(new Date(ms)) : '—')

const SAYFALAR = [
  { ad: 'gosterge', yol: '/yonetim', baslik: 'Gösterge', ikon: '◉', izin: 'gosterge' },
  { ad: 'uyarilar', yol: '/yonetim/uyarilar', baslik: 'Uyarılar', ikon: '⚠', izin: 'gosterge' },
  { ad: 'duyuru', yol: '/yonetim/duyuru', baslik: 'Duyurular', ikon: '✉', izin: 'duyuru' },
  { ad: 'uyeler', yol: '/yonetim/uyeler', baslik: 'Üyeler', ikon: '☺', izin: 'uyeler' },
  { ad: 'uye', yol: '/yonetim/uye', baslik: 'Üye', ikon: '☺', izin: 'uyeler', gizli: true },
  { ad: 'ekonomi', yol: '/yonetim/ekonomi', baslik: 'Ekonomi', ikon: '₺', izin: 'ekonomi' },
  { ad: 'grafik', yol: '/yonetim/grafik', baslik: 'Grafikler', ikon: '◢', izin: 'ekonomi' },
  { ad: 'toplu', yol: '/yonetim/toplu', baslik: 'Toplu işlem', ikon: '⇶', izin: 'ekonomi' },
  { ad: 'kasa', yol: '/yonetim/kasa', baslik: 'Kasalar', ikon: '▣', izin: 'kasa' },
  { ad: 'kumarhane', yol: '/yonetim/kumarhane', baslik: 'Kumarhane', ikon: '♠', izin: 'kumarhane' },
  { ad: 'devlet', yol: '/yonetim/devlet', baslik: 'Devlet', ikon: '⚖', izin: 'devlet' },
  { ad: 'gruplar', yol: '/yonetim/gruplar', baslik: 'Gruplar', ikon: '⚙', izin: 'gruplar' },
  { ad: 'sosyal', yol: '/yonetim/sosyal', baslik: 'Moderasyon', ikon: '⚑', izin: 'moderasyon' },
  { ad: 'sistem', yol: '/yonetim/sistem', baslik: 'Sistem', ikon: '⛁', izin: 'sistem' },
  { ad: 'yoneticiler', yol: '/yonetim/yoneticiler', baslik: 'Yöneticiler', ikon: '⚿', izin: 'yoneticiler' },
  { ad: 'kayit', yol: '/yonetim/kayit', baslik: 'Kayıt defteri', ikon: '☰', izin: 'kayit' },
]
export const YONETIM_SAYFALARI = Object.fromEntries(SAYFALAR.map((s) => [s.yol, s]))

const grupAdi = (g, i = 0) => g?.ad || `Grup ${i + 1}`
const grupLink = (yol, chat) => `${yol}?grup=${encodeURIComponent(chat)}`

function belge(baslik, govde) {
  return h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0a0e16">
<title>${baslik} · Yönetim</title>
<link rel="stylesheet" href="/yonetim.css?v=${STIL_SURUMU}">
<script src="/yonetim.js?v=${BETIK_SURUMU}" defer></script>
</head>
<body class="yonetim">${govde}</body>
</html>`.metin
}

function kabuk(v, aktif, baslik, icerik) {
  const { yonetici: y, nabiz } = v
  const rol = ROLLER[y.rol]
  const menu = SAYFALAR.filter((s) => !s.gizli && izinVar(y.rol, s.izin))
  const cevrimici = nabiz.cevrimici
  return belge(baslik, h`
<div class="duzen">
  <aside class="yan">
    <a class="marka" href="/yonetim"><span class="marka-isaret" aria-hidden="true"></span><span>Kontrol<b>Odası</b></span></a>
    <nav aria-label="Yönetim">${menu.map((s) => h`<a href="${s.yol}"${s.ad === aktif || (aktif === 'uye' && s.ad === 'uyeler') ? h` class="secili" aria-current="page"` : ''}><span class="ikon" aria-hidden="true">${s.ikon}</span>${s.baslik}</a>`)}</nav>
    <div class="yan-alt">
      <div class="bot-durum ${cevrimici ? 'acik' : 'kapali'}"><span class="nokta" aria-hidden="true"></span>${cevrimici ? 'Bot bağlı' : 'Bot çevrimdışı'}<small>${nabiz.son ? `son nabız ${saat.format(new Date(nabiz.son))}` : 'hiç nabız yok'}</small></div>
      <div class="ben"><span class="rol-rozet ${y.rol}">${rol.emoji} ${rol.ad}</span><strong>${y.ad}</strong></div>
      <form method="post" action="/yonetim/cikis"><button class="cikis">Çıkış</button></form>
    </div>
  </aside>
  <main>
    <header class="ust"><h1>${baslik}</h1></header>
    ${v.bildirim ? h`<div class="bildirim ${v.bildirim.hata ? 'hata' : 'tamam'}" role="status">${v.bildirim.hata ?? v.bildirim.tamam}</div>` : ''}
    ${icerik}
  </main>
</div>`)
}

/** Formun ortak gizli alanları. */
const gizli = (islem, donus, alanlar = {}) => h`<input type="hidden" name="islem" value="${islem}"><input type="hidden" name="donus" value="${donus}">${Object.entries(alanlar).map(([k, d]) => h`<input type="hidden" name="${k}" value="${d}">`)}`

function grupSecici(v, yol) {
  if (v.gruplar.length < 2) return ''
  return h`<nav class="grup-sekme" aria-label="Grup">${v.gruplar.map((g, i) => h`<a href="${grupLink(yol, g.chat_jid)}"${g.chat_jid === v.chat ? h` class="secili" aria-current="true"` : ''}>${grupAdi(g, i)}</a>`)}</nav>`
}

const uyeSecimi = (uyeler, ad = 'kisi') => h`<select name="${ad}" required><option value="">Üye seç…</option>${uyeler.map((u) => h`<option value="${u.jid}">${u.ad || u.jid.split('@')[0]} · ${kisa(u.xp)} XP</option>`)}</select>`
const onayKutusu = (metin) => h`<label class="onay"><input type="checkbox" name="onay" value="1" required> ${metin}</label>`

const durumRozeti = (d) => h`<span class="durum ${d}">${{ bekliyor: 'Sırada', isleniyor: 'Gönderiliyor', tamam: 'Gönderildi', hata: 'Hata', iptal: 'İptal' }[d] ?? d}</span>`
const IS_ADI = {
  duyuru: '📢 Duyuru', kasa_dagit: '🎁 Kasa dağıtımı', sus: '🤐 Sus', konus: '🗣️ Konuş', sustur: '🔇 Üye susturma',
  sustur_kaldir: '🔊 Susturma kaldırma', darbe: '🪖 Darbe', reborn: '♻️ Reborn oylaması', reborn_iptal: '🛑 Reborn iptali',
}

export function yonetimGiris(hata = '') {
  return belge('Giriş', h`
<main class="giris-sahne">
  <form class="giris-kart" method="post" action="/yonetim/giris">
    <div class="marka"><span class="marka-isaret" aria-hidden="true"></span><span>Kontrol<b>Odası</b></span></div>
    <h1>Yönetim girişi</h1>
    <p class="not">Bot sahibinin verdiği tek kullanımlık kodu yaz. Kod 10 dakika geçerlidir.</p>
    <label for="kod">Giriş kodu</label>
    <input id="kod" name="kod" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="ABCDE-FGHJK" maxlength="14" required autofocus>
    ${hata ? h`<p class="hata" role="alert">${hata}</p>` : ''}
    <button class="birincil">Giriş yap</button>
    <p class="kucuk">Sahip kodu bota özelden <code>.yonetim kod</code> yazarak alır.</p>
  </form>
</main>`)
}

function grupKarti(g, i, izinler) {
  const e = g.ekonomi
  return h`<article class="pano grup-pano">
  <header><h3>${grupAdi(g, i)}</h3><span class="etiket">${sayi.format(g.uye)} üye</span></header>
  <dl class="olcu">
    <div><dt>Coin kuru</dt><dd>${e ? kisa(e.kur) : '—'}</dd></div>
    <div><dt>Piyasa</dt><dd>${e ? kisa(e.anlik) : '—'}</dd></div>
    <div><dt>Hazine</dt><dd>${e ? kisa(e.kasa) : '—'}</dd></div>
    <div><dt>Banka faizi</dt><dd>%${oranYaz(g.faiz.banka)}<small>/sa</small></dd></div>
  </dl>
  <footer>
    ${g.duyuruBekleme ? h`<span class="kucuk">Sonraki duyuru ${saat.format(new Date(g.duyuruBekleme))}</span>` : h`<span class="kucuk yesil">Duyuru atılabilir</span>`}
    <span class="baglantilar">
      ${izinler.duyuru ? h`<a href="${grupLink('/yonetim/duyuru', g.chat_jid)}">Duyuru</a>` : ''}
      ${izinler.ekonomi ? h`<a href="${grupLink('/yonetim/ekonomi', g.chat_jid)}">Ekonomi</a>` : ''}
    </span>
  </footer>
</article>`
}

export function gostergeSayfasi(v) {
  const izinler = Object.fromEntries(Object.keys(IZINLER).map((k) => [k, izinVar(v.yonetici.rol, k)]))
  const bekleyen = v.isler.filter((i) => i.durum === 'bekliyor' || i.durum === 'isleniyor').length
  return kabuk(v, 'gosterge', 'Gösterge', h`
<section class="kutucuklar">
  <div class="kutucuk ${v.nabiz.cevrimici ? 'iyi' : 'kotu'}"><small>WhatsApp botu</small><strong>${v.nabiz.cevrimici ? 'Bağlı' : 'Çevrimdışı'}</strong><span>${v.nabiz.son ? `son nabız ${zaman(v.nabiz.son)}` : 'Bot hiç nabız yazmadı'}</span></div>
  <div class="kutucuk"><small>Gruplar</small><strong>${sayi.format(v.gruplar.length)}</strong><span>${sayi.format(v.gruplar.reduce((t, g) => t + g.uye, 0))} üye kaydı</span></div>
  <div class="kutucuk ${bekleyen ? 'uyari' : ''}"><small>Bekleyen iş</small><strong>${sayi.format(bekleyen)}</strong><span>bot 5 sn'de bir işler</span></div>
  <div class="kutucuk"><small>Yönetici</small><strong>${sayi.format(v.yoneticiSayisi)}</strong><span>erişimi açık kişi</span></div>
</section>
${v.nabiz.cevrimici ? '' : h`<p class="uyari-serit">Bot bağlı değil: duyuru ve kasa dağıtımı sırada bekler, bot bağlanınca gider. Ayarlar ve ekonomi işlemleri hemen işler.</p>`}
<h2 class="bolum">Gruplar</h2>
<section class="izgara">${v.gruplar.map((g, i) => grupKarti(g, i, izinler))}</section>
${v.gruplar.length ? '' : h`<p class="bos">Henüz grup kaydı yok. Bot bir grupta mesaj görünce burada çıkar.</p>`}
${izinler.kayit && v.kayitlar.length ? h`<h2 class="bolum">Son işlemler <a class="ince" href="/yonetim/kayit">tümü →</a></h2>${kayitTablosu(v.kayitlar.slice(0, 8))}` : ''}`)
}

export function duyuruSayfasi(v) {
  const secili = v.gruplar.find((g) => g.chat_jid === v.chat)
  const bekle = secili ? v.duyuruBekleme : 0
  return kabuk(v, 'duyuru', 'Duyurular', h`
<section class="pano">
  <header><h3>Yeni duyuru</h3><span class="etiket">aynı gruba ${DUYURU_ARALIGI_MS / 60_000} dakikada bir</span></header>
  <form class="form" method="post" action="/yonetim/islem">${gizli('duyuru', 'duyuru')}
    <label>Grup
      <select name="grup" required>${v.gruplar.map((g, i) => h`<option value="${g.chat_jid}"${g.chat_jid === v.chat ? ' selected' : ''}>${grupAdi(g, i)}</option>`)}</select>
    </label>
    <label>Metin
      <textarea name="metin" rows="6" maxlength="${DUYURU_AZAMI}" required placeholder="Gruba gidecek duyuru…"></textarea>
    </label>
    <label class="onay"><input type="checkbox" name="etiket" value="1" checked> Herkesi etiketle (bildirim düşer, etiketler metinde görünmez)</label>
    <label>Zamanla (isteğe bağlı, İstanbul saati)<input type="datetime-local" name="zaman"></label>
    <p class="kucuk">Boş bırakırsan hemen gider. Zamanlanan duyuru en çok 30 gün sonrasına kurulur, o saate kadar iptal edilebilir.</p>
    ${bekle ? h`<p class="kucuk sari">Bu gruba sonraki duyuru saat ${saat.format(new Date(bekle))} sonrası atılabilir.</p>` : ''}
    <div class="onizleme"><small>Grupta görünüşü</small><pre>📢 <b>DUYURU</b>

<i>metnin</i>

— <i>Yönetim</i></pre></div>
    <button class="birincil">Sıraya koy</button>
    <p class="kucuk">Bot bağlıysa birkaç saniyede gider. Kimin yazdığı grupta görünmez, kayıt defterinde durur. Grup <code>.sus</code> ile susturulmuşsa gitmez.</p>
  </form>
</section>
<h2 class="bolum">Geçmiş</h2>
${isTablosu(v, v.isler)}`)
}

function isTablosu(v, isler) {
  if (!isler.length) return h`<p class="bos">Henüz iş yok.</p>`
  const adlar = new Map(v.gruplar.map((g, i) => [g.chat_jid, grupAdi(g, i)]))
  return h`<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Zaman</th><th>Grup</th><th>İş</th><th>İçerik</th><th>Durum</th><th></th></tr></thead>
<tbody>${isler.map((i) => {
    const veri = JSON.parse(i.veri)
    return h`<tr>
  <td class="nowrap">${zaman(i.zaman)}${i.calisma > i.zaman + 60_000 ? h`<small class="blok">⏰ ${zaman(i.calisma)}</small>` : ''}</td><td>${adlar.get(i.chat_jid) ?? i.chat_jid}</td><td class="nowrap">${IS_ADI[i.tur] ?? i.tur}</td>
  <td class="metin">${veri.metin ?? ''}${i.sonuc ? h`<small>${i.sonuc}</small>` : ''}</td>
  <td>${i.durum === 'bekliyor' && i.calisma > Date.now() ? h`<span class="durum bekliyor">Zamanlandı</span>` : durumRozeti(i.durum)}</td>
  <td>${i.durum === 'bekliyor' ? h`<form method="post" action="/yonetim/islem">${gizli('is-iptal', 'duyuru', { id: i.id })}<button class="kucuk-dugme">İptal</button></form>` : ''}</td>
</tr>`
  })}</tbody></table></div>`
}

function ayarFormu(a, donus, chat) {
  const anahtarli = a.birim === 'açık/kapalı'
  return h`<form class="ayar-satir" method="post" action="/yonetim/islem">${gizli('ayar', donus, { anahtar: a.anahtar, grup: chat ?? '' })}
  <span class="ayar-ad"><strong>${a.ad}</strong><small>${anahtarli ? '' : `${a.en}–${a.cok} ${a.birim} · `}varsayılan ${anahtarli ? (a.varsayilan ? 'açık' : 'kapalı') : a.varsayilan}${a.deger !== a.varsayilan ? ' · değişti' : ''}</small></span>
  ${anahtarli
    ? h`<select name="deger"><option value="1"${a.deger ? ' selected' : ''}>Açık</option><option value="0"${a.deger ? '' : ' selected'}>Kapalı</option></select>`
    : h`<input name="deger" value="${a.deger}" inputmode="numeric" autocomplete="off" required>`}
  <button class="ikincil">Kaydet</button>
</form>`
}

export function ekonomiSayfasi(v) {
  const g = v.grup
  const e = g?.ekonomi
  return kabuk(v, 'ekonomi', 'Ekonomi', h`
${grupSecici(v, '/yonetim/ekonomi')}
${!g ? h`<p class="bos">Grup yok.</p>` : h`
<section class="kutucuklar">
  <div class="kutucuk"><small>Coin kuru</small><strong>${e ? kisa(e.kur) : '—'}</strong><span>${e ? `alış ${kisa(e.alisKur)} · bozdurma ${kisa(e.bozdurmaKur)}` : ''}</span></div>
  <div class="kutucuk"><small>Piyasadaki para</small><strong>${e ? kisa(e.anlik) : '—'}</strong><span>${e ? `açılışta ${kisa(e.arz)}` : ''}</span></div>
  <div class="kutucuk"><small>Hazine</small><strong>${e ? kisa(e.kasa) : '—'}</strong><span>${e ? `${sayi.format(e.kredi?.adet ?? 0)} açık kredi` : ''}</span></div>
  <div class="kutucuk"><small>Faiz (saatlik)</small><strong>%${oranYaz(g.faiz.banka)}</strong><span>kredi %${oranYaz(g.faiz.kredi)}</span></div>
</section>
<section class="izgara iki">
  <article class="pano">
    <header><h3>Faiz kararı</h3><span class="etiket">bu grup</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('faiz', 'ekonomi', { grup: v.chat })}
      <label>Saatlik banka faizi (%)<input name="oran" value="${oranYaz(g.faiz.banka)}" inputmode="decimal" autocomplete="off" required></label>
      <p class="kucuk">-5 ile 50 arası, en çok 2 ondalık. Kredi faizi kendiliğinden bankanın üstünde kalır. Birikmiş faiz önce eski orandan işlenir.</p>
      <button class="birincil">Kararı uygula</button>
    </form>
  </article>
  <article class="pano">
    <header><h3>Teşvik</h3><span class="etiket">hazineden</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('tesvik', 'ekonomi', { grup: v.chat })}
      <label>Toplam XP<input name="miktar" placeholder="ör. 50 milyon" autocomplete="off" required></label>
      <p class="kucuk">Son 7 günde yazan üyelere eşit bölünür. Hazinede: ${e ? sayi.format(e.kasa) : '—'} XP.</p>
      ${onayKutusu('Hazineden dağıtılacağını biliyorum')}
      <button class="birincil">Dağıt</button>
    </form>
  </article>
  <article class="pano">
    <header><h3>XP ver ya da al</h3><span class="etiket">basılır / yanar</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('xp', 'ekonomi', { grup: v.chat })}
      <label>Üye${uyeSecimi(v.uyeler)}</label>
      <label>Miktar<input name="miktar" placeholder="ör. 10 milyon ya da -5m" autocomplete="off" required></label>
      <p class="kucuk">Eksi yazılırsa alınır, cüzdan sıfırın altına inmez. <code>.xpver</code> ile aynıdır: hazineden çıkmaz, basılır.</p>
      ${onayKutusu('Onaylıyorum')}
      <button class="birincil">Uygula</button>
    </form>
  </article>
  <article class="pano">
    <header><h3>Coin ver ya da al</h3><span class="etiket">basılır / yanar</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('coin', 'ekonomi', { grup: v.chat })}
      <label>Üye${uyeSecimi(v.uyeler)}</label>
      <label>Adet<input name="miktar" placeholder="ör. 10 ya da -3" inputmode="numeric" autocomplete="off" required></label>
      <p class="kucuk"><code>.coinver</code> ile aynıdır. Bakiye sıfırın altına inmez.</p>
      ${onayKutusu('Onaylıyorum')}
      <button class="birincil">Uygula</button>
    </form>
  </article>
</section>`}
<h2 class="bolum">Genel ayarlar <span class="ince">bütün gruplarda geçerli</span></h2>
<section class="pano ayarlar">${v.ayarlar.ekonomi.map((a) => ayarFormu(a, 'ekonomi', v.chat))}</section>`)
}

export function kasaSayfasi(v) {
  return kabuk(v, 'kasa', 'Kasalar', h`
${grupSecici(v, '/yonetim/kasa')}
<h2 class="bolum">Kasa ayarları <span class="ince">bütün gruplarda geçerli, bota 10 sn içinde geçer</span></h2>
<section class="pano ayarlar">${v.ayarlar.kasa.map((a) => ayarFormu(a, 'kasa', v.chat))}</section>
${v.grup ? h`<section class="izgara iki">
  <article class="pano">
    <header><h3>Kasa ya da anahtar ver</h3><span class="etiket">${grupAdi(v.grup)}</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('kasa-ver', 'kasa', { grup: v.chat })}
      <label>Üye${uyeSecimi(v.uyeler)}</label>
      <div class="yan-yana">
        <label>Tür<select name="tur"><option value="kasa">Kasa</option><option value="anahtar">Anahtar</option></select></label>
        <label>Tier<select name="tier">${KASALAR.map((k) => h`<option value="${k.tier}">T${k.tier} ${k.ad.replace(/^\S+\s/, '')}</option>`)}</select></label>
        <label>Adet<input name="miktar" value="1" inputmode="numeric" autocomplete="off" required></label>
      </div>
      <p class="kucuk">Eksi adet alır. Haftalık sınırlara sayılmaz.</p>
      <button class="birincil">Ver</button>
    </form>
  </article>
  <article class="pano">
    <header><h3>Kasa yağmuru</h3><span class="etiket">${grupAdi(v.grup)}</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('kasa-dagit', 'kasa', { grup: v.chat })}
      <p>Gruptaki herkese T1-T4 arası rastgele 1 kasa. Bot dağıtıp gruba listeyi yazar, kimse etiketlenmez. <code>.kasa dağıt</code> ile aynıdır.</p>
      ${onayKutusu('Herkese kasa dağıtılsın')}
      <button class="birincil">Sıraya koy</button>
    </form>
  </article>
</section>` : ''}
<h2 class="bolum">Tier'ler</h2>
<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Tier</th><th>Kasa</th><th>Kasa fiyatı</th><th>Anahtar</th></tr></thead>
<tbody>${KASALAR.map((k) => h`<tr><td>T${k.tier}</td><td>${k.ad}</td><td>${kasaFiyati(k.tier)} coin</td><td>${anahtarFiyati(k.tier)} coin</td></tr>`)}</tbody>
</table></div>`)
}

export function yoneticilerSayfasi(v) {
  return kabuk(v, 'yoneticiler', 'Yöneticiler', h`
<section class="pano">
  <header><h3>Yeni kişi eklemek</h3></header>
  <p>Bota özelden <code>.yonetim kod moderatör Ali</code> ya da <code>.yonetim kod yönetici Ayşe</code> yaz, gelen kodu kişiye kendin ilet. Kod tek kullanımlık ve 10 dakika geçerli.</p>
  <ul class="roller">
    <li><span class="rol-rozet sahip">👑 Sahip</span> Her şey. Yalnızca <code>.env</code>'deki sahip.</li>
    <li><span class="rol-rozet yonetici">🛡️ Yönetici</span> Duyuru, ekonomi, kasalar, ayarlar, kayıt defteri.</li>
    <li><span class="rol-rozet moderator">🎙️ Moderatör</span> Gösterge ve duyuru.</li>
  </ul>
</section>
<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Ad</th><th>Rol</th><th>Eklendi</th><th>Son giriş</th><th>Durum</th><th></th></tr></thead>
<tbody>${v.yoneticiler.map((y) => h`<tr${y.aktif ? '' : h` class="soluk"`}>
  <td><strong>${y.ad}</strong></td>
  <td>${y.rol === 'sahip' ? h`<span class="rol-rozet sahip">👑 Sahip</span>` : h`<form class="satir-form" method="post" action="/yonetim/islem">${gizli('yonetici-rol', 'yoneticiler', { id: y.id })}
    <select name="rol">${['yonetici', 'moderator'].map((r) => h`<option value="${r}"${r === y.rol ? ' selected' : ''}>${ROLLER[r].emoji} ${ROLLER[r].ad}</option>`)}</select><button class="kucuk-dugme">Değiştir</button></form>`}</td>
  <td class="nowrap">${zaman(y.eklendi)}</td><td class="nowrap">${zaman(y.son_giris)}</td>
  <td>${y.aktif ? h`<span class="durum tamam">Açık</span>` : h`<span class="durum iptal">Kapalı</span>`}</td>
  <td>${y.rol !== 'sahip' && y.aktif ? h`<form method="post" action="/yonetim/islem">${gizli('yonetici-kapat', 'yoneticiler', { id: y.id })}<button class="kucuk-dugme tehlike">Erişimi kapat</button></form>` : ''}</td>
</tr>`)}</tbody></table></div>
<p class="kucuk">Kapatılan kişinin açık oturumu hemen düşer. Yeniden açmak için yeni kod ver. Rol değişince de oturumu düşer, yeni kodla girer.</p>`)
}

function kayitTablosu(liste) {
  return h`<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Zaman</th><th>Kim</th><th>İşlem</th><th>Ayrıntı</th></tr></thead>
<tbody>${liste.map((k) => h`<tr><td class="nowrap">${zaman(k.zaman)}</td><td class="nowrap">${ROLLER[k.rol]?.emoji ?? ''} ${k.ad}</td><td class="nowrap">${k.islem}</td><td class="metin">${k.ayrinti}</td></tr>`)}</tbody>
</table></div>`
}

export function kayitSayfasi(v) {
  const s = v.suz
  const suzuldu = s.ara || s.islem || s.bas || s.bit
  return kabuk(v, 'kayit', 'Kayıt defteri', h`
<form class="suzgec" method="get" action="/yonetim/kayit">
  <label>Ara<input name="ara" value="${s.ara}" placeholder="kişi, işlem ya da ayrıntı" autocomplete="off"></label>
  <label>İşlem<select name="islem"><option value="">Hepsi</option>${v.islemler.map((i) => h`<option value="${i}"${i === s.islem ? ' selected' : ''}>${i}</option>`)}</select></label>
  <label>Başlangıç<input type="date" name="bas" value="${s.bas}"></label>
  <label>Bitiş<input type="date" name="bit" value="${s.bit}"></label>
  <div class="suzgec-dugmeler"><button class="birincil">Süz</button>${suzuldu ? h`<a class="kucuk-dugme dugme-link" href="/yonetim/kayit">Temizle</a>` : ''}</div>
</form>
<p class="kucuk">${v.kayitlar.length} kayıt${v.kayitlar.length >= 200 ? ' (en yeni 200)' : ''}</p>
${v.kayitlar.length ? kayitTablosu(v.kayitlar) : h`<p class="bos">${suzuldu ? 'Bu süzgece uyan kayıt yok.' : 'Henüz kayıt yok.'}</p>`}`)
}

export const yasakSayfasi = (v) => kabuk(v, '', 'Yetki yok', h`<p class="bos">Bu sayfa için rolün yetmiyor.</p>`)

// Faz 91: üyeler, devlet, kumarhane, gruplar.

const adOf = (u) => u?.ad || (u?.jid ?? '').split('@')[0]
const uyeLink = (chat, jid) => `/yonetim/uye?grup=${encodeURIComponent(chat)}&id=${encodeURIComponent(jid)}`
const kisiFormu = (islem, chat, jid, ic, sinif = 'satir-form') =>
  h`<form class="${sinif}" method="post" action="/yonetim/islem">${gizli(islem, 'uye', { grup: chat, kisi: jid })}${ic}</form>`
const sureYaz = (bitis) => (bitis ? `bitiş ${zaman(bitis)}` : 'kaldırılana kadar')

export function uyelerSayfasi(v) {
  const satirlar = v.uyeler.map((u) => {
    const sus = v.susturulan.has(u.jid)
    return h`<tr>
  <td><a href="${uyeLink(v.chat, u.jid)}"><strong>${adOf(u)}</strong></a><small class="blok">${u.jid.split('@')[0].slice(-6)}</small></td>
  <td class="sag">${kisa(u.xp)}</td>
  <td class="sag">${sayi.format(u.messages)}</td>
  <td class="nowrap">${zaman(u.last_seen)}</td>
  <td>${[sus && h`<span class="durum hata">🔇 Susturulmuş</span>`, v.hapiste.has(u.jid) && h`<span class="durum bekliyor">🚔 Hapiste</span>`, u.panelde && h`<span class="durum tamam">Panelde</span>`].filter(Boolean)}</td>
</tr>`
  })
  return kabuk(v, 'uyeler', 'Üyeler', h`
${grupSecici(v, '/yonetim/uyeler')}
<form class="arama" method="get" action="/yonetim/uyeler">
  <input type="hidden" name="grup" value="${v.chat}">
  <input name="ara" value="${v.ara}" placeholder="Ad ya da numara ara…" autocomplete="off">
  <button class="ikincil">Ara</button>
</form>
<p class="kucuk">${v.ara ? `${v.uyeler.length} / ${v.toplam} üye` : `${v.toplam} üye`} · son görülme sırasıyla. Ada tıklayınca kart açılır.</p>
${v.uyeler.length ? h`<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Üye</th><th class="sag">XP</th><th class="sag">Mesaj</th><th>Son görülme</th><th>Durum</th></tr></thead>
<tbody>${satirlar}</tbody></table></div>` : h`<p class="bos">Üye bulunamadı.</p>`}`)
}

export function uyeSayfasi(v) {
  const k = v.kisi
  if (!k) return kabuk(v, 'uye', 'Üye', h`<p class="bos">Bu grupta böyle bir üye yok. <a href="/yonetim/uyeler">Üyelere dön</a></p>`)
  const s = v.servet
  const d = v.durum ?? {}
  const rol = v.yonetici.rol
  const kasalar = v.envanter.filter((e) => e.tur === 'kasa')
  const anahtarlar = v.envanter.filter((e) => e.tur === 'anahtar')
  return kabuk(v, 'uye', adOf(k), h`
<p class="kucuk"><a href="/yonetim/uyeler?grup=${encodeURIComponent(v.chat)}">← Üyeler</a> · ${grupAdi(v.gruplar.find((g) => g.chat_jid === v.chat))} · <code>${k.jid}</code></p>
<section class="kutucuklar">
  <div class="kutucuk"><small>Net servet</small><strong>${s ? kisa(s.net) : '—'}</strong><span>${s ? `varlık ${kisa(s.varlik)} · borç ${kisa(s.borc)}` : ''}</span></div>
  <div class="kutucuk"><small>Cüzdan</small><strong>${kisa(k.xp)}</strong><span>banka ${s ? kisa(s.banka) : '—'}</span></div>
  <div class="kutucuk"><small>Coin</small><strong>${s ? sayi.format(s.coinAdet) : '—'}</strong><span>${s ? `≈ ${kisa(s.coin)} XP` : ''}</span></div>
  <div class="kutucuk"><small>Mesaj</small><strong>${sayi.format(k.messages)}</strong><span>son ${zaman(k.last_seen)}</span></div>
</section>
<section class="izgara iki">
  <article class="pano">
    <header><h3>Durum</h3></header>
    <dl class="liste">
      <div><dt>Unvan</dt><dd>${d.unvan ?? '—'}</dd></div>
      <div><dt>Makam</dt><dd>${d.makamlar?.length ? d.makamlar.map((m) => MAKAMLAR.find((x) => x.kod === m)?.ad).join(', ') : '—'}</dd></div>
      <div><dt>Hapis</dt><dd>${d.hapis ? `🚔 ${sureYaz(d.hapis.bitis)}` : '—'}</dd></div>
      <div><dt>Ambargo</dt><dd>${d.ambargo ? `🌍 ${sureYaz(d.ambargo)}` : '—'}</dd></div>
      <div><dt>Kalkan</dt><dd>${d.kalkan ? `🛡️ ${sureYaz(d.kalkan)}` : '—'}</dd></div>
      <div><dt>Susturma</dt><dd>${v.susturma ? `🔇 ${sureYaz(v.susturma.bitis)}` : '—'}</dd></div>
      <div><dt>Panel hesabı</dt><dd>${k.panelde ? 'var' : 'yok'}</dd></div>
    </dl>
  </article>
  <article class="pano">
    <header><h3>Varlıklar</h3></header>
    <dl class="liste">
      <div><dt>Suly</dt><dd>${s ? `${sulyYaz(s.kriptoBirim)} · ≈ ${kisa(s.kripto)} XP` : '—'}</dd></div>
      <div><dt>Mülk</dt><dd>${s ? `≈ ${kisa(s.mulk)} XP` : '—'}</dd></div>
      <div><dt>NFT</dt><dd>${s ? sayi.format(s.nftAdet) : '—'}</dd></div>
      <div><dt>Kredi borcu</dt><dd>${s?.kredi ? kisa(s.kredi) : '—'}</dd></div>
      <div><dt>Kasalar</dt><dd>${kasalar.length ? kasalar.map((e) => `T${e.tier}×${e.adet}`).join(' ') : '—'}</dd></div>
      <div><dt>Anahtarlar</dt><dd>${anahtarlar.length ? anahtarlar.map((e) => `T${e.tier}×${e.adet}`).join(' ') : '—'}</dd></div>
    </dl>
  </article>
</section>
<h2 class="bolum">İşlemler</h2>
<section class="izgara iki">
  ${izinVar(rol, 'moderasyon') ? h`<article class="pano">
    <header><h3>Susturma</h3><span class="etiket">mesajları silinir</span></header>
    ${v.susturma
      ? kisiFormu('sustur-kaldir', v.chat, k.jid, h`<button class="birincil">🔊 Susturmayı kaldır</button>`, 'form')
      : kisiFormu('sustur', v.chat, k.jid, h`<label>Süre (dakika, boş = kaldırılana kadar)<input name="dakika" inputmode="numeric" autocomplete="off" placeholder="ör. 60"></label>
      <p class="kucuk">Bot grupta admin olmalı. Sahip, adminler ve bot susturulsa da WhatsApp'ta mesajları silinmez.</p>
      <button class="birincil">🔇 Sustur</button>`, 'form')}
  </article>` : ''}
  ${izinVar(rol, 'uyeDuzelt') ? h`<article class="pano">
    <header><h3>Düzeltmeler</h3></header>
    <div class="form">
      ${kisiFormu('unvan', v.chat, k.jid, h`<input name="unvan" value="${d.unvan ?? ''}" maxlength="40" placeholder="Unvan (boş = kaldır)" autocomplete="off"><button class="kucuk-dugme">Unvanı yaz</button>`)}
      ${d.hapis ? kisiFormu('hapis-cikar', v.chat, k.jid, h`<button class="kucuk-dugme">🚔 Hapisten çıkar</button>`) : ''}
      ${d.ambargo ? kisiFormu('ambargo-kaldir', v.chat, k.jid, h`<button class="kucuk-dugme">🌍 Ambargoyu kaldır</button>`) : ''}
      ${k.panelde ? kisiFormu('panel-kapat', v.chat, k.jid, h`<button class="kucuk-dugme tehlike">Panel hesabını kapat</button>`) : ''}
    </div>
  </article>` : ''}
  ${izinVar(rol, 'ekonomi') ? h`<article class="pano">
    <header><h3>XP ya da coin</h3><span class="etiket">basılır / yanar</span></header>
    ${kisiFormu('xp', v.chat, k.jid, h`<label>XP (eksi alır)<input name="miktar" placeholder="ör. 10 milyon ya da -5m" autocomplete="off" required></label>${onayKutusu('Onaylıyorum')}<button class="birincil">XP uygula</button>`, 'form')}
    <hr>
    ${kisiFormu('coin', v.chat, k.jid, h`<label>Coin (eksi alır)<input name="miktar" placeholder="ör. 10 ya da -3" inputmode="numeric" autocomplete="off" required></label>${onayKutusu('Onaylıyorum')}<button class="birincil">Coin uygula</button>`, 'form')}
  </article>` : ''}
  ${izinVar(rol, 'kasa') ? h`<article class="pano">
    <header><h3>Kasa ya da anahtar</h3></header>
    ${kisiFormu('kasa-ver', v.chat, k.jid, h`<div class="yan-yana">
        <label>Tür<select name="tur"><option value="kasa">Kasa</option><option value="anahtar">Anahtar</option></select></label>
        <label>Tier<select name="tier">${KASALAR.map((x) => h`<option value="${x.tier}">T${x.tier}</option>`)}</select></label>
        <label>Adet<input name="miktar" value="1" inputmode="numeric" autocomplete="off" required></label>
      </div><button class="birincil">Ver</button>`, 'form')}
  </article>` : ''}
</section>`)
}

export function devletSayfasi(v) {
  const sd = v.secim
  const adi = (jid) => (jid ? adOf(v.uyeler.find((u) => u.jid === jid)) || jid.split('@')[0] : null)
  const bakanliklar = MAKAMLAR.filter((m) => m.yetki)
  return kabuk(v, 'devlet', 'Devlet', h`
${grupSecici(v, '/yonetim/devlet')}
${!sd ? h`<p class="bos">Grup yok ya da veritabanı kapalı.</p>` : h`
${sd.darbe ? h`<p class="uyari-serit">🪖 Bu grupta darbe var: başkan seçimi askıda.</p>` : ''}
<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Makam</th><th>Kimde</th><th>Seçim</th><th></th></tr></thead>
<tbody>${sd.makamlar.map((m) => {
    const t = MAKAMLAR.find((x) => x.kod === m.kod)
    const sc = sd.secimler[m.kod]
    return h`<tr>
  <td class="nowrap">${t.ad}</td>
  <td>${adi(m.sahip) ?? (m.kod === 'baskan' ? 'Sahip (seçilmiş başkan yok)' : '—')}${m.askida ? h` <span class="durum bekliyor">${m.kod === 'baskan' ? 'darbe' : 'kayyum'}</span>` : ''}</td>
  <td>${sc ? h`${sc.adaylar.length} aday · bitiş ${zaman(sc.bitis)}${sc.adaylar.length ? h`<small class="blok">${sc.adaylar.map((a) => `${adi(a.user_jid)} (${a.oy})`).join(', ')}</small>` : ''}` : '—'}</td>
  <td class="nowrap">${sc ? h`<form class="satir-form" method="post" action="/yonetim/islem">${gizli('secim-iptal', 'devlet', { grup: v.chat, makam: m.kod })}<button class="kucuk-dugme tehlike">Seçimi iptal et</button></form>` : ''}
    ${m.askida && t.yetki ? h`<form class="satir-form" method="post" action="/yonetim/islem">${gizli('kayyum-kaldir', 'devlet', { grup: v.chat, makam: m.kod })}<button class="kucuk-dugme">Kayyumu kaldır</button></form>` : ''}</td>
</tr>`
  })}</tbody></table></div>
<section class="izgara iki">
  <article class="pano">
    <header><h3>Kayyum ata</h3><span class="etiket">seçim askıya alınır</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('kayyum', 'devlet', { grup: v.chat })}
      <label>Bakanlık<select name="makam">${bakanliklar.map((m) => h`<option value="${m.kod}">${m.ad}</option>`)}</select></label>
      <label>Kişi${uyeSecimi(v.uyeler)}</label>
      <p class="kucuk">Makam hemen bu kişiye geçer, açık seçim iptal olur ve ücretler yanar. <code>.kayyum</code> ile aynıdır.</p>
      <button class="birincil">Ata</button>
    </form>
  </article>
  ${izinVar(v.yonetici.rol, 'darbe') ? h`<article class="pano tehlikeli">
    <header><h3>🪖 Darbe</h3><span class="etiket">yalnızca sahip</span></header>
    ${sd.darbe
      ? h`<form class="form" method="post" action="/yonetim/islem">${gizli('darbe-bitir', 'devlet', { grup: v.chat })}<p>Darbeyi bitirince başkanlık ve kayyumlar yerinde kalır, bütün seçimler açılır.</p><button class="birincil">🕊️ Darbeyi bitir</button></form>`
      : h`<form class="form" method="post" action="/yonetim/islem">${gizli('darbe', 'devlet', { grup: v.chat })}
      <p><code>.darbe</code> ile aynıdır: başkanlık sana geçer, grupta herkes etiketlenir, her üyeye özelden yazılır. 10 dakika sonra destek vermeyenlerin varlığının %60'ına el konur ve borsa çöker.</p>
      <label><span>Onay için <b>ONAYLIYORUM</b> yaz</span><input name="onay" autocomplete="off" required></label>
      <button class="birincil tehlike-dugme">Darbe yap</button>
    </form>`}
  </article>` : ''}
</section>`}`)
}

/** Bakım düğmesi: kapsam '*' bütün gruplar, yoksa grup kimliği. */
function kilitDugmesi(kapsam, komut, kapali, donus, chat) {
  return h`<form class="satir-form" method="post" action="/yonetim/islem">${gizli('kilit', donus, { kapsam, komut, durum: kapali ? 'ac' : 'kapat', grup: chat ?? '' })}
  <button class="anahtar ${kapali ? 'kapali' : 'acik'}" aria-pressed="${kapali ? 'false' : 'true'}">${kapali ? '🔧 Bakımda' : '● Açık'}</button></form>`
}

export function kumarhaneSayfasi(v) {
  const kapali = new Set(v.kilitler.filter((k) => k.chat_jid === HEPSI).map((k) => k.komut))
  return kabuk(v, 'kumarhane', 'Kumarhane', h`
<p class="kucuk">Buradaki bakım bütün gruplarda geçerlidir; tek grup için <a href="/yonetim/gruplar">Gruplar</a>. Kapatılan komuta yazan "bakımda" yanıtı alır, sahip muaftır. Bota en geç 10 sn'de geçer.</p>
<section class="izgara iki">
  <article class="pano">
    <header><h3>WhatsApp kumar komutları</h3><span class="etiket">${v.komutlar.filter((k) => kapali.has(k.ad)).length} bakımda</span></header>
    <ul class="anahtar-liste">${v.komutlar.map((k) => h`<li><span><strong>.${k.ad}</strong><small>${k.aciklama}</small></span>${kilitDugmesi(HEPSI, k.ad, kapali.has(k.ad), 'kumarhane')}</li>`)}</ul>
  </article>
  <article class="pano">
    <header><h3>Panel oyunları</h3><span class="etiket">${v.panelOyunlari.filter((o) => kapali.has(`panel:${o.id}`)).length} bakımda</span></header>
    <ul class="anahtar-liste">${v.panelOyunlari.map((o) => h`<li><span><strong>${o.ikon} ${o.ad}</strong></span>${kilitDugmesi(HEPSI, `panel:${o.id}`, kapali.has(`panel:${o.id}`), 'kumarhane')}</li>`)}</ul>
    <p class="kucuk">Bakımdaki oyun lobide "🔧 Bakımda" görünür, açık el bitirilebilir.</p>
  </article>
  ${izinVar(v.yonetici.rol, 'sans') ? h`<article class="pano">
    <header><h3>🍀 Gizli şans</h3><span class="etiket">yalnızca sahip</span></header>
    <p><code>.şans</code> ile aynıdır: açıkken kaybeden çekilişlerin bir kısmı yeniden atılır. Kimse görmez.</p>
    <form class="form" method="post" action="/yonetim/islem">${gizli('sans', 'kumarhane', { durum: v.sansAcik ? 'kapat' : 'ac' })}
      <p>Şu an: <b>${v.sansAcik ? 'açık' : 'kapalı'}</b></p>
      <button class="birincil">${v.sansAcik ? 'Kapat' : 'Aç'}</button>
    </form>
  </article>` : ''}
</section>`)
}

export function gruplarSayfasi(v) {
  const g = v.gruplar.find((x) => x.chat_jid === v.chat)
  const grupKilit = new Set(v.kilitler.filter((k) => k.chat_jid === v.chat).map((k) => k.komut))
  const genel = new Set(v.kilitler.filter((k) => k.chat_jid === HEPSI).map((k) => k.komut))
  const suskun = v.suskun.has(v.chat)
  const adi = (komut) => (komut.startsWith('panel:') ? `🎰 ${v.panelOyunlari.find((o) => `panel:${o.id}` === komut)?.ad ?? komut.slice(6)} (panel)` : `.${komut}`)
  return kabuk(v, 'gruplar', 'Gruplar', h`
${grupSecici(v, '/yonetim/gruplar')}
${!g ? h`<p class="bos">Grup yok.</p>` : h`
<section class="izgara iki">
  <article class="pano">
    <header><h3>Bot bu grupta</h3><span class="etiket">${suskun ? '🤐 susturulmuş' : '🗣️ konuşuyor'}</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli(suskun ? 'konus' : 'sus', 'gruplar', { grup: v.chat })}
      <p><code>${suskun ? '.konuş' : '.sus'}</code> ile aynıdır. ${suskun ? 'Bot gruba "Geri döndüm" yazar.' : 'Açık oyun kapanır, bot gruba susturulduğunu yazar; komutlar ve duyurular durur, istatistik sürer.'}</p>
      <button class="birincil">${suskun ? '🗣️ Konuştur' : '🤐 Sustur'}</button>
    </form>
  </article>
  <article class="pano">
    <header><h3>Bu grupta komut kapat</h3></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('kilit', 'gruplar', { grup: v.chat, kapsam: v.chat, durum: 'kapat' })}
      <label>Komut ya da panel oyunu<select name="komut" required><option value="">Seç…</option>
        <optgroup label="WhatsApp komutları">${v.komutlar.filter((k) => !grupKilit.has(k.ad)).map((k) => h`<option value="${k.ad}">.${k.ad} · ${k.kategori}</option>`)}</optgroup>
        <optgroup label="Panel oyunları">${v.panelOyunlari.filter((o) => !grupKilit.has(`panel:${o.id}`)).map((o) => h`<option value="panel:${o.id}">${o.ikon} ${o.ad}</option>`)}</optgroup>
      </select></label>
      <button class="birincil">Bakıma al</button>
    </form>
  </article>
</section>
<h2 class="bolum">Bu grupta kapalı</h2>
${grupKilit.size ? h`<ul class="anahtar-liste pano">${[...grupKilit].map((k) => h`<li><span><strong>${adi(k)}</strong></span>${kilitDugmesi(v.chat, k, true, 'gruplar', v.chat)}</li>`)}</ul>` : h`<p class="bos">Bu gruba özel kapalı komut yok.</p>`}
${genel.size ? h`<p class="kucuk">Bütün gruplarda bakımda: ${[...genel].map(adi).join(', ')} (<a href="/yonetim/kumarhane">Kumarhane</a>).</p>` : ''}`}`)
}

// Faz 92: moderasyon ve sistem.

const MB = (b) => `${(b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
const silFormu = (islem, chat, id, etiket = 'Sil') =>
  h`<form class="satir-form" method="post" action="/yonetim/islem">${gizli(islem, 'sosyal', { grup: chat, id })}<button class="kucuk-dugme tehlike">${etiket}</button></form>`

export function sosyalSayfasi(v) {
  const ad = (jid) => v.adlar.get(jid) ?? jid.split('@')[0]
  const kisalt = (m) => (m.length > 160 ? `${m.slice(0, 160)}…` : m)
  return kabuk(v, 'sosyal', 'Moderasyon', h`
${grupSecici(v, '/yonetim/sosyal')}
<p class="kucuk">Panelin sosyal bölümü. Silinen içerik geri gelmez, fotoğrafı da silinir. Engellenen kişi okur ve tepki verir ama gönderi, yorum, mesaj ve hikâye yazamaz, <code>.paylaş</code> da çalışmaz.</p>
<section class="izgara iki">
  <article class="pano">
    <header><h3>Yazma engeli</h3><span class="etiket">${v.engelliler.length} engelli</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('engel', 'sosyal', { grup: v.chat })}
      <label>Üye${uyeSecimi(v.uyeler)}</label>
      <label>Süre<select name="saat">${[[1, '1 saat'], [6, '6 saat'], [24, '1 gün'], [72, '3 gün'], [168, '1 hafta'], [720, '30 gün']].map(([n, t]) => h`<option value="${n}"${n === 24 ? ' selected' : ''}>${t}</option>`)}</select></label>
      <button class="birincil">Engelle</button>
    </form>
    ${v.engelliler.length ? h`<ul class="anahtar-liste">${v.engelliler.map((e) => h`<li><span><strong>${ad(e.user_jid)}</strong><small>bitiş ${zaman(e.bitis)}</small></span>
      <form class="satir-form" method="post" action="/yonetim/islem">${gizli('engel-kaldir', 'sosyal', { grup: v.chat, kisi: e.user_jid })}<button class="kucuk-dugme">Kaldır</button></form></li>`)}</ul>` : ''}
  </article>
  <article class="pano">
    <header><h3>Açık hikâyeler</h3><span class="etiket">${v.hikayeler.length}</span></header>
    ${v.hikayeler.length ? h`<ul class="anahtar-liste">${v.hikayeler.map((x) => h`<li><span><strong>${ad(x.user_jid)}</strong><small>${zaman(x.zaman)}${x.metin ? ` · ${x.metin}` : ''}</small></span>${silFormu('hikaye-sil', v.chat, x.id)}</li>`)}</ul>` : h`<p class="kucuk">Açık hikâye yok.</p>`}
  </article>
</section>
<h2 class="bolum">Son gönderiler</h2>
${v.gonderiler.length ? h`<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Zaman</th><th>Yazan</th><th>Gönderi</th><th></th></tr></thead>
<tbody>${v.gonderiler.map((g) => h`<tr>
  <td class="nowrap">${zaman(g.zaman)}</td>
  <td class="nowrap">${ad(g.user_jid)}${g.hedef_jid ? h`<small class="blok">▸ ${ad(g.hedef_jid)}</small>` : ''}</td>
  <td class="metin">${g.medya ? '📷 ' : ''}${g.alinti_id && !g.metin ? '↻ paylaşım' : kisalt(g.metin)}</td>
  <td>${silFormu('gonderi-sil', v.chat, g.id)}</td>
</tr>`)}</tbody></table></div>` : h`<p class="bos">Gönderi yok.</p>`}
<h2 class="bolum">Son yorumlar</h2>
${v.yorumlar.length ? h`<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Zaman</th><th>Yazan</th><th>Yorum</th><th></th></tr></thead>
<tbody>${v.yorumlar.map((y) => h`<tr><td class="nowrap">${zaman(y.zaman)}</td><td class="nowrap">${ad(y.user_jid)}</td><td class="metin">${kisalt(y.metin)}<small class="blok">gönderi #${y.gonderi_id}</small></td><td>${silFormu('yorum-sil', v.chat, y.id)}</td></tr>`)}</tbody>
</table></div>` : h`<p class="bos">Yorum yok.</p>`}`)
}

export function sistemSayfasi(v) {
  const r = v.reborn
  const sonIs = v.rebornIsleri[0]
  return kabuk(v, 'sistem', 'Sistem', h`
<section class="kutucuklar">
  <div class="kutucuk"><small>Veritabanı</small><strong>${MB(v.dbBoyut)}</strong><span>data/stats.db</span></div>
  <div class="kutucuk"><small>Yedek</small><strong>${sayi.format(v.yedekler.length)}</strong><span>${v.yedekler[0] ? `en yenisi ${zaman(v.yedekler[0].zaman)}` : 'henüz yok'}</span></div>
</section>
<section class="izgara iki">
  <article class="pano">
    <header><h3>Yedekler</h3><span class="etiket">günde bir otomatik</span></header>
    <form class="form" method="post" action="/yonetim/islem">${gizli('yedek-al', 'sistem')}
      <p>Şimdi tutarlı bir kopya alınır (son 5 elle yedek kalır). Yedekler aynı sunucuda durur; sunucu giderse onlar da gider, ara sıra indir.</p>
      <button class="birincil">Şimdi yedek al</button>
    </form>
    ${v.yedekler.length ? h`<ul class="anahtar-liste">${v.yedekler.map((y) => h`<li><span><strong>${y.ad}</strong><small>${zaman(y.zaman)} · ${MB(y.boyut)}</small></span><a class="kucuk-dugme dugme-link" href="/yonetim/yedek?ad=${encodeURIComponent(y.ad)}">İndir</a></li>`)}</ul>` : ''}
  </article>
  <article class="pano tehlikeli">
    <header><h3>♻️ Reborn</h3><span class="etiket">${grupAdi(v.gruplar.find((g) => g.chat_jid === v.chat))}</span></header>
    ${grupSecici(v, '/yonetim/sistem')}
    ${r ? h`<dl class="liste">
      <div><dt>Kaçıncı reborn</dt><dd>${r.no}.</dd></div>
      <div><dt>Hesabı olan üye</dt><dd>${sayi.format(r.uye)}</dd></div>
      <div><dt>Piyasadaki para</dt><dd>${kisa(r.arz)} XP</dd></div>
      <div><dt>Kur</dt><dd>${kisa(r.kur)} XP</dd></div>
      <div><dt>Hazine</dt><dd>${kisa(r.kasa)} XP</dd></div>
      <div><dt>Yıldız alacaklar</dt><dd>${r.zenginler.length ? r.zenginler.map((z) => v.adlar?.get(z.user_jid) ?? z.user_jid.split('@')[0]).join(', ') : '—'}</dd></div>
    </dl>` : h`<p class="kucuk">Önizleme alınamadı.</p>`}
    ${sonIs ? h`<p class="kucuk">Son iş: ${IS_ADI[sonIs.tur]} · ${zaman(sonIs.zaman)} · ${sonIs.sonuc || sonIs.durum}</p>` : ''}
    <form class="form" method="post" action="/yonetim/islem">${gizli('reborn', 'sistem', { grup: v.chat })}
      <p><code>.reborn onay</code> ile aynıdır: grupta oylama başlar, 10 dakika sonra evet fazlaysa grubun ekonomisi sıfırlanır (önce yedek alınır). Mesaj sayıları, kartlar, petler kalır.</p>
      <label><span>Onay için <b>ONAYLIYORUM</b> yaz</span><input name="onay" autocomplete="off" required></label>
      <button class="birincil tehlike-dugme">Oylamayı başlat</button>
    </form>
    <form class="satir-form" method="post" action="/yonetim/islem">${gizli('reborn-iptal', 'sistem', { grup: v.chat })}<button class="kucuk-dugme">Süren oylamayı iptal et</button></form>
  </article>
  <article class="pano">
    <header><h3>Sıfır atma</h3><span class="etiket">sunucuda, elle</span></header>
    <p>Rakamları 1000'e böler, enflasyonu durdurmaz. Bot <b>kapalıyken</b> sunucuda çalıştırılır, panelden yapılmaz:</p>
    <pre class="kod">node scripts/sifir-at.js            # önizleme
node scripts/sifir-at.js --uygula   # önce yedek alır</pre>
  </article>
</section>`)
}

// Faz 93: uyarılar, grafikler, toplu işlem.

export function uyarilarSayfasi(v) {
  const duzenler = izinVar(v.yonetici.rol, 'ekonomi')
  return kabuk(v, 'uyarilar', 'Uyarılar', h`
<section class="izgara iki">
  <article class="pano">
    <header><h3>📲 Bu cihaza bildirim</h3><span class="etiket">${v.cihaz} cihaz kayıtlı</span></header>
    <p>Bot koptuğunda, enflasyon eşiği aştığında ya da yönetim işi takıldığında telefonuna bildirim gelir. Panel dakikada bir bakar.</p>
    <div id="uyari-cihaz" class="form" data-durum="yok">
      <button type="button" class="birincil uyari-ac" hidden>Bildirimleri aç</button>
      <button type="button" class="kucuk-dugme uyari-kapat" hidden>Bu cihazda kapat</button>
      <p class="kucuk uyari-not">Bildirim için tarayıcı desteği gerekir. iPhone'da önce paneli Ana Ekrana ekle, oradan aç.</p>
    </div>
  </article>
  ${duzenler ? h`<article class="pano ayarlar">${v.ayarlar.map((a) => ayarFormu(a, 'uyarilar'))}</article>` : ''}
</section>
<h2 class="bolum">Son uyarılar</h2>
${v.uyarilar.length ? h`<div class="tablo-kap"><table class="tablo">
<thead><tr><th>Zaman</th><th>Tür</th><th>Uyarı</th></tr></thead>
<tbody>${v.uyarilar.map((u) => h`<tr><td class="nowrap">${zaman(u.zaman)}</td><td class="nowrap">${UYARI_TURLERI[u.tur]?.emoji ?? '⚠️'} ${UYARI_TURLERI[u.tur]?.ad ?? u.tur}</td><td class="metin">${u.metin}</td></tr>`)}</tbody>
</table></div>` : h`<p class="bos">Henüz uyarı yok.</p>`}`)
}

/** Sunucuda çizilen çizgi grafiği. `noktalar`: { etiket, deger } eskiden yeniye. */
function cizgiGrafik(noktalar, { ad, yaz, sinif = '' }) {
  if (noktalar.length < 2) return h`<p class="kucuk">${ad}: en az iki günlük kayıt gerekiyor.</p>`
  const en = 640
  const boy = 220
  const sol = 8
  const sag = en - 92
  const ust = 14
  const alt = boy - 32
  const d = noktalar.map((n) => n.deger)
  const enAz = Math.min(...d, 0)
  const enCok = Math.max(...d) || 1
  const x = (i) => sol + (i / (noktalar.length - 1)) * (sag - sol)
  const y = (v) => alt - ((v - enAz) / (enCok - enAz || 1)) * (alt - ust)
  const yol = noktalar.map((n, i) => `${x(i).toFixed(1)},${y(n.deger).toFixed(1)}`).join(' ')
  const izgara = [0, 0.25, 0.5, 0.75, 1].map((o) => enAz + (enCok - enAz) * o)
  const adim = Math.max(1, Math.ceil(noktalar.length / 6))
  const son = noktalar.at(-1)
  return h`<figure class="grafik ${sinif}"><figcaption><span>${ad}</span><strong>${yaz(son.deger)}</strong></figcaption>
<svg viewBox="0 0 ${en} ${boy}" role="img" aria-label="${ad}: son ${yaz(son.deger)}, en yüksek ${yaz(enCok)}">
  ${izgara.map((v) => h`<line class="g-izgara" x1="${sol}" x2="${sag}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="g-yazi" x="${sag + 8}" y="${(y(v) + 4).toFixed(1)}" font-size="17">${yaz(v)}</text>`)}
  ${noktalar.map((n, i) => (i % adim === 0 || i === noktalar.length - 1 ? h`<text class="g-yazi" x="${x(i).toFixed(1)}" y="${boy - 8}" font-size="17" text-anchor="${i === 0 ? 'start' : i === noktalar.length - 1 ? 'end' : 'middle'}">${n.etiket}</text>` : ''))}
  <polygon class="g-dolgu" points="${sol},${alt} ${yol} ${x(noktalar.length - 1).toFixed(1)},${alt}"/>
  <polyline class="g-hat" fill="none" stroke-width="2.5" points="${yol}"/>
  ${noktalar.map((n, i) => h`<circle class="g-nokta" r="3" cx="${x(i).toFixed(1)}" cy="${y(n.deger).toFixed(1)}"><title>${n.etiket}: ${yaz(n.deger)}</title></circle>`)}
</svg></figure>`
}

/** Günlük değişim çubukları (yüzde): artış ve düşüş ayrı renkte. */
function cubukGrafik(noktalar, { ad }) {
  if (!noktalar.length) return h`<p class="kucuk">${ad}: en az iki günlük kayıt gerekiyor.</p>`
  const en = 640
  const boy = 200
  const sol = 8
  const sag = en - 92
  const ust = 14
  const alt = boy - 32
  const enCok = Math.max(...noktalar.map((n) => Math.abs(n.deger)), 1)
  const orta = (ust + alt) / 2
  const g = (sag - sol) / noktalar.length
  const yuzdeYaz = (v) => `${v < 0 ? '-' : ''}%${Math.abs(Math.round(v)).toLocaleString('tr-TR')}`
  const adim = Math.max(1, Math.ceil(noktalar.length / 6))
  return h`<figure class="grafik"><figcaption><span>${ad}</span><strong>${yuzdeYaz(noktalar.at(-1).deger)}</strong></figcaption>
<svg viewBox="0 0 ${en} ${boy}" role="img" aria-label="${ad}">
  <line class="g-izgara" x1="${sol}" x2="${sag}" y1="${orta}" y2="${orta}"/>
  <text class="g-yazi" x="${sag + 8}" y="${ust + 4}" font-size="17">${yuzdeYaz(enCok)}</text>
  <text class="g-yazi" x="${sag + 8}" y="${orta + 4}" font-size="17">%0</text>
  <text class="g-yazi" x="${sag + 8}" y="${alt + 4}" font-size="17">${yuzdeYaz(-enCok)}</text>
  ${noktalar.map((n, i) => {
    const yuk = (Math.abs(n.deger) / enCok) * (orta - ust)
    return h`<rect class="${n.deger >= 0 ? 'g-artis' : 'g-dusus'}" x="${(sol + i * g + g * 0.15).toFixed(1)}" width="${(g * 0.7).toFixed(1)}" y="${(n.deger >= 0 ? orta - yuk : orta).toFixed(1)}" height="${Math.max(yuk, 0.5).toFixed(1)}"><title>${n.etiket}: ${yuzdeYaz(n.deger)}</title></rect>`
  })}
  ${noktalar.map((n, i) => (i % adim === 0 ? h`<text class="g-yazi" x="${(sol + i * g + g / 2).toFixed(1)}" y="${boy - 8}" font-size="17" text-anchor="${i === 0 ? 'start' : 'middle'}">${n.etiket}</text>` : ''))}
</svg></figure>`
}

const gunEtiketi = (gun) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${gun}T00:00:00Z`))

export function grafikSayfasi(v) {
  const gunler = v.gunler.map((r) => ({ ...r, etiket: gunEtiketi(r.day) }))
  const enflasyon = gunler.slice(1).map((r, i) => ({ etiket: r.etiket, deger: gunler[i].kur ? ((r.kur - gunler[i].kur) / gunler[i].kur) * 100 : 0 }))
  const e = v.grup?.ekonomi
  const hazineli = gunler.filter((r) => r.kasa > 0)
  return kabuk(v, 'grafik', 'Ekonomi grafikleri', h`
${grupSecici(v, '/yonetim/grafik')}
<p class="kucuk">Her nokta günün açılış kaydıdır (günün ilk mesajında yazılır), son 60 gün. Bugünün anlık değerleri: kur ${e ? kisa(e.kur) : '—'}, piyasa ${e ? kisa(e.anlik) : '—'}, hazine ${e ? kisa(e.kasa) : '—'}.</p>
<section class="izgara iki grafikler">
  ${cizgiGrafik(gunler.map((r) => ({ etiket: r.etiket, deger: r.kur })), { ad: 'Coin kuru (XP)', yaz: kisa })}
  ${cubukGrafik(enflasyon, { ad: 'Günlük kur değişimi' })}
  ${cizgiGrafik(gunler.map((r) => ({ etiket: r.etiket, deger: r.arz })), { ad: 'Piyasadaki para (XP)', yaz: kisa, sinif: 'g-mavi' })}
  ${hazineli.length >= 2 ? cizgiGrafik(hazineli.map((r) => ({ etiket: r.etiket, deger: r.kasa })), { ad: 'Hazine (XP)', yaz: kisa, sinif: 'g-sari' }) : h`<p class="kucuk">Hazine grafiği bu sürümden sonraki günlerde dolar.</p>`}
  ${cizgiGrafik(v.maaslar.map((r) => ({ etiket: gunEtiketi(r.day), deger: r.toplam })), { ad: 'Günlük maaş (XP)', yaz: kisa, sinif: 'g-mor' })}
</section>`)
}

export function topluSayfasi(v) {
  return kabuk(v, 'toplu', 'Toplu işlem', h`
${grupSecici(v, '/yonetim/toplu')}
<form class="pano form" method="post" action="/yonetim/islem">${gizli('toplu', 'toplu', { grup: v.chat })}
  <div class="yan-yana">
    <label>Ne<select name="tur"><option value="xp">XP</option><option value="coin">Coin</option><option value="kasa">Kasa</option><option value="anahtar">Anahtar</option></select></label>
    <label>Miktar (eksi alır)<input name="miktar" placeholder="ör. 1 milyon, 5, -2" autocomplete="off" required></label>
    <label>Tier (kasa/anahtar)<select name="tier">${KASALAR.map((k) => h`<option value="${k.tier}">T${k.tier}</option>`)}</select></label>
  </div>
  <fieldset class="secim">
    <legend>Kime</legend>
    <label class="onay"><input type="radio" name="hedef" value="hepsi" checked> Herkes (${v.uyeler.length} kişi, bot hariç)</label>
    <label class="onay"><input type="radio" name="hedef" value="aktif"> Son 7 günde yazanlar</label>
    <label class="onay"><input type="radio" name="hedef" value="secili"> Yalnızca aşağıda seçtiklerim</label>
  </fieldset>
  <details class="uye-secim"><summary>Üye seç (${v.uyeler.length})</summary>
    <div class="uye-kutular">${v.uyeler.map((u) => h`<label class="onay"><input type="checkbox" name="kisiler" value="${u.jid}"> ${adOf(u)} <small>${kisa(u.xp)} XP</small></label>`)}</div>
  </details>
  <p class="kucuk">XP ve coin basılır ya da yanar (hazineden çıkmaz). Kasa ve anahtar haftalık sınırlara sayılmaz. Bakiye sıfırın altına inmez.</p>
  ${onayKutusu('Bu işlemin seçilen herkese uygulanacağını biliyorum')}
  <button class="birincil">Uygula</button>
</form>`)
}
