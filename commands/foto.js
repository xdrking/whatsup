import { downloadMediaMessage } from '@whiskeysockets/baileys'
import sharp from 'sharp'
import logger, { baileysLogger } from '../lib/logger.js'

// Büyük fotoğraf işlenmeden önce küçültülür: WhatsApp zaten sıkıştırıyor,
// 4000 px'lik görseli bulanıklaştırmak boşuna bellek ve süre harcar.
const MAX_KENAR = 1280
const PIKSEL_BLOK = 24

export const EFEKTLER = {
  sb: { aciklama: 'siyah-beyaz', uygula: (img) => img.grayscale() },
  sepya: {
    aciklama: 'eski fotoğraf',
    uygula: (img) =>
      img.recomb([
        [0.393, 0.769, 0.189],
        [0.349, 0.686, 0.168],
        [0.272, 0.534, 0.131],
      ]),
  },
  bulanık: { aciklama: 'bulanıklaştırır', uygula: (img) => img.blur(12) },
  keskin: { aciklama: 'keskinleştirir', uygula: (img) => img.sharpen({ sigma: 2 }) },
  ayna: { aciklama: 'sağ-sol çevirir', uygula: (img) => img.flop() },
  ters: { aciklama: 'baş aşağı çevirir', uygula: (img) => img.flip() },
  negatif: { aciklama: 'renkleri tersine çevirir', uygula: (img) => img.negate({ alpha: false }) },
  piksel: {
    aciklama: 'pikselleştirir',
    // Küçültüp aynı boya "nearest" ile büyütmek kare blokları üretir.
    uygula: async (img) => {
      const { info } = await img.clone().toBuffer({ resolveWithObject: true })
      const kucuk = await img
        .resize(Math.max(1, Math.round(info.width / PIKSEL_BLOK)), null, { kernel: 'nearest' })
        .toBuffer()
      return sharp(kucuk).resize(info.width, info.height, { kernel: 'nearest' })
    },
  },
}

// Türkçe klavyesi olmayan da yazabilsin.
const ESANLAM = { bulanik: 'bulanık', siyahbeyaz: 'sb', gri: 'sb' }

function kullanim() {
  return [
    '🖼️ Bir fotoğrafı yanıtlayarak `.foto <efekt>` yaz.',
    '',
    ...Object.entries(EFEKTLER).map(([ad, e]) => `• *${ad}* — ${e.aciklama}`),
  ].join('\n')
}

export default {
  name: 'foto',
  aliases: ['fotoefekt', 'filtre', 'resim'],
  description: 'Yanıtlanan fotoğrafa efekt uygular (sb, bulanık, ayna, negatif, piksel…)',
  usage: '.foto sb (bir fotoğrafı yanıtlayarak)',
  // Efekt listesi EFEKTLER'den üretilir: yeni efekt eklenince yardım da güncellenir.
  details: [
    'Bir fotoğrafı yanıtlayıp `.foto <efekt>` yaz → efektli hali gelir.',
    'Efektler:',
    ...Object.entries(EFEKTLER).map(([ad, e]) => `• *${ad}* — ${e.aciklama}`),
  ],
  category: 'medya',
  ownerOnly: false,
  // Görsel indirme + işleme: arka arkaya tetiklenmesin.
  cooldown: 10,

  async execute({ sock, msg, from, args, parsed }) {
    const istenen = (args[0] || '').toLocaleLowerCase('tr')
    const ad = ESANLAM[istenen] || istenen
    const efekt = EFEKTLER[ad]

    if (parsed.quoted?.type !== 'imageMessage' || !efekt) {
      await sock.sendMessage(from, { text: kullanim() }, { quoted: msg })
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

      // rotate(): telefon fotoğrafının EXIF yönü uygulanmazsa sonuç yan döner.
      const kaynak = sharp(buffer)
        .rotate()
        .resize(MAX_KENAR, MAX_KENAR, { fit: 'inside', withoutEnlargement: true })
      const islenmis = await efekt.uygula(kaynak)
      const image = await islenmis.jpeg({ quality: 85 }).toBuffer()

      await sock.sendMessage(from, { image }, { quoted: msg })
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })
    } catch (err) {
      // Tepki temizlenmezse mesajda kalıcı olarak ⏳ görünür.
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })
      logger.error({ err, efekt: ad }, 'Fotoğraf efekti uygulanamadı')
      throw err
    }
  },
}
