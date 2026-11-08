import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarEngeli, MIN_BAHIS, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { KAT, kuleCarpani, start, ZORLUK, zorlukCoz } from '../games/kule.js'

export default {
  name: 'kule',
  aliases: ['ejderha', 'dragon', 'dragontower', 'dragontier'],
  description: 'Ejderha kulesine tırman, her katta yumurtayı bul',
  usage: '.kule <miktar|hepsi|yarısı> [kolay|orta|zor]',
  details: [
    `Kule ${KAT} kattır. Her katta botun mesajına kutu numarası yazarsın: yumurtaysa bir kat çıkarsın, ejderhaysa bahis yanar.`,
    ...Object.entries(ZORLUK).map(
      ([ad, z]) => `${ad}: ${z.kutu} kutuda ${z.yumurta} yumurta, tepe ${kuleCarpani(ad, KAT)}x`,
    ),
    `\`çek\` kazancı alır. Örnek: \`.kule 1000 zor\`, zorluk yazılmazsa orta.`,
    `Süre 3 dk; dolarsa kazanç otomatik çekilir. En az ${MIN_BAHIS} XP. Grupta aynı anda tek oyun.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    if (getGame(from)) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

    const { miktar, secim } = argumanlariAyir(args)
    const zorluk = zorlukCoz(secim)
    if (!zorluk) return yaz('🐉 Zorluk `kolay`, `orta` ya da `zor` olmalı.')

    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp, kumarYasagi(from, sender))
    if (engel) return yaz(`🐉 ${engel}`)

    const cozum = miktarCoz(miktar, xp)
    if (cozum.hata) return yaz(`🐉 ${cozum.hata}`)

    await start({ sock, msg, from, sender, miktar: cozum.miktar, zorluk })
  },
}
