import { requireGroup } from '../lib/group.js'
import { kumarEngeli, MIN_BAHIS, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { HILO_TAVAN, start } from '../games/hilo.js'

export default {
  name: 'hilo',
  aliases: ['hi-lo', 'yüksekdüşük', 'yuksekdusuk'],
  description: 'Sıradaki kart yüksek mi düşük mü — bildikçe çarpan büyür',
  usage: '.hilo <miktar|hepsi|yarısı>',
  details: [
    'Bir kart açılır. Botun mesajına `yüksek` (aynı ya da büyük) ya da `düşük` (aynı ya da küçük) yazarsın.',
    'Bildikçe çarpan katlanır, şansı az olan tahmin daha çok kazandırır. Bilemezsen bahis yanar.',
    `\`geç\` kartı çarpana dokunmadan değiştirir, \`çek\` kazancı alır. ${HILO_TAVAN}x'te kendiliğinden çekilir.`,
    `Süre 3 dk; dolarsa kazanç otomatik çekilir. En az ${MIN_BAHIS} XP. Grupta aynı anda tek oyun.`,
  ],
  category: 'kumar',
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
