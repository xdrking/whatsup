import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/karisik.js'

export default {
  name: 'karışık',
  aliases: ['karisik', 'anagram'],
  description: 'Harfleri karışmış kelimeyi bul',
  usage: '.karışık',
  details: [
    'Doğru kelimeyi botun son mesajına yanıt olarak yaz.',
    'Her 3 yanlışta baştan bir harf açılır. İlk bilen +50 XP alır. Süre 5 dk.',
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
