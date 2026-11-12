// Tek seferlik sıfır atma: XP cinsinden bütün tutarları böler, varsayılan 1000 (bkz. lib/sifirAt.js).
//
//   node scripts/sifir-at.js                      # yalnızca önizleme, hiçbir şey yazmaz
//   node scripts/sifir-at.js --uygula             # bütün gruplar
//   node scripts/sifir-at.js --uygula <grup id>   # tek grup
//   --bolen=10                                    # 1000 yerine 10'a böler (bir sıfır)
//   --bot-haric                                   # botun cüzdanı ve bankası (hazine) bölünmez
//
// BOT KAPALIYKEN çalıştırılır: açık bot bellekteki oyun bahislerini ve günlük denetimleri
// eski rakamlarla tutar. Uygulamadan önce data/yedek/ içine tam yedek alınır.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { sifirAt } from '../lib/sifirAt.js'
import { binlik } from '../lib/sayi.js'

const BOLEN = Number(process.argv.find((a) => a.startsWith('--bolen='))?.slice(8) ?? 1000)
const kok = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dbYolu = process.env.STATS_DB || path.join(kok, 'data', 'stats.db')
const argumanlar = process.argv.slice(2)
const uygula = argumanlar.includes('--uygula')
const chat = argumanlar.find((a) => !a.startsWith('--')) ?? null

const db = new Database(dbYolu, { readonly: !uygula, fileMustExist: true })

// Bot kimliğini bot kendisi yazar (botHesabiniTani). Yoksa bot hariç tutulamaz, betik durur.
const botJid = argumanlar.includes('--bot-haric')
  ? db.prepare("SELECT deger FROM ayar WHERE anahtar = 'bot_jid'").get()?.deger
  : null
if (argumanlar.includes('--bot-haric') && !botJid) {
  console.error('ayar.bot_jid yok: bot bu sürümle en az bir kez açılmalı.')
  process.exit(1)
}
const haric = botJid ? [botJid] : []

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
  console.log(`\nÖnizleme. Bütün XP tutarları ${BOLEN} ile bölünecek${botJid ? `, botun (${botJid}) cüzdanı ve bankası hariç` : ''}. Uygulamak için bot kapalıyken komuta --uygula ekle.`)
  process.exit(0)
}

const klasor = path.join(kok, 'data', 'yedek')
mkdirSync(klasor, { recursive: true })
// Ad panel/yedek.js'in döndürme kalıbına uymaz, günlük yedeklerle birlikte silinmez.
const yedek = path.join(klasor, `sifir-at-oncesi-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
await db.backup(yedek)
console.log(`\nYedek: ${yedek}`)

const sonuc = sifirAt(db, { bolen: BOLEN, chat, haric })
for (const [tablo, adet] of Object.entries(sonuc)) console.log(`  ${tablo}: ${adet} satır`)
yaz('Sonra:')
db.close()
