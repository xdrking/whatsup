// Yönetim panelinin HTML'i (Faz 90). Değerler `h` ile kaçırılır; satır içi stil ve betik yoktur (CSP).
// Kurallar ve yazma lib/ ve panel/yonetim.js'tedir, burada yalnızca çizilir.
import { readFileSync } from 'node:fs'
import { oranYaz } from '../lib/banka.js'
import { fnv1a } from '../lib/hash.js'
import { KASALAR } from '../lib/sandik.js'
import { DUYURU_ARALIGI_MS, DUYURU_AZAMI, IZINLER, izinVar, ROLLER } from '../lib/yonetim.js'
import { h } from './sayfalar.js'

const STIL_SURUMU = fnv1a(readFileSync(new URL('./yonetim.css', import.meta.url), 'utf8'))
const sayi = new Intl.NumberFormat('tr-TR')
const kompakt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
const kisa = (n) => kompakt.format(n).replace(/B$/, 'bin')
const tarih = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const saat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
const zaman = (ms) => (ms ? tarih.format(new Date(ms)) : '—')

const SAYFALAR = [
  { ad: 'gosterge', yol: '/yonetim', baslik: 'Gösterge', ikon: '◉', izin: 'gosterge' },
  { ad: 'duyuru', yol: '/yonetim/duyuru', baslik: 'Duyurular', ikon: '✉', izin: 'duyuru' },
  { ad: 'ekonomi', yol: '/yonetim/ekonomi', baslik: 'Ekonomi', ikon: '₺', izin: 'ekonomi' },
  { ad: 'kasa', yol: '/yonetim/kasa', baslik: 'Kasalar', ikon: '▣', izin: 'kasa' },
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
</head>
<body class="yonetim">${govde}</body>
</html>`.metin
}

function kabuk(v, aktif, baslik, icerik) {
  const { yonetici: y, nabiz } = v
  const rol = ROLLER[y.rol]
  const menu = SAYFALAR.filter((s) => izinVar(y.rol, s.izin))
  const cevrimici = nabiz.cevrimici
  return belge(baslik, h`
<div class="duzen">
  <aside class="yan">
    <a class="marka" href="/yonetim"><span class="marka-isaret" aria-hidden="true"></span><span>Kontrol<b>Odası</b></span></a>
    <nav aria-label="Yönetim">${menu.map((s) => h`<a href="${s.yol}"${s.ad === aktif ? h` class="secili" aria-current="page"` : ''}><span class="ikon" aria-hidden="true">${s.ikon}</span>${s.baslik}</a>`)}</nav>
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
const IS_ADI = { duyuru: '📢 Duyuru', kasa_dagit: '🎁 Kasa dağıtımı' }

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
  <td class="nowrap">${zaman(i.zaman)}</td><td>${adlar.get(i.chat_jid) ?? i.chat_jid}</td><td class="nowrap">${IS_ADI[i.tur] ?? i.tur}</td>
  <td class="metin">${veri.metin ?? ''}${i.sonuc ? h`<small>${i.sonuc}</small>` : ''}</td>
  <td>${durumRozeti(i.durum)}</td>
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
<tbody>${KASALAR.map((k) => h`<tr><td>T${k.tier}</td><td>${k.ad}</td><td>${k.fiyat} coin</td><td>${k.anahtar} coin</td></tr>`)}</tbody>
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
  return kabuk(v, 'kayit', 'Kayıt defteri', v.kayitlar.length ? kayitTablosu(v.kayitlar) : h`<p class="bos">Henüz kayıt yok.</p>`)
}

export const yasakSayfasi = (v) => kabuk(v, '', 'Yetki yok', h`<p class="bos">Bu sayfa için rolün yetmiyor.</p>`)
