import { requireGroup } from '../lib/group.js'
import { BOZDURMA_YUZDESI } from '../lib/coin.js'
import { KIRA_AZAMI_SAAT, MULKLER, mulkBul } from '../lib/mulk.js'
import { binlik } from '../lib/sayi.js'
import { kiraTopla, mulkAl, mulkDurumu, mulkSat } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🏠 Tapu şu an kapalı, sonra dene.'

export default {
  name: 'mülk',
  aliases: ['mulk', 'emlak'],
  description: 'Coinle mülk al, kira topla',
  usage: '.mülk  —  .mülk al <mülk>  —  .mülk sat <mülk>  —  .mülk topla',
  details: [
    'Mülk coinle alınır. Kira saat başı birikir ve coin kuruna bağlıdır, enflasyonda büyür.',
    `Kira ${KIRA_AZAMI_SAAT} saatte durur, \`.mülk topla\` yazmak gerekir.`,
    `Satış coin kurunun %${BOZDURMA_YUZDESI}'inden XP olarak ödenir. Owner \`.haciz @kişi ev\` ile mülke el koyabilir.`,
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const islem = trLower(args[0] || '')

      if (islem === 'topla') {
        const s = kiraTopla({ chatJid: from, userJid: sender })
        if (!s) return await yaz(KAPALI)
        if (!s.kira) return await yaz('🏠 Toplanacak kira yok.')
        return await yaz(`🏠 Kira toplandı: *+${binlik(s.kira)} XP*\n💰 XP'n: ${binlik(s.xp)}`)
      }

      if (islem === 'al' || islem === 'sat') {
        const mulk = mulkBul(args[1])
        if (!mulk) return await yaz(`🏠 Hangi mülk? ${MULKLER.map((m) => `\`${m.adlar[0]}\``).join(', ')}`)

        if (islem === 'al') {
          const s = mulkAl({ chatJid: from, userJid: sender, mulk })
          if (!s) return await yaz(KAPALI)
          if (s.yetersiz) return await yaz(`🏠 ${mulk.fiyat} coin gerekiyor. Senin coinin: ${binlik(s.bakiye)}`)
          return await yaz(`🏠 *${mulk.ad}* senin! (${s.adet} tane)\n🪙 Kalan coin: ${binlik(s.bakiye)}`)
        }

        const s = mulkSat({ chatJid: from, userJid: sender, mulk })
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz(`🏠 Sende ${mulk.ad} yok.`)
        return await yaz([
          `🏠 *${mulk.ad}* satıldı: +${binlik(s.kazanc)} XP`,
          ...(s.kira ? [`💵 Birikmiş kira: +${binlik(s.kira)} XP`] : []),
          `💰 XP'n: ${binlik(s.xp)}`,
        ].join('\n'))
      }

      const mulkler = mulkDurumu({ chatJid: from, userJid: sender })
      await yaz([
        '🏠 *Emlak*',
        '',
        ...MULKLER.map((m) => `${m.ad} — ${m.fiyat} coin${m.kiraYuzde ? `, saatlik kira %${String(m.kiraYuzde).replace('.', ',')}` : ', kira yok'}`),
        '',
        ...(mulkler.length
          ? ['*Mülklerin*', ...mulkler.map((m) => `${m.mulk.ad} x${m.adet}${m.kira ? ` — ${binlik(m.kira)} XP kira` : ''}`), '']
          : []),
        'Kullanım: `.mülk al ev`  •  `.mülk sat ev`  •  `.mülk topla`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.mülk başarısız')
      await yaz('🏠 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.mülk hata mesajı gönderilemedi'),
      )
    }
  },
}
