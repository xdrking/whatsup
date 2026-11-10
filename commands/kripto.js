import { requireGroup } from '../lib/group.js'
import { btcFiyati, ONDALIK, SATIS_KESINTI, SULY, sulyCoz, sulyDegeri, sulyFiyati, sulyYaz } from '../lib/kripto.js'
import { binlik } from '../lib/sayi.js'
import { getStats, kriptoAl, kriptoDurumu, kriptoSat } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const dolar = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const KAPALI = '🟠 Kripto piyasası şu an kapalı, sonra dene.'
const FIYAT_YOK = '🟠 Bitcoin fiyatı şu an alınamıyor, alım satım yapılamaz. Biraz sonra dene.'

/** `.kripto al suly 0.001` → "0.001". Ham metinden okunur: handler "0.001"i binlik sanıp 1 yapardı. */
export function miktarMetni(text) {
  const parcalar = String(text || '').trim().split(/\s+/).slice(1)
  if (SULY.adlar.includes(trLower(parcalar[0] || ''))) parcalar.shift()
  return trLower(parcalar[0] || '')
}

export default {
  name: 'kripto',
  aliases: ['kriptopara', 'crypto'],
  description: 'Bitcoin fiyatına endeksli Suly al, sat, piyasayı gör',
  usage: '.kripto  —  .kripto al suly <miktar>  —  .kripto sat suly <miktar|hepsi>',
  details: [
    '1 Suly, gerçek Bitcoin\'in anlık dolar fiyatına endekslidir. XP karşılığı coin kuruyla büyür, enflasyonda değerini korur.',
    `Ondalıklı alınır: \`.kripto al suly 12,46\` ya da \`.kripto al suly 0.001\` (en çok ${ONDALIK} basamak).`,
    `\`.kripto sat suly hepsi\` değerin %${100 - SATIS_KESINTI}'ini öder, %${SATIS_KESINTI} hazineye gider. Ödenen XP yanar, satınca geri basılır.`,
    'Suly soyulmaz, `.hacizall` ve bakanlar alamaz. Yalnızca bot sahibinin `.haciz`\'i alabilir. Darbede destek vermeyenin %60\'ı yanar.',
    'Borçluyken alınamaz, elinde Suly varken `.iflas` edilemez.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, text, parsed }) {
    const yaz = (metin) => sock.sendMessage(from, { text: metin }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const islem = trLower(args[0] || '')
      const miktarHam = miktarMetni(text)

      if (['al', 'satınal', 'satinal', 'buy'].includes(islem)) {
        const birim = sulyCoz(miktarHam)
        if (!birim) return await yaz('🟠 Kaç Suly? `.kripto al suly 0,5`')

        const fiyat = await btcFiyati()
        if (!fiyat) return await yaz(FIYAT_YOK)

        const s = kriptoAl({ chatJid: from, userJid: sender, birim, usd: fiyat.usd })
        if (!s) return await yaz(KAPALI)
        if (s.borclu) return await yaz('🟠 Borçluyken Suly alamazsın. Önce `.kredi öde`.')
        if (s.yetersiz) return await yaz(`🟠 ${binlik(s.ucret)} XP gerekiyor. Senin XP'n: ${binlik(s.xp)}`)
        return await yaz([
          `🟠 *${sulyYaz(birim)} Suly* aldın, ${binlik(s.ucret)} XP ödedin.`,
          `₿ 1 Suly = $${dolar.format(fiyat.usd)}`,
          `💰 Suly: ${sulyYaz(s.birim)}  •  XP'n: ${binlik(s.xp)}`,
        ].join('\n'))
      }

      if (['sat', 'boz', 'bozdur', 'sell'].includes(islem)) {
        const hepsi = ['hepsi', 'tümü', 'tumu'].includes(miktarHam)
        const birim = hepsi ? null : sulyCoz(miktarHam)
        if (!hepsi && !birim) return await yaz('🟠 Kaç Suly? `.kripto sat suly 0,5` ya da `.kripto sat suly hepsi`')

        const fiyat = await btcFiyati()
        if (!fiyat) return await yaz(FIYAT_YOK)

        const s = kriptoSat({ chatJid: from, userJid: sender, birim, usd: fiyat.usd })
        if (!s) return await yaz(KAPALI)
        if (s.yetersiz) return await yaz(`🟠 O kadar Suly'n yok: ${sulyYaz(s.birim)}`)
        return await yaz([
          `🟠 *${sulyYaz(s.satilan)} Suly* sattın: +${binlik(s.kazanc)} XP (kesinti ${binlik(s.kesinti)} XP)`,
          `₿ 1 Suly = $${dolar.format(fiyat.usd)}`,
          `💰 Suly: ${sulyYaz(s.birim)}  •  XP'n: ${binlik(s.xp)}`,
        ].join('\n'))
      }

      const fiyat = await btcFiyati()
      const d = kriptoDurumu({ chatJid: from, userJid: sender })
      if (!d) return await yaz(KAPALI)

      const usd = fiyat?.usd ?? d.fiyat?.usd
      const satirlar = ['🟠 *Kripto Piyasası*', '']
      if (usd) {
        satirlar.push(`${SULY.ad} — $${dolar.format(usd)}  •  1 Suly ≈ ${binlik(Math.floor(sulyFiyati(usd, d.kur)))} XP`)
        if (!fiyat) satirlar.push('_(Bitcoin fiyatı şu an alınamadı, son bilinen fiyat. Alım satım kapalı.)_')
      } else {
        satirlar.push(`${SULY.ad} — fiyat şu an alınamıyor`)
      }
      satirlar.push(
        '',
        `💰 Suly: ${sulyYaz(d.birim)}${d.birim && usd ? ` ≈ ${binlik(sulyDegeri(d.birim, usd, d.kur))} XP` : ''}  •  XP'n: ${binlik(getStats(from, sender).xp)}`,
        '',
        'Almak için `.kripto al suly <miktar>` (ör. `0,001`)',
        'Satmak için `.kripto sat suly <miktar|hepsi>`',
      )
      await yaz(satirlar.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.kripto başarısız')
      await yaz('🟠 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.kripto hata mesajı gönderilemedi'))
    }
  },
}
