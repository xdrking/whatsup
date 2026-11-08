import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import { HAK, HARF, wordleOyna } from '../games/wordle.js'

export default {
  name: 'wordle',
  aliases: ['gününkelimesi', 'gununkelimesi', 'kelimebul'],
  description: 'Günün 5 harfli kelimesini grupça bul, ilk bilen kazanır',
  usage: '.wordle <kelime>',
  details: [
    '🟩 *Nasıl oynanır*',
    `1. Her gün herkes için aynı ${HARF} harfli Türkçe kelime var. Grupta tek ortak tahta vardır.`,
    '2. `.wordle kelime` ile tahmin yaz, bot tahtaya renkli satırı ekler:',
    '   🟩 harf doğru yerde  •  🟨 kelimede var, yeri yanlış  •  ⬛ kelimede yok',
    '3. Herkes aynı tahtaya yazar, birbirinin satırından ipucu alır. Kelimeyi ilk bilen ödülü alır ve kelime o gün kapanır.',
    `Kişi başı günde ${HAK} hak. Sözlükte olmayan kelime hak yakmaz.`,
    'Grup ne kadar az tahminde bulursa ödül o kadar büyük.',
    '`.wordle` tek başına tahtayı ve kalan hakkını gösterir.',
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
