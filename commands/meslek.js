import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { CALISMA_DAKIKASI, MESLEK_DEGISIM_SAATI, MESLEKLER, meslekBul } from '../lib/meslek.js'
import { meslekDurumu, meslekSec } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const yuzde = (binde) => String(binde / 100).replace('.', ',')
const KARIYER = MESLEKLER.find((m) => m.kariyerSaati)

/** Kariyerli meslek seçilmeden önce gösterilir: insanlar ne olduğunu bilmeden seçip yakıyordu. */
const kariyerUyarisi = (m) => [
  `⚠️ *${m.ad} tek seferlik bir kariyerdir, iyi düşün:*`,
  `• Maaş her \`.çalış\`ta kurun %${yuzde(m.min)} ile %${yuzde(m.max)} arası rastgele bir pay olarak gelir. Kötü günde hiç para çıkmaz, iyi günde pilotun birkaç katını alırsın.`,
  `• Kariyer seçtiğin andan ${m.kariyerSaati} saat sonra biter. Bitince ${m.ad.split(' ').pop()} *bir daha asla* seçilemez.`,
  `• ${m.kariyerSaati} saat boyunca başka mesleğe geçemezsin. \`.istifa\` edersen kariyer o an biter, yine geri dönülmez.`,
  '• Kariyer bitince hemen yeni meslek seçebilirsin.',
]

export default {
  name: 'meslek',
  aliases: ['iş', 'is', 'job'],
  description: 'Meslek seçer, maaş için `.çalış`',
  usage: '.meslek  —  .meslek seç <meslek>',
  details: [
    `Maaş coin kuruna bağlıdır, ${CALISMA_DAKIKASI} dakikada bir \`.çalış\` yazılır.`,
    `Meslek ${MESLEK_DEGISIM_SAATI} saatte bir değiştirilebilir. Maaşlar gerçek hayata göredir, riskli mesleklerde daha çok oynar.`,
    `\`.istifa\` meslekten çıkarır. Yeni meslek yine ${MESLEK_DEGISIM_SAATI} saat dolunca seçilir.`,
    ...kariyerUyarisi(KARIYER),
    `Seçmek için onay gerekir: \`.meslek seç ${KARIYER.adlar[0]} onay\``,
  ],
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const ilk = trLower(args[0] || '')
      const kalan = ['seç', 'sec'].includes(ilk) ? args.slice(1) : args
      const ad = kalan[0]
      const onay = ['onay', 'onaylıyorum', 'evet'].includes(trLower(kalan[1] || ''))

      if (ad) {
        const meslek = meslekBul(ad)
        if (!meslek) return await yaz(`💼 Hangi meslek? ${MESLEKLER.map((m) => `\`${m.adlar[0]}\``).join(', ')}`)

        if (meslek.kariyerSaati && !onay) {
          return await yaz([
            ...kariyerUyarisi(meslek),
            '',
            `Yine de istiyorsan: \`.meslek seç ${meslek.adlar[0]} onay\``,
          ].join('\n'))
        }

        const s = meslekSec({ chatJid: from, userJid: sender, meslek })
        if (!s) return await yaz('💼 İŞKUR şu an kapalı, sonra dene.')
        if (s.ayni) return await yaz(`💼 Zaten ${meslek.ad} olarak çalışıyorsun.`)
        if (s.hakBitti) return await yaz(`💼 ${meslek.ad} kariyerin bitti, bir daha seçemezsin.`)
        if (s.bekle) return await yaz(`💼 Meslek değiştirmek için ${sureYaz(s.bitis - Date.now())} beklemelisin.`)
        return await yaz([
          `💼 Hayırlı olsun: *${meslek.ad}*`,
          ...(meslek.kariyerSaati ? [`⚠️ Kariyerin ${meslek.kariyerSaati} saat sürer, sonra bir daha seçemezsin.`] : []),
          'Maaş için `.çalış`',
        ].join('\n'))
      }

      const durum = meslekDurumu(from, sender)
      await yaz([
        '💼 *Meslekler*',
        '',
        ...MESLEKLER.map((m) => `${m.ad} — kurun %${yuzde(m.min)}-%${yuzde(m.max)}'i${m.kariyerSaati ? ` ⚠️ ${m.kariyerSaati} saatlik tek seferlik kariyer, önce \`.help meslek\`` : ''}`),
        '',
        durum ? `Mesleğin: ${durum.meslek.ad}${durum.kariyerBitis ? `, kariyerin ${sureYaz(durum.kariyerBitis - Date.now())} sonra bitiyor` : ''}` : 'Seçmek için: `.meslek seç kurye`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.meslek başarısız')
      await yaz('💼 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.meslek hata mesajı gönderilemedi'),
      )
    }
  },
}
