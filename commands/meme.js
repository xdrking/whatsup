import logger from '../lib/logger.js'

// Ücretsiz, API key istemeyen Reddit meme servisi.
const API_URL = 'https://meme-api.com/gimme'
const TIMEOUT_MS = 10_000

// NSFW/spoiler işaretli gönderi atlanır; birkaç deneme sonunda pes edilir.
const MAX_TRIES = 3

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`meme-api ${response.status}`)
  return response.json()
}

async function pickMeme() {
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    const data = await fetchJson(API_URL)

    if (data?.nsfw || data?.spoiler) {
      logger.info({ subreddit: data.subreddit }, 'NSFW/spoiler meme atlandı')
      continue
    }

    if (typeof data?.url === 'string' && data.url) return data
  }

  return null
}

export default {
  name: 'meme',
  aliases: ['caps', 'mim'],
  description: 'İnternetten rastgele bir meme getirir',
  usage: '.meme',
  ownerOnly: false,
  // Dış servis: hız sınırına takılmayalım.
  cooldown: 10,

  async execute({ sock, msg, from }) {
    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

    try {
      const meme = await pickMeme()

      if (!meme) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
        await sock.sendMessage(
          from,
          { text: 'Uygun bir meme bulamadım, tekrar dene.' },
          { quoted: msg },
        )
        return
      }

      const image = await fetch(meme.url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!image.ok) throw new Error(`meme görseli indirilemedi: ${image.status}`)

      const buffer = Buffer.from(await image.arrayBuffer())
      const caption = [meme.title, meme.subreddit ? `r/${meme.subreddit}` : '']
        .filter(Boolean)
        .join('\n')

      await sock.sendMessage(from, { image: buffer, caption }, { quoted: msg })
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
    } catch (err) {
      // Dış servis: yavaşlık ve kesinti beklenen durum, bot bunun için çökmez.
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
      logger.error({ err }, 'Meme alınamadı')
      await sock.sendMessage(
        from,
        { text: 'Meme servisi şu an cevap vermiyor. Biraz sonra tekrar dene.' },
        { quoted: msg },
      )
    }
  },
}
