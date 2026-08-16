import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/kelime.js'

export default {
  name: 'kelime',
  aliases: ['kelimeoyunu', 'zincir'],
  description: 'Türkçe kelime zinciri oyunu başlatır',
  usage: '.kelime',
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    if (getGame(from)) {
      await sock.sendMessage(
        from,
        { text: '⚠️ Bu grupta zaten aktif bir oyun var.' },
        { quoted: msg },
      )
      return
    }

    await start({ sock, msg, from, sender })
  },
}
