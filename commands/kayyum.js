import { makamBul, MAKAMLAR } from '../lib/devlet.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { baskanMi, botHesabiMi, kayyumAta, kayyumKaldir } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const BAKANLIKLAR = MAKAMLAR.filter((m) => m.yetki)
const LISTE = BAKANLIKLAR.map((m) => `\`${m.adlar[0]}\``).join(', ')
const KULLANIM = `Kullanım: \`.kayyum <bakanlık> @kişi\`  •  \`.kayyum kaldır <bakanlık>\`\nBakanlıklar: ${LISTE}`
const KAPALI = '🏛️ Bakanlıklar şu an kapalı, sonra dene.'

export default {
  name: 'kayyum',
  aliases: [],
  description: 'Başkan bir bakanlığa kayyum atar',
  usage: '.kayyum <bakanlık> @kişi  —  .kayyum kaldır <bakanlık>',
  details: [
    'Yalnızca başkan kullanır (bot sahibi de başkan sayılır).',
    '`.kayyum dışişleri @mert` — Dışişleri Bakanı görevden alınır, Mert bakan olur.',
    'Kayyumlu bakanlığın seçimi askıya alınır, açık seçimi iptal olur (adaylık ve oy ücretleri yanar).',
    '`.kayyum kaldır dışişleri` seçimi yeniden açar, kayyum yenisi seçilene kadar kalır. `.darbe bitir` de bütün kayyumları kaldırır.',
  ],
  category: 'toplum',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      // Hazine gibi: sahip başkan sayılır, seçilmiş başkan da kullanır.
      if (!isOwner && !baskanMi(from, sender)) return await yaz('🏛️ Kayyumu yalnızca başkan atar.')

      const kaldir = ['kaldır', 'kaldir', 'bitir'].includes(trLower(args[0] || ''))
      const makam = (kaldir ? args.slice(1) : args).map(makamBul).find((m) => m?.yetki)
      if (!makam) return await yaz(KULLANIM)

      if (kaldir) {
        const s = kayyumKaldir({ chatJid: from, makam: makam.kod })
        if (!s) return await yaz(KAPALI)
        if (s.kayyumYok) return await yaz(`🏛️ ${makam.ad} kayyumla yönetilmiyor.`)
        return await yaz(
          `🗳️ ${makam.ad} kayyumu kaldırıldı, seçim yeniden açık. ${mentionOf(s.sahip)} yenisi seçilene kadar görevde.`,
          [s.sahip],
        )
      }

      const [ham] = resolveTargets(parsed)
      if (!ham) return await yaz(KULLANIM)
      const hedef = uyeKimligiBul(metadata, ham)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (botHesabiMi(hedef)) return await yaz('🤖 Bot bakan olamaz.')

      const s = kayyumAta({ chatJid: from, makam: makam.kod, hedef })
      if (!s || s.degil) return await yaz(KAPALI)
      if (s.zaten) return await yaz(`🏛️ ${mentionOf(hedef)} zaten ${makam.ad} kayyumu.`, [hedef])

      const mentions = [hedef, ...(s.onceki ? [s.onceki] : [])]
      await yaz(
        [
          `🏛️ *Kayyum atandı:* ${makam.ad}`,
          ...(s.onceki ? [`${mentionOf(s.onceki)} görevden alındı.`] : []),
          `Yeni bakan: ${mentionOf(hedef)}`,
          ...(s.iptal ? ['Açık seçim iptal edildi.'] : []),
          'Seçim askıda. Başkan `.kayyum kaldır` ile açabilir.',
        ].join('\n'),
        mentions,
      )
    } catch (err) {
      logger.error({ err, from }, '.kayyum başarısız')
      await yaz('🏛️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.kayyum hata mesajı gönderilemedi'))
    }
  },
}
