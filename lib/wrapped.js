// .wrapped: kişinin ve grubun ilk kayıttan bugüne özeti. Hiçbir şey yazmaz, yalnızca
// reborn'da silinmeyen tablolardan okur: stats, hours, gecmis, kumar, kumar_oyun,
// sampiyon, reborn_zengin, evlilik, cete_uye. `gecmis` panelle (Faz 31) başladığı için
// günlük veriler ondan öncesini bilmez; toplam sayaçlar (stats) botun ilk gününden beri sayar.
import { getDb } from './db.js'
import { istanbulDay } from './dataset.js'
import logger from './logger.js'
import { botHesabiMi } from './stats.js'

export const OYUN_ADI = {
  bahis: 'Yazı-tura', slot: 'Slot', rulet: 'Rulet', kazı: 'Kazı kazan', plinko: 'Plinko',
  crash: 'Crash', blackjack: 'Blackjack', mayın: 'Mayın', hilo: 'Hi-Lo', kule: 'Kule',
  yarış: 'At yarışı', vs: 'VS', piyango: 'Piyango', poker: 'Poker',
}

const GUN_MS = 86_400_000
const gunSayisi = (gun) => Date.parse(`${gun}T00:00:00Z`) / GUN_MS

/** Sıralı ya da sırasız 'YYYY-MM-DD' listesinde art arda en uzun gün sayısı. */
export function enUzunSeri(gunler) {
  const sirali = [...new Set(gunler)].map(gunSayisi).sort((a, b) => a - b)
  let en = 0
  let seri = 0
  for (let i = 0; i < sirali.length; i++) {
    seri = i > 0 && sirali[i] - sirali[i - 1] === 1 ? seri + 1 : 1
    en = Math.max(en, seri)
  }
  return en
}

/** İki gün arasındaki gün sayısı, ikisi dahil. */
export function gunFarki(ilk, son) {
  return Math.round(gunSayisi(son) - gunSayisi(ilk)) + 1
}

/** Saat dağılımında en çok yazılan saat ve 00-04 arasının payı. */
export function saatOzeti(saatler) {
  const toplam = saatler.reduce((t, s) => t + s.count, 0)
  if (!toplam) return { saat: null, gece: 0 }
  const en = saatler.reduce((a, b) => (b.count > a.count ? b : a))
  const gece = saatler.filter((s) => s.hour <= 4).reduce((t, s) => t + s.count, 0)
  return { saat: en.hour, gece: gece / toplam }
}

/** Kişinin verisinden tek bir "kimlik" çıkar. Sıra önemlidir: ilk tutan kazanır. */
export function kisilik(v) {
  if (v.messages < 100) return { ad: '👀 Sessiz Gözcü', aciklama: 'Az yazar, hep okur.' }
  if (v.gecePayi >= 0.3) return { ad: '🦉 Gece Kuşu', aciklama: 'Grup uyurken o yazıyor.' }
  if (v.stickers >= v.messages * 0.5) return { ad: '🖼️ Sticker Makinesi', aciklama: 'Kelimeler yetmiyor, sticker konuşuyor.' }
  if (v.voices >= v.messages * 0.2) return { ad: '🎙️ Podcast Yayıncısı', aciklama: 'Yazmaya üşenir, sesli anlatır.' }
  if (v.kumarEl >= 300) return { ad: '🎰 Kumarhane Müdavimi', aciklama: 'Kasanın en sadık müşterisi.' }
  if (v.sira === 1) return { ad: '👑 Grubun Sesi', aciklama: 'Grupta en çok yazan.' }
  if (v.aktifPay >= 0.8) return { ad: '📅 Demirbaş', aciklama: 'Neredeyse her gün burada.' }
  return { ad: '💬 Sohbet Ustası', aciklama: 'Grubun dengeli müdavimi.' }
}

function tum(db, sql, ...p) {
  try {
    return db.prepare(sql).all(...p)
  } catch (err) {
    // Eski veritabanında tablo yoksa o bölüm boş kalır, özet yine çıkar.
    logger.warn({ err: err.message }, 'Wrapped sorgusu okunamadı')
    return []
  }
}

