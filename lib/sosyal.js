// Panelin sosyal bölümü (Faz 66): gönderi, yorum, beğeni, duvar, dürtme, DM, hikâye,
// bildirim; Faz 70'te arama, grup sohbeti, etkinlik ve haftanın gönderisi. Her şey gruba aittir, grubun üyeleri otomatik arkadaştır. Panel yazar,
// bot yalnızca `botGonderisi` ile olay düşer. Medya dosyaları data/medya/ altındadır.
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'
import logger from './logger.js'
import { haftaAnahtari } from './sezon.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
export const MEDYA_DIR = process.env.MEDYA_DIR || path.join(DATA_DIR, 'medya')

export const METIN_AZAMI = 2000
export const YORUM_AZAMI = 500
export const BIO_AZAMI = 160
export const DM_AZAMI = 1000
export const ANKET_AZAMI = 4
export const ANKET_SECENEK_AZAMI = 80
export const ANKET_GUNLERI = [1, 3, 7]
export const AKIS_SAYFA = 20
export const SOSYAL_XP_HAKKI = 3
export const SOSYAL_XP_TABAN = 10
export const DURT_ARALIGI_MS = 60 * 60_000
// "Herkes görünce silinir" kuralı, hesabı olup hiç girmeyen yüzünden diski doldurmasın.
export const HIKAYE_AZAMI_MS = 7 * 24 * 60 * 60_000
// İzleme kaydından sonra görsel bu süre içinde yüklenmeli: hikâye bir kez görünür.
export const HIKAYE_MEDYA_MS = 2 * 60_000
const MEDYA_ADI = /^[a-f0-9]{32}$/
export const TEPKILER = ['❤️', '👍', '😂', '😮', '😢', '😡']
// #etiket: harf, rakam ve alt çizgi; Türkçe harfler dahil. En çok 40 karakter.
const HASHTAG = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{1,40})/gu
export const GUNDEM_GUN = 7
export const SOHBET_AD_AZAMI = 40
// Grup sohbeti en az 3 kişidir (kuran dahil); daha azı düz DM'dir.
export const SOHBET_EN_AZ = 3
export const SOHBET_UYE_AZAMI = 20
export const ETKINLIK_METIN_AZAMI = 80
export const KATILIM = ['evet', 'belki', 'hayir']
// Etkinlikten bu kadar önce katılanlara bildirim gider (panel 5 dakikada bir bakar).
export const ETKINLIK_HATIRLAT_MS = 60 * 60_000
const ETKINLIK_EN_UZAK_MS = 365 * 86_400_000
// Haftanın gönderisi: sahibinin kendi tepkisi sayılmaz, en az bu kadar tepki gerekir.
export const HAFTA_ODUL_TABAN = 100
export const HAFTA_ODUL_EN_AZ = 2
export const ARAMA_EN_AZ = 2
// Faz 72
export const DUZENLEME_MS = 10 * 60_000
export const DURUM_AZAMI = 80
export const DURUM_MS = 24 * 60 * 60_000
export const CEVRIMICI_MS = 5 * 60_000

// Bildirim ve DM yazılınca çağrılır (panel Web Push için kurar, bot kurmaz).
let bildirimKancasi = null
export function bildirimKancasiKur(fn) {
  bildirimKancasi = fn
}
const kancaCagir = (chatJid, userJid) => {
  try {
    bildirimKancasi?.(chatJid, userJid)
  } catch (err) {
    logger.error({ err }, 'Bildirim kancası çalışmadı')
  }
}

const db = () => getDb()
/** Aramada harf duyarsız eşleşme: Türkçe küçük harf, aksansız ("Şeker" ile "seker" eşleşir). */
export const katla = (metin) => String(metin).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const temizMetin = (metin, azami) => String(metin ?? '').replace(/\r\n/g, '\n').trim().slice(0, azami)

// --- Medya ---------------------------------------------------------------

export const medyaAdiGecerli = (ad) => MEDYA_ADI.test(String(ad))
export const medyaYolu = (ad) => path.join(MEDYA_DIR, `${ad}.webp`)

/**
 * Görseli WebP'ye çevirip saklar. sharp metadata'yı (EXIF, konum) varsayılan olarak atar,
 * `rotate()` telefon fotoğrafının yönünü düzeltir. Görsel değilse sharp hata atar.
 * @returns {Promise<string>} dosya adı
 */
export async function medyaKaydet(tampon, { boyut = 1280, kare = false } = {}) {
  let resim = sharp(tampon, { limitInputPixels: 40_000_000 }).rotate()
  resim = kare
    ? resim.resize(boyut, boyut, { fit: 'cover' })
    : resim.resize(boyut, boyut, { fit: 'inside', withoutEnlargement: true })
  const cikti = await resim.webp({ quality: 80 }).toBuffer()
  mkdirSync(MEDYA_DIR, { recursive: true })
  const ad = randomBytes(16).toString('hex')
  writeFileSync(medyaYolu(ad), cikti)
  return ad
}

export function medyaSil(ad) {
  if (!medyaAdiGecerli(ad)) return
  try {
    rmSync(medyaYolu(ad), { force: true })
  } catch (err) {
    logger.error({ err, ad }, 'Medya dosyası silinemedi')
  }
}

/** Görsel bu grubun gönderisinde, profilinde ya da kişinin kendi DM'sinde mi. */
export function medyaIzni(chatJid, userJid, ad) {
  if (!medyaAdiGecerli(ad)) return false
  const d = db()
  if (!d) return false
  return Boolean(
    d.prepare('SELECT 1 FROM sosyal_gonderi WHERE chat_jid = ? AND medya = ?').get(chatJid, ad)
    || d.prepare('SELECT 1 FROM sosyal_profil WHERE chat_jid = ? AND (avatar = ? OR kapak = ?)').get(chatJid, ad, ad)
    || d.prepare('SELECT 1 FROM sosyal_dm WHERE chat_jid = ? AND medya = ? AND (gonderen = ? OR alici = ?)').get(chatJid, ad, userJid, userJid)
    || d.prepare(`SELECT 1 FROM sosyal_sohbet_mesaj m JOIN sosyal_sohbet s ON s.id = m.sohbet_id
      JOIN sosyal_sohbet_uye u ON u.sohbet_id = m.sohbet_id AND u.user_jid = ? WHERE s.chat_jid = ? AND m.medya = ?`).get(userJid, chatJid, ad),
  )
}

// --- Üyeler ve profil ----------------------------------------------------

/**
 * Grubun üyeleri: istatistiği olan herkes, bot hariç. `panelde` hesabı olan, yani
 * DM okuyabilen kişidir.
 */
export function uyeler(chatJid) {
  const d = db()
  if (!d) return []
  const bot = d.prepare("SELECT deger FROM ayar WHERE anahtar = 'bot_jid'").get()?.deger ?? ''
  return d.prepare(`
    SELECT s.user_jid AS jid, COALESCE(i.ad, '') AS ad, s.xp, s.messages, s.last_seen,
           COALESCE(p.avatar, '') AS avatar, COALESCE(p.aktif, 0) AS aktif,
           CASE WHEN p.durum_bitis > @simdi THEN p.durum ELSE '' END AS durum,
           EXISTS (SELECT 1 FROM panel_hesap h WHERE h.chat_jid = s.chat_jid AND h.user_jid = s.user_jid) AS panelde
    FROM stats s
    LEFT JOIN isimler i ON i.user_jid = s.user_jid
    LEFT JOIN sosyal_profil p ON p.chat_jid = s.chat_jid AND p.user_jid = s.user_jid
    WHERE s.chat_jid = @chat AND s.user_jid <> @bot
    ORDER BY s.last_seen DESC
  `).all({ chat: chatJid, bot, simdi: Date.now() })
}

export function uyeBul(chatJid, jid) {
  return uyeler(chatJid).find((u) => u.jid === jid) ?? null
}

