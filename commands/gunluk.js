import { claimDaily, getStats, gunlukOdul, seviye } from '../lib/stats.js'

export default {
  name: 'günlük',
  aliases: ['gunluk', 'daily', 'ödül', 'odul'],
  description: 'Günde bir kez XP ödülü — her gün üst üste alırsan büyür',
  usage: '.günlük',
  ownerOnly: false,

  async execute({ sock, msg, from, sender }) {
    const once = getStats(from, sender).xp
    const sonuc = claimDaily({ chatJid: from, userJid: sender })

    if (!sonuc) {
      await sock.sendMessage(from, { text: '🎁 Günlük ödül şu an kullanılamıyor.' }, { quoted: msg })
      return
    }

    if (!sonuc.alindi) {
      await sock.sendMessage(
        from,
        {
          text: [
            '🎁 Bugünkü ödülünü zaten aldın.',
            `🔥 Seri: ${sonuc.seri} gün  •  Yarın: +${gunlukOdul(sonuc.seri + 1)} XP`,
          ].join('\n'),
        },
        { quoted: msg },
      )
      return
    }

    const lines = [
      `🎁 *+${sonuc.miktar} XP*`,
      `🔥 Seri: ${sonuc.seri} gün`,
    ]

    const yeniSeviye = seviye(once + sonuc.miktar)
    if (yeniSeviye > seviye(once)) lines.push(`🆙 Seviye ${yeniSeviye} oldun!`)

    lines.push('', 'Yarın da gel, seri bozulmasın.')

    await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
  },
}