const tek = (db, sql, ...p) => tum(db, sql, ...p)[0] ?? null

function enIyi(satirlar, alan) {
  return satirlar.reduce((en, s) => (s[alan] > (en?.[alan] ?? 0) ? s : en), null)
}

function kumarOzeti(oyunlar) {
  const toplam = oyunlar.reduce(
    (t, o) => ({ won: t.won + o.won, lost: t.lost + o.lost, games: t.games + o.games }),
    { won: 0, lost: 0, games: 0 },
  )
  return {
    ...toplam,
    net: toplam.won - toplam.lost,
    favori: enIyi(oyunlar, 'games'),
    vurgun: enIyi(oyunlar, 'en_buyuk'),
  }
}

/** @returns {object | null} kişinin özeti; hiç kaydı yoksa null */
export function kisiWrapped(chatJid, userJid, now = Date.now()) {
  const db = getDb()
  if (!db) return null

  const s = tek(db, 'SELECT messages, stickers, voices FROM stats WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)
  if (!s || s.messages + s.stickers + s.voices === 0) return null

  const herkes = tum(db, 'SELECT user_jid, messages FROM stats WHERE chat_jid = ? ORDER BY messages DESC', chatJid)
    .filter((r) => !botHesabiMi(r.user_jid))
  const grupMesaj = herkes.reduce((t, r) => t + r.messages, 0)

  const gunler = tum(db, 'SELECT gun, mesaj, xp FROM gecmis WHERE chat_jid = ? AND user_jid = ? ORDER BY gun', chatJid, userJid)
  const grupIlk = tek(db, 'SELECT MIN(gun) AS gun FROM gecmis WHERE chat_jid = ?', chatJid)?.gun ?? null
  const toplamGun = grupIlk ? gunFarki(grupIlk, istanbulDay(new Date(now))) : 0

  const { saat, gece } = saatOzeti(tum(db, 'SELECT hour, count FROM hours WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid))
  const kumar = kumarOzeti(
    tum(db, 'SELECT oyun, won, lost, games, en_buyuk FROM kumar_oyun WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid),
  )
  // kumar_oyun'dan önceki eller yalnızca toplam tablodadır, toplam oradan okunur.
  const kumarToplam = tek(db, 'SELECT won, lost, games FROM kumar WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)
  if (kumarToplam) Object.assign(kumar, kumarToplam, { net: kumarToplam.won - kumarToplam.lost })

  const veri = {
    ...s,
    sira: herkes.findIndex((r) => r.user_jid === userJid) + 1,
    uyeSayisi: herkes.filter((r) => r.messages > 0).length,
    grupPayi: grupMesaj ? s.messages / grupMesaj : 0,
    ilkGun: gunler[0]?.gun ?? null,
    toplamGun,
    aktifGun: gunler.length,
    aktifPay: toplamGun ? gunler.length / toplamGun : 0,
    seri: enUzunSeri(gunler.map((g) => g.gun)),
    enYogun: enIyi(gunler, 'mesaj'),
    zirve: enIyi(gunler, 'xp'),
    saat,
    gecePayi: gece,
    kumar,
    kumarEl: kumar.games,
    sampiyon: tek(db, 'SELECT kez FROM sampiyon WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)?.kez ?? 0,
    devirZengini: tek(db, 'SELECT COUNT(*) AS n FROM reborn_zengin WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)?.n ?? 0,
    es: tek(db, 'SELECT es_jid FROM evlilik WHERE chat_jid = ? AND user_jid = ?', chatJid, userJid)?.es_jid ?? null,
    cete: tek(db, `
      SELECT c.ad FROM cete_uye u JOIN cete c ON c.chat_jid = u.chat_jid AND c.anahtar = u.anahtar
      WHERE u.chat_jid = ? AND u.user_jid = ?`, chatJid, userJid)?.ad ?? null,
  }
  veri.kisilik = kisilik(veri)
  return veri
}

/** @returns {object | null} grubun özeti; hiç kayıt yoksa null */
export function grupWrapped(chatJid, now = Date.now()) {
  const db = getDb()
  if (!db) return null

  const uyeler = tum(db, 'SELECT user_jid, messages, stickers, voices FROM stats WHERE chat_jid = ?', chatJid)
    .filter((r) => !botHesabiMi(r.user_jid) && r.messages + r.stickers + r.voices > 0)
  if (!uyeler.length) return null

  const topla = (alan) => uyeler.reduce((t, r) => t + r[alan], 0)
  const sirala = (alan) => [...uyeler].sort((a, b) => b[alan] - a[alan])

  const gunler = tum(db, 'SELECT gun, SUM(mesaj) AS mesaj FROM gecmis WHERE chat_jid = ? GROUP BY gun ORDER BY gun', chatJid)
  const ilkGun = gunler[0]?.gun ?? null

  const geceKusu = tum(db, `
    SELECT user_jid, SUM(count) AS mesaj FROM hours WHERE chat_jid = ? AND hour <= 4
    GROUP BY user_jid ORDER BY mesaj DESC`, chatJid).find((r) => !botHesabiMi(r.user_jid)) ?? null

  const kumarcilar = tum(db, 'SELECT user_jid, won - lost AS net, games FROM kumar WHERE chat_jid = ?', chatJid)
    .filter((r) => !botHesabiMi(r.user_jid))
  const oyunlar = tum(db, 'SELECT user_jid, oyun, games, en_buyuk FROM kumar_oyun WHERE chat_jid = ?', chatJid)
    .filter((r) => !botHesabiMi(r.user_jid))
  const oyunToplam = Object.values(
    oyunlar.reduce((m, o) => {
      m[o.oyun] = { oyun: o.oyun, games: (m[o.oyun]?.games ?? 0) + o.games }
      return m
    }, {}),
  )

  return {
    ad: tek(db, 'SELECT ad FROM gruplar WHERE chat_jid = ?', chatJid)?.ad ?? null,
    mesaj: topla('messages'),
    sticker: topla('stickers'),
    ses: topla('voices'),
    uyeSayisi: uyeler.length,
    ilkGun,
    toplamGun: ilkGun ? gunFarki(ilkGun, istanbulDay(new Date(now))) : 0,
    aktifGun: gunler.length,
    enYogun: enIyi(gunler, 'mesaj'),
    saat: saatOzeti(tum(db, 'SELECT hour, SUM(count) AS count FROM hours WHERE chat_jid = ? GROUP BY hour', chatJid)).saat,
    yazanlar: sirala('messages').slice(0, 3),
    stickerKrali: sirala('stickers')[0],
    sesKrali: sirala('voices')[0],
    geceKusu,
    kumarKrali: enIyi(kumarcilar, 'net'),
    kumarKurbani: kumarcilar.reduce((en, r) => (r.net < (en?.net ?? 0) ? r : en), null),
    kumarEl: kumarcilar.reduce((t, r) => t + r.games, 0),
    vurgun: enIyi(oyunlar, 'en_buyuk'),
    favoriOyun: enIyi(oyunToplam, 'games'),
    zirve: tum(db, 'SELECT user_jid, gun, xp FROM gecmis WHERE chat_jid = ? ORDER BY xp DESC LIMIT 5', chatJid)
      .find((r) => !botHesabiMi(r.user_jid)) ?? null,
    sampiyon: tek(db, 'SELECT user_jid, kez FROM sampiyon WHERE chat_jid = ? ORDER BY kez DESC LIMIT 1', chatJid),
    reborn: tek(db, 'SELECT COUNT(*) AS n FROM reborn WHERE chat_jid = ?', chatJid)?.n ?? 0,
    evlilik: Math.floor((tek(db, 'SELECT COUNT(*) AS n FROM evlilik WHERE chat_jid = ?', chatJid)?.n ?? 0) / 2),
  }
}
