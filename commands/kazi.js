import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, KAZI_ODULLERI, kaziCevir, kumarOyna, MIN_BAHIS } from '../lib/kumar.js'

export default {
  name: 'kazı',
  aliases: ['kazi', 'kazıkazan', 'kazikazan'],
  description: 'Kazı kazan kartı — 3 aynı sembol kazandırır',
  usage: '.kazı <miktar|hepsi|yarısı>',
  details: [
    '9 kutulu kart açılır, 3 aynı sembol çıkarsa ödül senindir.',
    'Ödüller: ' + KAZI_ODULLERI.map((o) => `${o.s} ${o.carpan}x`).join('  '),
    `\`hepsi\` bütün XP'ni, \`yarısı\` yarısını basar. En az ${MIN_BAHIS} XP.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    await kumarOyna({
      oyun: 'kazı',
      sock, msg, from, sender,
      miktarArg: argumanlariAyir(args).miktar,
      cevir: () => kaziCevir(),
      anlat: (s) => {
        const k = s.kutular
        const satir = ['🎟️ *KAZI KAZAN*', '', k.slice(0, 3).join(' '), k.slice(3, 6).join(' '), k.slice(6).join(' ')]
        if (s.sembol) satir.push('', `Üç ${s.sembol}: *${s.carpan}x*`)
        return satir
      },
    })
  },
}
