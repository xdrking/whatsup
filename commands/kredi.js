import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import { KREDI_FAIZ_YUZDESI, KREDI_LIMITI, KREDI_VADE_SAATI, MIN_KREDI } from '../lib/kredi.js'
import { miktarCoz } from '../lib/kumar.js'
import { krediCek, krediDurumu, krediOde } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { sureYaz } from './cark.js'

const sayi = new Intl.NumberFormat('tr-TR')
const KAPALI = '💳 Kredi servisi şu an kapalı, sonra dene.'

export default {
  name: 'kredi',
  aliases: ['borç', 'borc', 'loan'],
  description: 'Botun bankasından faizli kredi çeker',
  usage: '.kredi  —  .kredi çek <miktar>  —  .kredi öde <miktar|hepsi|yarısı>',
  details: [
    `Faiz saatlik %${KREDI_FAIZ_YUZDESI} bileşiktir, saat başlarında işler. Vade ${KREDI_VADE_SAATI} saat, aynı anda tek kredi.`,
    `Limit ${sayi.format(KREDI_LIMITI)} XP, en az ${MIN_KREDI} XP çekilir.`,
    'Borç varken `.banka yatır` önce borcu keser, `.devret` kapalıdır.',
    'Vade dolunca borç önce cüzdandan, sonra bankadan alınır, kalanı cüzdana eksi yazılır.',
    'Eksi bakiye oyun ve görev XP\'siyle kapanır ya da `.iflas` ile silinir.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const durum = krediDurumu({ chatJid: from, userJid: sender })
      if (!durum) return await yaz(KAPALI)

      const islem = trLower(args[0] || '')

      if (['çek', 'cek', 'al'].includes(islem)) {
        const miktar = Number(args[1])
        if (!Number.isSafeInteger(miktar) || miktar < MIN_KREDI) {
          return await yaz(`💳 Kullanım: \`.kredi çek <miktar>\` (en az ${MIN_KREDI} XP)`)
        }

        const s = krediCek({ chatJid: from, userJid: sender, miktar })
        if (!s || s.kapali) return await yaz(KAPALI)
        if (s.acik) return await yaz(`💳 Önce mevcut borcunu kapat: ${sayi.format(s.borc)} XP`)
        if (s.eksi) return await yaz(`💳 Cüzdanın ekside, kredi verilmez: ${sayi.format(s.xp)} XP`)
        if (s.limit) return await yaz(`💳 Limitin ${sayi.format(s.limit)} XP.`)
        if (s.kasa) return await yaz('💳 Botun bankasında bu kadar XP yok.')

        return await yaz([
          `💳 ${sayi.format(miktar)} XP kredi çekildi.`,
          `⏰ Vade: ${KREDI_VADE_SAATI} saat  •  📈 Saatlik faiz: %${KREDI_FAIZ_YUZDESI}`,
          `👛 Cüzdan: ${sayi.format(s.xp)} XP`,
        ].join('\n'))
      }

      if (['öde', 'ode', 'kapat'].includes(islem)) {
        if (!durum.borc) return await yaz('💳 Borcun yok.')

        const hepsi = ['hepsi', 'all', 'hep'].includes(trLower(args[1] || ''))
        const c = hepsi ? { miktar: durum.xp } : miktarCoz(args[1], durum.xp)
        if (c.hata) return await yaz(`💳 ${c.hata}`)

        const s = krediOde({ chatJid: from, userJid: sender, miktar: c.miktar })
        if (!s) return await yaz(KAPALI)
        if (s.yetersiz) return await yaz(`💳 Ödeyecek XP'n yok. Senin XP'n: ${sayi.format(s.xp)}`)

        return await yaz([
          `💳 ${sayi.format(s.odenen)} XP ödendi.`,
          s.borc ? `📉 Kalan borç: ${sayi.format(s.borc)} XP` : '✅ Borcun bitti.',
          `👛 Cüzdan: ${sayi.format(s.xp)} XP`,
        ].join('\n'))
      }

      const lines = ['💳 *Kredi*', '']
      if (durum.borc) {
        lines.push(
          `📉 Borç: ${sayi.format(durum.borc)} XP`,
          `⏰ Vadeye: ${sureYaz(durum.vade - Date.now())}`,
        )
      } else {
        lines.push('Borcun yok.')
      }
      lines.push(`👛 Cüzdan: ${sayi.format(durum.xp)} XP`, `🏷️ Limit: ${sayi.format(durum.limit)} XP`)
      if (durum.xp < 0) lines.push('', '🔴 Cüzdanın ekside. Oyun ve görevlerden XP kazanarak kapat ya da `.iflas` yaz.')
      lines.push('', '`.kredi çek 1000`  •  `.kredi öde hepsi`')

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.kredi başarısız')
      await yaz('💳 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.kredi hata mesajı gönderilemedi'),
      )
    }
  },
}
