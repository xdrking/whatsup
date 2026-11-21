// Sosyal bölümün yolları (Faz 66): /s altında. Oyuncu oturumuyla girilir, kişi her grupta
// o gruptaki üye kimliğiyle (panel_hesap.user_jid) görünür. Yazma lib/sosyal.js'tedir.
import { createReadStream, existsSync } from 'node:fs'
import logger from '../lib/logger.js'
import { ROZETLER } from '../lib/rozet.js'
import * as S from '../lib/sosyal.js'
import { getBusiestHour, getDailyStreak, getStats, oyunTutari, seviye, xpAyarla } from '../lib/stats.js'
import { kisiWrapped } from '../lib/wrapped.js'
import { hamGovde, multipartCoz } from './multipart.js'
import { endpointGecerli, panelAdresiKaydet, vapid } from './push.js'
import * as P from './sosyalSayfalar.js'

const ARALIK_MS = 1500
const sayi = new Intl.NumberFormat('tr-TR')
const DUZ = { 'Content-Type': 'text/plain; charset=utf-8' }

/** Gönderi XP'si: taban kurla ölçeklenir (`oyunTutari`), görev ve sezon puanı yazmaz. */
function xpVer({ chatJid, userJid, taban, now }) {
  const miktar = oyunTutari(chatJid, taban, now)
  return xpAyarla({ chatJid, userJid, miktar, at: now }) ? miktar : 0
}

/** Bellekteki durum: bir kez gösterilen sonuç ve iki yazma arası bekleme. */
export function sosyalMotoru({ saat = Date.now } = {}) {
  const bildirimler = new Map()
  const sonIslem = new Map()
  const anahtar = (kim) => `${kim.chat}|${kim.user}`
  return {
    bildir: (kim, metin, hata = false) => bildirimler.set(anahtar(kim), { metin, hata }),
    bildirimAl(kim) {
      const b = bildirimler.get(anahtar(kim)) ?? null
      bildirimler.delete(anahtar(kim))
      return b
    },
    /** Aynı kişinin iki yazması arasında ARALIK_MS olmalı: form iki kez gönderilmesin, akış dolmasın. */
    hizli(kim) {
      const simdi = saat()
      if (simdi - (sonIslem.get(anahtar(kim)) ?? 0) < ARALIK_MS) return true
      sonIslem.set(anahtar(kim), simdi)
      return false
    },
    /** @returns {Promise<string | null>} dosya yoksa '', görsel değilse null */
    async fotoKaydet(dosya, ayar) {
      if (!dosya) return ''
      try {
        return await S.medyaKaydet(dosya, ayar)
      } catch (err) {
        logger.warn({ err: err.message }, 'Yüklenen dosya görsel değil')
        return null
      }
    },
  }
}

async function formOku(req, govdeOku) {
  const tur = String(req.headers['content-type'] ?? '')
  if (tur.startsWith('multipart/form-data')) {
    const ham = await hamGovde(req)
    return ham && multipartCoz(ham, tur)
  }
  const form = await govdeOku(req, 8 * 1024)
  return form && { alanlar: new Map(form), dosya: null }
}

/** Aynı panel içindeki geri adres; dışarı yönlendirme yapılmaz. */
function geriAdres(req, yedek) {
  try {
    const u = new URL(req.headers.referer ?? '', 'http://panel')
    return u.pathname.startsWith('/s') ? u.pathname + u.search : yedek
  } catch {
    return yedek
  }
}

