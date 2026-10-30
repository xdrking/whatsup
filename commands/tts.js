import logger from '../lib/logger.js'
import { parseTtsInput, textToVoice, MAX_CHARS } from '../lib/tts.js'

export default {
  name: 'tts',
  aliases: ['ses', 'seslendir'],
  description: 'Metni sese çevirip sesli mesaj olarak gönderir',
  usage: '.tts merhaba dünya | tr  —  ya da bir mesajı yanıtlayarak .tts | en',
  details: [
    '`.tts merhaba dünya` → Türkçe sesli mesaj.',
    'Dil için sona `| dil kodu` ekle: `.tts hello world | en`',
    'Bir mesajı yanıtlayıp `.tts` yazarsan o mesaj okunur; dil için `.tts | en`',
    'Bazı dil kodları: tr, en, de, fr, es, it, ru, ar, ja',
    'En fazla 500 karakter.',
  ],
  ownerOnly: false,
  // Her çağrı Google TTS isteği + ffmpeg dönüşümü.
  cooldown: 10,

  async execute({ sock, msg, from, text: raw, parsed }) {
    const { text: typed, lang } = parseTtsInput(raw)

    // Metin yazılmadıysa yanıtlanan mesajın metni okunur; dil kodu
    // ("| en") yine komutun kendisinden gelir.
    const text = typed || (parsed.quoted?.body || '').trim()

    if (!text) {
      await sock.sendMessage(
        from,
        {
          text: 'Kullanım: `.tts merhaba dünya | tr`\n' +
            'Bir mesajı yanıtlayıp `.tts` ya da `.tts | en` de yazabilirsin.\n' +
            'Dil kodu yazılmazsa Türkçe okunur. Örnekler: tr, en, de, fr, es, ar, ru, ja.',
        },
        { quoted: msg },
      )
      return
    }

    if (text.length > MAX_CHARS) {
      await sock.sendMessage(
        from,
        { text: `Metin çok uzun (${text.length} karakter). En fazla ${MAX_CHARS} olabilir.` },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

    try {
      const audio = await textToVoice(text, lang)

      await sock.sendMessage(
        from,
        { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: msg },
      )
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
    } catch (err) {
      // Tepki temizlenmezse mesajda kalıcı olarak ⏳ görünür.
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
      logger.error({ err, lang, chars: text.length }, 'Seslendirme başarısız')
      throw err
    }
  },
}
