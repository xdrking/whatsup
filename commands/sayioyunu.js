import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/sayioyunu.js'

export default {
  name: 'sayıoyunu',
  aliases: ['sayioyunu', 'işlem', 'islem'],
  description: 'Verilen sayılarla hedefe ulaş',
  usage: '.sayıoyunu',
  details: [
    'Bot 5 sayı ve bir hedef verir; işlemi botun son mesajına yanıt olarak yaz.',
    'Örnek: `(25 + 5) * 3`. Her sayı bir kez kullanılır, hepsi şart değil. + - * / ve parantez geçerli.',
    'İlk bulan +10 XP alır. Süre 5 dk.',
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
