// Yönetim paneli (Faz 90): `/yonetim` yolları. Giriş bot sahibinin `.yonetim kod` ile verdiği tek kullanımlık
// kodladır, oturum ayrı çerezdedir ve oyuncu ya da eski panel oturumuyla karışmaz. Her işlem rolün izniyle denetlenir
// ve kayıt defterine yazılır. Kural kopyalanmaz: işlemler komutların çağırdığı lib/ fonksiyonlarını çağırır.
import { createReadStream, readFileSync } from 'node:fs'
import path from 'node:path'
import { ASGARI_FAIZ, AZAMI_FAIZ, faizOranCoz, oranYaz } from '../lib/banka.js'
import { AYARLAR, ayarListesi, ayarYaz } from '../lib/ayarlar.js'
import logger from '../lib/logger.js'
import { kasaBul } from '../lib/sandik.js'
import { binlik, miktarlariCoz } from '../lib/sayi.js'
import { uyeler as grupUyeleri } from '../lib/sosyal.js'
import {
  ambargoKaldir, coinAyarla, darbeBitir, ekonomiDurumu, faizDurumu, faizKarari, hapistenCikar, hapistekiler, kayyumAta,
  kayyumKaldir, rebornOnizle, sandikVer, secimDurumu, secimIptal, servetDurumu, tesvikDagit, unvanAyarla, uyeDurumu, xpAyarla,
} from '../lib/stats.js'
import { makamKoduyla } from '../lib/devlet.js'
import { getDb } from '../lib/db.js'
import { HEPSI, KILITLENMEZ, kilitler, kilitYaz } from '../lib/komutKilit.js'
import { panelUyeCikar } from '../lib/panelHesap.js'
import { sahipKimlikleri, sansAc, sansKapat, sansKisileri } from '../lib/sahipSans.js'
import { acikHikayeler, ENGEL_AZAMI_SAAT, engelKaldir, engelliler, engelYaz, gonderiSil, hikayeKaldir, katla, sonGonderiler, sonYorumlar, yorumSil } from '../lib/sosyal.js'
import { loadCommands } from '../commands/index.js'
import { panelOyunlari } from './oyunSayfalari.js'
import {
  DUYURU_AZAMI, ZAMANLAMA_AZAMI_MS, duyuruBekleme, isEkle, isIptal, isler, izinVar, kayitlar, kayitYaz, kodlaGir, NABIZ_ESIGI_MS, nabizOku,
  oturumYoneticisi, ROLLER, yoneticiBul, yoneticiGuncelle, yoneticiListesi,
} from '../lib/yonetim.js'
import { oturumlar } from './guvenlik.js'
import { hazineyiTani } from './kumar.js'
import { elleYedekAl, yedekListesi, yedekYolu } from './yedek.js'
import {
  devletSayfasi, duyuruSayfasi, sistemSayfasi, sosyalSayfasi, ekonomiSayfasi, gostergeSayfasi, gruplarSayfasi, kasaSayfasi, kayitSayfasi,
  kumarhaneSayfasi, uyelerSayfasi, uyeSayfasi, YONETIM_SAYFALARI, yasakSayfasi, yoneticilerSayfasi, yonetimGiris,
} from './yonetimSayfalari.js'

const CEREZ = '__Host-yonetim'
// Yönetim oturumu kısadır: açık kalan bir tarayıcı ekonomiye günlerce dokunabilmesin.
const OTURUM_MS = 12 * 60 * 60_000
const STIL = readFileSync(new URL('./yonetim.css', import.meta.url))
const tarihYaz = (x) => new Date(x).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Formdaki `datetime-local` değeri İstanbul saatidir (+03:00, Türkiye yaz saati uygulamıyor). Boşsa null (hemen).
 * @returns {number | { hata: string } | null}
 */
function zamanCoz(deger, simdi) {
  const d = String(deger ?? '').trim()
  if (!d) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d)) return { hata: 'Tarih ve saat anlaşılmadı.' }
  const ms = Date.parse(`${d}:00+03:00`)
  if (!Number.isFinite(ms) || ms <= simdi + 60_000) return { hata: 'Zaman ileri bir an olmalı (en az 1 dakika sonra).' }
  if (ms > simdi + ZAMANLAMA_AZAMI_MS) return { hata: 'En çok 30 gün sonrasına kurulur.' }
  return ms
}

async function elleYedek(ortam, simdi) {
  if (!ortam.db || !ortam.yedekKlasoru) return null
  try {
    return await elleYedekAl(ortam.db, ortam.yedekKlasoru, new Date(simdi))
  } catch (err) {
    logger.error({ err }, 'Elle yedek alınamadı')
    return null
  }
}

// İki işlem arası: form iki kez gönderilmesin.
const ISLEM_ARALIK_MS = 700

const cerez = (deger, saniye) => `${CEREZ}=${deger}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${saniye}`
function cerezOku(req) {
  for (const parca of String(req.headers.cookie ?? '').split(';')) {
    const [ad, deger] = parca.trim().split('=')
    if (ad === CEREZ) return deger
  }
  return ''
}

