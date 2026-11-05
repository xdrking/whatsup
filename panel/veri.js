// Panelin okuduğu her şey burada. Bağlantı salt okunurdur: panel botun verisini
// değiştiremez.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { HISSELER } from '../lib/borsa.js'
import { SETLER } from '../lib/kart.js'
import { haftaAnahtari } from '../lib/sezon.js'
import { seviye } from '../lib/stats.js'

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

export const SIRALAMALAR = {
  xp: 'XP',
  servet: 'Servet',
  messages: 'Mesaj',
  stickers: 'Sticker',
  voices: 'Ses',
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

  function uyeler(chatJid) {
    const portfoyler = new Map(db.prepare(`
      SELECT p.user_jid, SUM(p.adet * b.fiyat) AS deger
      FROM portfoy p JOIN borsa b ON b.chat_jid = p.chat_jid AND b.hisse = p.hisse
      WHERE p.chat_jid = ? GROUP BY p.user_jid
    `).all(chatJid).map((r) => [r.user_jid, Math.floor(r.deger)]))

    return db.prepare(`
      SELECT s.user_jid, s.messages, s.stickers, s.voices, s.xp, s.last_seen,
        COALESCE(b.bakiye, 0) AS bakiye, COALESCE(i.ad, '') AS ad, COALESCE(m.unvan, '') AS unvan
      FROM stats s
      LEFT JOIN banka b ON b.chat_jid = s.chat_jid AND b.user_jid = s.user_jid
      LEFT JOIN isimler i ON i.user_jid = s.user_jid
      LEFT JOIN market m ON m.chat_jid = s.chat_jid AND m.user_jid = s.user_jid
      WHERE s.chat_jid = ?
    `).all(chatJid).map((u) => {
      const portfoy = portfoyler.get(u.user_jid) ?? 0
      return { ...u, portfoy, servet: u.xp + u.bakiye + portfoy, seviye: seviye(u.xp) }
    })
  }

  return {
    db,

    gruplar: () => db.prepare(`
      SELECT chat_jid, COUNT(*) AS uye, SUM(messages) AS mesaj
      FROM stats WHERE chat_jid LIKE '%@g.us' GROUP BY chat_jid ORDER BY mesaj DESC
    `).all(),

    /** @returns {object | null} grup yoksa null */
    grup(chatJid, sirala) {
      const liste = uyeler(chatJid)
      if (!liste.length) return null

      const alan = SIRALAMALAR[sirala] ? sirala : 'xp'
      const toplam = (a) => liste.reduce((t, u) => t + u[a], 0)
      const adlar = new Map(liste.map((u) => [u.user_jid, u]))
      const fiyatlar = new Map(db.prepare('SELECT hisse, fiyat, onceki FROM borsa WHERE chat_jid = ?')
        .all(chatJid).map((r) => [r.hisse, r]))

      return {
        alan,
        uyeler: liste.toSorted((a, b) => b[alan] - a[alan]),
        toplam: { uye: liste.length, mesaj: toplam('messages'), xp: toplam('xp'), banka: toplam('bakiye') },
        saatler: saatler('chat_jid = ?', chatJid),
        borsa: HISSELER.flatMap((h) => (fiyatlar.has(h.kod) ? [{ ad: h.ad, ...fiyatlar.get(h.kod) }] : [])),
        sezon: db.prepare('SELECT user_jid, puan FROM sezon WHERE chat_jid = ? AND hafta = ? ORDER BY puan DESC LIMIT 3')
          .all(chatJid, haftaAnahtari()).map((s) => ({ ...s, uye: adlar.get(s.user_jid) ?? null })),
      }
    },

    /** @returns {object | null} kişi yoksa null */
    kisi(chatJid, userJid) {
      const uye = uyeler(chatJid).find((u) => u.user_jid === userJid)
      if (!uye) return null

      const adetler = new Map(db.prepare('SELECT no, adet FROM kart WHERE chat_jid = ? AND user_jid = ?')
        .all(chatJid, userJid).map((k) => [k.no, k.adet]))
      const hisseler = new Map(HISSELER.map((h) => [h.kod, h.ad]))

      return {
        ...uye,
        saatler: saatler('chat_jid = ? AND user_jid = ?', chatJid, userJid),
        seri: db.prepare('SELECT streak FROM daily WHERE chat_jid = ? AND user_jid = ?').get(chatJid, userJid)?.streak ?? 0,
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
