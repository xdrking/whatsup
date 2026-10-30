import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/quiz.js'

export default {
  name: 'quiz',
  aliases: ['bilmece', 'bilgi', 'yarışma', 'yarisma'],
  description: '4 şıklı bilgi sorusu — ilk bilen XP kazanır',
  usage: '.quiz',
  details: [
    'Bot 4 şıklı bir bilgi sorusu sorar.',
    'Cevabı soru mesajını yanıtlayarak yaz: harf (`b`), numara (`2`) ya da şıkkın kendisi.',
    'Herkesin tek hakkı var; ilk doğru cevap +5 XP alır.',
    '10 dakika içinde bilen çıkmazsa oyun kapanır ve cevap söylenir.',
  ],
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
