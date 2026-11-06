import { requireGroup } from '../lib/group.js'
import { kumarEngeli, MIN_BAHIS, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/blackjack.js'

export default {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Krupiyeye karşı 21 — XP\'ne blackjack oyna',
  usage: '.blackjack <miktar|hepsi|yarısı>',
  details: [
    'Botun mesajına `kart` yazarsan kart çekersin, `dur` yazarsan krupiye oynar.',
    '21\'e en yakın kazanır, 21\'i geçen yanar. Krupiye 17\'de durur.',
    'Kazanç 2x, ilk iki kartla 21 (blackjack) 2.5x, beraberlikte bahis geri döner.',
    `Süre 3 dk; dolarsa el \`dur\` sayılır. En az ${MIN_BAHIS} XP. Grupta aynı anda tek oyun.`,
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    if (getGame(from)) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp, kumarYasagi(from, sender))
    if (engel) return yaz(`🃏 ${engel}`)

    const cozum = miktarCoz(args[0], xp)
    if (cozum.hata) return yaz(`🃏 ${cozum.hata}`)

    await start({ sock, msg, from, sender, miktar: cozum.miktar })
  },
}
