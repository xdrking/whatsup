import logger from '../lib/logger.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { miktarCoz } from '../lib/kumar.js'
import { bankaDurumu, botHesabiMi, hacizEt } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')
const KAPALI = '⚖️ Haciz şu an yapılamıyor.'

export default {
  name: 'haciz',
  aliases: [],
  description: 'Kişinin banka hesabından botun bankasına XP aktarır',
  usage: '.haciz @kişi <miktar|hepsi|yarısı>',
  category: 'oyun',
  ownerOnly: true,

  async execute({ sock, msg, args, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      // `args` verilmez: miktar 8+ haneliyse elle yazılmış numara sanılırdı.
      const [hedefHam] = resolveTargets(parsed)
      const miktarArg = args.find((a) => !a.startsWith('@'))
      if (!hedefHam || !miktarArg) return await yaz('Kullanım: `.haciz @kişi <miktar|hepsi|yarısı>`')

      const hedef = uyeKimligiBul(metadata, hedefHam)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (botHesabiMi(hedef)) return await yaz('🤖 Botun hesabına haciz konmaz.')

      const durum = bankaDurumu({ chatJid: from, userJid: hedef })
      if (!durum) return await yaz(KAPALI)

      const c = miktarCoz(miktarArg, durum.bakiye)
      if (c.hata) return await yaz(`⚖️ ${c.hata.replace('Senin XP\'n', 'Hesabı')}`)

      const s = hacizEt({ chatJid: from, userJid: hedef, miktar: c.miktar })
      if (!s || s.kapali) return await yaz(KAPALI)
      if (s.yetersiz) return await yaz(`⚖️ Hesabında o kadar yok: ${sayi.format(s.bakiye)} XP`)

      await yaz(
        `⚖️ *Haciz* — ${mentionOf(hedef)} hesabından ${sayi.format(c.miktar)} XP botun bankasına geçti.\n` +
          `💰 Kalan hesap: ${sayi.format(s.bakiye)} XP`,
        [hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.haciz başarısız')
      await yaz('⚖️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.haciz hata mesajı gönderilemedi'),
      )
    }
  },
}
