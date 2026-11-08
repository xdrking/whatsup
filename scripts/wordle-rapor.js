// Tek seferlik rapor: eski (kişisel tahtalı) .wordle sürümünde kelimeyi kimin bildiği
// ve yaklaşık ne kadar XP aldığı. Veritabanını salt okunur açar, hiçbir şey yazmaz.
//
//   node scripts/wordle-rapor.js
//
// Sınırlar:
// - `wordle` tablosu kişi başına tek satır tutar, her yeni gün üstüne yazılır. Bu yüzden
//   herkesin yalnızca SON oynadığı gün görünür; daha önceki günlerin kaydı yoktur.
// - XP saklanmadı, yeniden hesaplanır: günün kuru × deneme ödülü. Çark/market bonusu ve
//   piyasa olayı bilinmediği için gerçek tutar bundan büyük ya da küçük olabilir.
// - Kelimeyi gerçekten kendisi bulan (kopyalamayan) ilk kişi de listede çıkar, ayırt edilemez.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { oyunOlcegi } from '../lib/coin.js'
import { binlik } from '../lib/sayi.js'
import { ODULLER } from '../games/wordle.js'

const kok = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const db = new Database(process.env.STATS_DB || path.join(kok, 'data', 'stats.db'), { readonly: true, fileMustExist: true })

const tablo = (ad) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ad)
if (!tablo('wordle')) {
  console.log('wordle tablosu yok: bot wordle\'lı sürümle hiç açılmamış.')
  process.exit(0)
}

// Yeni sürümde bilen, grubun o günkü `cozen`idir; onun ödülü meşrudur, listeye girmez.
const grupVar = Boolean(tablo('wordle_grup'))
const satirlar = db.prepare(`
  SELECT w.chat_jid, w.user_jid, w.day, w.deneme,
         COALESCE(g.ad, w.chat_jid) AS grup,
         COALESCE(i.ad, w.user_jid) AS kisi,
         e.kur
  FROM wordle w
  LEFT JOIN gruplar g  ON g.chat_jid = w.chat_jid
  LEFT JOIN isimler i  ON i.user_jid = w.user_jid
  LEFT JOIN ekonomi e  ON e.chat_jid = w.chat_jid AND e.day = w.day
  WHERE w.cozuldu = 1
  ${grupVar ? `AND NOT EXISTS (
    SELECT 1 FROM wordle_grup wg WHERE wg.chat_jid = w.chat_jid AND wg.day = w.day AND wg.cozen = w.user_jid
  )` : ''}
  ORDER BY w.chat_jid, w.day, w.deneme
`).all()

if (!satirlar.length) {
  console.log('Eski sürümde kelimeyi bilen kayıt yok.')
  process.exit(0)
}

let grup = null
let toplam = 0
for (const s of satirlar) {
  if (s.grup !== grup) {
    if (grup) console.log(`  Grup toplamı ≈ ${binlik(toplam)} XP\n`)
    grup = s.grup
    toplam = 0
    console.log(`== ${s.grup} (${s.chat_jid})`)
  }
  const taban = ODULLER[Math.min(s.deneme, ODULLER.length) - 1]
  const xp = s.kur ? oyunOlcegi(taban, s.kur) : null
  toplam += xp ?? 0
  console.log(
    `  ${s.day}  ${s.kisi.padEnd(20)}  ${s.deneme}. deneme  ≈ ${xp === null ? '? (o günün kuru yok)' : `${binlik(xp)} XP`}  ${s.user_jid}`,
  )
}
console.log(`  Grup toplamı ≈ ${binlik(toplam)} XP`)
db.close()
