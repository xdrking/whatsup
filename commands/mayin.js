import { requireGroup } from '../lib/group.js'
import { kumarEngeli, MIN_BAHIS, miktarCoz } from '../lib/kumar.js'
import { getStats } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { KUTU, MAYIN, mayinCarpani, start } from '../games/mayin.js'

export default {
  name: 'mayın',
  aliases: ['mayin', 'mines', 'mayıntarlası'],
  description: 'Kutu aç, çarpan büyüsün; mayına basarsan bahis yanar',
  usage: '.mayın <miktar|hepsi|yarısı>',
  details: [
    `${KUTU} kutuda ${MAYIN} mayın var. Botun mesajına kutu numarası yazarak kutu açarsın.`,
    `Her güvenli kutu çarpanı artırır: ${mayinCarpani(1)}x, ${mayinCarpani(2)}x, ${mayinCarpani(3)}x…`,
    '`çek` yazınca kazancı alırsın. Mayına basarsan bahsin tamamı gider.',
    `Süre 3 dk; dolarsa kazanç otomatik çekilir. En az ${MIN_BAHIS} XP. Grupta aynı anda tek oyun.`,
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    if (getGame(from)) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp)
    if (engel) return yaz(`💣 ${engel}`)

    const cozum = miktarCoz(args[0], xp)
    if (cozum.hata) return yaz(`💣 ${cozum.hata}`)

    await start({ sock, msg, from, sender, miktar: cozum.miktar })
  },
}
