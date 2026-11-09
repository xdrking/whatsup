// Tek seferlik sıfır atma: XP cinsinden bütün tutarları 1000'e böler (bkz. lib/sifirAt.js).
//
//   node scripts/sifir-at.js                      # yalnızca önizleme, hiçbir şey yazmaz
//   node scripts/sifir-at.js --uygula             # bütün gruplar
//   node scripts/sifir-at.js --uygula <grup id>   # tek grup
//
// BOT KAPALIYKEN çalıştırılır: açık bot bellekteki oyun bahislerini ve günlük denetimleri
// eski rakamlarla tutar. Uygulamadan önce data/yedek/ içine tam yedek alınır.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { sifirAt } from '../lib/sifirAt.js'
import { binlik } from '../lib/sayi.js'

const BOLEN = 1000
const kok = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dbYolu = process.env.STATS_DB || path.join(kok, 'data', 'stats.db')
const argumanlar = process.argv.slice(2)
const uygula = argumanlar.includes('--uygula')
const chat = argumanlar.find((a) => !a.startsWith('--')) ?? null

const db = new Database(dbYolu, { readonly: !uygula, fileMustExist: true })

const ozet = () => db.prepare(`
  SELECT s.chat_jid, COALESCE(g.ad, s.chat_jid) AS ad, SUM(s.xp) AS cuzdan,
         (SELECT COALESCE(SUM(b.bakiye), 0) FROM banka b WHERE b.chat_jid = s.chat_jid) AS banka
  FROM stats s LEFT JOIN gruplar g ON g.chat_jid = s.chat_jid
  ${chat ? 'WHERE s.chat_jid = ?' : ''}
  GROUP BY s.chat_jid
`).all(...(chat ? [chat] : []))

const yaz = (baslik) => {
  console.log(`\n${baslik}`)
  for (const g of ozet()) {
    console.log(`  ${g.ad} (${g.chat_jid}): cüzdanlar ${binlik(g.cuzdan)} XP, bankalar ${binlik(g.banka)} XP`)
  }
}

yaz('Şu an:')
if (!uygula) {
  console.log(`\nÖnizleme. Bütün XP tutarları ${BOLEN}'e bölünecek. Uygulamak için bot kapalıyken: node scripts/sifir-at.js --uygula${chat ? ` ${chat}` : ''}`)
  process.exit(0)
}

const klasor = path.join(kok, 'data', 'yedek')
mkdirSync(klasor, { recursive: true })
// Ad panel/yedek.js'in döndürme kalıbına uymaz, günlük yedeklerle birlikte silinmez.
const yedek = path.join(klasor, `sifir-at-oncesi-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
await db.backup(yedek)
console.log(`\nYedek: ${yedek}`)

const sonuc = sifirAt(db, { bolen: BOLEN, chat })
for (const [tablo, adet] of Object.entries(sonuc)) console.log(`  ${tablo}: ${adet} satır`)
yaz('Sonra:')
db.close()