export function profilOku(chatJid, userJid, now = Date.now()) {
  const p = db()?.prepare('SELECT bio, avatar, kapak, sabit, durum, durum_bitis FROM sosyal_profil WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)
    ?? { bio: '', avatar: '', kapak: '', sabit: 0, durum: '', durum_bitis: 0 }
  // Süresi dolan durum okunurken düşer, silinmesi için bir iş gerekmez.
  return p.durum_bitis > now ? p : { ...p, durum: '', durum_bitis: 0 }
}

/** Yalnızca verilen alanlar değişir; eski avatar ya da kapak dosyası silinir. */
export function profilYaz(chatJid, userJid, alanlar) {
  const d = db()
  if (!d) return false
  const now = alanlar.now ?? Date.now()
  const eski = profilOku(chatJid, userJid, now)
  const yeni = { ...eski }
  if (alanlar.bio !== undefined) yeni.bio = temizMetin(alanlar.bio, BIO_AZAMI)
  if (alanlar.avatar) yeni.avatar = alanlar.avatar
  if (alanlar.kapak) yeni.kapak = alanlar.kapak
  // Durum 24 saat yaşar; aynı metin yeniden kaydedilirse süresi baştan başlamaz.
  if (alanlar.durum !== undefined) {
    const durum = temizMetin(alanlar.durum, DURUM_AZAMI).replace(/\s+/g, ' ')
    if (!durum) Object.assign(yeni, { durum: '', durum_bitis: 0 })
    else if (durum !== eski.durum) Object.assign(yeni, { durum, durum_bitis: now + DURUM_MS })
  }
  d.prepare(`
    INSERT INTO sosyal_profil (chat_jid, user_jid, bio, avatar, kapak, durum, durum_bitis) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET bio = excluded.bio, avatar = excluded.avatar, kapak = excluded.kapak,
      durum = excluded.durum, durum_bitis = excluded.durum_bitis
  `).run(chatJid, userJid, yeni.bio, yeni.avatar, yeni.kapak, yeni.durum, yeni.durum_bitis)
  if (eski.avatar && eski.avatar !== yeni.avatar) medyaSil(eski.avatar)
  if (eski.kapak && eski.kapak !== yeni.kapak) medyaSil(eski.kapak)
  return true
}

// --- Bildirim ------------------------------------------------------------

function bildir(d, { chatJid, userJid, kimden, tur, gonderiId = 0, now }) {
  if (!userJid || userJid === kimden) return
  d.prepare('INSERT INTO sosyal_bildirim (chat_jid, user_jid, kimden, tur, gonderi_id, zaman) VALUES (?, ?, ?, ?, ?, ?)')
    .run(chatJid, userJid, kimden, tur, gonderiId, now)
  kancaCagir(chatJid, userJid)
}

export function bildirimler(chatJid, userJid, adet = 40) {
  return db()?.prepare('SELECT * FROM sosyal_bildirim WHERE chat_jid = ? AND user_jid = ? ORDER BY id DESC LIMIT ?')
    .all(chatJid, userJid, adet) ?? []
}

export function bildirimleriOku(chatJid, userJid) {
  db()?.prepare('UPDATE sosyal_bildirim SET okundu = 1 WHERE chat_jid = ? AND user_jid = ? AND okundu = 0').run(chatJid, userJid)
}

/** Menüdeki rozetler: okunmamış bildirim ve DM sayısı (grup sohbetleri dahil). */
export function sayaclar(chatJid, userJid) {
  const d = db()
  if (!d) return { bildirim: 0, dm: 0 }
  return {
    bildirim: d.prepare('SELECT COUNT(*) AS n FROM sosyal_bildirim WHERE chat_jid = ? AND user_jid = ? AND okundu = 0').get(chatJid, userJid).n,
    dm: d.prepare('SELECT COUNT(*) AS n FROM sosyal_dm WHERE chat_jid = ? AND alici = ? AND okundu = 0').get(chatJid, userJid).n
      + d.prepare(`SELECT COUNT(*) AS n FROM sosyal_sohbet_mesaj m JOIN sosyal_sohbet s ON s.id = m.sohbet_id
        JOIN sosyal_sohbet_uye u ON u.sohbet_id = m.sohbet_id AND u.user_jid = ?
        WHERE s.chat_jid = ? AND m.id > u.son_okunan AND m.gonderen <> ?`).get(userJid, chatJid, userJid).n,
  }
}

// --- Gönderi -------------------------------------------------------------

/**
 * Metindeki "@Ad" etiketleri. Ad boşluk taşıyabildiği için en uzun ad önce aranır,
 * yoksa "@Ali Veli" içindeki "@Ali" de eşleşirdi.
 */
export function etiketleriBul(metin, uyeListesi) {
  const bulunan = new Set()
  const adlar = uyeListesi.filter((u) => u.ad).sort((a, b) => b.ad.length - a.ad.length)
  let kalan = String(metin).toLocaleLowerCase('tr')
  for (const u of adlar) {
    const iz = `@${u.ad.toLocaleLowerCase('tr')}`
    if (kalan.includes(iz)) {
      bulunan.add(u.jid)
      kalan = kalan.split(iz).join(' ')
    }
  }
  return [...bulunan]
}

/** Metindeki #etiketler, küçük harfle ve tekrarsız. */
export function hashtagler(metin) {
  return [...new Set([...String(metin).matchAll(HASHTAG)].map((e) => e[2].toLocaleLowerCase('tr')))]
}

/** Alıntı her zaman özgün gönderiyi gösterir: düz paylaşımın paylaşımı zincir kurmasın. */
function ozgunGonderi(d, chatJid, id) {
  const g = d.prepare('SELECT id, user_jid, metin, medya, alinti_id FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (g && g.alinti_id && !g.metin && !g.medya) return ozgunGonderi(d, chatJid, g.alinti_id)
  return g ?? null
}

/**
 * @returns {{ id: number, xp: number } | { geriAlindi: true } | { hata: string }}
 * `alintiId`: paylaşılan gönderi. Metinsiz ve fotosuz alıntı düz paylaşımdır (retweet), kişi başı
 * birdir; ikinci kez istenirse geri alınır. Düz paylaşım XP vermez.
 * Günün ilk SOSYAL_XP_HAKKI gönderisi küçük bir XP verir (bot sahibinin kararı, "az XP").
 * XP fonksiyonu dışarıdan verilir: kurla ölçek lib/stats.js'tedir, burası ekonomiyi bilmez.
 */
/**
 * Anket girdisini denetler. @returns {{ secenekler: string[], bitis: number } | { hata: string }}
 */
export function anketHazirla(secenekler, gun, now = Date.now()) {
  const temiz = secenekler.map((x) => temizMetin(x ?? '', ANKET_SECENEK_AZAMI)).filter(Boolean)
  if (temiz.length < 2) return { hata: 'Ankette en az iki seçenek olmalı.' }
  if (temiz.length > ANKET_AZAMI) return { hata: `Ankette en çok ${ANKET_AZAMI} seçenek olur.` }
  if (new Set(temiz.map((x) => x.toLocaleLowerCase('tr'))).size !== temiz.length) return { hata: 'Aynı seçenek iki kez yazılmış.' }
  const sure = ANKET_GUNLERI.includes(Number(gun)) ? Number(gun) : ANKET_GUNLERI[0]
  return { secenekler: temiz, bitis: now + sure * 86_400_000 }
}

export function gonderiYaz({ chatJid, userJid, hedefJid = '', metin = '', medya = '', alintiId = 0, kaynak = '', anket = null, etkinlik = null, vurgun = null, now = Date.now(), xpVer = null }) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const temiz = temizMetin(metin, METIN_AZAMI)
  if (anket) {
    if (anket.hata) return anket
    if (!temiz) return { hata: 'Anketin sorusunu yaz.' }
    if (alintiId) return { hata: 'Alıntıya anket eklenmez.' }
  }
  if (etkinlik) {
    if (etkinlik.hata) return etkinlik
    if (anket) return { hata: 'Anket ve etkinlik aynı gönderide olmaz.' }
    if (alintiId) return { hata: 'Alıntıya etkinlik eklenmez.' }
  }
  let ozgun = null
  if (alintiId) {
    ozgun = ozgunGonderi(d, chatJid, alintiId)
    if (!ozgun) return { hata: 'Paylaşılan gönderi silinmiş.' }
    hedefJid = ''
  }
  const duzPaylasim = Boolean(ozgun) && !temiz && !medya
  if (!temiz && !medya && !ozgun && !etkinlik && !vurgun) return { hata: 'Boş gönderi paylaşılamaz.' }
  if (hedefJid === userJid) hedefJid = ''

  if (duzPaylasim) {
    const eski = d.prepare("SELECT id FROM sosyal_gonderi WHERE chat_jid = ? AND user_jid = ? AND alinti_id = ? AND metin = '' AND medya = ''")
      .get(chatJid, userJid, ozgun.id)
    if (eski) {
      gonderiSil(chatJid, userJid, eski.id)
      return { geriAlindi: true }
    }
  }

  const liste = uyeler(chatJid)
  if (hedefJid && !liste.some((u) => u.jid === hedefJid)) return { hata: 'Bu kişi grupta yok.' }

  const sonuc = d.transaction(() => {
    const id = Number(d.prepare('INSERT INTO sosyal_gonderi (chat_jid, user_jid, hedef_jid, metin, medya, alinti_id, kaynak, vurgun, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(chatJid, userJid, hedefJid, temiz, medya, ozgun?.id ?? 0, kaynak, vurgun ? JSON.stringify(vurgun) : '', now).lastInsertRowid)
    if (anket) d.prepare('INSERT INTO sosyal_anket (gonderi_id, secenekler, bitis) VALUES (?, ?, ?)').run(id, JSON.stringify(anket.secenekler), anket.bitis)
    if (etkinlik) d.prepare('INSERT INTO sosyal_etkinlik (gonderi_id, baslik, yer, zaman) VALUES (?, ?, ?, ?)').run(id, etkinlik.baslik, etkinlik.yer, etkinlik.zaman)
    if (ozgun) bildir(d, { chatJid, userJid: ozgun.user_jid, kimden: userJid, tur: duzPaylasim ? 'paylasim' : 'alinti', gonderiId: id, now })
    if (hedefJid) bildir(d, { chatJid, userJid: hedefJid, kimden: userJid, tur: 'duvar', gonderiId: id, now })
    for (const jid of etiketleriBul(temiz, liste)) {
      if (jid !== hedefJid) bildir(d, { chatJid, userJid: jid, kimden: userJid, tur: 'etiket', gonderiId: id, now })
    }

    const gun = istanbulDay(new Date(now))
    const satir = d.prepare('SELECT day, adet FROM sosyal_xp WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)
    const adet = satir?.day === gun ? satir.adet : 0
    const xpHakki = !duzPaylasim && adet < SOSYAL_XP_HAKKI
    if (xpHakki) {
      d.prepare(`INSERT INTO sosyal_xp (chat_jid, user_jid, day, adet) VALUES (?, ?, ?, ?)
        ON CONFLICT (chat_jid, user_jid) DO UPDATE SET day = excluded.day, adet = excluded.adet`).run(chatJid, userJid, gun, adet + 1)
    }
    return { id, xpHakki }
  })()

  const xp = sonuc.xpHakki && xpVer ? xpVer({ chatJid, userJid, taban: SOSYAL_XP_TABAN, now }) : 0
  return { id: sonuc.id, xp }
}

/** Bot olaylarını akışa düşer (reborn, darbe, rekor…). Bot sürecinden çağrılır, hata botu durdurmaz. */
export function botGonderisi(chatJid, metin, now = Date.now(), alintiId = 0) {
  try {
    db()?.prepare("INSERT INTO sosyal_gonderi (chat_jid, user_jid, metin, alinti_id, zaman) VALUES (?, '', ?, ?, ?)")
      .run(chatJid, temizMetin(metin, METIN_AZAMI), alintiId, now)
  } catch (err) {
    logger.error({ err, chatJid }, 'Bot gönderisi yazılamadı')
  }
}

/** Yazan da duvar sahibi de silebilir. `zorla`: yönetim panelinin moderasyonu (Faz 92), sahiplik sorulmaz. */
export function gonderiSil(chatJid, userJid, id, { zorla = false } = {}) {
  const d = db()
  if (!d) return false
  const g = d.prepare('SELECT * FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g || (!zorla && (!userJid || (g.user_jid !== userJid && g.hedef_jid !== userJid)))) return false
  d.transaction(() => {
    d.prepare('DELETE FROM sosyal_gonderi WHERE id = ?').run(id)
    d.prepare('DELETE FROM sosyal_begeni WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_yorum_tepki WHERE yorum_id IN (SELECT id FROM sosyal_yorum WHERE gonderi_id = ?)').run(id)
    d.prepare('DELETE FROM sosyal_yorum WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_anket WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_anket_oy WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_etkinlik WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_katilim WHERE gonderi_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_bildirim WHERE chat_jid = ? AND gonderi_id = ?').run(chatJid, id)
    d.prepare('DELETE FROM sosyal_kayit WHERE chat_jid = ? AND gonderi_id = ?').run(chatJid, id)
    d.prepare('UPDATE sosyal_profil SET sabit = 0 WHERE chat_jid = ? AND sabit = ?').run(chatJid, id)
  })()
  if (g.medya) medyaSil(g.medya)
  return true
}

/**
 * Akış: en yeni önce. `kisi` verilirse o kişinin profili (yazdıkları ve duvarına yazılanlar).
 * `once`: bu id'den eski gönderiler (sayfalama).
 */
export function akis(chatJid, izleyen, { kisi = '', once = 0, adet = AKIS_SAYFA, id = 0 } = {}) {
  const d = db()
  if (!d) return []
  const kosul = ['g.chat_jid = ?']
  const p = [chatJid]
  if (id) { kosul.push('g.id = ?'); p.push(id) }
  if (kisi) { kosul.push('(g.user_jid = ? OR g.hedef_jid = ?)'); p.push(kisi, kisi) }
  if (once) { kosul.push('g.id < ?'); p.push(once) }
  const gonderiler = d.prepare(`SELECT g.* FROM sosyal_gonderi g WHERE ${kosul.join(' AND ')} ORDER BY g.id DESC LIMIT ?`).all(...p, adet)
  return gonderiler.map((g) => gonderiDoldur(d, chatJid, izleyen, g))
}

/** Gönderiye tepki özeti, yorumlar, paylaşım sayısı ve alıntılanan gönderiyi ekler. */
function gonderiDoldur(d, chatJid, izleyen, g, alintiDoldur = true) {
  const tepkiler = d.prepare('SELECT tepki, COUNT(*) AS n FROM sosyal_begeni WHERE gonderi_id = ? GROUP BY tepki ORDER BY n DESC').all(g.id)
  const benim = d.prepare('SELECT tepki FROM sosyal_begeni WHERE gonderi_id = ? AND user_jid = ?').get(g.id, izleyen)?.tepki ?? ''
  let alinti = g.alinti_id ? d.prepare('SELECT * FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, g.alinti_id) ?? { silindi: true } : null
  // Düz paylaşımda ekranda özgün gönderi durur, tepki ve yorum ona gider: onu da doldur.
  if (alintiDoldur && alinti && !alinti.silindi && !g.metin && !g.medya) alinti = gonderiDoldur(d, chatJid, izleyen, alinti, false)
  const ozgunId = alinti && !g.metin && !g.medya && !alinti.silindi ? alinti.id : g.id
  return {
    ...g,
    tepkiler,
    begeni: tepkiler.reduce((t, x) => t + x.n, 0),
    benimTepkim: benim,
    begendim: Boolean(benim),
    alinti,
    paylasim: d.prepare("SELECT COUNT(*) AS n FROM sosyal_gonderi WHERE alinti_id = ? AND metin = '' AND medya = ''").get(ozgunId).n,
    paylastim: Boolean(d.prepare("SELECT 1 FROM sosyal_gonderi WHERE alinti_id = ? AND user_jid = ? AND metin = '' AND medya = ''").get(ozgunId, izleyen)),
    yorumlar: yorumlariOku(d, g.id, izleyen),
    anket: anketOku(d, g.id, izleyen),
    etkinlik: etkinlikOku(d, g.id, izleyen),
    haftanin: d.prepare('SELECT xp FROM sosyal_hafta_gonderi WHERE chat_jid = ? AND gonderi_id = ?').get(chatJid, g.id) ?? null,
    kaydettim: Boolean(d.prepare('SELECT 1 FROM sosyal_kayit WHERE chat_jid = ? AND user_jid = ? AND gonderi_id = ?').get(chatJid, izleyen, g.id)),
    bahsis: d.prepare('SELECT COUNT(*) AS adet, COALESCE(SUM(xp), 0) AS toplam FROM sosyal_bahsis WHERE gonderi_id = ?').get(g.id),
    vurgunVeri: vurgunCoz(g.vurgun),
  }
}

function vurgunCoz(metin) {
  if (!metin) return null
  try {
    return JSON.parse(metin)
  } catch (err) {
    logger.warn({ err: err.message }, 'Kazanç kartı okunamadı')
    return null
  }
}

/** #etiket sayfası: metninde bu etiket geçen gönderiler, en yeni önce. */
export function etiketAkisi(chatJid, izleyen, etiket, { adet = AKIS_SAYFA, once = 0 } = {}) {
  const d = db()
  if (!d) return []
  const ad = String(etiket).toLocaleLowerCase('tr')
  const adaylar = d.prepare(`SELECT * FROM sosyal_gonderi WHERE chat_jid = ? AND instr(metin, '#') > 0 ${once ? 'AND id < ?' : ''}
    ORDER BY id DESC LIMIT 1000`).all(...(once ? [chatJid, once] : [chatJid]))
  return adaylar.filter((g) => hashtagler(g.metin).includes(ad)).slice(0, adet).map((g) => gonderiDoldur(d, chatJid, izleyen, g))
}

/** Gündem: son GUNDEM_GUN günün en çok geçen etiketleri; aynı kişinin tekrarı bir sayılır. */
export function gundem(chatJid, now = Date.now(), adet = 6) {
  const d = db()
  if (!d) return []
  const sayim = new Map()
  for (const g of d.prepare("SELECT user_jid, metin FROM sosyal_gonderi WHERE chat_jid = ? AND zaman > ? AND instr(metin, '#') > 0").all(chatJid, now - GUNDEM_GUN * 86_400_000)) {
    for (const e of hashtagler(g.metin)) {
      if (!sayim.has(e)) sayim.set(e, new Set())
      sayim.get(e).add(g.user_jid)
    }
  }
  return [...sayim].map(([ad, kisiler]) => ({ ad, sayi: kisiler.size })).sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr')).slice(0, adet)
}

/**
 * Tepki verir. Aynı tepki ikinci kez gelirse kalkar, başkası gelirse değişir. Bildirim yalnızca
 * ilk tepkide düşer: tepki değiştirmek bildirim yağdırmasın.
 * @returns {{ tepki: string, sayi: number, ozet: { tepki: string, n: number }[] } | null}
 */
export function begen(chatJid, userJid, id, now = Date.now(), tepki = '❤️') {
  const d = db()
  if (!d) return null
  if (!TEPKILER.includes(tepki)) tepki = '❤️'
  const g = d.prepare('SELECT user_jid FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g) return null
  return d.transaction(() => {
    const eski = d.prepare('SELECT tepki FROM sosyal_begeni WHERE gonderi_id = ? AND user_jid = ?').get(id, userJid)?.tepki
    let yeni = ''
    if (eski === tepki) d.prepare('DELETE FROM sosyal_begeni WHERE gonderi_id = ? AND user_jid = ?').run(id, userJid)
    else {
      d.prepare(`INSERT INTO sosyal_begeni (gonderi_id, user_jid, tepki, zaman) VALUES (?, ?, ?, ?)
        ON CONFLICT (gonderi_id, user_jid) DO UPDATE SET tepki = excluded.tepki`).run(id, userJid, tepki, now)
      if (!eski) bildir(d, { chatJid, userJid: g.user_jid, kimden: userJid, tur: 'begeni', gonderiId: id, now })
      yeni = tepki
    }
    const ozet = d.prepare('SELECT tepki, COUNT(*) AS n FROM sosyal_begeni WHERE gonderi_id = ? GROUP BY tepki ORDER BY n DESC').all(id)
    return { tepki: yeni, sayi: ozet.reduce((t, x) => t + x.n, 0), ozet }
  })()
}

/** Anketin sonucu; anket yoksa null. Oy verenler oy verince ya da anket bitince gösterilir. */
export function anketOku(d, gonderiId, izleyen, now = Date.now()) {
  const a = d.prepare('SELECT * FROM sosyal_anket WHERE gonderi_id = ?').get(gonderiId)
  if (!a) return null
  const oylar = d.prepare('SELECT user_jid, secim FROM sosyal_anket_oy WHERE gonderi_id = ? ORDER BY zaman').all(gonderiId)
  const secenekler = JSON.parse(a.secenekler).map((metin, i) => {
    const verenler = oylar.filter((o) => o.secim === i).map((o) => o.user_jid)
    return { metin, oy: verenler.length, verenler }
  })
  return { secenekler, toplam: oylar.length, benim: oylar.find((o) => o.user_jid === izleyen)?.secim ?? -1, bitis: a.bitis, bitti: now >= a.bitis }
}

/** @returns {{ tamam: true } | { hata: string }} Oy değiştirilebilir; bildirim yalnızca ilk oyda. */
export function anketOy(chatJid, userJid, gonderiId, secim, now = Date.now()) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const g = d.prepare('SELECT g.user_jid, a.secenekler, a.bitis FROM sosyal_gonderi g JOIN sosyal_anket a ON a.gonderi_id = g.id WHERE g.chat_jid = ? AND g.id = ?').get(chatJid, gonderiId)
  if (!g) return { hata: 'Anket bulunamadı.' }
  if (now >= g.bitis) return { hata: 'Anket sona erdi.' }
  if (!Number.isInteger(secim) || secim < 0 || secim >= JSON.parse(g.secenekler).length) return { hata: 'Seçenek yok.' }
  d.transaction(() => {
    const eski = d.prepare('SELECT secim FROM sosyal_anket_oy WHERE gonderi_id = ? AND user_jid = ?').get(gonderiId, userJid)
    d.prepare(`INSERT INTO sosyal_anket_oy (gonderi_id, user_jid, secim, zaman) VALUES (?, ?, ?, ?)
      ON CONFLICT (gonderi_id, user_jid) DO UPDATE SET secim = excluded.secim`).run(gonderiId, userJid, secim, now)
    if (!eski) bildir(d, { chatJid, userJid: g.user_jid, kimden: userJid, tur: 'anket_oy', gonderiId, now })
  })()
  return { tamam: true }
}

/** Yorumlar tepki özetiyle; yanıtlar ana yorumun `yanitlar` dizisinde. */
function yorumlariOku(d, gonderiId, izleyen) {
  const ozet = d.prepare('SELECT tepki, COUNT(*) AS n FROM sosyal_yorum_tepki WHERE yorum_id = ? GROUP BY tepki ORDER BY n DESC')
  const benim = d.prepare('SELECT tepki FROM sosyal_yorum_tepki WHERE yorum_id = ? AND user_jid = ?')
  const hepsi = d.prepare('SELECT * FROM sosyal_yorum WHERE gonderi_id = ? ORDER BY id').all(gonderiId).map((y) => {
    const tepkiler = ozet.all(y.id)
    return { ...y, tepkiler, begeni: tepkiler.reduce((t, x) => t + x.n, 0), benimTepkim: benim.get(y.id, izleyen)?.tepki ?? '', yanitlar: [] }
  })
  const ana = new Map(hepsi.filter((y) => !y.yanit_id).map((y) => [y.id, y]))
  for (const y of hepsi) if (y.yanit_id) ana.get(y.yanit_id)?.yanitlar.push(y)
  return [...ana.values()]
}

/** Ana yorumlar ve yanıtlar birlikte. */
export const yorumSayisi = (g) => g.yorumlar.reduce((t, y) => t + 1 + y.yanitlar.length, 0)

/** Tek yorumu (yanıtlarıyla) okur; betik yorumu yerinde yenilerken kullanır. */
export function yorumOku(chatJid, izleyen, yorumId) {
  const d = db()
  const y = d?.prepare(`SELECT y.gonderi_id, y.yanit_id, y.id FROM sosyal_yorum y JOIN sosyal_gonderi g ON g.id = y.gonderi_id
    WHERE y.id = ? AND g.chat_jid = ?`).get(yorumId, chatJid)
  if (!y) return null
  return yorumlariOku(d, y.gonderi_id, izleyen).find((a) => a.id === (y.yanit_id || y.id)) ?? null
}

/**
 * @returns {object | null} yazılan yorum. `yanitId` verilirse yanıttır; yanıtın yanıtı ana yorumun
 * altına düşer (tek seviye). Yanıtlanana "yanit", gönderi sahibine "yorum" bildirimi düşer, kimseye iki kez değil.
 */
export function yorumYaz(chatJid, userJid, id, metin, now = Date.now(), yanitId = 0) {
  const d = db()
  const temiz = temizMetin(metin, YORUM_AZAMI)
  if (!d || !temiz) return null
  const g = d.prepare('SELECT user_jid FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g) return null
  let anaId = 0
  let yanitlanan = ''
  if (yanitId) {
    const y = d.prepare('SELECT id, user_jid, yanit_id FROM sosyal_yorum WHERE id = ? AND gonderi_id = ?').get(yanitId, id)
    if (!y) return null
    anaId = y.yanit_id || y.id
    yanitlanan = y.user_jid
  }
  const liste = uyeler(chatJid)
  return d.transaction(() => {
    const yorumId = Number(d.prepare('INSERT INTO sosyal_yorum (gonderi_id, user_jid, metin, yanit_id, zaman) VALUES (?, ?, ?, ?, ?)')
      .run(id, userJid, temiz, anaId, now).lastInsertRowid)
    const bildirilen = new Set()
    const bildirBir = (jid, tur) => {
      if (!jid || bildirilen.has(jid)) return
      bildirilen.add(jid)
      bildir(d, { chatJid, userJid: jid, kimden: userJid, tur, gonderiId: id, now })
    }
    bildirBir(yanitlanan, 'yanit')
    for (const jid of etiketleriBul(temiz, liste)) bildirBir(jid, 'etiket')
    bildirBir(g.user_jid, 'yorum')
    return { id: yorumId, gonderi_id: id, user_jid: userJid, metin: temiz, yanit_id: anaId, zaman: now }
  })()
}

/**
 * Yoruma tepki; gönderi tepkisiyle aynı kural (aynısı kaldırır, başkası değiştirir, ilkinde bildirim).
 * @returns {number | null} tepki verilen yorumun ana yorum id'si
 */
export function yorumTepki(chatJid, userJid, yorumId, tepki = '❤️', now = Date.now()) {
  const d = db()
  if (!d) return null
  if (!TEPKILER.includes(tepki)) tepki = '❤️'
  const y = d.prepare(`SELECT y.* FROM sosyal_yorum y JOIN sosyal_gonderi g ON g.id = y.gonderi_id
    WHERE y.id = ? AND g.chat_jid = ?`).get(yorumId, chatJid)
  if (!y) return null
  d.transaction(() => {
    const eski = d.prepare('SELECT tepki FROM sosyal_yorum_tepki WHERE yorum_id = ? AND user_jid = ?').get(yorumId, userJid)?.tepki
    if (eski === tepki) {
      d.prepare('DELETE FROM sosyal_yorum_tepki WHERE yorum_id = ? AND user_jid = ?').run(yorumId, userJid)
      return
    }
    d.prepare(`INSERT INTO sosyal_yorum_tepki (yorum_id, user_jid, tepki, zaman) VALUES (?, ?, ?, ?)
      ON CONFLICT (yorum_id, user_jid) DO UPDATE SET tepki = excluded.tepki`).run(yorumId, userJid, tepki, now)
    if (!eski) bildir(d, { chatJid, userJid: y.user_jid, kimden: userJid, tur: 'yorum_tepki', gonderiId: y.gonderi_id, now })
  })()
  return y.yanit_id || y.id
}

/** Bu id'den yeni gönderi sayısı ("yeni gönderi var" şeridi). */
export function yeniGonderiSayisi(chatJid, sonId, haric = '') {
  return db()?.prepare('SELECT COUNT(*) AS n FROM sosyal_gonderi WHERE chat_jid = ? AND id > ? AND user_jid <> ?').get(chatJid, sonId, haric).n ?? 0
}

/** Yorumu yazan da gönderinin sahibi de silebilir. */
export function yorumSil(chatJid, userJid, yorumId, { zorla = false } = {}) {
  const d = db()
  if (!d) return false
  const y = d.prepare(`SELECT y.id FROM sosyal_yorum y JOIN sosyal_gonderi g ON g.id = y.gonderi_id
    WHERE y.id = ? AND g.chat_jid = ? AND (? OR y.user_jid = ? OR g.user_jid = ?)`).get(yorumId, chatJid, zorla ? 1 : 0, userJid, userJid)
  if (!y) return false
  // Ana yorum yanıtlarıyla gider, yoksa yanıtlar sahipsiz kalırdı.
  d.transaction(() => {
    d.prepare('DELETE FROM sosyal_yorum_tepki WHERE yorum_id IN (SELECT id FROM sosyal_yorum WHERE id = ? OR yanit_id = ?)').run(yorumId, yorumId)
    d.prepare('DELETE FROM sosyal_yorum WHERE id = ? OR yanit_id = ?').run(yorumId, yorumId)
  })()
  return true
}

// --- Dürtme --------------------------------------------------------------

/** @returns {{ tamam: true } | { bekleMs: number } | null} */
export function durt(chatJid, kimden, kime, now = Date.now()) {
  const d = db()
  if (!d || kimden === kime) return null
  const son = d.prepare('SELECT zaman FROM sosyal_durt WHERE chat_jid = ? AND kimden = ? AND kime = ?').get(chatJid, kimden, kime)?.zaman ?? 0
  if (now - son < DURT_ARALIGI_MS) return { bekleMs: son + DURT_ARALIGI_MS - now }
  d.transaction(() => {
    d.prepare(`INSERT INTO sosyal_durt (chat_jid, kimden, kime, zaman) VALUES (?, ?, ?, ?)
      ON CONFLICT (chat_jid, kimden, kime) DO UPDATE SET zaman = excluded.zaman`).run(chatJid, kimden, kime, now)
    bildir(d, { chatJid, userJid: kime, kimden, tur: 'durt', now })
  })()
  return { tamam: true }
}

// --- DM ------------------------------------------------------------------

export function dmYaz({ chatJid, gonderen, alici, metin = '', medya = '', hikayeId = 0, now = Date.now() }) {
  const d = db()
  const temiz = temizMetin(metin, DM_AZAMI)
  if (!d || (!temiz && !medya) || gonderen === alici) return null
  const id = Number(d.prepare('INSERT INTO sosyal_dm (chat_jid, gonderen, alici, metin, medya, hikaye_id, zaman) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(chatJid, gonderen, alici, temiz, medya, hikayeId, now).lastInsertRowid)
  kancaCagir(chatJid, alici)
  return id
}

/** Kişinin konuşmaları: karşı taraf başına son mesaj ve okunmamış sayısı. */
export function konusmalar(chatJid, userJid) {
  const d = db()
  if (!d) return []
  const sonOku = d.prepare('SELECT * FROM sosyal_dm WHERE id = ?')
  return d.prepare(`
    SELECT ile, MAX(id) AS son_id,
      SUM(CASE WHEN alici = @u AND okundu = 0 THEN 1 ELSE 0 END) AS okunmamis
    FROM (SELECT id, alici, okundu, CASE WHEN gonderen = @u THEN alici ELSE gonderen END AS ile
          FROM sosyal_dm WHERE chat_jid = @c AND (gonderen = @u OR alici = @u))
    GROUP BY ile ORDER BY son_id DESC
  `).all({ c: chatJid, u: userJid }).map((k) => ({ ...k, son: sonOku.get(k.son_id) }))
}

/** İki kişi arasındaki mesajlar, `sonId`'den yeniler; gelenler okundu işaretlenir. */
export function dmAkis(chatJid, userJid, ile, { sonId = 0, adet = 100 } = {}) {
  const d = db()
  if (!d) return []
  d.prepare('UPDATE sosyal_dm SET okundu = 1 WHERE chat_jid = ? AND gonderen = ? AND alici = ? AND okundu = 0').run(chatJid, ile, userJid)
  return d.prepare(`
    SELECT * FROM (SELECT * FROM sosyal_dm WHERE chat_jid = ? AND id > ?
      AND ((gonderen = ? AND alici = ?) OR (gonderen = ? AND alici = ?)) ORDER BY id DESC LIMIT ?) ORDER BY id
  `).all(chatJid, sonId, userJid, ile, ile, userJid, adet)
}

/** Karşı tarafın okuduğu, benim gönderdiğim son mesajın id'si ("Görüldü"); hiç yoksa 0. */
export function dmGoruldu(chatJid, userJid, ile) {
  return db()?.prepare('SELECT MAX(id) AS id FROM sosyal_dm WHERE chat_jid = ? AND gonderen = ? AND alici = ? AND okundu = 1')
    .get(chatJid, userJid, ile)?.id ?? 0
}

// --- Hikâye --------------------------------------------------------------

function hikayeSil(d, h) {
  d.prepare('DELETE FROM sosyal_hikaye WHERE id = ?').run(h.id)
  d.prepare('DELETE FROM sosyal_izleme WHERE hikaye_id = ?').run(h.id)
  medyaSil(h.medya)
}

/**
 * Süresi dolanı ve panel hesabı olan herkesin gördüğünü siler. İzleme HIKAYE_MEDYA_MS
 * eskimeden sayılmaz: son izleyici görseli yükleyemeden dosya silinmesin.
 */
export function hikayeTemizle(chatJid, now = Date.now()) {
  const d = db()
  if (!d) return
  const izleyici = d.prepare('SELECT COUNT(*) AS n FROM panel_hesap WHERE chat_jid = ? AND user_jid <> ?')
  const izlenme = d.prepare(`SELECT COUNT(*) AS n FROM sosyal_izleme i
    JOIN panel_hesap h ON h.chat_jid = ? AND h.user_jid = i.user_jid WHERE i.hikaye_id = ? AND i.zaman <= ?`)
  for (const h of d.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ?').all(chatJid)) {
    const gerekli = izleyici.get(chatJid, h.user_jid).n
    if (now - h.zaman > HIKAYE_AZAMI_MS || (gerekli > 0 && izlenme.get(chatJid, h.id, now - HIKAYE_MEDYA_MS).n >= gerekli)) hikayeSil(d, h)
  }
}

export function hikayeYaz({ chatJid, userJid, medya, metin = '', now = Date.now() }) {
  const d = db()
  if (!d) return 0
  return Number(d.prepare('INSERT INTO sosyal_hikaye (chat_jid, user_jid, medya, metin, zaman) VALUES (?, ?, ?, ?, ?)')
    .run(chatJid, userJid, medya, temizMetin(metin, 120), now).lastInsertRowid)
}

/** Hikâye şeridi: kişi başına görülmemiş hikâyeler. Kendi hikâyeleri `benim`de, izleyenleriyle. */
export function hikayeler(chatJid, izleyen, now = Date.now()) {
  const d = db()
  if (!d) return { kisiler: [], benim: [] }
  hikayeTemizle(chatJid, now)
  const hepsi = d.prepare(`
    SELECT h.*, EXISTS (SELECT 1 FROM sosyal_izleme i WHERE i.hikaye_id = h.id AND i.user_jid = ?) AS gordum
    FROM sosyal_hikaye h WHERE h.chat_jid = ? ORDER BY h.id
  `).all(izleyen, chatJid)
  const izleyenler = d.prepare('SELECT user_jid, zaman, tepki FROM sosyal_izleme WHERE hikaye_id = ? ORDER BY zaman')
  const benim = hepsi.filter((h) => h.user_jid === izleyen).map((h) => ({ ...h, izleyenler: izleyenler.all(h.id) }))
  const kisiler = new Map()
  for (const h of hepsi) {
    if (h.user_jid === izleyen || h.gordum) continue
    if (!kisiler.has(h.user_jid)) kisiler.set(h.user_jid, [])
    kisiler.get(h.user_jid).push(h)
  }
  return { kisiler: [...kisiler].map(([jid, liste]) => ({ jid, liste })), benim }
}

/**
 * Hikâyeyi açar. Sahibi dışındaki herkes bir kez görebilir: ilk açılışta izleme yazılır,
 * görsel HIKAYE_MEDYA_MS içinde yüklenmeli.
 * @returns {{ hikaye: object } | { goruldu: true } | null}
 */
export function hikayeAc(chatJid, izleyen, id, now = Date.now()) {
  const d = db()
  const h = d?.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!h) return null
  if (h.user_jid === izleyen) return { hikaye: h }
  const yazildi = d.prepare('INSERT OR IGNORE INTO sosyal_izleme (hikaye_id, user_jid, zaman) VALUES (?, ?, ?)').run(id, izleyen, now)
  return yazildi.changes ? { hikaye: h } : { goruldu: true }
}

/**
 * Hikâyeye tepki ya da yanıt (Faz 70). Yalnızca hikâyeyi görmüş kişi yazar (izleme satırı); yanıt
 * sahibine DM olarak düşer, tepki ayrıca izleyen listesinde görünür. Hikâye bir kez görüldüğü için
 * ikinci tepki öncekinin yerine geçer. @returns {{ tamam: true } | { hata: string }}
 */
export function hikayeYanit(chatJid, userJid, hikayeId, { tepki = '', metin = '' } = {}, now = Date.now()) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const h = d.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ? AND id = ?').get(chatJid, hikayeId)
  if (!h) return { hata: 'Bu hikâye artık yok.' }
  if (h.user_jid === userJid) return { hata: 'Kendi hikâyene yanıt veremezsin.' }
  if (!d.prepare('SELECT 1 FROM sosyal_izleme WHERE hikaye_id = ? AND user_jid = ?').get(hikayeId, userJid)) return { hata: 'Önce hikâyeyi aç.' }
  const temiz = temizMetin(metin, DM_AZAMI)
  if (tepki && !TEPKILER.includes(tepki)) tepki = ''
  if (!tepki && !temiz) return { hata: 'Boş yanıt gönderilmez.' }
  d.transaction(() => {
    if (tepki) d.prepare('UPDATE sosyal_izleme SET tepki = ? WHERE hikaye_id = ? AND user_jid = ?').run(tepki, hikayeId, userJid)
    dmYaz({ chatJid, gonderen: userJid, alici: h.user_jid, metin: tepki || temiz, hikayeId, now })
  })()
  return { tamam: true }
}

/** Hikâye görselinin dosya adı; izin yoksa null. */
export function hikayeMedyasi(chatJid, izleyen, id, now = Date.now()) {
  const d = db()
  const h = d?.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!h) return null
  if (h.user_jid === izleyen) return h.medya
  const i = d.prepare('SELECT zaman FROM sosyal_izleme WHERE hikaye_id = ? AND user_jid = ?').get(id, izleyen)
  return i && now - i.zaman <= HIKAYE_MEDYA_MS ? h.medya : null
}

// --- Web Push aboneliği (Faz 67) ---------------------------------------------

export function pushKaydet({ endpoint, numara = '', lid = '', now = Date.now() }) {
  db()?.prepare(`INSERT INTO sosyal_push (endpoint, numara, lid, zaman) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET numara = excluded.numara, lid = excluded.lid, zaman = excluded.zaman`).run(endpoint, numara, lid, now)
}

export function pushSil(endpoint) {
  db()?.prepare('DELETE FROM sosyal_push WHERE endpoint = ?').run(endpoint)
}

/** Gruptaki üyenin bütün cihazları: hesabın numara ya da lid'i üzerinden. */
export function pushAlicilari(chatJid, userJid) {
  return db()?.prepare(`
    SELECT DISTINCT p.endpoint FROM panel_hesap h
    JOIN sosyal_push p ON (h.numara <> '' AND p.numara = h.numara) OR (h.lid <> '' AND p.lid = h.lid)
    WHERE h.chat_jid = ? AND h.user_jid = ?
  `).all(chatJid, userJid).map((r) => r.endpoint) ?? []
}

/**
 * Bildirimin metni: kişinin bütün gruplarındaki en yeni okunmamış bildirim ya da DM.
 * Push boş gittiği için servis işçisi bunu çeker. @param {{ chat_jid, user_jid }[]} hesaplar
 */
export function sonOkunmamis(hesaplar) {
  const d = db()
  if (!d) return null
  let en = null
  for (const h of hesaplar) {
    const b = d.prepare('SELECT *, \'bildirim\' AS kaynak FROM sosyal_bildirim WHERE chat_jid = ? AND user_jid = ? AND okundu = 0 ORDER BY id DESC LIMIT 1').get(h.chat_jid, h.user_jid)
    const m = d.prepare('SELECT *, \'dm\' AS kaynak FROM sosyal_dm WHERE chat_jid = ? AND alici = ? AND okundu = 0 ORDER BY id DESC LIMIT 1').get(h.chat_jid, h.user_jid)
    const s = d.prepare(`SELECT m.*, s.chat_jid, s.ad, 'sohbet' AS kaynak FROM sosyal_sohbet_mesaj m JOIN sosyal_sohbet s ON s.id = m.sohbet_id
      JOIN sosyal_sohbet_uye u ON u.sohbet_id = m.sohbet_id AND u.user_jid = ?
      WHERE s.chat_jid = ? AND m.id > u.son_okunan AND m.gonderen NOT IN ('', ?) ORDER BY m.id DESC LIMIT 1`).get(h.user_jid, h.chat_jid, h.user_jid)
    for (const x of [b, m, s]) if (x && (!en || x.zaman > en.zaman)) en = x
  }
  return en
}

// --- Haftalık gazete (Faz 69) ----------------------------------------------

const GUN_AY = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' })

/**
 * Yeni haftanın ilk akış açılışında geçen haftanın özetini akışa yazar. Bot kendiliğinden
 * yazmadığı için tetik paneldir; hafta işareti `ayar`'dadır ve yazmayla aynı transaction'da
 * denetlenir, iki istek aynı anda gelse de gazete bir kez çıkar. @returns {number} gönderi id, 0 = yok
 */
export function gazeteKontrol(chatJid, now = Date.now(), xpVer = null) {
  const d = db()
  if (!d) return 0
  const hafta = haftaAnahtari(new Date(now))
  const anahtar = `gazete:${chatJid}`
  if (d.prepare('SELECT deger FROM ayar WHERE anahtar = ?').get(anahtar)?.deger === hafta) return 0
  const bitis = Date.parse(`${hafta}T00:00:00+03:00`)
  const bas = bitis - 7 * 86_400_000
  return d.transaction(() => {
    if (d.prepare('SELECT deger FROM ayar WHERE anahtar = ?').get(anahtar)?.deger === hafta) return 0
    d.prepare('INSERT INTO ayar (anahtar, deger) VALUES (?, ?) ON CONFLICT (anahtar) DO UPDATE SET deger = excluded.deger').run(anahtar, hafta)
    const ozet = gazeteOzeti(d, chatJid, bas, bitis)
    if (!ozet) return 0
    // Haftanın gönderisi: sahibi XP alır (bot sahibinin kararı), gönderide 🏆 görünür.
    let metin = ozet.metin
    const k = ozet.kazanan
    if (k) {
      const xp = xpVer?.({ chatJid, userJid: k.user_jid, taban: HAFTA_ODUL_TABAN, now }) ?? 0
      d.prepare('INSERT OR IGNORE INTO sosyal_hafta_gonderi (chat_jid, hafta, gonderi_id, user_jid, xp) VALUES (?, ?, ?, ?, ?)')
        .run(chatJid, haftaAnahtari(new Date(bas)), k.id, k.user_jid, xp)
      metin += `\n\n🏆 Haftanın gönderisi: ${uyeBul(chatJid, k.user_jid)?.ad || 'Biri'}${xp ? ` · +${xp.toLocaleString('tr-TR')} XP` : ''}`
      bildir(d, { chatJid, userJid: k.user_jid, kimden: '', tur: 'hafta', gonderiId: k.id, now })
    }
    const id = Number(d.prepare("INSERT INTO sosyal_gonderi (chat_jid, user_jid, metin, alinti_id, zaman) VALUES (?, '', ?, ?, ?)")
      .run(chatJid, temizMetin(metin, METIN_AZAMI), ozet.alintiId, now).lastInsertRowid)
    return id
  })()
}

/** Geçen haftanın gazete metni; hafta boşsa null. Bot gönderileri sayılmaz. */
export function gazeteOzeti(d, chatJid, bas, bitis) {
  const aralik = "g.chat_jid = ? AND g.zaman >= ? AND g.zaman < ? AND g.user_jid <> ''"
  const p = [chatJid, bas, bitis]
  const gonderi = d.prepare(`SELECT COUNT(*) AS n FROM sosyal_gonderi g WHERE ${aralik}`).get(...p).n
  if (!gonderi) return null
  const yorum = d.prepare(`SELECT COUNT(*) AS n FROM sosyal_yorum y JOIN sosyal_gonderi g ON g.id = y.gonderi_id WHERE ${aralik}`).get(...p).n
  const tepki = d.prepare(`SELECT COUNT(*) AS n FROM sosyal_begeni b JOIN sosyal_gonderi g ON g.id = b.gonderi_id WHERE ${aralik}`).get(...p).n
  // Sahibinin kendi tepkisi sayılmaz: kendi gönderisini beğenip seçilmesin.
  const enTepki = d.prepare(`SELECT g.id, g.user_jid, COUNT(*) AS n FROM sosyal_begeni b JOIN sosyal_gonderi g ON g.id = b.gonderi_id
    WHERE ${aralik} AND b.user_jid <> g.user_jid GROUP BY g.id ORDER BY n DESC, g.id LIMIT 1`).get(...p)
  const enYorum = d.prepare(`SELECT g.id, g.user_jid, COUNT(*) AS n FROM sosyal_yorum y JOIN sosyal_gonderi g ON g.id = y.gonderi_id
    WHERE ${aralik} GROUP BY g.id ORDER BY n DESC, g.id LIMIT 1`).get(...p)
  const enCok = d.prepare(`SELECT g.user_jid, COUNT(*) AS n FROM sosyal_gonderi g WHERE ${aralik} GROUP BY g.user_jid ORDER BY n DESC LIMIT 1`).get(...p)
  const sayac = new Map()
  for (const r of d.prepare(`SELECT g.user_jid, g.metin FROM sosyal_gonderi g WHERE ${aralik}`).all(...p)) {
    for (const e of hashtagler(r.metin)) (sayac.get(e) ?? sayac.set(e, new Set()).get(e)).add(r.user_jid)
  }
  const etiketler = [...sayac].sort((a, b) => b[1].size - a[1].size).slice(0, 3).map(([e]) => `#${e}`)
  const ad = (jid) => uyeBul(chatJid, jid)?.ad || 'Biri'

  const satirlar = [`📰 HAFTANIN GAZETESİ · ${GUN_AY.format(bas)} – ${GUN_AY.format(bitis - 1)}`, '',
    `✍️ Bu hafta ${gonderi} gönderi, ${yorum} yorum, ${tepki} tepki.`]
  if (enTepki) satirlar.push(`🏆 En çok tepki alan: ${ad(enTepki.user_jid)} (${enTepki.n} tepki), aşağıda.`)
  if (enYorum && enYorum.id !== enTepki?.id) satirlar.push(`💬 En çok konuşulan: ${ad(enYorum.user_jid)} (${enYorum.n} yorum).`)
  if (enCok) satirlar.push(`📣 En çok paylaşan: ${ad(enCok.user_jid)} (${enCok.n} gönderi).`)
  if (etiketler.length) satirlar.push(`#️⃣ Gündem: ${etiketler.join(' ')}`)
  return {
    metin: satirlar.join('\n'),
    alintiId: enTepki?.id ?? enYorum?.id ?? 0,
    kazanan: enTepki && enTepki.n >= HAFTA_ODUL_EN_AZ ? enTepki : null,
  }
}

// --- Etkinlik (Faz 70) -------------------------------------------------------

/**
 * Etkinlik girdisini denetler. Tarih ve saat İstanbul saatidir (Türkiye'de yaz saati yok, +03:00 sabit).
 * @returns {{ baslik: string, yer: string, zaman: number } | { hata: string }}
 */
export function etkinlikHazirla({ baslik = '', tarih = '', saat = '', yer = '' }, now = Date.now()) {
  const temizBaslik = temizMetin(baslik, ETKINLIK_METIN_AZAMI)
  if (!temizBaslik) return { hata: 'Etkinliğin adını yaz.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || !/^\d{2}:\d{2}$/.test(saat)) return { hata: 'Etkinliğin tarihini ve saatini seç.' }
  const zaman = Date.parse(`${tarih}T${saat}:00+03:00`)
  if (!Number.isFinite(zaman)) return { hata: 'Tarih okunamadı.' }
  if (zaman <= now) return { hata: 'Etkinlik ileri bir tarihte olmalı.' }
  if (zaman - now > ETKINLIK_EN_UZAK_MS) return { hata: 'Etkinlik en çok bir yıl sonrası için kurulur.' }
  return { baslik: temizBaslik, yer: temizMetin(yer, ETKINLIK_METIN_AZAMI), zaman }
}

/** Etkinlik ve katılım listesi; etkinlik yoksa null. */
export function etkinlikOku(d, gonderiId, izleyen, now = Date.now()) {
  const e = d.prepare('SELECT * FROM sosyal_etkinlik WHERE gonderi_id = ?').get(gonderiId)
  if (!e) return null
  const katilim = Object.fromEntries(KATILIM.map((k) => [k, []]))
  let benim = ''
  for (const k of d.prepare('SELECT user_jid, durum FROM sosyal_katilim WHERE gonderi_id = ? ORDER BY zaman').all(gonderiId)) {
    katilim[k.durum]?.push(k.user_jid)
    if (k.user_jid === izleyen) benim = k.durum
  }
  return { baslik: e.baslik, yer: e.yer, zaman: e.zaman, gecti: now >= e.zaman, katilim, benim }
}

/**
 * Katılım bildirir. Aynı durum ikinci kez gelirse kalkar (anketteki gibi değiştirilebilir).
 * Bildirim yalnızca ilk "geliyorum"da düşer. @returns {{ tamam: true } | { hata: string }}
 */
export function etkinlikKatil(chatJid, userJid, gonderiId, durum, now = Date.now()) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  if (!KATILIM.includes(durum)) return { hata: 'Böyle bir seçenek yok.' }
  const g = d.prepare('SELECT g.user_jid, e.zaman FROM sosyal_gonderi g JOIN sosyal_etkinlik e ON e.gonderi_id = g.id WHERE g.chat_jid = ? AND g.id = ?').get(chatJid, gonderiId)
  if (!g) return { hata: 'Etkinlik bulunamadı.' }
  if (now >= g.zaman) return { hata: 'Etkinlik başladı ya da geçti.' }
  d.transaction(() => {
    const eski = d.prepare('SELECT durum FROM sosyal_katilim WHERE gonderi_id = ? AND user_jid = ?').get(gonderiId, userJid)?.durum
    if (eski === durum) {
      d.prepare('DELETE FROM sosyal_katilim WHERE gonderi_id = ? AND user_jid = ?').run(gonderiId, userJid)
      return
    }
    d.prepare(`INSERT INTO sosyal_katilim (gonderi_id, user_jid, durum, zaman) VALUES (?, ?, ?, ?)
      ON CONFLICT (gonderi_id, user_jid) DO UPDATE SET durum = excluded.durum`).run(gonderiId, userJid, durum, now)
    if (durum === 'evet' && !eski) bildir(d, { chatJid, userJid: g.user_jid, kimden: userJid, tur: 'etkinlik_katil', gonderiId, now })
  })()
  return { tamam: true }
}

/** Yan sütun için bu gruptaki yaklaşan etkinlikler, en yakın önce. */
export function yaklasanEtkinlikler(chatJid, now = Date.now(), adet = 3) {
  return db()?.prepare(`SELECT e.gonderi_id AS id, e.baslik, e.yer, e.zaman,
      (SELECT COUNT(*) FROM sosyal_katilim k WHERE k.gonderi_id = e.gonderi_id AND k.durum = 'evet') AS gelen
    FROM sosyal_etkinlik e JOIN sosyal_gonderi g ON g.id = e.gonderi_id
    WHERE g.chat_jid = ? AND e.zaman > ? ORDER BY e.zaman LIMIT ?`).all(chatJid, now, adet) ?? []
}

/**
 * Başlamasına ETKINLIK_HATIRLAT_MS kalan etkinliklerde "geliyorum" ve "belki" diyenlere bildirim
 * yazar (push kancası telefona iletir). Panel birkaç dakikada bir çağırır; işaret ve bildirim aynı
 * transaction'dadır, hatırlatma bir kez gider. @returns {number} hatırlatılan etkinlik sayısı
 */
export function etkinlikHatirlat(now = Date.now()) {
  const d = db()
  if (!d) return 0
  const yakin = d.prepare(`SELECT e.gonderi_id, g.chat_jid, g.user_jid FROM sosyal_etkinlik e JOIN sosyal_gonderi g ON g.id = e.gonderi_id
    WHERE e.hatirlatildi = 0 AND e.zaman > ? AND e.zaman - ? <= ?`).all(now, now, ETKINLIK_HATIRLAT_MS)
  for (const e of yakin) {
    d.transaction(() => {
      if (!d.prepare('UPDATE sosyal_etkinlik SET hatirlatildi = 1 WHERE gonderi_id = ? AND hatirlatildi = 0').run(e.gonderi_id).changes) return
      for (const k of d.prepare("SELECT user_jid FROM sosyal_katilim WHERE gonderi_id = ? AND durum IN ('evet', 'belki')").all(e.gonderi_id)) {
        bildir(d, { chatJid: e.chat_jid, userJid: k.user_jid, kimden: e.user_jid, tur: 'etkinlik_yakin', gonderiId: e.gonderi_id, now })
      }
    })()
  }
  return yakin.length
}

// --- Arama (Faz 70) ----------------------------------------------------------

/**
 * Kişi, etiket ve gönderi arar; büyük-küçük harf ve Türkçe harf farkı gözetmez. Gönderiler son
 * 3000 içinden süzülür: SQLite'ın lower()'ı Türkçe harfleri bilmez.
 */
export function ara(chatJid, izleyen, sorgu, { adet = AKIS_SAYFA } = {}) {
  const bos = { kisiler: [], etiketler: [], gonderiler: [] }
  const d = db()
  const aranan = katla(String(sorgu).trim().replace(/^[#@]/, ''))
  if (!d || aranan.length < ARAMA_EN_AZ) return bos
  const kisiler = uyeler(chatJid).filter((u) => u.ad && katla(u.ad).includes(aranan))
  const adaylar = d.prepare("SELECT * FROM sosyal_gonderi WHERE chat_jid = ? AND metin <> '' ORDER BY id DESC LIMIT 3000").all(chatJid)
  const etiketSayim = new Map()
  const bulunan = []
  for (const g of adaylar) {
    const metin = katla(g.metin)
    if (!metin.includes(aranan)) continue
    if (bulunan.length < adet) bulunan.push(g)
    for (const e of hashtagler(g.metin)) if (katla(e).includes(aranan)) etiketSayim.set(e, (etiketSayim.get(e) ?? 0) + 1)
  }
  const etiketler = [...etiketSayim].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ad, sayi]) => ({ ad, sayi }))
  return { kisiler, etiketler, gonderiler: bulunan.map((g) => gonderiDoldur(d, chatJid, izleyen, g)) }
}

// --- Grup sohbeti (Faz 70) ---------------------------------------------------

const sistemNotu = (d, sohbetId, metin, now) =>
  Number(d.prepare("INSERT INTO sosyal_sohbet_mesaj (sohbet_id, gonderen, metin, zaman) VALUES (?, '', ?, ?)").run(sohbetId, metin, now).lastInsertRowid)
const adBul = (chatJid, jid) => uyeBul(chatJid, jid)?.ad || 'Biri'

/** Panel hesabı olan grup üyeleri: grup sohbetine yalnızca mesaj okuyabilen eklenir. */
function sohbetUyeleriDenetle(chatJid, jidler) {
  const panelde = new Set(uyeler(chatJid).filter((u) => u.panelde).map((u) => u.jid))
  return [...new Set(jidler)].filter((j) => panelde.has(j))
}

/** @returns {{ id: number } | { hata: string }} Kuran dahil en az SOHBET_EN_AZ kişi. */
export function sohbetKur({ chatJid, kuran, ad = '', uyeJidler = [], now = Date.now() }) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const secilen = sohbetUyeleriDenetle(chatJid, uyeJidler).filter((j) => j !== kuran)
  if (secilen.length + 1 < SOHBET_EN_AZ) return { hata: 'Grup sohbeti için en az iki kişi seç. Tek kişiyle normal mesaj at.' }
  if (secilen.length + 1 > SOHBET_UYE_AZAMI) return { hata: `Bir sohbette en çok ${SOHBET_UYE_AZAMI} kişi olur.` }
  const temizAd = temizMetin(ad, SOHBET_AD_AZAMI) || [kuran, ...secilen].map((j) => adBul(chatJid, j).split(' ')[0]).join(', ').slice(0, SOHBET_AD_AZAMI)
  const id = d.transaction(() => {
    const sohbetId = Number(d.prepare('INSERT INTO sosyal_sohbet (chat_jid, ad, kuran, zaman) VALUES (?, ?, ?, ?)').run(chatJid, temizAd, kuran, now).lastInsertRowid)
    const not = sistemNotu(d, sohbetId, `${adBul(chatJid, kuran)} sohbeti kurdu.`, now)
    const ekle = d.prepare('INSERT INTO sosyal_sohbet_uye (sohbet_id, user_jid, son_okunan) VALUES (?, ?, ?)')
    ekle.run(sohbetId, kuran, not)
    for (const j of secilen) ekle.run(sohbetId, j, 0)
    return sohbetId
  })()
  for (const j of secilen) kancaCagir(chatJid, j)
  return { id }
}

/** Sohbet ve üyeleri; kişi üye değilse null. */
export function sohbetOku(chatJid, userJid, id) {
  const d = db()
  const s = d?.prepare('SELECT * FROM sosyal_sohbet WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!s) return null
  const uyelik = d.prepare('SELECT user_jid, son_okunan FROM sosyal_sohbet_uye WHERE sohbet_id = ?').all(id)
  if (!uyelik.some((u) => u.user_jid === userJid)) return null
  const benimSon = d.prepare('SELECT MAX(id) AS id FROM sosyal_sohbet_mesaj WHERE sohbet_id = ? AND gonderen = ?').get(id, userJid).id ?? 0
  return { ...s, uyeler: uyelik, benimSon }
}

/** Kişinin grup sohbetleri: son mesaj ve okunmamış sayısıyla, en yeni önce. */
export function sohbetler(chatJid, userJid) {
  const d = db()
  if (!d) return []
  return d.prepare(`
    SELECT s.*, u.son_okunan,
      (SELECT MAX(m.id) FROM sosyal_sohbet_mesaj m WHERE m.sohbet_id = s.id) AS son_id,
      (SELECT COUNT(*) FROM sosyal_sohbet_mesaj m WHERE m.sohbet_id = s.id AND m.id > u.son_okunan AND m.gonderen <> @u) AS okunmamis,
      (SELECT COUNT(*) FROM sosyal_sohbet_uye x WHERE x.sohbet_id = s.id) AS kisi
    FROM sosyal_sohbet s JOIN sosyal_sohbet_uye u ON u.sohbet_id = s.id AND u.user_jid = @u
    WHERE s.chat_jid = @c ORDER BY son_id DESC
  `).all({ c: chatJid, u: userJid }).map((s) => ({ ...s, son: d.prepare('SELECT * FROM sosyal_sohbet_mesaj WHERE id = ?').get(s.son_id) }))
}

/** `sonId`'den yeni mesajlar; kişinin okuduğu son mesaj ilerler. Üye değilse boş. */
export function sohbetAkis(chatJid, userJid, id, { sonId = 0, adet = 100 } = {}) {
  const d = db()
  if (!d || !sohbetOku(chatJid, userJid, id)) return []
  const mesajlar = d.prepare(`SELECT * FROM (SELECT * FROM sosyal_sohbet_mesaj WHERE sohbet_id = ? AND id > ? ORDER BY id DESC LIMIT ?) ORDER BY id`)
    .all(id, sonId, adet)
  const son = mesajlar.at(-1)?.id
  if (son) d.prepare('UPDATE sosyal_sohbet_uye SET son_okunan = MAX(son_okunan, ?) WHERE sohbet_id = ? AND user_jid = ?').run(son, id, userJid)
  return mesajlar
}

export function sohbetYaz({ chatJid, userJid, id, metin = '', medya = '', now = Date.now() }) {
  const d = db()
  const temiz = temizMetin(metin, DM_AZAMI)
  const s = sohbetOku(chatJid, userJid, id)
  if (!d || !s || (!temiz && !medya)) return null
  const mesajId = Number(d.prepare('INSERT INTO sosyal_sohbet_mesaj (sohbet_id, gonderen, metin, medya, zaman) VALUES (?, ?, ?, ?, ?)')
    .run(id, userJid, temiz, medya, now).lastInsertRowid)
  d.prepare('UPDATE sosyal_sohbet_uye SET son_okunan = ? WHERE sohbet_id = ? AND user_jid = ?').run(mesajId, id, userJid)
  for (const u of s.uyeler) if (u.user_jid !== userJid) kancaCagir(chatJid, u.user_jid)
  return mesajId
}

/** Üye başka üye ekler. @returns {{ tamam: true } | { hata: string }} */
export function sohbetEkle(chatJid, userJid, id, yeniJidler, now = Date.now()) {
  const d = db()
  const s = sohbetOku(chatJid, userJid, id)
  if (!d || !s) return { hata: 'Bu sohbette değilsin.' }
  const mevcut = new Set(s.uyeler.map((u) => u.user_jid))
  const eklenen = sohbetUyeleriDenetle(chatJid, yeniJidler).filter((j) => !mevcut.has(j))
  if (!eklenen.length) return { hata: 'Eklenecek kimse seçilmedi.' }
  if (mevcut.size + eklenen.length > SOHBET_UYE_AZAMI) return { hata: `Bir sohbette en çok ${SOHBET_UYE_AZAMI} kişi olur.` }
  d.transaction(() => {
    for (const j of eklenen) d.prepare('INSERT INTO sosyal_sohbet_uye (sohbet_id, user_jid, son_okunan) VALUES (?, ?, 0)').run(id, j)
    sistemNotu(d, id, `${adBul(chatJid, userJid)}, ${eklenen.map((j) => adBul(chatJid, j)).join(', ')} kişisini ekledi.`, now)
  })()
  for (const j of eklenen) kancaCagir(chatJid, j)
  return { tamam: true }
}

/** Sohbetten ayrılır; son kişi de ayrılınca sohbet mesajları ve fotoğraflarıyla silinir. */
export function sohbetCik(chatJid, userJid, id, now = Date.now()) {
  const d = db()
  if (!d || !sohbetOku(chatJid, userJid, id)) return false
  const silinecekMedya = d.transaction(() => {
    d.prepare('DELETE FROM sosyal_sohbet_uye WHERE sohbet_id = ? AND user_jid = ?').run(id, userJid)
    if (d.prepare('SELECT COUNT(*) AS n FROM sosyal_sohbet_uye WHERE sohbet_id = ?').get(id).n) {
      sistemNotu(d, id, `${adBul(chatJid, userJid)} sohbetten ayrıldı.`, now)
      return []
    }
    const medya = d.prepare("SELECT medya FROM sosyal_sohbet_mesaj WHERE sohbet_id = ? AND medya <> ''").all(id).map((m) => m.medya)
    d.prepare('DELETE FROM sosyal_sohbet_mesaj WHERE sohbet_id = ?').run(id)
    d.prepare('DELETE FROM sosyal_sohbet WHERE id = ?').run(id)
    return medya
  })()
  for (const m of silinecekMedya) medyaSil(m)
  return true
}

// --- Faz 72: düzenleme, kaydetme, sabitleme, çevrimiçi, okunan yer, bahşiş -----------

/** Düz paylaşım dışındaki kendi gönderisi, yazıldıktan sonraki DUZENLEME_MS içinde. */
export function duzenlenebilir(g, userJid, now = Date.now()) {
  return Boolean(g && g.user_jid && g.user_jid === userJid && now - g.zaman < DUZENLEME_MS
    && !(g.alinti_id && !g.metin && !g.medya))
}

/**
 * Metni değiştirir, `duzenlendi` yazar. Yeni eklenen @etiketlere bildirim gitmez: düzenleyerek
 * herkese tekrar tekrar bildirim attırılmasın.
 */
export function gonderiDuzenle(chatJid, userJid, id, metin, now = Date.now()) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const g = d.prepare('SELECT * FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g) return { hata: 'Bu gönderi silinmiş.', bitti: true }
  if (!duzenlenebilir(g, userJid, now)) return { hata: 'Gönderi yalnızca ilk 10 dakikada düzenlenebilir.', bitti: true }
  const temiz = temizMetin(metin, METIN_AZAMI)
  const anket = d.prepare('SELECT 1 FROM sosyal_anket WHERE gonderi_id = ?').get(id)
  const etkinlik = d.prepare('SELECT 1 FROM sosyal_etkinlik WHERE gonderi_id = ?').get(id)
  if (!temiz && anket) return { hata: 'Anketin sorusu boş kalamaz.' }
  if (!temiz && !g.medya && !g.alinti_id && !etkinlik && !g.vurgun) return { hata: 'Boş gönderi olmaz. Silmek için Sil’i kullan.' }
  if (temiz === g.metin) return { ayni: true }
  d.prepare('UPDATE sosyal_gonderi SET metin = ?, duzenlendi = ? WHERE id = ?').run(temiz, now, id)
  return { tamam: true }
}

/** Kaydet ya da kaydı kaldır. @returns {{ kaydedildi: boolean } | null} */
export function kaydetDegistir(chatJid, userJid, id, now = Date.now()) {
  const d = db()
  if (!d || !d.prepare('SELECT 1 FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)) return null
  const sil = d.prepare('DELETE FROM sosyal_kayit WHERE chat_jid = ? AND user_jid = ? AND gonderi_id = ?').run(chatJid, userJid, id)
  if (sil.changes) return { kaydedildi: false }
  d.prepare('INSERT INTO sosyal_kayit (chat_jid, user_jid, gonderi_id, zaman) VALUES (?, ?, ?, ?)').run(chatJid, userJid, id, now)
  return { kaydedildi: true }
}

/** Kaydedilenler, en son kaydedilen önce. */
export function kaydedilenler(chatJid, userJid, adet = 50) {
  const d = db()
  if (!d) return []
  return d.prepare(`SELECT g.* FROM sosyal_kayit k JOIN sosyal_gonderi g ON g.id = k.gonderi_id
    WHERE k.chat_jid = ? AND k.user_jid = ? ORDER BY k.zaman DESC LIMIT ?`).all(chatJid, userJid, adet)
    .map((g) => gonderiDoldur(d, chatJid, userJid, g))
}

export function kayitSayisi(chatJid, userJid) {
  return db()?.prepare('SELECT COUNT(*) AS n FROM sosyal_kayit WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid).n ?? 0
}

/** Kendi yazdığı gönderiyi profilinin başına sabitler; aynısı yeniden gelirse kaldırır. */
export function sabitle(chatJid, userJid, id) {
  const d = db()
  if (!d) return null
  const g = d.prepare('SELECT user_jid FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g || g.user_jid !== userJid) return { hata: 'Yalnızca kendi gönderini sabitleyebilirsin.' }
  const eski = profilOku(chatJid, userJid).sabit
  const yeni = eski === id ? 0 : id
  d.prepare(`INSERT INTO sosyal_profil (chat_jid, user_jid, sabit) VALUES (?, ?, ?)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET sabit = excluded.sabit`).run(chatJid, userJid, yeni)
  return { sabit: yeni }
}

/** Panelde görülme anı: çevrimiçi noktası bundan çıkar. Panel her istekte değil, dakikada bir yazar. */
export function aktifYaz(chatJid, userJid, now = Date.now()) {
  db()?.prepare(`INSERT INTO sosyal_profil (chat_jid, user_jid, aktif) VALUES (?, ?, ?)
    ON CONFLICT (chat_jid, user_jid) DO UPDATE SET aktif = excluded.aktif`).run(chatJid, userJid, now)
}

export const cevrimiciMi = (u, now = Date.now()) => Boolean(u?.aktif) && now - u.aktif < CEVRIMICI_MS

/**
 * Akışta görülen son gönderi: eski değeri döner, yenisini yazar. "Buraya kadar okudun"
 * çizgisi eski değerin hemen üstüne çizilir.
 */
export function akisGorulen(chatJid, userJid, sonId) {
  const d = db()
  if (!d) return 0
  const eski = d.prepare('SELECT akis_gorulen FROM sosyal_profil WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)?.akis_gorulen ?? 0
  if (sonId > eski) {
    d.prepare(`INSERT INTO sosyal_profil (chat_jid, user_jid, akis_gorulen) VALUES (?, ?, ?)
      ON CONFLICT (chat_jid, user_jid) DO UPDATE SET akis_gorulen = excluded.akis_gorulen`).run(chatJid, userJid, sonId)
  }
  return eski
}

/**
 * Gönderiye XP bahşişi. Para `devret` ile geçer (panel `xpDevret`'i verir: kredi, ambargo ve
 * bakiye kuralları `.devret` ile aynıdır); başarılıysa kayıt ve bildirim yazılır.
 */
export function bahsisVer({ chatJid, userJid, id, miktar, devret, now = Date.now() }) {
  const d = db()
  if (!d) return { hata: 'Şu an yazılamıyor.' }
  const g = d.prepare('SELECT user_jid FROM sosyal_gonderi WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!g) return { hata: 'Bu gönderi silinmiş.' }
  if (!g.user_jid) return { hata: 'Grup Bülteni bahşiş almaz.' }
  if (g.user_jid === userJid) return { hata: 'Kendine bahşiş veremezsin.' }
  if (!Number.isSafeInteger(miktar) || miktar < 1) return { hata: 'Geçerli bir tutar yaz.' }
  const s = devret({ chatJid, kaynak: userJid, hedef: g.user_jid, miktar, now })
  if (!s) return { hata: 'Şu an gönderilemiyor.' }
  if (s.kredili) return { hata: 'Kredi borcun varken bahşiş veremezsin.' }
  if (s.ambargo) return { hata: 'Ambargodasın, bahşiş veremezsin.' }
  if (s.yetersiz) return { hata: 'O kadar XP\'n yok.' }
  d.transaction(() => {
    d.prepare('INSERT INTO sosyal_bahsis (chat_jid, gonderi_id, kimden, kime, xp, zaman) VALUES (?, ?, ?, ?, ?, ?)').run(chatJid, id, userJid, g.user_jid, miktar, now)
    bildir(d, { chatJid, userJid: g.user_jid, kimden: userJid, tur: 'bahsis', gonderiId: id, now })
  })()
  return { tamam: true, kalan: s.kaynakXp }
}

// --- Moderasyon (Faz 92) ---------------------------------------------------
// Yönetim panelinden: son içerikler, zorla silme ve sosyal bölümde yazma engeli. Engelli kişi okur, beğenir,
// ama gönderi, yorum, DM ve hikâye yazamaz; `.paylaş` da reddedilir.

export const ENGEL_AZAMI_SAAT = 24 * 30

export function sonGonderiler(chatJid, adet = 40) {
  return db()?.prepare(`SELECT id, user_jid, hedef_jid, metin, medya, alinti_id, kaynak, zaman FROM sosyal_gonderi
    WHERE chat_jid = ? AND user_jid <> '' ORDER BY id DESC LIMIT ?`).all(chatJid, adet) ?? []
}

export function sonYorumlar(chatJid, adet = 40) {
  return db()?.prepare(`SELECT y.id, y.gonderi_id, y.user_jid, y.metin, y.zaman FROM sosyal_yorum y
    JOIN sosyal_gonderi g ON g.id = y.gonderi_id WHERE g.chat_jid = ? ORDER BY y.id DESC LIMIT ?`).all(chatJid, adet) ?? []
}

export function acikHikayeler(chatJid) {
  return db()?.prepare('SELECT id, user_jid, metin, medya, zaman FROM sosyal_hikaye WHERE chat_jid = ? ORDER BY id DESC').all(chatJid) ?? []
}

export function hikayeKaldir(chatJid, id) {
  const d = db()
  const h = d?.prepare('SELECT * FROM sosyal_hikaye WHERE chat_jid = ? AND id = ?').get(chatJid, id)
  if (!h) return false
  hikayeSil(d, h)
  return true
}

/** Engelin bitişi; engel yoksa 0. */
export function engelBitisi(chatJid, userJid, now = Date.now()) {
  const b = db()?.prepare('SELECT bitis FROM sosyal_engel WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)?.bitis ?? 0
  return b > now ? b : 0
}

export function engelYaz(chatJid, userJid, saat, now = Date.now()) {
  db()?.prepare('INSERT OR REPLACE INTO sosyal_engel (chat_jid, user_jid, bitis) VALUES (?, ?, ?)').run(chatJid, userJid, now + saat * 3_600_000)
  return now + saat * 3_600_000
}

export const engelKaldir = (chatJid, userJid) =>
  (db()?.prepare('DELETE FROM sosyal_engel WHERE chat_jid = ? AND user_jid = ?').run(chatJid, userJid).changes ?? 0) > 0

export const engelliler = (chatJid, now = Date.now()) =>
  db()?.prepare('SELECT user_jid, bitis FROM sosyal_engel WHERE chat_jid = ? AND bitis > ? ORDER BY bitis').all(chatJid, now) ?? []
