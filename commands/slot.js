import { requireGroup } from '../lib/group.js'
import { IKILI_CARPAN, kumarOyna, MIN_BAHIS, SEMBOLLER, slotCevir } from '../lib/kumar.js'

export default {
  name: 'slot',
  aliases: ['slots', 'kumar', 'makine'],
  description: 'XP\'ne slot makinesi çevir',
  usage: '.slot <miktar|hepsi|yarısı>',
  details: [
    'Üç makara döner. Üçü aynı gelirse büyük ödül, ikisi aynıysa bahsin ' +
      `${IKILI_CARPAN} katı geri döner.`,
    'Üçlü ödüller: ' + SEMBOLLER.map((x) => `${x.s} ${x.uclu}x`).join('  '),
    `\`hepsi\` bütün XP'ni, \`yarısı\` yarısını basar. En az ${MIN_BAHIS} XP.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    await kumarOyna({
      oyun: 'slot',
      sock, msg, from, sender,
      miktarArg: args[0],
      cevir: () => slotCevir(),
      anlat: (s) => {
        const satir = [`🎰 [ ${s.makaralar.join(' | ')} ]`]
        if (s.carpan >= 25) satir.push('💥 *JACKPOT!*')
        else if (s.carpan > IKILI_CARPAN) satir.push(`🔥 Üçlü! *${s.carpan}x*`)
        else if (s.carpan) satir.push(`İkili: *${s.carpan}x*`)
        return satir
      },
    })
  },
}
