// Panelin okuduğu her şey burada. Bağlantı salt okunurdur: panel botun verisini
// değiştiremez.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { HISSELER } from '../lib/borsa.js'
import { istanbulDay } from '../lib/dataset.js'
import { SETLER } from '../lib/kart.js'
import { ROZETLER } from '../lib/rozet.js'
import { haftaAnahtari } from '../lib/sezon.js'
import { seviye, seviyeIlerlemesi } from '../lib/stats.js'

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

const GUN_MS = 86_400_000
const GRAFIK_GUNU = 30

export const SIRALAMALAR = {
  xp: 'XP',
  servet: 'Servet',
  messages: 'Mesaj',
  stickers: 'Sticker',
  voices: 'Ses',
}

// Yeni rekor = bir satır. `alan`, uyeler() satırındaki sayıdır.
const REKORLAR = [
  { etiket: '💰 En zengin', alan: 'servet', birim: 'XP' },
  { etiket: '💬 En geveze', alan: 'messages', birim: 'mesaj' },
  { etiket: '😂 Sticker kralı', alan: 'stickers', birim: 'sticker' },
  { etiket: '🎤 Podcast\'çi', alan: 'voices', birim: 'ses' },
  { etiket: '🏦 Bankacı', alan: 'bakiye', birim: 'XP' },
  { etiket: '🔥 En uzun seri', alan: 'seri', birim: 'gün' },
  { etiket: '🍀 En şanslı', alan: 'kumarNet', birim: 'XP kâr' },
  { etiket: '💸 En çok batan', alan: 'kumarZarar', birim: 'XP zarar' },
]

/** Son `GRAFIK_GUNU` günün dizisi; verisi olmayan gün 0'dır. */
function gunler(satirlar, now) {
  const degerler = new Map(satirlar.map((r) => [r.gun, r.n]))
  return Array.from({ length: GRAFIK_GUNU }, (_, i) => {
    const gun = istanbulDay(new Date(now - (GRAFIK_GUNU - 1 - i) * GUN_MS))
    return { gun, n: degerler.get(gun) ?? 0 }
  })
}

