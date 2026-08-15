import { requireGroup } from '../lib/group.js'
import { getLeaderboard, seviye } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')
const MADALYA = ['🥇', '🥈', '🥉']
const VARSAYILAN_LIMIT = 10
const MAX_LIMIT = 25

export default {
  name: 'top',
  aliases: ['sıralama', 'siralama', 'liderlik'],
  description: 'Gruptaki en yüksek XP\'ye sahip kullanıcıları sıralar',
  usage: '.top  —  .top 5',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const istenen = Number.parseInt(args[0], 10)
    const limit = Number.isInteger(istenen) && istenen > 0
      ? Math.min(istenen, MAX_LIMIT)
      : VARSAYILAN_LIMIT

    const sira = getLeaderboard(from, limit)

    if (!sira.length) {
      await sock.sendMessage(
        from,
        { text: 'Henüz XP kaydı yok. Biraz sohbet edin, tablo dolmaya başlar.' },
        { quoted: msg },
      )
      return
    }

    const lines = sira.map((row, index) => {
      const isaret = MADALYA[index] || `${index + 1}.`
      return `${isaret} ${mentionOf(row.user_jid)} — ${sayi.format(row.xp)} XP ` +
        `(Sv ${seviye(row.xp)})`
    })

    await sock.sendMessage(
      from,
      {
        text: [`🏆 *XP Sıralaması* (ilk ${sira.length})`, '', ...lines].join('\n'),
        mentions: sira.map((row) => row.user_jid),
      },
      { quoted: msg },
    )
  },
}
