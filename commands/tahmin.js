import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/tahmin.js'

export default {
  name: 'tahmin',
  aliases: ['sayıtahmin', 'sayitahmin'],
  description: 'Botun tuttuğu 1-100 arası sayıyı bul',
  usage: '.tahmin',
  details: [
    'Tahminini botun son mesajına yanıt olarak yaz, bot yukarı ya da aşağı der.',
    'İlk bilen kurla artan XP alır. 10 dk tahmin gelmezse oyun kapanır.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    if (getGame(from)) {
      await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
      return
    }

    await start({ sock, msg, from, sender })
  },
}
