import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import logger from '../lib/logger.js'

const COMMANDS_DIR = path.dirname(fileURLToPath(import.meta.url))

/**
 * commands/ klasörünü tarar ve her komutu adı + alias'ları ile eşler.
 * Yeni komut eklemek için bu dosyaya dokunmak gerekmez; klasöre dosya
 * koymak yeterlidir.
 *
 * @returns {Promise<Map<string, object>>} ad/alias -> komut nesnesi
 */
export async function loadCommands() {
  const commands = new Map()
  const entries = await readdir(COMMANDS_DIR, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'index.js')
    .map((entry) => entry.name)

  for (const file of files) {
    try {
      const module = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href)
      const command = module.default

      if (!command?.name || typeof command.execute !== 'function') {
        logger.warn({ file }, 'Komut sözleşmesine uymuyor (name + execute gerekli), atlandı')
        continue
      }

      for (const key of [command.name, ...(command.aliases || [])]) {
        const alias = String(key).toLowerCase()
        if (commands.has(alias)) {
          logger.warn({ file, alias }, 'Komut adı çakışıyor, bu ad atlandı')
          continue
        }
        commands.set(alias, command)
      }
    } catch (err) {
      logger.error({ err, file }, 'Komut yüklenemedi')
    }
  }

  return commands
}
