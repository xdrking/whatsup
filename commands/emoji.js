import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/emoji.js'

export default {
  name: 'emoji',
  aliases: ['emojibulmaca'],
  description: 'Emojilerden film, dizi ya da şarkı tahmini',
  usage: '.emoji',
  details: [
    'Bot birkaç emoji ve türünü (film/dizi/şarkı) yazar; tahminini botun *son* oyun mesajını yanıtlayarak yaz.',
    'Her 3 yanlışta ipucu açılır: önce harf kalıbı, sonra baş harfler.',
    'Adın tamamı yazılmalı; Türkçe karakter şart değil, bilinen İngilizce adlar da kabul edilir.',
    'İlk bilen kurla artan XP alır. Süre 10 dk.',
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
