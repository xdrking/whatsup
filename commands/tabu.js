import { requireGroup } from '../lib/group.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/tabu.js'

export default {
  name: 'tabu',
  aliases: [],
  description: 'Yasaklı sözcükleri kullanmadan kelime anlat',
  usage: '.tabu',
  details: [
    '1. `.tabu` yazan anlatıcı olur. Bot kelimeyi ve 5 yasaklı sözcüğü ona özelden yollar.',
    '2. Anlatan ipuçlarını, diğerleri tahminlerini gruptaki tabu mesajına *yanıt olarak* yazar.',
    '3. Anlatan yasaklı sözcüğü ya da kelimenin kendisini (ekli hali dahil) yazarsa oyun biter.',
    '4. Anlatan aynı mesaja `pas` yazarak kartı 2 kez değiştirebilir.',
    '5. İlk bilen ve anlatan XP alır. Süre 3 dakika.',
  ],
  category: 'oyun',
  cooldown: 300,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    if (getGame(from)) {
      await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
      return
    }

    await start({ sock, msg, from, sender, senderPn: parsed.senderPn })
  },
}
