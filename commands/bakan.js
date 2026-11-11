import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { AMBARGO_MS, BAKAN_GUNLUK, MAKAMLAR, TUTUKLAMA_SAATI, yetkiyleMakam } from '../lib/devlet.js'
import { binlik } from '../lib/sayi.js'
import { bakanYetkisi, botHesabiMi, secimDurumu } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const BAKANLIKLAR = MAKAMLAR.filter((m) => m.yetki)

export default {
  name: 'bakan',
  aliases: ['bakanlık', 'bakanlik'],
  description: 'Bakanlar ve bakanlık yetkileri',
  usage: '.bakan  —  .bakan af|tutukla|kalkan|ambargo @kişi',
  details: [
    ...BAKANLIKLAR.map((m) => `${m.ad}: \`.bakan ${m.yetki} @kişi\`, ${m.aciklama}.`),
    `Bakanlar \`.seçim\` ile seçilir ya da başkan \`.kayyum\` ile atar. Yetki günde ${BAKAN_GUNLUK} kez kullanılır.`,
  ],
  category: 'toplum',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const makam = yetkiyleMakam(trLower(args[0] || ''))
      if (!makam) {
        const s = secimDurumu({ chatJid: from, userJid: sender })
        if (!s) return await yaz('🏛️ Bakanlıklar şu an kapalı.')
        const lines = ['🏛️ *Bakanlar*', '']
        for (const m of BAKANLIKLAR) {
          const { sahip, askida } = s.makamlar.find((x) => x.kod === m.kod) ?? {}
          lines.push(`${m.ad}: ${sahip ? displayName(sahip) : 'boş'}${askida ? ' (kayyum)' : ''}`, `   \`.bakan ${m.yetki} @kişi\` — ${m.aciklama}`)
        }
        lines.push('', 'Bakan olmak için: `.seçim aday <makam>`')
        return await yaz(lines.join('\n'))
      }

      const [ham] = resolveTargets(parsed)
      if (!ham) return await yaz(`Kullanım: \`.bakan ${makam.yetki} @kişi\``)
      const hedef = uyeKimligiBul(metadata, ham)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (botHesabiMi(hedef)) return await yaz('🤖 Bota yetki işlemez.')

      const s = bakanYetkisi({ chatJid: from, userJid: sender, makam: makam.kod, hedef })
      if (!s) return await yaz('🏛️ Bakanlık şu an kapalı, sonra dene.')
      if (s.degil) return await yaz(`🏛️ Bu yetki yalnızca ${makam.ad}'nın.`)
      if (s.bugunVar) return await yaz(`🏛️ Bugünkü ${BAKAN_GUNLUK} hakkını kullandın, yarın tekrar.`)
      if (s.hapisteDegil) return await yaz(`🚔 ${mentionOf(hedef)} hapiste değil.`, [hedef])
      if (s.zatenAmbargo) return await yaz(`🌍 ${mentionOf(hedef)} zaten ambargoda.`, [hedef])
      if (s.zatenHapiste) return await yaz(`⚖️ ${mentionOf(hedef)} zaten hapiste.`, [hedef])

      const hak = `\n(Bugün kalan hakkın: ${s.kalan})`
      if (s.af) return await yaz(`🚔 ${makam.ad} ${mentionOf(sender)}, ${mentionOf(hedef)} için af çıkardı. Özgürsün!${hak}`, [sender, hedef])
      if (s.ambargo) {
        return await yaz(`🌍 ${makam.ad} ${mentionOf(sender)}, ${mentionOf(hedef)} kişisine ${AMBARGO_MS / 3_600_000} saat ambargo koydu: para ve mülk gönderemez.${hak}`, [sender, hedef])
      }
      if (s.tutuklama) {
        return await yaz(
          `⚖️ ${makam.ad} ${mentionOf(sender)}, ${mentionOf(hedef)} hakkında tutuklama kararı verdi: ${TUTUKLAMA_SAATI} saat hapis.\n` +
            `Kefalet: ${binlik(s.tutuklama.kefalet)} XP (\`.kefalet @kişi\`)${hak}`,
          [sender, hedef],
        )
      }
      await yaz(`🛡️ ${makam.ad} ${mentionOf(sender)}, ${mentionOf(hedef)} kişisini 24 saat soygunlara karşı korumaya aldı.${hak}`, [sender, hedef])
    } catch (err) {
      logger.error({ err, from }, '.bakan başarısız')
      await yaz('🏛️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.bakan hata mesajı gönderilemedi'))
    }
  },
}
