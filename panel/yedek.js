// Günlük veritabanı yedeği. Yedekler aynı sunucuda durur, sunucu ölürse onlar da
// gider; bu yüzden panelde indirme düğmesi vardır.
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
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

// Yönetim panelinden elle alınan yedekler (Faz 92): günlük yedeklerden ayrı adla, son 5'i kalır.
const ELLE_SAKLANAN = 5
const ELLE = /^elle-\d{8}-\d{6}\.db$/
// Listede görünen ve indirilebilen yedekler: günlük, elle, reborn ve sıfır atma öncesi. Ad kalıba uymazsa verilmez.
const YEDEK_ADI = /^(stats-\d{4}-\d{2}-\d{2}|elle-\d{8}-\d{6}|reborn-oncesi-[\w.-]+|sifir-at-oncesi-[\w.-]+)\.db$/

export async function elleYedekAl(db, klasor, now = new Date()) {
  mkdirSync(klasor, { recursive: true })
  const d = new Date(now.getTime() + 3 * 3_600_000).toISOString()
  const ad = `elle-${d.slice(0, 10).replaceAll('-', '')}-${d.slice(11, 19).replaceAll(':', '')}.db`
  await db.backup(path.join(klasor, ad))
  const elle = readdirSync(klasor).filter((f) => ELLE.test(f)).sort()
  for (const eski of elle.slice(0, -ELLE_SAKLANAN)) rmSync(path.join(klasor, eski))
  return ad
}

/** @returns {{ ad: string, boyut: number, zaman: number }[]} yeniden eskiye */
export function yedekListesi(klasor) {
  try {
    return readdirSync(klasor).filter((f) => YEDEK_ADI.test(f)).map((ad) => {
      const st = statSync(path.join(klasor, ad))
      return { ad, boyut: st.size, zaman: st.mtimeMs }
    }).sort((a, b) => b.zaman - a.zaman)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/** İndirilecek yedeğin yolu; ad listede yoksa null (yol dışına çıkılamaz). */
export function yedekYolu(klasor, ad) {
  return YEDEK_ADI.test(String(ad)) && yedekListesi(klasor).some((y) => y.ad === ad) ? path.join(klasor, ad) : null
}
