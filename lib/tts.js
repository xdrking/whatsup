import gtts from 'google-tts-api'
import { toVoiceNote } from './audio.js'

const DEFAULT_LANG = 'tr'

// Google TTS her isteği ~200 karakterde böler; 500 karakter yaklaşık 3 parça
// ve ~40 saniyelik ses demek. Üstü grup sohbetinde rahatsız edici olur.
export const MAX_CHARS = 500

// Varsayılan undici User-Agent'ı ile Google zaman zaman 403 döndürüyor.
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/**
 * ".tts merhaba dünya | en" girdisini metin ve dil koduna ayırır.
 * Dil verilmezse Türkçe kabul edilir. Metnin kendisinde "|" olabileceği için
 * yalnızca SON "|" ayırıcı sayılır.
 */
export function parseTtsInput(raw) {
  const input = (raw || '').trim()
  const separator = input.lastIndexOf('|')

  if (separator === -1) {
    return { text: input, lang: DEFAULT_LANG }
  }

  const lang = input.slice(separator + 1).trim().toLowerCase()
  const text = input.slice(0, separator).trim()

  // "|" var ama sağı dil koduna benzemiyorsa metnin parçası sayılır.
  if (!/^[a-z]{2}(-[a-z]{2,4})?$/.test(lang)) {
    return { text: input, lang: DEFAULT_LANG }
  }

  // Metin boş kalabilir (".tts | en"): bu durumda çağıran taraf metni
  // yanıtlanan mesajdan alır, dil kodu korunur.
  return { text, lang }
}

async function fetchSpeechMp3(text, lang) {
  const parts = gtts.getAllAudioUrls(text, {
    lang,
    slow: false,
    host: 'https://translate.google.com',
  })

  const chunks = []
  for (const part of parts) {
    const response = await fetch(part.url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) {
      throw new Error(
        `Google TTS ${response.status} döndü — "${lang}" dil kodu desteklenmiyor olabilir`,
      )
    }
    chunks.push(Buffer.from(await response.arrayBuffer()))
  }

  // Parçalar ayrı MP3 dosyalarıdır; ffmpeg birleşik akışı sorunsuz çözer.
  return Buffer.concat(chunks)
}

/** Metni seslendirip WhatsApp sesli mesajı olarak gönderilebilir buffer döner. */
export async function textToVoice(text, lang) {
  const mp3 = await fetchSpeechMp3(text, lang)
  return toVoiceNote(mp3)
}
