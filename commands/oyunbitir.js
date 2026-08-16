import { requireGroup } from '../lib/group.js'
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

    // Başkasının oyununu rastgele biri kapatamasın; bot sahibi her zaman kapatabilir.
    if (state.starterJid !== sender && !isOwner) {
      await sock.sendMessage(
        from,
        { text: 'Bu oyunu yalnızca başlatan kişi durdurabilir.' },
        { quoted: msg },
      )
      return
    }

    const ozet = state.summarize?.(state) || { text: 'Oyun durduruldu.' }
    endGame(from)

    await sock.sendMessage(from, ozet, { quoted: msg })
  },
}
