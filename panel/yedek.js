// Günlük veritabanı yedeği. Yedekler aynı sunucuda durur, sunucu ölürse onlar da
// gider; bu yüzden panelde indirme düğmesi vardır.
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { istanbulDay } from '../lib/dataset.js'

const SAKLANAN = 14

const yedekler = (klasor) => readdirSync(klasor).filter((f) => /^stats-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()

/** Bugünün yedeği yoksa alır, eskileri siler. */
export async function yedekAl(db, klasor, now = new Date()) {
  mkdirSync(klasor, { recursive: true })

  const hedef = `stats-${istanbulDay(now)}.db`
  if (yedekler(klasor).includes(hedef)) return null

  // .backup() açık bağlantıda tutarlı kopya alır; dosyayı elle kopyalamak WAL'daki
  // son yazmaları kaçırırdı.
  await db.backup(path.join(klasor, hedef))

  for (const eski of yedekler(klasor).slice(0, -SAKLANAN)) rmSync(path.join(klasor, eski))
  return hedef
}

export function sonYedek(klasor) {
  try {
    const son = yedekler(klasor).at(-1)
    return son ? path.join(klasor, son) : null
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}
