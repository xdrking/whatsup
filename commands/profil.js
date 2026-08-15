import { getStats, seviyeIlerlemesi } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')

function cubuk(kazanilan, gereken) {
  const oran = gereken > 0 ? kazanilan / gereken : 0
  const dolu = Math.max(0, Math.min(10, Math.round(oran * 10)))
  return '█'.repeat(dolu) + '░'.repeat(10 - dolu)
}

export default {
  name: 'profil',
  aliases: ['profile', 'level', 'seviye'],
  description: 'Kullanıcının seviye ve XP profilini gösterir',
  usage: '.profil  —  .profil @kişi  —  bir mesajı yanıtlayarak .profil',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })

    const veri = getStats(from, jid)
    const { level, kazanilan, gereken, sonraki } = seviyeIlerlemesi(veri.xp)

    // Hedef komutu yazan kişiyse pushName en taze addır; başkasıysa bilinen ad.
    const ad = jid === parsed.sender && parsed.pushName ? parsed.pushName : displayName(jid)

    const lines = [
      `👤 *${ad}*  ${mentionOf(jid)}`,
      `🏅 Seviye ${level}  •  ${sayi.format(veri.xp)} XP`,
      `${cubuk(kazanilan, gereken)}  ${sayi.format(kazanilan)}/${sayi.format(gereken)}`,
      `⬆️ Sonraki seviye: ${sayi.format(Math.max(0, sonraki - veri.xp))} XP kaldı`,
      '',
      `💬 ${sayi.format(veri.messages)} mesaj  •  😂 ${sayi.format(veri.stickers)} sticker` +
        `  •  🎤 ${sayi.format(veri.voices)} ses`,
    ]

    await sock.sendMessage(
      from,
      { text: lines.join('\n'), mentions: [jid] },
      { quoted: msg },
    )
  },
}
