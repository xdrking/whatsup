import { downloadMediaMessage } from '@whiskeysockets/baileys'
import logger, { baileysLogger } from '../lib/logger.js'
import { toVoiceNote } from '../lib/audio.js'

// Perde (pitch) değişimi asetrate ile yapılır: örnek hızı değiştirilip geri
// 48 kHz'e örneklenir, ses hem incelir/kalınlaşır hem hızlanır/yavaşlar.
const EFEKTLER = {
  ters: { filtre: 'areverse', aciklama: 'tersten çalar' },
  hızlı: { filtre: 'atempo=1.6', aciklama: 'hızlandırır' },
  yavaş: { filtre: 'atempo=0.7', aciklama: 'yavaşlatır' },
  incelt: { filtre: 'aresample=48000,asetrate=48000*1.45,aresample=48000', aciklama: 'sincap sesi' },
  kalın: { filtre: 'aresample=48000,asetrate=48000*0.72,aresample=48000', aciklama: 'dev sesi' },
  yankı: { filtre: 'aecho=0.8:0.88:120:0.5', aciklama: 'mağara yankısı' },
  robot: {
    filtre: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75",
    aciklama: 'robot sesi',
  },
  telefon: { filtre: 'highpass=f=300,lowpass=f=3400,volume=1.5', aciklama: 'eski telefon hattı' },
  bas: { filtre: 'bass=g=18,volume=0.8', aciklama: 'bas patlatır' },
}

// Türkçe klavyesi olmayan da yazabilsin.
const ESANLAM = { hizli: 'hızlı', yavas: 'yavaş', kalin: 'kalın', yanki: 'yankı' }

// Uzun ses kaydı grubu boğmasın ve ffmpeg belleği şişmesin.
const MAX_SANIYE = 60

function kullanim(prefix) {
  return [
    `🎛️ Bir sesli mesajı yanıtlayarak \`${prefix}efekt <ad>\` yaz.`,
    '',
    ...Object.entries(EFEKTLER).map(([ad, e]) => `• *${ad}* — ${e.aciklama}`),
  ].join('\n')
}

export default {
  name: 'efekt',
  aliases: ['sesefekt', 'fx'],
  description: 'Yanıtlanan sese efekt uygular (ters, hızlı, incelt, robot…)',
  usage: '.efekt ters (bir sesli mesajı yanıtlayarak)',
  // Efekt listesi EFEKTLER'den üretilir: yeni efekt eklenince yardım da güncellenir.
  details: [
    'Bir sesli mesajı yanıtlayıp `.efekt <ad>` yaz → efektli hali sesli mesaj olarak gelir.',
    'Efektler:',
    ...Object.entries(EFEKTLER).map(([ad, e]) => `• *${ad}* — ${e.aciklama}`),
    'Sesin ilk 60 saniyesi işlenir.',
  ],
  category: 'medya',
  ownerOnly: false,
  // Ses indirme + ffmpeg: arka arkaya tetiklenmesin.
  cooldown: 10,

  async execute({ sock, msg, from, args, parsed }) {
    const prefix = process.env.PREFIX || '.'
    const istenen = (args[0] || '').toLocaleLowerCase('tr')
    const ad = ESANLAM[istenen] || istenen
    const efekt = EFEKTLER[ad]

    if (parsed.quoted?.type !== 'audioMessage' || !efekt) {
      await sock.sendMessage(from, { text: kullanim(prefix) }, { quoted: msg })
      return
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } })

    try {
      const buffer = await downloadMediaMessage(
        parsed.quoted,
        'buffer',
        {},
        { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage },
      )

      const audio = await toVoiceNote(buffer, { filter: efekt.filtre, maxSeconds: MAX_SANIYE })

      await sock.sendMessage(
        from,
        { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: msg },
      )
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
    } catch (err) {
      // Tepki temizlenmezse mesajda kalıcı olarak ⏳ görünür.
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
      logger.error({ err, efekt: ad }, 'Ses efekti uygulanamadı')
      throw err
    }
  },
}
