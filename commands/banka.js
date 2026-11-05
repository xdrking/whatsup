import {
  CEKIM_KESINTI_YUZDESI, FAIZ_YUZDESI, VERGI_ESIGI, VERGI_YUZDESI,
} from '../lib/banka.js'
import { requireGroup } from '../lib/group.js'
import { miktarCoz } from '../lib/kumar.js'
import { bankaCek, bankaDurumu, bankaYatir } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')
const ondalik = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })

export default {
  name: 'banka',
  aliases: ['bank'],
  description: 'XP\'ni soygun ve vergiden koru, saatlik faiz al',
  usage: '.banka  —  .banka yatır <miktar|hepsi|yarısı>  —  .banka çek <miktar|hepsi|yarısı>',
  details: [
    `Bankadaki XP soyulamaz ve her saat tüm bakiyeye %${ondalik.format(FAIZ_YUZDESI)} faiz alır. Faiz \`.banka\` yazınca işlenir, en çok 7 günlük birikir.`,
    `Çekerken %${CEKIM_KESINTI_YUZDESI} kesilir. Bankadaki XP'yle kumar oynanmaz, seviyeye ve \`.top\`'a sayılmaz.`,
    `Cüzdanda ${sayi.format(VERGI_ESIGI)} XP'nin üstü, o günkü ilk mesajında %${VERGI_YUZDESI} vergilenir. Banka vergiden muaftır.`,
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const durum = bankaDurumu({ chatJid: from, userJid: sender })
      if (!durum) return await yaz('🏦 Banka şu an kapalı, sonra dene.')

      const islem = trLower(args[0] || '')

      if (['yatır', 'yatir', 'koy'].includes(islem)) {
        const c = miktarCoz(args[1], durum.xp)
        if (c.hata) return await yaz(`🏦 ${c.hata}`)

        const s = bankaYatir({ chatJid: from, userJid: sender, miktar: c.miktar })
        if (!s) return await yaz('🏦 Banka şu an kapalı, sonra dene.')
        if (s.yetersiz) return await yaz(`🏦 O kadar XP'n yok. Senin XP'n: ${sayi.format(s.xp)}`)

        return await yaz(`🏦 ${sayi.format(c.miktar)} XP yatırıldı.\n💰 Hesap: ${sayi.format(s.bakiye)} XP  •  👛 Cüzdan: ${sayi.format(s.xp)} XP`)
      }

      if (['çek', 'cek', 'al'].includes(islem)) {
        const c = miktarCoz(args[1], durum.bakiye)
        if (c.hata) return await yaz(`🏦 ${c.hata.replace('Senin XP\'n', 'Hesabın')}`)

        const s = bankaCek({ chatJid: from, userJid: sender, miktar: c.miktar })
        if (!s) return await yaz('🏦 Banka şu an kapalı, sonra dene.')
        if (s.yetersiz) return await yaz(`🏦 Hesabında o kadar yok: ${sayi.format(s.bakiye)} XP`)

        return await yaz([
          `🏦 ${sayi.format(c.miktar)} XP çekildi, kesinti ${sayi.format(s.kesinti)} XP.`,
          `💰 Hesap: ${sayi.format(s.bakiye)} XP  •  👛 Cüzdan: ${sayi.format(s.xp)} XP`,
        ].join('\n'))
      }

      const lines = [
        '🏦 *Banka*',
        '',
        `💰 Hesap: ${sayi.format(durum.bakiye)} XP`,
        `👛 Cüzdan: ${sayi.format(durum.xp)} XP`,
      ]
      if (durum.faiz) lines.push(`📈 Yeni faiz: +${sayi.format(durum.faiz)} XP`)
      if (durum.sonVergi) lines.push(`💸 Son vergi: ${sayi.format(durum.sonVergi)} XP`)
      lines.push('', '`.banka yatır 500`  •  `.banka çek 500`')

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.banka başarısız')
      await yaz('🏦 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.banka hata mesajı gönderilemedi'),
      )
    }
  },
}