async function postIsle({ req, res, yol, hesapBul, ortak, motor, now }) {
  const { gonder, yonlendir } = ortak
  const form = await formOku(req, ortak.govdeOku)
  if (!form) return gonder(res, 413, 'Dosya çok büyük ya da bozuk. En çok 12 MB.', DUZ)
  const al = (ad) => form.alanlar.get(ad) ?? ''
  const chat = al('grup')
  const hesap = hesapBul(chat)
  if (!hesap) return yonlendir(res, '/s')

  const kim = { chat, user: hesap.user_jid }
  const ben = kim.user
  const istemci = req.headers['x-istemci'] === '1'
  const id = Number(al('id')) || 0

  if (yol === '/s/begen') {
    const s = S.begen(chat, ben, id, now, al('tepki'))
    if (istemci) {
      const [g] = s ? S.akis(chat, ben, { id, adet: 1 }) : []
      return gonder(res, g ? 200 : 404, g ? P.eylemCubugu(chat, g).metin : '')
    }
    return yonlendir(res, `${geriAdres(req, P.sLink(chat))}#g${id}`)
  }

  if (motor.hizli(kim)) return istemci ? gonder(res, 429, 'Biraz yavaş.', DUZ) : yonlendir(res, geriAdres(req, P.sLink(chat)))

  if (yol === '/s/paylas') {
    const don = al('don')
    const medya = await motor.fotoKaydet(form.dosya)
    if (medya === null) motor.bildir(kim, 'Bu dosya bir fotoğraf değil.', true)
    else {
      const alintiId = Number(al('alinti')) || 0
      const secenekler = [1, 2, 3, 4].map((i) => al(`secenek${i}`)).filter((x) => x.trim())
      const anket = secenekler.length ? S.anketHazirla(secenekler, al('sure'), now) : null
      const s = S.gonderiYaz({ chatJid: chat, userJid: ben, hedefJid: al('hedef'), metin: al('metin'), medya, alintiId, anket, now, xpVer })
      if (s.hata) {
        if (medya) S.medyaSil(medya)
        motor.bildir(kim, s.hata, true)
      } else if (s.geriAlindi) motor.bildir(kim, 'Paylaşımı geri aldın.')
      else if (s.xp) motor.bildir(kim, `Paylaşıldı. +${sayi.format(s.xp)} XP`)
      else if (alintiId) motor.bildir(kim, 'Paylaşıldı.')
      // Düz paylaşım kişiyi olduğu yerde bırakır, alıntı akışa döner.
      if (alintiId && !al('metin').trim() && !medya) return yonlendir(res, `${geriAdres(req, P.sLink(chat))}#g${alintiId}`)
    }
    return yonlendir(res, don ? P.sLink(chat, '/profil', { id: don }) : P.sLink(chat))
  }
  if (yol === '/s/yorum') {
    const y = S.yorumYaz(chat, ben, id, al('metin'), now, Number(al('yanit')) || 0)
    if (istemci) return yorumDali(gonder, res, chat, ben, y?.id, now)
    return yonlendir(res, `${geriAdres(req, P.sLink(chat, '/gonderi', { id }))}#${y ? `c${y.id}` : `g${id}`}`)
  }
  if (yol === '/s/anket-oy') {
    const s = S.anketOy(chat, ben, id, Number(al('secim')), now)
    if (istemci) {
      const [g] = S.akis(chat, ben, { id, adet: 1 })
      if (!g?.anket) return gonder(res, 404, '')
      return gonder(res, s.hata ? 409 : 200, P.anketCiz(chat, g, S.uyeler(chat), now).metin)
    }
    if (s.hata) motor.bildir(kim, s.hata, true)
    return yonlendir(res, `${geriAdres(req, P.sLink(chat))}#g${id}`)
  }
  if (yol === '/s/yorum-tepki') {
    const anaId = S.yorumTepki(chat, ben, id, al('tepki'), now)
    if (istemci) return yorumDali(gonder, res, chat, ben, anaId, now)
    return yonlendir(res, `${geriAdres(req, P.sLink(chat))}#c${id}`)
  }
  if (yol === '/s/sil') {
    S.gonderiSil(chat, ben, id)
    return yonlendir(res, geriAdres(req, P.sLink(chat)))
  }
  if (yol === '/s/yorum-sil') {
    S.yorumSil(chat, ben, id)
    return yonlendir(res, geriAdres(req, P.sLink(chat)))
  }
  if (yol === '/s/durt') {
    const hedef = al('id')
    const s = S.uyeBul(chat, hedef) ? S.durt(chat, ben, hedef, now) : null
    if (s?.tamam) motor.bildir(kim, 'Dürttün.')
    else if (s?.bekleMs) motor.bildir(kim, `Az önce dürttün. ${Math.ceil(s.bekleMs / 60_000)} dk sonra yine dürtebilirsin.`, true)
    return yonlendir(res, P.sLink(chat, '/profil', { id: hedef }))
  }
  if (yol === '/s/mesaj-yaz') {
    const ile = al('ile')
    if (S.uyeBul(chat, ile)?.panelde) {
      const medya = await motor.fotoKaydet(form.dosya, { boyut: 1024 })
      if (medya !== null) S.dmYaz({ chatJid: chat, gonderen: ben, alici: ile, metin: al('metin'), medya, now })
    }
    return istemci ? gonder(res, 204, '') : yonlendir(res, P.sLink(chat, '/mesaj', { ile }))
  }
  if (yol === '/s/hikaye-yaz') {
    const medya = await motor.fotoKaydet(form.dosya, { boyut: 1080 })
    if (!medya) motor.bildir(kim, medya === null ? 'Bu dosya bir fotoğraf değil.' : 'Önce bir fotoğraf seç.', true)
    else {
      S.hikayeYaz({ chatJid: chat, userJid: ben, medya, metin: al('metin'), now })
      motor.bildir(kim, 'Hikâyen paylaşıldı. Herkes bir kez görebilir.')
    }
    return yonlendir(res, P.sLink(chat))
  }
  if (yol === '/s/profil-yaz') {
    const tur = al('tur') === 'kapak' ? 'kapak' : 'avatar'
    const medya = await motor.fotoKaydet(form.dosya, tur === 'avatar' ? { boyut: 400, kare: true } : { boyut: 1500 })
    if (medya === null) motor.bildir(kim, 'Bu dosya bir fotoğraf değil.', true)
    else {
      S.profilYaz(chat, ben, { bio: al('bio'), ...(medya ? { [tur]: medya } : {}) })
      motor.bildir(kim, 'Profil kaydedildi.')
    }
    return yonlendir(res, P.sLink(chat, '/ayar'))
  }
  return yonlendir(res, P.sLink(chat))
}

