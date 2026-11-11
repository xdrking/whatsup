import { groupMetadata, uyeKimligiBul } from '../lib/group.js'
import { coinAyarla } from '../lib/stats.js'
import { lookupName } from '../lib/contacts.js'
import logger from '../lib/logger.js'
import { grupIdCoz, numaraCoz } from './xpver.js'

export default {
  name: 'coinver',
  aliases: ['coinekle'],
  description: 'Bot sahibi: gruptaki kişiye özelden coin verir/alır',
  usage: '.coinver <grup id> <numara ya da @lid id> <adet>',
  category: 'ekonomi',
  // .xpver gibi: .help'te hiç görünmez, kullanımı yalnızca README'de.
  hidden: true,
  ownerOnly: true,
  cooldown: 0,

  async execute({ sock, msg, args, from, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    // Grupta yazılırsa hiçbir iz bırakmadan düşer: kimin coin bastığı görünmesin.
    if (parsed.isGroup) {
      logger.info({ from }, '.coinver grupta yazıldı, yok sayıldı')
      return
    }

    try {
      const [grupArg, numaraArg, adetArg] = args
      const grup = grupIdCoz(String(grupArg || '').replace(/`/g, ''))
      const numara = numaraCoz(numaraArg)
      const adet = /^[+-]?\d+$/.test(adetArg || '') ? Number(adetArg) : NaN

      if (!grup || !numara || !Number.isSafeInteger(adet) || adet === 0) {
        await yaz('Kullanım: `.coinver <grup id> <numara ya da @lid id> <adet>`\nÖrnek: `.coinver 120363012345678901@g.us 905551234567 5`')
        return
      }

      let metadata
      try {
        metadata = await groupMetadata(sock, grup)
      } catch (err) {
        logger.warn({ err, grup }, '.coinver: grup bilgisi alınamadı')
        await yaz('❌ Grup bulunamadı. Id doğru mu, bot o grupta mı?')
        return
      }

      const kimlik = uyeKimligiBul(metadata, numara)
      if (!kimlik) {
        await yaz(`❌ ${numara} bu grupta bulunamadı.\n(WhatsApp bazı gruplarda üyelerin numarasını göstermeyebilir.)`)
        return
      }

      const sonuc = coinAyarla({ chatJid: grup, userJid: kimlik, adet })
      if (!sonuc) {
        await yaz('❌ Veritabanına yazılamadı.')
        return
      }

      const fark = sonuc.bakiye - sonuc.once
      await yaz([
        `✅ *${metadata.subject || grup}*`,
        `👤 ${lookupName(kimlik) || numara}: ${fark >= 0 ? '+' : ''}${fark} coin`,
        `🪙 Coin: ${sonuc.once} → ${sonuc.bakiye}`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err }, '.coinver başarısız')
      await yaz('❌ Bir şeyler ters gitti.')
    }
  },
}