const SAYFA_CIZIMI = {
  gosterge: gostergeSayfasi, duyuru: duyuruSayfasi, ekonomi: ekonomiSayfasi, kasa: kasaSayfasi, uyeler: uyelerSayfasi,
  uye: uyeSayfasi, devlet: devletSayfasi, sosyal: sosyalSayfasi, sistem: sistemSayfasi, kumarhane: kumarhaneSayfasi, gruplar: gruplarSayfasi,
  yoneticiler: yoneticilerSayfasi, kayit: kayitSayfasi,
}

/** Formdaki tutar: "50 milyon", "-5m", "1.000.000". */
function tutarCoz(metin) {
  const ham = String(metin ?? '').trim()
  const eksi = ham.startsWith('-')
  const [n] = miktarlariCoz(ham.replace(/^[-+]\s*/, '').split(/\s+/).filter(Boolean))
  const sayi = /^\d+$/.test(n ?? '') ? Number(n) : NaN
  return Number.isSafeInteger(sayi) && sayi > 0 ? (eksi ? -sayi : sayi) : null
}

/**
 * İşlemler: `izin` rolün yapabileceğidir, `yap` sonucu `{ tamam }` ya da `{ hata }` döner ve kayıt defterine
 * yazılacak `kayit` metnini taşır. Gruplu işlemler yalnızca panelin bildiği gruplara yapılır (`grupVar`).
 */