function medyaGonder(res, ortak, ad, onbellek) {
  if (!ad || !existsSync(S.medyaYolu(ad))) return ortak.gonder(res, 404, '', DUZ)
  res.writeHead(200, { ...ortak.guvenlik, 'Content-Type': 'image/webp', 'Cache-Control': onbellek })
  createReadStream(S.medyaYolu(ad)).on('error', (err) => {
    logger.error({ err }, 'Medya gönderilemedi')
    res.destroy()
  }).pipe(res)
}

/**
 * @returns {Promise<boolean>} istek bu bölümünse true
 * `ortak`: { gonder, yonlendir, govdeOku, grupAdlari, guvenlik }
 */
export async function sosyalIsle({ req, res, url, yontem, hesaplar, ortak, motor }) {
  if (url.pathname !== '/s' && !url.pathname.startsWith('/s/')) return false
  const { gonder, yonlendir } = ortak
  const hesapBul = (chat) => hesaplar.find((r) => r.chat_jid === chat)
  const cokGrup = hesaplar.length > 1
  const now = Date.now()

  // Web Push (Faz 67): abonelik cihaza aittir, gruba değil.
  if (yontem === 'POST' && (url.pathname === '/s/push-kayit' || url.pathname === '/s/push-sil')) {
    const form = await ortak.govdeOku(req, 2048)
    const endpoint = form?.get('endpoint') ?? ''
    if (!endpointGecerli(endpoint)) return gonder(res, 400, 'Geçersiz abonelik.', DUZ), true
    if (url.pathname === '/s/push-sil') S.pushSil(endpoint)
    else {
      S.pushKaydet({ endpoint, numara: hesaplar[0].numara, lid: hesaplar[0].lid, now })
      // VAPID'in `sub` alanı panelin kendi adresidir; nginx Host'u ve https'i verir.
      if (req.headers.host) panelAdresiKaydet(`https://${req.headers.host}`)
    }
    gonder(res, 204, '')
    return true
  }
  if (yontem === 'GET' && url.pathname === '/s/push-anahtar') {
    gonder(res, 200, vapid().acik, DUZ)
    return true
  }
  if (yontem === 'GET' && url.pathname === '/s/push-ozet') {
    gonder(res, 200, JSON.stringify(pushOzeti(hesaplar, ortak.grupAdlari())), { 'Content-Type': 'application/json; charset=utf-8' })
    return true
  }

  if (yontem === 'POST') {
    await postIsle({ req, res, yol: url.pathname, hesapBul, ortak, motor, now })
    return true
  }
  if (yontem !== 'GET') return false

  const chat = url.searchParams.get('grup') ?? (hesaplar.length === 1 ? hesaplar[0].chat_jid : '')
  const hesap = hesapBul(chat)
  if (!hesap) {
    const adlar = ortak.grupAdlari()
    gonder(res, 200, P.sosyalGrupSecimi(hesaplar.map((r) => ({ chat: r.chat_jid, ad: adlar.get(r.chat_jid) ?? '' }))))
    return true
  }
  const kim = { chat, user: hesap.user_jid }

  const medyaAdi = /^\/s\/medya\/([a-f0-9]{32})$/.exec(url.pathname)?.[1]
  if (medyaAdi) {
    medyaGonder(res, ortak, S.medyaIzni(chat, kim.user, medyaAdi) ? medyaAdi : null, 'private, max-age=86400')
    return true
  }
  if (url.pathname === '/s/hikaye-medya') {
    // Hikâye bir kez görünür, tarayıcı da saklamasın.
    medyaGonder(res, ortak, S.hikayeMedyasi(chat, kim.user, Number(url.searchParams.get('id')) || 0, now), 'no-store')
    return true
  }
  if (url.pathname === '/s/sayac') {
    const s = S.sayaclar(chat, kim.user)
    gonder(res, 200, `${s.bildirim}:${s.dm}`, DUZ)
    return true
  }

  const uyeler = S.uyeler(chat)
  const ben = uyeler.find((u) => u.jid === kim.user) ?? { jid: kim.user, ad: '', xp: 0, avatar: '' }

  if (url.pathname === '/s/mesaj-yeni') {
    const yeni = S.dmAkis(chat, kim.user, url.searchParams.get('ile') ?? '', { sonId: Number(url.searchParams.get('son')) || 0 })
    gonder(res, 200, P.dmBalonlari(chat, yeni, ben).map((p) => p.metin).join(''))
    return true
  }

  if (url.pathname === '/s/akis-parca') {
    const etiket = url.searchParams.get('ad')
    const once = Number(url.searchParams.get('once')) || 0
    const gonderiler = etiket ? S.etiketAkisi(chat, kim.user, etiket, { once }) : S.akis(chat, kim.user, { once, kisi: url.searchParams.get('kisi') ?? '' })
    const sonraki = gonderiler.length >= S.AKIS_SAYFA ? gonderiler.at(-1).id : 0
    gonder(res, 200, gonderiler.map((g) => P.gonderiCiz(chat, g, uyeler, ben, now).metin).join(''), { 'X-Sonraki': String(sonraki) })
    return true
  }
  if (url.pathname === '/s/yeni-sayi') {
    gonder(res, 200, String(S.yeniGonderiSayisi(chat, Number(url.searchParams.get('son')) || 0, kim.user)), DUZ)
    return true
  }

  const grupAdi = ortak.grupAdlari().get(chat) ?? ''
  const sayfa = (baslik, icerik, secili, sag = P.sagSutun(chat, uyeler, now, S.gundem(chat, now))) => {
    gonder(res, 200, P.sosyalKabuk(baslik, icerik, { chat, ben, grupAdi, sayac: S.sayaclar(chat, kim.user), secili, sag, cokGrup }))
    return true
  }
  const bildirim = () => motor.bildirimAl(kim)

  switch (url.pathname) {
    case '/s': {
      try {
        S.gazeteKontrol(chat, now)
      } catch (err) {
        logger.error({ err, chat }, 'Haftalık gazete yazılamadı')
      }
      const gonderiler = S.akis(chat, kim.user, { once: Number(url.searchParams.get('once')) || 0 })
      return sayfa('Haber kaynağı', P.akisSayfasi({ chat, ben, gonderiler, uyeler, hikayeler: S.hikayeler(chat, kim.user, now), bildirim: bildirim(), now }), 'akis')
    }
    case '/s/gonderi': {
      const [g] = S.akis(chat, kim.user, { id: Number(url.searchParams.get('id')) || -1, adet: 1 })
      return sayfa('Gönderi', P.tekGonderiSayfasi({ chat, ben, gonderi: g, uyeler, now }), 'akis')
    }
    case '/s/profil': {
      const kisi = uyeler.find((u) => u.jid === url.searchParams.get('id')) ?? ben
      const stats = getStats(chat, kisi.jid)
      const veri = { ...stats, level: seviye(stats.xp), seri: getDailyStreak(chat, kisi.jid), saat: getBusiestHour(chat, kisi.jid)?.hour ?? null }
      return sayfa(P.adi(kisi), P.profilSayfasi({
        chat, ben, kisi, profil: S.profilOku(chat, kisi.jid), stats, seviye: veri.level,
        rozetler: ROZETLER.filter((r) => r.deger(veri) >= r.hedef),
        wrapped: kisiWrapped(chat, kisi.jid, now),
        gonderiler: S.akis(chat, kim.user, { kisi: kisi.jid }), uyeler, bildirim: bildirim(), now,
      }), kisi.jid === ben.jid ? 'profil' : '')
    }
    case '/s/etiket': {
      const etiket = (url.searchParams.get('ad') ?? '').toLocaleLowerCase('tr').slice(0, 40)
      const gonderiler = S.etiketAkisi(chat, kim.user, etiket, { once: Number(url.searchParams.get('once')) || 0 })
      return sayfa(`#${etiket}`, P.etiketSayfasi({ chat, ben, etiket, gonderiler, uyeler, now }), '')
    }
    case '/s/alinti': {
      const [g] = S.akis(chat, kim.user, { id: Number(url.searchParams.get('id')) || -1, adet: 1 })
      // Düz paylaşım alıntılanırsa özgün gönderi alıntılanır.
      const hedef = g && g.alinti_id && !g.metin && !g.medya && g.alinti && !g.alinti.silindi ? g.alinti : g
      return sayfa('Alıntıla', P.alintiSayfasi({ chat, ben, gonderi: hedef, uyeler, now }), '')
    }
    case '/s/ayar':
      return sayfa('Profili düzenle', P.ayarSayfasi({ chat, profil: S.profilOku(chat, kim.user), bildirim: bildirim() }), 'ayar')
    case '/s/arkadas':
      return sayfa('Arkadaşlar', P.arkadasSayfasi({ chat, uyeler: uyeler.filter((u) => u.jid !== ben.jid), now }), 'arkadas')
    case '/s/bildirim': {
      const liste = S.bildirimler(chat, kim.user)
      S.bildirimleriOku(chat, kim.user)
      return sayfa('Bildirimler', P.bildirimSayfasi({ chat, liste, uyeler, now }), 'bildirim')
    }
    case '/s/mesaj': {
      const ile = url.searchParams.get('ile')
      const karsi = ile && ile !== ben.jid ? uyeler.find((u) => u.jid === ile) : null
      if (karsi) return sayfa(P.adi(karsi), P.sohbetSayfasi({ chat, ben, karsi, mesajlar: S.dmAkis(chat, kim.user, karsi.jid) }), 'mesaj', '')
      return sayfa('Mesajlar', P.mesajListesi({ chat, konusmalar: S.konusmalar(chat, kim.user), uyeler, ben, now }), 'mesaj')
    }
    case '/s/hikaye': {
      const id = Number(url.searchParams.get('id')) || 0
      const acilan = S.hikayeAc(chat, kim.user, id, now)
      if (!acilan?.hikaye) {
        motor.bildir(kim, acilan?.goruldu ? 'Bu hikâyeyi zaten gördün.' : 'Bu hikâye artık yok.', true)
        yonlendir(res, P.sLink(chat))
        return true
      }
      const hikaye = acilan.hikaye
      const kendim = hikaye.user_jid === kim.user
      const hk = S.hikayeler(chat, kim.user, now)
      const benimKi = hk.benim.findIndex((x) => x.id === hikaye.id)
      const sonraki = kendim ? (hk.benim[benimKi + 1]?.id ?? 0) : (hk.kisiler.flatMap((k) => k.liste)[0]?.id ?? 0)
      const sahip = uyeler.find((u) => u.jid === hikaye.user_jid) ?? { jid: hikaye.user_jid, ad: '' }
      return sayfa('Hikâye', P.hikayeSayfasi({
        chat, hikaye, sahip, kendim, izleyenler: kendim ? hk.benim[benimKi]?.izleyenler ?? [] : [], uyeler, sonraki, now,
      }), '', '')
    }
    default:
      yonlendir(res, P.sLink(chat))
      return true
  }
}

