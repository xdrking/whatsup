import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/adamasmaca.js'

export default {
  name: 'adamasmaca',
  aliases: ['adam', 'asmaca'],
  description: 'Grupça harf tahminli adam asmaca',
  usage: '.adamasmaca',
  details: [
    'Bot gizli bir kelime seçer; botun *son* oyun mesajını yanıtlayarak bir harf (ör. `a`) ya da kelimenin tamamını yaz.',
    'Yanlış harf ve yanlış kelime tahmini aynı cezayı alır; 6 yanlışta adam asılır.',
    'Kelimeyi tamamlayan +50 XP alır. 10 dk tahmin gelmezse oyun kapanır.',
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
