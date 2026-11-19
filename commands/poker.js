import { getGame } from '../games/gameManager.js'
import { kartHatirlat, start } from '../games/poker.js'
import { requireGroup } from '../lib/group.js'
import logger from '../lib/logger.js'
import { KOR_ARTIS_EL, KOR_ORANI, MAX_OYUNCU, MIN_GIRIS, MIN_OYUNCU } from '../lib/poker.js'
import { binlik } from '../lib/sayi.js'

export default {
  name: 'poker',
  aliases: ['holdem', 'texas'],
  description: 'Texas Hold\'em poker masası, oyuncular arası XP',
  usage: '.poker <giriş>',
  details: [
    `1. \`.poker 10000\` masayı kurar, giriş cüzdanından çekilir. Bot mesajına \`katıl\` yazan aynı girişle oturur (${MIN_OYUNCU}-${MAX_OYUNCU} kişi), kuran \`başla\` yazar.`,
    '2. Kartların her elde özelden gelir. Gelmediyse bota özelden `.poker` yaz.',
    '3. Sıra sendeyken son masa mesajına yanıt ver: `pas`, `gör`, `artır 500`, `hepsi`, `çekil`. Süre 90 sn, dolarsa pas ya da çekil sayılır.',
    `4. Körler girişin ${KOR_ORANI}'de biri kadardır, her ${KOR_ARTIS_EL} elde ikiye katlanır. Çipi biten masadan kalkar.`,
    '5. İstediğin an masa mesajına `kalk` yaz, el bitince önündeki çip cüzdanına döner. Tek kişi kalınca masa kapanır.',
    `Para oyuncular arasındadır, kasa ve hazine yoktur. En az ${binlik(MIN_GIRIS)} XP giriş, kumar kuralları (500 XP, yasaklar) geçerlidir.`,
  ],
  category: 'kumar',
  cooldown: 10,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!parsed.isGroup) return await kartHatirlat({ sock, msg, parsed })
      if (!(await requireGroup({ sock, msg, from, parsed }))) return
      if (getGame(from)) return await yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

      const giris = Number.parseInt(args[0], 10)
      if (!Number.isInteger(giris) || String(giris) !== args[0]) {
        return await yaz(`🃏 Kullanım: \`.poker <giriş>\` (en az ${binlik(MIN_GIRIS)} XP). Ayrıntı: \`.help poker\``)
      }
      if (giris < MIN_GIRIS) return await yaz(`🃏 Giriş en az ${binlik(MIN_GIRIS)} XP olmalı.`)

      await start({ sock, msg, from, sender, senderPn: parsed.senderPn, giris })
    } catch (err) {
      logger.error({ err, from }, '.poker başarısız')
      await yaz('🃏 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.poker hata mesajı gönderilemedi'))
    }
  },
}