const OZET_METNI = {
  begeni: 'gönderine tepki verdi', yorum: 'gönderine yorum yaptı', etiket: 'seni etiketledi', duvar: 'duvarına yazdı',
  durt: 'seni dürttü', paylasim: 'gönderini paylaştı', alinti: 'gönderini alıntıladı',
  yanit: 'yorumuna yanıt verdi', yorum_tepki: 'yorumuna tepki verdi', anket_oy: 'anketine oy verdi',
}

/** Servis işçisinin gösterdiği bildirim; DM metni gösterilmez, kilit ekranında okunmasın. */
function pushOzeti(hesaplar, grupAdlari) {
  const son = S.sonOkunmamis(hesaplar)
  if (!son) return { baslik: 'Yeni bildirim', metin: 'Açıp bak.', adres: '/s' }
  const ad = (jid) => S.uyeBul(son.chat_jid, jid)?.ad || 'Biri'
  const grup = grupAdlari.get(son.chat_jid) || 'Grup'
  if (son.kaynak === 'dm') return { baslik: grup, metin: `${ad(son.gonderen)} sana mesaj gönderdi`, adres: P.sLink(son.chat_jid, '/mesaj', { ile: son.gonderen }), etiket: `dm-${son.gonderen}` }
  return {
    baslik: grup,
    metin: `${ad(son.kimden)} ${OZET_METNI[son.tur] ?? 'bir şey yaptı'}`,
    adres: son.gonderi_id ? P.sLink(son.chat_jid, '/gonderi', { id: son.gonderi_id }) : P.sLink(son.chat_jid, '/bildirim'),
    etiket: `b-${son.id}`,
  }
}

/** Betik için yorum dalının (ana yorum ve yanıtları) güncel HTML'i. */
function yorumDali(gonder, res, chat, ben, yorumId, now) {
  const y = yorumId ? S.yorumOku(chat, ben, yorumId) : null
  const [g] = y ? S.akis(chat, ben, { id: y.gonderi_id, adet: 1 }) : []
  if (!g) return gonder(res, 404, '')
  const uyeler = S.uyeler(chat)
  return gonder(res, 200, P.yorumCiz(chat, g, y, uyeler, uyeler.find((u) => u.jid === ben) ?? { jid: ben }, now).metin)
}