const ISLEMLER = {
  duyuru: {
    izin: 'duyuru', grup: true,
    yap({ y, f, chat, simdi }) {
      const metin = String(f.get('metin') ?? '').replace(/\r\n/g, '\n').trim()
      if (!metin) return { hata: 'Metin boş.' }
      if (metin.length > DUYURU_AZAMI) return { hata: `Metin en çok ${DUYURU_AZAMI} karakter.` }
      const etiket = f.get('etiket') === '1'
      const zamanlama = zamanCoz(f.get('zaman'), simdi)
      if (zamanlama?.hata) return zamanlama
      const s = isEkle({ chatJid: chat, tur: 'duyuru', veri: { metin, etiket }, yoneticiId: y.id, now: simdi, calisma: zamanlama ?? simdi })
      if (!s) return { hata: 'Sıraya konamadı.' }
      if (s.bekle) return { hata: `Bu gruba 10 dakika içinde başka duyuru var. ${tarihYaz(s.bekle)} sonrası tekrar dene.` }
      if (s.cakisma) return { hata: `O saate 10 dakikadan yakın başka bir duyuru kurulu (${tarihYaz(s.cakisma)}). Başka saat seç.` }
      const ne = zamanlama ? `${tarihYaz(zamanlama)} için zamanlandı` : 'sıraya kondu, bot birkaç saniyede gönderir'
      return { tamam: `Duyuru ${ne}.`, kayit: `${zamanlama ? `${tarihYaz(zamanlama)} · ` : ''}${etiket ? 'etiketli' : 'etiketsiz'} · ${metin.slice(0, 120)}` }
    },
  },
  'is-iptal': {
    izin: 'duyuru',
    yap({ f }) {
      const id = Number(f.get('id'))
      return isIptal(id) ? { tamam: 'İş iptal edildi.', kayit: `#${id}` } : { hata: 'İş çoktan işlendi ya da yok.' }
    },
  },
  faiz: {
    izin: 'ekonomi', grup: true,
    yap({ f, chat }) {
      const oran = faizOranCoz(f.get('oran'))
      if (oran === null) return { hata: `Oran ${ASGARI_FAIZ} ile ${AZAMI_FAIZ} arasında, en çok 2 ondalık olmalı.` }
      const s = faizKarari({ chatJid: chat, oran })
      if (!s) return { hata: 'Faiz kararı yazılamadı.' }
      return { tamam: `Banka faizi %${oranYaz(s.once)} → %${oranYaz(s.banka)}, kredi %${oranYaz(s.kredi)}.`, kayit: `%${oranYaz(s.once)} → %${oranYaz(s.banka)}` }
    },
  },
  tesvik: {
    izin: 'ekonomi', grup: true, onay: true,
    yap({ f, chat }) {
      const miktar = tutarCoz(f.get('miktar'))
      if (!miktar || miktar < 0) return { hata: 'Geçerli bir XP tutarı yaz.' }
      const s = tesvikDagit({ chatJid: chat, uyeler: grupUyeleri(chat).map((u) => u.jid), miktar })
      if (!s || s.kapali) return { hata: 'Hazine kapalı: bot henüz tanınmadı.' }
      if (s.yetersiz) return { hata: `Hazinede ${binlik(s.kasa)} XP var.` }
      if (s.kimseYok) return { hata: 'Son 7 günde yazan üye yok ya da pay 1 XP\'yi bulmuyor.' }
      return { tamam: `${s.kisi} kişiye ${binlik(s.pay)} XP verildi. Hazinede ${binlik(s.kasa)} XP kaldı.`, kayit: `${binlik(s.toplam)} XP, ${s.kisi} kişi` }
    },
  },
  xp: {
    izin: 'ekonomi', grup: true, onay: true, kisi: true,
    yap({ f, chat, kisi }) {
      const miktar = tutarCoz(f.get('miktar'))
      if (!miktar) return { hata: 'Geçerli bir tutar yaz (eksi alır).' }
      const s = xpAyarla({ chatJid: chat, userJid: kisi.jid, miktar })
      if (!s) return { hata: 'XP yazılamadı.' }
      return { tamam: `${kisi.ad}: ${binlik(s.once)} → ${binlik(s.xp)} XP.`, kayit: `${kisi.ad} · ${miktar > 0 ? '+' : ''}${binlik(miktar)} XP (${binlik(s.once)} → ${binlik(s.xp)})` }
    },
  },
  coin: {
    izin: 'ekonomi', grup: true, onay: true, kisi: true,
    yap({ f, chat, kisi }) {
      const adet = /^[+-]?\d{1,9}$/.test(String(f.get('miktar') ?? '').trim()) ? Number(f.get('miktar')) : 0
      if (!adet) return { hata: 'Geçerli bir coin adedi yaz (eksi alır).' }
      const s = coinAyarla({ chatJid: chat, userJid: kisi.jid, adet })
      if (!s) return { hata: 'Coin yazılamadı.' }
      return { tamam: `${kisi.ad}: ${binlik(s.once)} → ${binlik(s.bakiye)} coin.`, kayit: `${kisi.ad} · ${adet > 0 ? '+' : ''}${adet} coin (${s.once} → ${s.bakiye})` }
    },
  },
  ayar: {
    izin: 'ekonomi',
    yap({ f }) {
      const anahtar = String(f.get('anahtar') ?? '')
      const tanim = Object.hasOwn(AYARLAR, anahtar) ? AYARLAR[anahtar] : null
      // Kasa ayarları kasa iznine, öbürleri ekonomi iznine bağlıdır; ikisi de şimdilik aynı rollerde.
      const s = ayarYaz(anahtar, f.get('deger'))
      if (s.hata) return s
      return { tamam: `${tanim.ad}: ${s.once} → ${s.deger}`, kayit: `${tanim.ad}: ${s.once} → ${s.deger}` }
    },
  },
  'kasa-ver': {
    izin: 'kasa', grup: true, kisi: true,
    yap({ f, chat, kisi }) {
      const tur = f.get('tur') === 'anahtar' ? 'anahtar' : 'kasa'
      const kasa = kasaBul(f.get('tier'))
      const adet = /^-?\d{1,3}$/.test(String(f.get('miktar') ?? '').trim()) ? Number(f.get('miktar')) : 0
      if (!kasa || !adet) return { hata: 'Tier ve adet geçerli olmalı.' }
      const s = sandikVer({ chatJid: chat, userJid: kisi.jid, tur, tier: kasa.tier, adet })
      if (!s || s.yok) return { hata: 'Yazılamadı.' }
      const ad = `T${kasa.tier} ${tur === 'kasa' ? 'kasa' : 'anahtar'}`
      return { tamam: `${kisi.ad}: ${ad} ${s.once} → ${s.adet}.`, kayit: `${kisi.ad} · ${adet > 0 ? '+' : ''}${adet} ${ad}` }
    },
  },
  'kasa-dagit': {
    izin: 'kasa', grup: true, onay: true,
    yap({ y, chat }) {
      const s = isEkle({ chatJid: chat, tur: 'kasa_dagit', veri: {}, yoneticiId: y.id })
      return s ? { tamam: 'Kasa yağmuru sıraya kondu, bot birkaç saniyede dağıtır.', kayit: 'herkese 1 kasa' } : { hata: 'Sıraya konamadı.' }
    },
  },
  // Faz 91: üyeler. Susturma bot belleğinde de durduğu için iş kuyruğundan gider (lib/yonetimIs.js).
  sustur: {
    izin: 'moderasyon', grup: true, kisi: true,
    yap({ y, f, chat, kisi }) {
      const dakika = String(f.get('dakika') ?? '').trim()
      const dk = dakika ? Number(dakika) : 0
      if (!Number.isInteger(dk) || dk < 0 || dk > 7 * 24 * 60) return { hata: 'Süre 0 ile 10080 dakika arasında olmalı (0 = kaldırılana kadar).' }
      const s = isEkle({ chatJid: chat, tur: 'sustur', veri: { kisi: kisi.jid, dakika: dk }, yoneticiId: y.id })
      return s ? { tamam: `${kisi.ad} susturuluyor, bot birkaç saniyede işler.`, kayit: `${kisi.ad} · ${dk ? `${dk} dk` : 'süresiz'}` } : { hata: 'Sıraya konamadı.' }
    },
  },
  'sustur-kaldir': {
    izin: 'moderasyon', grup: true, kisi: true,
    yap({ y, chat, kisi }) {
      const s = isEkle({ chatJid: chat, tur: 'sustur_kaldir', veri: { kisi: kisi.jid }, yoneticiId: y.id })
      return s ? { tamam: `${kisi.ad}'nin susturması kalkıyor.`, kayit: kisi.ad } : { hata: 'Sıraya konamadı.' }
    },
  },
  'hapis-cikar': {
    izin: 'uyeDuzelt', grup: true, kisi: true,
    yap({ chat, kisi }) {
      const s = hapistenCikar({ chatJid: chat, userJid: kisi.jid })
      return s ? { tamam: `${kisi.ad} hapisten çıktı.`, kayit: kisi.ad } : { hata: s === false ? 'Hapiste değil.' : 'Yazılamadı.' }
    },
  },
  'ambargo-kaldir': {
    izin: 'uyeDuzelt', grup: true, kisi: true,
    yap({ chat, kisi }) {
      const s = ambargoKaldir({ chatJid: chat, userJid: kisi.jid })
      return s ? { tamam: `${kisi.ad}'nin ambargosu kalktı.`, kayit: kisi.ad } : { hata: s === false ? 'Ambargosu yok.' : 'Yazılamadı.' }
    },
  },
  unvan: {
    izin: 'uyeDuzelt', grup: true, kisi: true,
    yap({ f, chat, kisi }) {
      const unvan = String(f.get('unvan') ?? '').trim().slice(0, 40)
      const s = unvanAyarla({ chatJid: chat, userJid: kisi.jid, unvan })
      if (!s) return { hata: 'Yazılamadı.' }
      return { tamam: unvan ? `${kisi.ad} artık "${unvan}".` : `${kisi.ad}'nin unvanı kaldırıldı.`, kayit: `${kisi.ad}: ${s.once ?? '—'} → ${unvan || '—'}` }
    },
  },
  'panel-kapat': {
    izin: 'uyeDuzelt', grup: true, kisi: true,
    yap({ chat, kisi }) {
      panelUyeCikar(chat, [kisi.jid])
      return { tamam: `${kisi.ad}'nin bu gruptaki panel hesabı kapandı. Yeniden açmak için bota .panel kayıt yazar.`, kayit: kisi.ad }
    },
  },
  // Devlet.
  kayyum: {
    izin: 'devlet', grup: true, kisi: true,
    yap({ f, chat, kisi }) {
      const makam = makamKoduyla(f.get('makam'))
      if (!makam?.yetki) return { hata: 'Bakanlık seç; başkanlığa kayyum atanmaz.' }
      const s = kayyumAta({ chatJid: chat, makam: makam.kod, hedef: kisi.jid })
      if (!s || s.degil) return { hata: 'Atanamadı.' }
      if (s.zaten) return { hata: 'Zaten kayyum.' }
      return { tamam: `${makam.ad}: ${kisi.ad} kayyum olarak atandı${s.iptal ? ', açık seçim iptal edildi' : ''}.`, kayit: `${makam.ad} → ${kisi.ad}` }
    },
  },
  'kayyum-kaldir': {
    izin: 'devlet', grup: true,
    yap({ f, chat }) {
      const makam = makamKoduyla(f.get('makam'))
      const s = makam && kayyumKaldir({ chatJid: chat, makam: makam.kod })
      if (!s || s.kayyumYok) return { hata: 'Bu makamda kayyum yok.' }
      return { tamam: `${makam.ad}: kayyum kalktı, seçim açıldı.`, kayit: makam.ad }
    },
  },
  'secim-iptal': {
    izin: 'devlet', grup: true,
    yap({ f, chat }) {
      const makam = makamKoduyla(f.get('makam'))
      const s = makam && secimIptal({ chatJid: chat, makam: makam.kod })
      if (!s) return { hata: 'Bu makamda açık seçim yok.' }
      return { tamam: `${makam.ad} seçimi iptal edildi, ücretler yandı.`, kayit: makam.ad }
    },
  },
  'darbe-bitir': {
    izin: 'darbe', grup: true,
    yap({ chat }) {
      const s = darbeBitir({ chatJid: chat })
      return s ? { tamam: 'Darbe bitti, bütün seçimler yeniden açıldı.', kayit: '' } : { hata: s === false ? 'Bu grupta darbe yok.' : 'Yazılamadı.' }
    },
  },
  darbe: {
    izin: 'darbe', grup: true,
    yap({ y, f, chat }) {
      if (String(f.get('onay') ?? '').trim().toLocaleUpperCase('tr') !== 'ONAYLIYORUM') return { hata: 'Onay için ONAYLIYORUM yaz.' }
      const s = isEkle({ chatJid: chat, tur: 'darbe', veri: {}, yoneticiId: y.id })
      return s ? { tamam: 'Darbe sıraya kondu, bot birkaç saniyede başlatır.', kayit: '' } : { hata: 'Sıraya konamadı.' }
    },
  },
  // Gruplar ve kumarhane.
  sus: {
    izin: 'gruplar', grup: true,
    yap({ y, chat }) {
      return isEkle({ chatJid: chat, tur: 'sus', veri: {}, yoneticiId: y.id }) ? { tamam: 'Susturma sıraya kondu, bot birkaç saniyede susar.', kayit: '' } : { hata: 'Sıraya konamadı.' }
    },
  },
  konus: {
    izin: 'gruplar', grup: true,
    yap({ y, chat }) {
      return isEkle({ chatJid: chat, tur: 'konus', veri: {}, yoneticiId: y.id }) ? { tamam: 'Sıraya kondu, bot birkaç saniyede yeniden konuşur.', kayit: '' } : { hata: 'Sıraya konamadı.' }
    },
  },
  kilit: {
    // Bütün grupların kilidi kumarhane iznindedir, tek grubunki gruplar izninde; ikisi de şimdilik aynı rollerde.
    izin: 'gruplar',
    yap({ f, gruplarVar }) {
      const kapsam = String(f.get('kapsam') ?? '')
      if (kapsam !== HEPSI && !gruplarVar(kapsam)) return { hata: 'Grup bulunamadı.' }
      const komut = String(f.get('komut') ?? '').trim().replace(/^\./, '')
      if (!/^(panel:)?[\p{L}\d]{1,30}$/u.test(komut) || KILITLENMEZ.has(komut)) return { hata: 'Bu komut kilitlenemez.' }
      const kapali = f.get('durum') === 'kapat'
      if (!kilitYaz(kapsam, komut, kapali)) return { hata: kapali ? 'Zaten bakımdaydı.' : 'Zaten açıktı.' }
      const ad = komut.startsWith('panel:') ? `panel ${komut.slice(6)}` : `.${komut}`
      return { tamam: `${ad} ${kapali ? 'bakıma alındı' : 'açıldı'}${kapsam === HEPSI ? ' (bütün gruplar)' : ''}. Bota en geç 10 sn'de geçer.`, kayit: `${ad} ${kapali ? 'kapalı' : 'açık'} · ${kapsam === HEPSI ? 'hepsi' : kapsam}` }
    },
  },
  sans: {
    izin: 'sans',
    yap({ f }) {
      if (f.get('durum') === 'ac') {
        if (!sahipKimlikleri().length) return { hata: ".env'de OWNER_NUMBER ya da OWNER_LID yok, şans kime açılacağını bilmiyor." }
        const { kapatilan } = sansAc([])
        return { tamam: `Şansın açık${kapatilan.length ? `, ${kapatilan.length} kişinin şansı kapatıldı` : ''}.`, kayit: 'açık' }
      }
      sansKapat()
      return { tamam: 'Şansın kapalı, normal oynuyorsun.', kayit: 'kapalı' }
    },
  },
  // Faz 92: sosyal moderasyon.
  'gonderi-sil': {
    izin: 'moderasyon', grup: true,
    yap({ f, chat }) {
      const id = Number(f.get('id'))
      return gonderiSil(chat, '', id, { zorla: true }) ? { tamam: 'Gönderi silindi.', kayit: `#${id}` } : { hata: 'Gönderi bulunamadı.' }
    },
  },
  'yorum-sil': {
    izin: 'moderasyon', grup: true,
    yap({ f, chat }) {
      const id = Number(f.get('id'))
      return yorumSil(chat, '', id, { zorla: true }) ? { tamam: 'Yorum silindi.', kayit: `#${id}` } : { hata: 'Yorum bulunamadı.' }
    },
  },
  'hikaye-sil': {
    izin: 'moderasyon', grup: true,
    yap({ f, chat }) {
      const id = Number(f.get('id'))
      return hikayeKaldir(chat, id) ? { tamam: 'Hikâye silindi.', kayit: `#${id}` } : { hata: 'Hikâye bulunamadı.' }
    },
  },
  engel: {
    izin: 'moderasyon', grup: true, kisi: true,
    yap({ f, chat, kisi, simdi }) {
      const saat = Number(f.get('saat'))
      if (!Number.isInteger(saat) || saat < 1 || saat > ENGEL_AZAMI_SAAT) return { hata: `Süre 1 ile ${ENGEL_AZAMI_SAAT} saat arasında olmalı.` }
      const bitis = engelYaz(chat, kisi.jid, saat, simdi)
      return { tamam: `${kisi.ad} ${tarihYaz(bitis)} tarihine kadar sosyal bölümde yazamaz.`, kayit: `${kisi.ad} · ${saat} saat` }
    },
  },
  'engel-kaldir': {
    izin: 'moderasyon', grup: true, kisi: true,
    yap({ chat, kisi }) {
      return engelKaldir(chat, kisi.jid) ? { tamam: `${kisi.ad}'nin engeli kalktı.`, kayit: kisi.ad } : { hata: 'Engeli yok.' }
    },
  },
  // Sistem: yalnızca sahip.
  'yedek-al': {
    izin: 'sistem',
    async yap({ ortam, simdi }) {
      const ad = await elleYedek(ortam, simdi)
      return ad ? { tamam: `Yedek alındı: ${ad}`, kayit: ad } : { hata: 'Yedek alınamadı.' }
    },
  },
  reborn: {
    izin: 'sistem', grup: true,
    yap({ y, f, chat }) {
      if (String(f.get('onay') ?? '').trim().toLocaleUpperCase('tr') !== 'ONAYLIYORUM') return { hata: 'Onay için ONAYLIYORUM yaz.' }
      return isEkle({ chatJid: chat, tur: 'reborn', veri: {}, yoneticiId: y.id }) ? { tamam: 'Reborn oylaması sıraya kondu, bot birkaç saniyede başlatır.', kayit: '' } : { hata: 'Sıraya konamadı.' }
    },
  },
  'reborn-iptal': {
    izin: 'sistem', grup: true,
    yap({ y, chat }) {
      return isEkle({ chatJid: chat, tur: 'reborn_iptal', veri: {}, yoneticiId: y.id }) ? { tamam: 'Oylamanın iptali sıraya kondu.', kayit: '' } : { hata: 'Sıraya konamadı.' }
    },
  },
  'yonetici-rol': {
    izin: 'yoneticiler',
    yap({ f }) {
      const hedef = yoneticiBul(Number(f.get('id')))
      const rol = f.get('rol')
      if (!hedef || hedef.rol === 'sahip' || !['yonetici', 'moderator'].includes(rol)) return { hata: 'Bu kişinin rolü değiştirilemez.' }
      if (hedef.rol === rol) return { hata: 'Rol zaten bu.' }
      yoneticiGuncelle({ id: hedef.id, rol })
      return { tamam: `${hedef.ad} artık ${ROLLER[rol].ad}. Oturumu düştü, yeniden girmesi için yeni kod ver.`, kayit: `${hedef.ad}: ${ROLLER[hedef.rol].ad} → ${ROLLER[rol].ad}` }
    },
  },
  'yonetici-kapat': {
    izin: 'yoneticiler',
    yap({ f }) {
      const hedef = yoneticiBul(Number(f.get('id')))
      if (!hedef || hedef.rol === 'sahip') return { hata: 'Sahibin erişimi kapatılamaz.' }
      yoneticiGuncelle({ id: hedef.id, aktif: false })
      return { tamam: `${hedef.ad}'nin erişimi kapandı.`, kayit: hedef.ad }
    },
  },
}

