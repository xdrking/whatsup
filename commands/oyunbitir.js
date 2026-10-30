import logger from '../lib/logger.js'
import { requireGroup, senderIsAdmin } from '../lib/group.js'
import { endGame, getGame } from '../games/gameManager.js'

export default {
  name: 'oyunbitir',
  aliases: ['oyundur', 'oyuniptal'],
  description: 'Gruptaki aktif oyunu durdurur',
  usage: '.oyunbitir',
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed, isOwner }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const state = getGame(from)
    if (!state) {
      await sock.sendMessage(from, { text: 'Bu grupta aktif oyun yok.' }, { quoted: msg })
      return
    }

    // Başkasının oyununu rastgele biri kapatamasın. Başlatan kişi ve bot sahibi
    // için grup bilgisi hiç sorulmaz; yalnızca diğerleri için admin mi diye bakılır.
    if (state.starterJid !== sender && !isOwner && !(await senderIsAdmin(sock, from, sender))) {
      await sock.sendMessage(
        from,
        { text: 'Bu oyunu yalnızca başlatan kişi ya da bir grup admini durdurabilir.' },
        { quoted: msg },
      )
      return
    }

    // Admin kontrolü bir await noktası: bu arada oyun bitmiş ya da yenisi
    // başlamış olabilir. Başkasının yeni oyunu kapatılmasın.
    if (getGame(from) !== state) {
      logger.info({ from }, 'Oyun admin kontrolü sırasında değişti, .oyunbitir atlandı')
      return
    }

    const ozet = state.summarize?.(state) || { text: 'Oyun durduruldu.' }
    endGame(from)

    await sock.sendMessage(from, ozet, { quoted: msg })
  },
}