export function veriAc(dbYolu = process.env.STATS_DB || path.join(DATA_DIR, 'stats.db')) {
  const db = new Database(dbYolu, { readonly: true, fileMustExist: true })

  const saatler = (where, ...degerler) => {
    const dizi = Array(24).fill(0)
    for (const r of db.prepare(`SELECT hour, SUM(count) AS n FROM hours WHERE ${where} GROUP BY hour`).all(...degerler)) {
      dizi[r.hour] = r.n
    }
    return dizi
  }

  function uyeler(chatJid, now) {
    const portfoyler = new Map(db.prepare(`
      SELECT p.user_jid, SUM(p.adet * b.fiyat) AS deger
      FROM portfoy p JOIN borsa b ON b.chat_jid = p.chat_jid AND b.hisse = p.hisse
      WHERE p.chat_jid = ? GROUP BY p.user_jid
    `).all(chatJid).map((r) => [r.user_jid, Math.floor(r.deger)]))

    return db.prepare(`
      SELECT s.user_jid, s.messages, s.stickers, s.voices, s.xp, s.last_seen,
        COALESCE(b.bakiye, 0) AS bakiye, COALESCE(i.ad, '') AS ad, COALESCE(m.unvan, '') AS unvan,
        COALESCE(k.won - k.lost, 0) AS net,
        CASE WHEN d.last_day >= @dun THEN d.streak ELSE 0 END AS seri
      FROM stats s
      LEFT JOIN banka b ON b.chat_jid = s.chat_jid AND b.user_jid = s.user_jid
      LEFT JOIN isimler i ON i.user_jid = s.user_jid
      LEFT JOIN market m ON m.chat_jid = s.chat_jid AND m.user_jid = s.user_jid
      LEFT JOIN kumar k ON k.chat_jid = s.chat_jid AND k.user_jid = s.user_jid
      LEFT JOIN daily d ON d.chat_jid = s.chat_jid AND d.user_jid = s.user_jid
      WHERE s.chat_jid = @chat
    `).all({ chat: chatJid, dun: istanbulDay(new Date(now - GUN_MS)) }).map((u) => {
      const portfoy = portfoyler.get(u.user_jid) ?? 0
      return {
        ...u,
        portfoy,
        servet: u.xp + u.bakiye + portfoy,
        seviye: seviye(u.xp),
        seri: u.seri ?? 0,
        kumarNet: Math.max(u.net, 0),
        kumarZarar: Math.max(-u.net, 0),
      }
    })
  }

  return {
    db,

    gruplar: () => db.prepare(`
      SELECT s.chat_jid, COUNT(*) AS uye, SUM(s.messages) AS mesaj, COALESCE(g.ad, '') AS ad
      FROM stats s LEFT JOIN gruplar g ON g.chat_jid = s.chat_jid
      WHERE s.chat_jid LIKE '%@g.us' GROUP BY s.chat_jid ORDER BY mesaj DESC
    `).all(),

    /** @returns {object | null} grup yoksa null */
    grup(chatJid, sirala, now = Date.now()) {
      const liste = uyeler(chatJid, now)
      if (!liste.length) return null

      const alan = SIRALAMALAR[sirala] ? sirala : 'xp'
      const toplam = (a) => liste.reduce((t, u) => t + u[a], 0)
      const adlar = new Map(liste.map((u) => [u.user_jid, u]))
      const fiyatlar = new Map(db.prepare('SELECT hisse, fiyat, onceki FROM borsa WHERE chat_jid = ?')
        .all(chatJid).map((r) => [r.hisse, r]))
      const fiyatGecmisi = db.prepare('SELECT fiyat FROM borsa_gecmis WHERE chat_jid = ? AND hisse = ? ORDER BY saat')
      const bugun = db.prepare('SELECT COUNT(*) AS kisi, COALESCE(SUM(mesaj), 0) AS mesaj FROM gecmis WHERE chat_jid = ? AND gun = ?')
        .get(chatJid, istanbulDay(new Date(now)))

      return {
        ad: db.prepare('SELECT ad FROM gruplar WHERE chat_jid = ?').get(chatJid)?.ad ?? '',
        alan,
        uyeler: liste.toSorted((a, b) => b[alan] - a[alan]),
        toplam: { uye: liste.length, mesaj: toplam('messages'), xp: toplam('xp'), banka: toplam('bakiye') },
        bugun,
        saatler: saatler('chat_jid = ?', chatJid),
        gunlukMesaj: gunler(db.prepare('SELECT gun, SUM(mesaj) AS n FROM gecmis WHERE chat_jid = ? GROUP BY gun').all(chatJid), now),
        rekorlar: REKORLAR.flatMap((r) => {
          const uye = liste.reduce((en, u) => (u[r.alan] > en[r.alan] ? u : en))
          return uye[r.alan] > 0 ? [{ ...r, uye, deger: uye[r.alan] }] : []
        }),
        borsa: HISSELER.flatMap((h) => (fiyatlar.has(h.kod)
          ? [{ ad: h.ad, ...fiyatlar.get(h.kod), gecmis: fiyatGecmisi.all(chatJid, h.kod).map((r) => r.fiyat) }]
          : [])),
        sezon: db.prepare('SELECT user_jid, puan FROM sezon WHERE chat_jid = ? AND hafta = ? ORDER BY puan DESC LIMIT 3')
          .all(chatJid, haftaAnahtari(new Date(now))).map((s) => ({ ...s, uye: adlar.get(s.user_jid) ?? null })),
      }
    },

    /** @returns {object | null} kişi yoksa null */
    kisi(chatJid, userJid, now = Date.now()) {
      const liste = uyeler(chatJid, now).toSorted((a, b) => b.xp - a.xp)
      const sira = liste.findIndex((u) => u.user_jid === userJid)
      if (sira < 0) return null

      const uye = liste[sira]
      const saatDizisi = saatler('chat_jid = ? AND user_jid = ?', chatJid, userJid)
      const enCok = Math.max(...saatDizisi)
      const enAktifSaat = enCok ? saatDizisi.indexOf(enCok) : null

      const rozetVerisi = { ...uye, level: uye.seviye, saat: enAktifSaat }
      const adetler = new Map(db.prepare('SELECT no, adet FROM kart WHERE chat_jid = ? AND user_jid = ?')
        .all(chatJid, userJid).map((k) => [k.no, k.adet]))
      const hisseler = new Map(HISSELER.map((h) => [h.kod, h.ad]))
      const gecmis = db.prepare('SELECT gun, xp, mesaj AS n FROM gecmis WHERE chat_jid = ? AND user_jid = ? ORDER BY gun')
        .all(chatJid, userJid)

      return {
        ...uye,
        sira: sira + 1,
        uyeSayisi: liste.length,
        ilerleme: seviyeIlerlemesi(uye.xp),
        enAktifSaat,
        saatler: saatDizisi,
        gunlukMesaj: gunler(gecmis, now),
        xpGecmisi: gecmis.slice(-GRAFIK_GUNU).map((g) => g.xp),
        rozetler: ROZETLER.map((r) => ({ ad: r.ad, aciklama: r.aciklama, kazanildi: r.deger(rozetVerisi) >= r.hedef })),
        kumar: db.prepare('SELECT won, lost, games FROM kumar WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid) ?? null,
        sampiyonluk: db.prepare('SELECT kez FROM sampiyon WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)?.kez ?? 0,
        hisseler: db.prepare(`
          SELECT p.hisse, p.maliyet, p.adet * b.fiyat AS deger
          FROM portfoy p JOIN borsa b ON b.chat_jid = p.chat_jid AND b.hisse = p.hisse
          WHERE p.chat_jid = ? AND p.user_jid = ?
        `).all(chatJid, userJid).map((p) => ({ ...p, ad: hisseler.get(p.hisse) ?? p.hisse, deger: Math.floor(p.deger) })),
        setler: SETLER.map((s) => ({
          ad: s.ad,
          kartlar: s.kartlar.map((k) => ({ ad: k.ad, adet: adetler.get(k.no) ?? 0 })),
        })),
      }
    },
  }
}
