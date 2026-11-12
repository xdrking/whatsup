import { BAKAN_GUNLUK } from '../lib/devlet.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { kumarAffet } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

export default {
  name: 'kumaraf',
  aliases: ['kumarafı', 'kumarafi'],
  description: 'Günlük kumar tavanını dolduran kişinin kumar yasağını kaldırır',
  usage: '.kumaraf @kişi | .kumaraf (kendine)',
  details: [
    'Yalnızca bot sahibi ve İçişleri Bakanı kullanır.',
    'Günde piyasanın yarısını kumardan kazanan gece yarısına kadar kumar oynayamaz. `.kumaraf @kişi` bu yasağı kaldırır, kişinin bugünkü tavanı baştan dolar.',
    'Kimse etiketlenmezse yazan kendini affeder: WhatsApp kişinin kendini etiketlemesine izin vermiyor.',
    `İçişleri Bakanı için \`.bakan af\` ile aynı günlük hakkı harcar (günde ${BAKAN_GUNLUK}). İflas ve hapis yasağını kaldırmaz.`,
  ],
  category: 'toplum',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const [ham = sender] = resolveTargets(parsed)
      const hedef = uyeKimligiBul(metadata, ham)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')

      const s = kumarAffet({ chatJid: from, userJid: sender, hedef, sahip: isOwner })
      if (!s) return await yaz('🏛️ Şu an yapılamıyor, sonra dene.')
      if (s.degil) return await yaz('🚔 Kumar affını yalnızca İçişleri Bakanı ve bot sahibi çıkarır.')
      if (s.bugunVar) return await yaz(`🚔 Bugünkü ${BAKAN_GUNLUK} hakkını kullandın, yarın tekrar.`)
      if (s.yasakYok) return await yaz(`🎰 ${mentionOf(hedef)} kumar tavanına takılmamış.`, [hedef])

      const hak = s.kalan === null ? '' : `\n(Bugün kalan hakkın: ${s.kalan})`
      await yaz(`🎰 ${mentionOf(sender)}, ${mentionOf(hedef)} için kumar affı çıkardı. Masalar yeniden açık!${hak}`, [sender, hedef])
    } catch (err) {
      logger.error({ err, from }, '.kumaraf başarısız')
      await yaz('🏛️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.kumaraf hata mesajı gönderilemedi'))
    }
  },
}