// Bot susturmayı belleğinde de tuttuğu için panel kendi önbelleğine değil, doğrudan tabloya bakar.
const tum = (sql, ...p) => {
  try {
    return getDb()?.prepare(sql).all(...p) ?? []
  } catch (err) {
    logger.error({ err }, 'Yönetim sorgusu başarısız')
    return []
  }
}
const susturulanlar = (chat) => tum('SELECT user_jid, bitis FROM susturulan_uye WHERE chat_jid = ? AND (bitis = 0 OR bitis > ?)', chat, Date.now())
const suskunGruplar = () => new Set(tum('SELECT chat_jid FROM muted_chats').map((r) => r.chat_jid))
const envanter = (chat, jid) => tum('SELECT tur, tier, adet FROM sandik WHERE chat_jid = ? AND user_jid = ? AND adet > 0 ORDER BY tur, tier', chat, jid)

// Komut listesi bir kez yüklenir: panel `commands/` klasörünü botla aynı yoldan tarar, yalnızca ad ve kategori kullanır.
let komutlarSozu = null
function komutListesi() {
  komutlarSozu ??= loadCommands().then((m) => [...new Set(m.values())]
    .filter((k) => !k.hidden && !KILITLENMEZ.has(k.name))
    .map((k) => ({ ad: k.name, kategori: k.category, aciklama: k.description }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr')))
  return komutlarSozu
}

export function yonetimMotoru({ depo = null, saat = Date.now, veri, yedekKlasoru = '' } = {}) {
  const ortam = { db: veri?.db, yedekKlasoru }
  const oturum = oturumlar({ depo, sure: OTURUM_MS, saat })
  const bildirimler = new Map()
  const sonIslem = new Map()

  const gruplar = () => veri.gruplar()
  const nabiz = () => {
    const son = nabizOku()
    return { son, cevrimici: Boolean(son) && saat() - son < NABIZ_ESIGI_MS }
  }

  function grupBilgisi(g) {
    return { ...g, ekonomi: ekonomiDurumu({ chatJid: g.chat_jid }), faiz: faizDurumu(g.chat_jid), duyuruBekleme: duyuruBekleme(g.chat_jid, saat()) }
  }

  async function sayfaVerisi(y, ad, url) {
    const liste = gruplar()
    const istenen = url.searchParams.get('grup')
    const chat = liste.some((g) => g.chat_jid === istenen) ? istenen : liste[0]?.chat_jid ?? ''
    const b = bildirimler.get(y.id) ?? null
    bildirimler.delete(y.id)
    const v = { yonetici: y, nabiz: nabiz(), gruplar: liste, chat, bildirim: b }
    if (ad === 'gosterge') {
      return { ...v, gruplar: liste.map(grupBilgisi), isler: isler({ adet: 50 }), kayitlar: izinVar(y.rol, 'kayit') ? kayitlar(8) : [], yoneticiSayisi: yoneticiListesi().filter((x) => x.aktif).length }
    }
    if (ad === 'duyuru') return { ...v, isler: isler({ adet: 40 }), duyuruBekleme: chat ? duyuruBekleme(chat, saat()) : 0 }
    if (ad === 'ekonomi' || ad === 'kasa') {
      const g = liste.find((x) => x.chat_jid === chat)
      return {
        ...v, grup: g ? grupBilgisi(g) : null, uyeler: chat ? grupUyeleri(chat) : [],
        ayarlar: { ekonomi: ayarListesi('ekonomi'), kasa: ayarListesi('kasa') },
      }
    }
    if (ad === 'yoneticiler') return { ...v, yoneticiler: yoneticiListesi() }
    if (ad === 'kayit') return { ...v, kayitlar: kayitlar(200) }
    if (ad === 'uyeler') {
      const ara = String(url.searchParams.get('ara') ?? '').trim().slice(0, 40)
      const hepsi = chat ? grupUyeleri(chat) : []
      return {
        ...v, ara, toplam: hepsi.length,
        uyeler: ara ? hepsi.filter((u) => katla(u.ad || u.jid).includes(katla(ara)) || u.jid.includes(ara)) : hepsi,
        susturulan: new Map(susturulanlar(chat).map((r) => [r.user_jid, r.bitis])),
        hapiste: new Set(chat ? hapistekiler(chat, saat()).map((r) => r.user_jid) : []),
      }
    }
    if (ad === 'uye') {
      const kisi = chat && grupUyeleri(chat).find((u) => u.jid === url.searchParams.get('id'))
      if (!kisi) return { ...v, kisi: null }
      return {
        ...v, kisi,
        servet: servetDurumu({ chatJid: chat, userJid: kisi.jid, now: saat() }),
        durum: uyeDurumu({ chatJid: chat, userJid: kisi.jid, now: saat() }),
        susturma: susturulanlar(chat).find((r) => r.user_jid === kisi.jid) ?? null,
        envanter: envanter(chat, kisi.jid),
      }
    }
    if (ad === 'devlet') {
      return { ...v, secim: chat ? secimDurumu({ chatJid: chat, userJid: '', now: saat() }) : null, uyeler: chat ? grupUyeleri(chat) : [] }
    }
    if (ad === 'sosyal') {
      const adlar = new Map((chat ? grupUyeleri(chat) : []).map((u) => [u.jid, u.ad || u.jid.split('@')[0]]))
      return {
        ...v, adlar, uyeler: chat ? grupUyeleri(chat) : [],
        gonderiler: chat ? sonGonderiler(chat) : [], yorumlar: chat ? sonYorumlar(chat) : [],
        hikayeler: chat ? acikHikayeler(chat) : [], engelliler: chat ? engelliler(chat, saat()) : [],
      }
    }
    if (ad === 'sistem') {
      const db = ortam.db
      return {
        ...v, adlar: new Map((chat ? grupUyeleri(chat) : []).map((u) => [u.jid, u.ad || u.jid.split('@')[0]])),
        yedekler: ortam.yedekKlasoru ? yedekListesi(ortam.yedekKlasoru) : [],
        dbBoyut: db ? db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true }) : 0,
        reborn: chat ? rebornOnizle({ chatJid: chat, now: saat() }) : null,
        rebornIsleri: isler({ adet: 10 }).filter((i) => i.tur.startsWith('reborn')),
      }
    }
    if (ad === 'kumarhane') {
      return { ...v, kilitler: kilitler(), komutlar: (await komutListesi()).filter((k) => k.kategori === 'kumar'), panelOyunlari: panelOyunlari(), sansAcik: sansKisileri().length > 0 }
    }
    if (ad === 'gruplar') {
      return { ...v, kilitler: kilitler(), komutlar: await komutListesi(), panelOyunlari: panelOyunlari(), suskun: suskunGruplar() }
    }
    return v
  }

  /** Bir işlem; sonucu bir kez gösterilecek bildirime yazar. */
  async function islem(y, f) {
    const ad = String(f.get('islem') ?? '')
    const t = Object.hasOwn(ISLEMLER, ad) ? ISLEMLER[ad] : null
    const sonuc = await (async () => {
      if (!t) return { hata: 'Bilinmeyen işlem.' }
      if (!izinVar(y.rol, t.izin)) return { hata: 'Bu işlem için rolün yetmiyor.' }
      const simdi = saat()
      if (simdi - (sonIslem.get(y.id) ?? 0) < ISLEM_ARALIK_MS) return { hata: 'Çok hızlı, bir saniye bekle.' }
      sonIslem.set(y.id, simdi)
      if (t.onay && f.get('onay') !== '1') return { hata: 'Onay kutusunu işaretle.' }
      const chat = String(f.get('grup') ?? '')
      if (t.grup && !gruplar().some((g) => g.chat_jid === chat)) return { hata: 'Grup bulunamadı.' }
      let kisi = null
      if (t.kisi) {
        kisi = grupUyeleri(chat).find((u) => u.jid === f.get('kisi'))
        if (!kisi) return { hata: 'Üye bulunamadı.' }
        kisi = { jid: kisi.jid, ad: kisi.ad || kisi.jid.split('@')[0] }
      }
      // Tesvik ve kasa dağıtımı hazineyi bilmeli: bot kimliği her işlemde tanınır.
      hazineyiTani()
      return t.yap({ y, f, chat, kisi, simdi, ortam, gruplarVar: (c) => gruplar().some((g) => g.chat_jid === c) })
    })()
    bildirimler.set(y.id, sonuc.hata ? { hata: sonuc.hata } : { tamam: sonuc.tamam })
    if (!sonuc.hata) {
      const grup = gruplar().find((g) => g.chat_jid === f.get('grup'))
      kayitYaz(y, ad, `${grup ? `[${grup.ad || grup.chat_jid}] ` : ''}${sonuc.kayit ?? ''}`, saat())
      logger.info({ yonetici: y.id, islem: ad }, 'Yönetim işlemi')
    }
    return sonuc
  }

  return { oturum, sayfaVerisi, islem, nabiz, ortam }
}

/**
 * `/yonetim` ve altındaki yolları işler; işlemediyse false döner. `ortak` sunucunun yardımcılarıdır
 * (gonder, yonlendir, govdeOku, sinir, istemciIp, bekleMetni).
 */
export async function yonetimIsle({ req, res, url, yontem, motor, ortak }) {
  const yol = url.pathname
  if (yol !== '/yonetim' && !yol.startsWith('/yonetim/') && yol !== '/yonetim.css') return false
  const { gonder, yonlendir, govdeOku } = ortak

  if (yol === '/yonetim.css') {
    gonder(res, 200, STIL, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
    return true
  }

  const jeton = cerezOku(req)
  const y = oturumYoneticisi(motor.oturum.veri(jeton))

  if (yol === '/yonetim/giris') {
    if (yontem === 'GET') {
      if (y) yonlendir(res, '/yonetim')
      else gonder(res, 200, yonetimGiris())
      return true
    }
    if (yontem !== 'POST') return false
    const form = await govdeOku(req)
    if (!form) {
      gonder(res, 413, yonetimGiris('İstek çok büyük.'))
      return true
    }
    const ip = ortak.istemciIp(req)
    const { izin, bekleMs } = ortak.sinir.dene(ip)
    if (!izin) {
      logger.warn({ ip }, 'Yönetim girişi sınıra takıldı')
      gonder(res, 429, yonetimGiris(ortak.bekleMetni(bekleMs)), { 'Retry-After': String(Math.ceil(bekleMs / 1000)) })
      return true
    }
    const giren = kodlaGir(form.get('kod'))
    if (!giren) {
      logger.warn({ ip }, 'Yönetimde yanlış ya da süresi dolmuş kod')
      gonder(res, 401, yonetimGiris('Kod yanlış, kullanılmış ya da süresi dolmuş. Yeni kod iste.'))
      return true
    }
    ortak.sinir.basarili(ip)
    logger.info({ ip, yonetici: giren.id, rol: giren.rol }, 'Yönetim paneline giriş')
    kayitYaz(giren, 'giriş', ip)
    const yeni = motor.oturum.ac({ tur: 'yonetim', id: giren.id, surum: giren.surum })
    yonlendir(res, '/yonetim', { 'Set-Cookie': cerez(yeni, OTURUM_MS / 1000) })
    return true
  }

  if (!y) {
    if (jeton) motor.oturum.kapat(jeton)
    yonlendir(res, '/yonetim/giris', jeton ? { 'Set-Cookie': cerez('', 0) } : {})
    return true
  }

  if (yontem === 'POST' && yol === '/yonetim/cikis') {
    motor.oturum.kapat(jeton)
    yonlendir(res, '/yonetim/giris', { 'Set-Cookie': cerez('', 0) })
    return true
  }

  if (yontem === 'POST' && yol === '/yonetim/islem') {
    const form = await govdeOku(req, 8 * 1024)
    if (!form) {
      gonder(res, 413, 'İstek çok büyük.')
      return true
    }
    await motor.islem(y, form)
    const donus = Object.values(YONETIM_SAYFALARI).find((s) => s.ad === form.get('donus'))?.yol ?? '/yonetim'
    const grup = form.get('grup')
    const kisi = form.get('donus') === 'uye' ? form.get('kisi') : null
    yonlendir(res, grup ? `${donus}?grup=${encodeURIComponent(grup)}${kisi ? `&id=${encodeURIComponent(kisi)}` : ''}` : donus)
    return true
  }

  // Yedek indirme (Faz 92): yalnızca sahip, yalnızca yedek klasöründeki bilinen adlar.
  if (yontem === 'GET' && yol === '/yonetim/yedek') {
    const dosya = izinVar(y.rol, 'sistem') && motor.ortam.yedekKlasoru ? yedekYolu(motor.ortam.yedekKlasoru, url.searchParams.get('ad')) : null
    if (!dosya) {
      gonder(res, 404, 'Yedek bulunamadı.', { 'Content-Type': 'text/plain; charset=utf-8' })
      return true
    }
    kayitYaz(y, 'yedek-indir', path.basename(dosya))
    res.writeHead(200, { ...ortak.guvenlik, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${path.basename(dosya)}"`, 'Cache-Control': 'no-store' })
    createReadStream(dosya).on('error', (err) => {
      logger.error({ err }, 'Yedek gönderilemedi')
      res.destroy()
    }).pipe(res)
    return true
  }

  const sayfa = yontem === 'GET' ? YONETIM_SAYFALARI[yol] : null
  if (!sayfa) {
    yonlendir(res, '/yonetim')
    return true
  }
  const v = await motor.sayfaVerisi(y, sayfa.ad, url)
  gonder(res, izinVar(y.rol, sayfa.izin) ? 200 : 403, izinVar(y.rol, sayfa.izin) ? SAYFA_CIZIMI[sayfa.ad](v) : yasakSayfasi(v))
  return true
}
