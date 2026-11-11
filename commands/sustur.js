import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { isGroupAdmin, requireGroupMetadata, sahipUyeKimligi, uyeKimligiBul } from '../lib/group.js'
import { susturulanUyeler, uyeSerbest, uyeSustur } from '../lib/uyeSustur.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KULLANIM = 'Kullanım: `.sustur @kişi [dakika]`  •  `.sustur kaldır @kişi`  •  `.sustur liste`'

function saatYaz(ms) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(ms)
}

export default {
  name: 'sustur',
  aliases: ['susturkaldır', 'susturkaldir'],
  description: 'Üyeyi susturur, bot mesajlarını siler (admin)',
  usage: '.sustur @kişi [dakika]  —  .sustur kaldır @kişi  —  .sustur liste',
  details: [
    'Yalnızca grup adminleri kullanabilir. Botun grupta admin olması gerekir.',
    '`.sustur @ali` — Ali\'nin her mesajını bot siler, kaldırılana kadar. `.sustur @ali 30` — 30 dakika.',
    'Susturulan kişinin komutları da çalışmaz, mesajları istatistiğe sayılmaz.',
    '`.sustur kaldır @ali` ya da `.susturkaldır @ali` açar. `.sustur liste` susturulanları yazar.',
    'Bot sahibi, bot ve adminler susturulamaz. Botu susturmak için `.sus`.',
  ],
  category: 'grup',
  cooldown: 3,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      if (!isGroupAdmin(metadata, sender)) return await yaz('🔇 Üyeleri yalnızca grup adminleri susturabilir.')

      const komut = trLower(parsed.body.trim().split(/\s+/)[0] || '')
      const islem = trLower(args[0] || '')

      if (islem === 'liste') {
        const liste = susturulanUyeler(from)
        if (!liste.length) return await yaz('🔇 Susturulan kimse yok.')
        return await yaz(
          ['🔇 *Susturulanlar*', ...liste.map((u) => `${mentionOf(u.jid)} — ${u.bitis ? `${saatYaz(u.bitis)}'e kadar` : 'kaldırılana kadar'}`)].join('\n'),
          liste.map((u) => u.jid),
        )
      }

      const [hedefHam] = resolveTargets(parsed)
      if (!hedefHam) return await yaz(KULLANIM)
      const hedef = uyeKimligiBul(metadata, hedefHam)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')

      if (komut.includes('kaldır') || komut.includes('kaldir') || ['kaldır', 'kaldir', 'aç', 'ac'].includes(islem)) {
        if (!uyeSerbest(from, hedef)) return await yaz(`🔈 ${mentionOf(hedef)} zaten susturulmamış.`, [hedef])
        return await yaz(`🔈 ${mentionOf(hedef)} artık konuşabilir.`, [hedef])
      }

      const botKimlikleri = [sock.user?.id, sock.user?.lid].filter(Boolean).map((j) => jidNormalizedUser(j))
      if (botKimlikleri.includes(hedef)) return await yaz('🤖 Beni susturmak için `.sus` yazın.')
      if (hedef === sahipUyeKimligi(metadata)) return await yaz('👑 Bot sahibi susturulamaz.')
      if (hedef === sender) return await yaz('❌ Kendini susturamazsın.')
      if (isGroupAdmin(metadata, hedef)) return await yaz('❌ Adminler susturulamaz.')
      // Admin değilse WhatsApp silmeyi reddeder; susturma işe yaramaz görünmesin.
      if (!botKimlikleri.some((j) => isGroupAdmin(metadata, j))) return await yaz('❌ Mesaj silebilmem için önce beni grupta admin yapın.')

      const dakikaHam = args.find((a) => /^\d{1,5}$/.test(a))
      const dakika = dakikaHam ? Number(dakikaHam) : 0
      const bitis = uyeSustur(from, hedef, dakika)

      await yaz(
        `🔇 ${mentionOf(hedef)} susturuldu, mesajlarını sileceğim${bitis ? ` (${saatYaz(bitis)}'e kadar)` : ''}.\nAçmak için: \`.sustur kaldır @kişi\``,
        [hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.sustur başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.sustur hata mesajı gönderilemedi'))
    }
  },
}
