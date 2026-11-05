// Bottan ayrı süreç: bot çökse ya da numara ban yese de panel çalışır.
import 'dotenv/config'
import path from 'node:path'
import logger from '../lib/logger.js'
import { sunucuKur } from './sunucu.js'
import { DATA_DIR, veriAc } from './veri.js'
import { yedekAl } from './yedek.js'

const SAAT_MS = 60 * 60 * 1000
const port = Number(process.env.PANEL_PORT) || 8787
const sifreHash = process.env.PANEL_SIFRE_HASH
const yedekKlasoru = path.join(DATA_DIR, 'yedek')

if (!sifreHash) {
  logger.error('PANEL_SIFRE_HASH yok. `npm run panel:sifre` çalıştırıp çıkan satırı .env dosyasına ekle.')
  process.exit(1)
}

const veri = veriAc()

async function yedekle() {
  try {
    const alinan = await yedekAl(veri.db, yedekKlasoru)
    if (alinan) logger.info({ alinan }, 'Veritabanı yedeklendi')
  } catch (err) {
    logger.error({ err }, 'Veritabanı yedeklenemedi')
  }
}

await yedekle()
setInterval(yedekle, SAAT_MS)

sunucuKur({ sifreHash, veri, yedekKlasoru }).listen(port, '127.0.0.1', () => {
  logger.info({ port }, 'Panel hazır')
})
