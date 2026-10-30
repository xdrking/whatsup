import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/kimim.js'

export default {
  name: 'kimim',
  aliases: ['kimimben', 'tahmin'],
  description: 'Karakter tahmin oyunu başlatır',
  usage: '.kimim',
  details: [
    'Bot bir ünlü seçer ve ipucu verir; tahminini botun *son* oyun mesajını yanıtlayarak yaz.',
    'Her 3 yanlış tahminde yeni ipucu açılır.',
    'Tam ad, soyad ya da ad + soyad kabul edilir; Türkçe karakter kullanmak şart değil.',
    'Doğru bilen +10 XP alır. 1 saat içinde bilen çıkmazsa cevap söylenir.',
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
