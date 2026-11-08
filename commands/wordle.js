import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import { HAK, HARF, wordleOyna } from '../games/wordle.js'

export default {
  name: 'wordle',
  aliases: ['gününkelimesi', 'gununkelimesi', 'kelimebul'],
  description: 'Günün 5 harfli kelimesini 6 denemede bul',
  usage: '.wordle <kelime>',
  details: [
    `Her gün herkes için aynı ${HARF} harfli kelime. Kişi başı ${HAK} hak.`,
    '🟩 harf doğru yerde, 🟨 kelimede var ama yeri yanlış, ⬛ kelimede yok.',
    'Sözlükte olmayan kelime hak yakmaz. Erken bilen daha çok XP alır.',
    '`.wordle` tek başına tahtanı ve kalan hakkını gösterir. Tahminler grupta göründüğü için başkasının tahtası ipucudur.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    try {
      const cevap = await wordleOyna({ from, sender, tahmin: args.length > 1 ? args.join(' ') : args[0] })
      await sock.sendMessage(from, cevap, { quoted: msg })
    } catch (err) {
      logger.error({ err, from }, '.wordle başarısız')
      await sock.sendMessage(from, { text: '🟩 Wordle şu an açılamadı.' }, { quoted: msg })
    }
  },
}
