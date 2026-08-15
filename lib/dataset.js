import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from './logger.js'
import { fnv1a } from './hash.js'
import { mentionOf, resolveTargets } from './target.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

// Havuzlar elle yazılan, nadiren değişen dosyalar: bir kez okunup bellekte
// tutulur. Dosyaya satır eklendiğinde botun yeniden başlatılması gerekir.
const cache = new Map()

// "havuz|sohbet" -> son gönderilen metinler. Aynı şaka arka arkaya çıkmasın
// diye tutulur; bilerek kalıcı değil, süreçle birlikte ölür.
const history = new Map()
const MAX_HISTORY = 20

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Türkiye takvim günü ("2026-08-16"). Sunucunun saat dilimine güvenilmez. */
export function istanbulDay(now = new Date()) {
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * `data/<file>` içeriğini string dizisi olarak döner.
 * Dosya yoksa, bozuksa ya da boşsa hata atar — çağıran taraf kullanıcıya
 * kısa bir mesaj yazar, bot çökmez.
 */
export async function loadDataset(file) {
  const cached = cache.get(file)
  if (cached) return cached

  const raw = await readFile(path.join(DATA_DIR, file), 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error(`data/${file} bir JSON dizisi değil`)
  }

  const items = parsed.filter((item) => typeof item === 'string' && item.trim())
  if (!items.length) {
    throw new Error(`data/${file} kullanılabilir satır içermiyor`)
  }

  if (items.length !== parsed.length) {
    logger.warn({ file, atlanan: parsed.length - items.length }, 'Havuzda geçersiz satırlar atlandı')
  }

  cache.set(file, items)
  return items
}

// Son seçilenler havuzun üçte birini geçmez: küçük havuzda her seçim
// "yakın zamanda çıktı" sayılırsa tekrarsızlık imkânsız hale gelir.
function historyLimit(size) {
  return Math.max(1, Math.min(Math.floor(size / 3), MAX_HISTORY))
}

/** Havuzdan rastgele satır; aynı sohbette son seçilenler tekrar edilmez. */
export async function pickRandom(file, chatJid = 'global') {
  const items = await loadDataset(file)
  if (items.length === 1) return items[0]

  const key = `${file}|${chatJid}`
  const recent = history.get(key) || []

  // Tümü yakın zamanda çıktıysa havuzun tamamına dönülür, komut susmaz.
  const fresh = items.filter((item) => !recent.includes(item))
  const pool = fresh.length ? fresh : items

  const choice = pool[Math.floor(Math.random() * pool.length)]

  recent.push(choice)
  while (recent.length > historyLimit(items.length)) recent.shift()
  history.set(key, recent)

  return choice
}

/** Güne sabitlenmiş satır: aynı gün kaç kez çağrılırsa çağrılsın aynı sonuç. */
export async function pickDaily(file, now = new Date()) {
  const items = await loadDataset(file)
  return items[fnv1a(`${file}|${istanbulDay(now)}`) % items.length]
}

/**
 * `data/*.json` havuzundan içerik gönderen komutları üretir. Havuz komutları
 * birbirinin aynısı olduğu için gövde tek yerde durur; `commands/` altındaki
 * dosyalar yalnızca hangi havuzu kullandıklarını söyler.
 *
 * @param {object}  options
 * @param {string}  options.file     data/ altındaki dosya adı
 * @param {string}  [options.emoji]  satırın başına eklenir (havuz zaten emoji ile başlıyorsa boş bırakılır)
 * @param {boolean} [options.daily]  true ise rastgele değil, güne sabit seçim
 * @param {boolean} [options.target] true ise `{user}` hedef kullanıcının etiketiyle değiştirilir
 */
export function createDatasetCommand({
  name,
  aliases = [],
  description,
  usage,
  file,
  emoji = '',
  daily = false,
  target = false,
}) {
  return {
    name,
    aliases,
    description,
    usage,
    ownerOnly: false,

    async execute({ sock, msg, from, args, parsed }) {
      let line

      try {
        line = daily ? await pickDaily(file) : await pickRandom(file, from)
      } catch (err) {
        logger.error({ err, file }, 'İçerik havuzu okunamadı')
        await sock.sendMessage(
          from,
          { text: `\`data/${file}\` okunamadı; dosya eksik, bozuk ya da boş olabilir.` },
          { quoted: msg },
        )
        return
      }

      if (!target) {
        await sock.sendMessage(
          from,
          { text: emoji ? `${emoji} ${line}` : line },
          { quoted: msg },
        )
        return
      }

      const [jid] = resolveTargets(parsed, { args, limit: 1 })

      if (!jid) {
        const prefix = process.env.PREFIX || '.'
        await sock.sendMessage(
          from,
          {
            text: `Kimi hedef alayım? \`${prefix}${name} @kişi\` yaz ya da birinin ` +
              `mesajını yanıtlayarak \`${prefix}${name}\` de.`,
          },
          { quoted: msg },
        )
        return
      }

      const mention = mentionOf(jid)
      // Havuzdaki bir satırda {user} unutulmuş olabilir; etiket yine de başa gelir.
      const filled = line.includes('{user}')
        ? line.replaceAll('{user}', mention)
        : `${mention} ${line}`

      await sock.sendMessage(
        from,
        { text: emoji ? `${emoji} ${filled}` : filled, mentions: [jid] },
        { quoted: msg },
      )
    },
  }
}
