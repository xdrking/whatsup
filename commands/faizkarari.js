import { ASGARI_FAIZ, AZAMI_FAIZ, faizOranCoz, gunlukFaiz, oranYaz } from '../lib/banka.js'
import { requireGroup } from '../lib/group.js'
import { baskanMi, faizDurumu, faizKarari } from '../lib/stats.js'
import logger from '../lib/logger.js'

export default {
  name: 'faizkararı',
  aliases: ['faizkarari'],
  description: 'Başkan: grubun banka ve kredi faizini belirler',
  usage: '.faizkararı <oran>',
  details: [
    `Saatlik banka faizi ${ASGARI_FAIZ} ile ${AZAMI_FAIZ} arasında olabilir, ondalık da yazılır: \`.faizkararı 0,25\`. Eksi faiz bankadaki parayı eritir. Kredi faizi 4 puan üstünde kalır, eksiye inmez.`,
    'Faiz saatlik ve bileşiktir, küçük oran bile günde büyür:',
    [0.1, 0.25, 0.5, 1, 5, 15].map((o) => `%${oranYaz(o)} → günde %${oranYaz(gunlukFaiz(o))}`).join('  •  '),
    'Birikmiş faiz eski orandan işlenir, yeni oran bundan sonraki saatlere uygulanır.',
    'Başkan günde bir karar verir (`.seçim`), bot sahibi sınırsızdır.',
  ],
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed, isOwner }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      if (!args[0]) {
        const f = faizDurumu(from)
        return await yaz(`🏦 Banka: %${oranYaz(f.banka)} (günde %${oranYaz(gunlukFaiz(f.banka))})  •  Kredi: %${oranYaz(f.kredi)}\nDeğiştirmek için \`.faizkararı <oran>\``)
      }

      const oran = faizOranCoz(args[0])
      if (oran === null) {
        return await yaz(`🏦 Oran ${ASGARI_FAIZ} ile ${AZAMI_FAIZ} arasında olmalı, en çok 2 ondalık basamak. Örnek: \`.faizkararı 0,25\`, \`.faizkararı -0,5\``)
      }

      if (!isOwner && !baskanMi(from, sender)) return await yaz('🏛️ Faiz kararını yalnızca başkan verir.')

      const s = faizKarari({ chatJid: from, oran, baskan: !isOwner })
      if (!s) return await yaz('🏦 Kurul toplanamadı, sonra dene.')
      if (s.bugunVar) return await yaz('🏛️ Bugünkü faiz kararını verdin, yarın tekrar.')

      await yaz([
        '🏛️ *MERKEZ BANKASI FAİZ KARARI*',
        '',
        `🏦 Banka faizi: %${oranYaz(s.once)} → *%${oranYaz(s.banka)}* saatlik (günde %${oranYaz(gunlukFaiz(s.banka))})`,
        `💳 Kredi faizi: *%${oranYaz(s.kredi)}* saatlik`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.faizkararı başarısız')
      await yaz('🏦 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.faizkararı hata mesajı gönderilemedi'),
      )
    }
  },
}
