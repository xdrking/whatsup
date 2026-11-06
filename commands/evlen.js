import { uyumluluk } from './ship.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { EVLI_MAAS_YUZDESI } from '../lib/meslek.js'
import { NAFAKA_YUZDESI } from '../lib/evlilik.js'
import { botHesabiMi, esBul } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/evlilik.js'
import logger from '../lib/logger.js'

const tarihBicimi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'long' })

export default {
  name: 'evlen',
  aliases: ['evlilik', 'nikah'],
  description: 'Birine evlenme teklif eder',
  usage: '.evlen @kişi  —  .evlen (durumunu gösterir)',
  details: [
    'Karşı taraf 2 dk içinde botun mesajına `evet` ya da `hayır` yazar.',
    `Evliler \`.çalış\`'ta %${EVLI_MAAS_YUZDESI} fazla maaş alır, eşinin kefaletini yarı fiyata öder.`,
    `Boşanan \`.boşan\` ile servetinin %${NAFAKA_YUZDESI}'sini eşine nafaka öder.`,
  ],
  category: 'oyun',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const benim = esBul(from, sender)
      const [hedef] = resolveTargets(parsed)

      if (!hedef) {
        if (!benim) return await yaz('💍 Bekârsın. Kullanım: `.evlen @kişi`')
        return await yaz(`💍 ${mentionOf(benim.es_jid)} ile evlisin, ${tarihBicimi.format(benim.tarih)} tarihinden beri.`, [benim.es_jid])
      }

      const es = uyeKimligiBul(metadata, hedef)
      if (!es) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (es === sender) return await yaz('Kendinle evlenemezsin 🙃')
      if (botHesabiMi(es)) return await yaz('🤖 Bot bekâr kalmaya yemin etti.')
      if (benim) return await yaz('💍 Zaten evlisin, önce `.boşan`.')
      if (esBul(from, es)) return await yaz(`💍 ${mentionOf(es)} evli.`, [es])
      if (getGame(from)) return await yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

      await start({ sock, msg, from, sender, es, uyum: uyumluluk(sender, es) })
    } catch (err) {
      logger.error({ err, from }, '.evlen başarısız')
      await yaz('💍 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.evlen hata mesajı gönderilemedi'),
      )
    }
  },
}
