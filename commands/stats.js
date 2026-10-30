import { formatAgo } from '../lib/activity.js'
import { getBusiestHour, getStats, seviye } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')

function ikiHane(value) {
  return String(value).padStart(2, '0')
}

function saatAraligi(hour) {
  return `${ikiHane(hour)}:00–${ikiHane((hour + 1) % 24)}:00`
}

export default {
  name: 'stats',
  aliases: ['istatistik', 'ist'],
  description: 'Kullanıcının mesaj/sticker/ses istatistiklerini gösterir',
  usage: '.stats  —  .stats @kişi  —  bir mesajı yanıtlayarak .stats',
  details: [
    'Kendin için `.stats`; başkası için etiketle ya da mesajını yanıtla.',
    'Mesaj, sticker, ses sayıları ve en aktif olduğun saat. Sayaçlar her grupta ayrıdır.',
  ],
  category: 'istatistik',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })

    const veri = getStats(from, jid)
    const enAktif = getBusiestHour(from, jid)

    const toplam = veri.messages + veri.stickers + veri.voices
    if (!toplam) {
      await sock.sendMessage(
        from,
        {
          text: `${mentionOf(jid)} için henüz kayıt yok. İstatistikler bot bu sohbette ` +
            'çalışmaya başladıktan sonraki mesajlardan toplanır.',
          mentions: [jid],
        },
        { quoted: msg },
      )
      return
    }

    const lines = [
      `👤 ${mentionOf(jid)}`,
      `💬 ${sayi.format(veri.messages)} mesaj`,
      `😂 ${sayi.format(veri.stickers)} sticker`,
      `🎤 ${sayi.format(veri.voices)} ses`,
      `🕐 En aktif saat: ${enAktif ? saatAraligi(enAktif.hour) : 'bilinmiyor'}`,
      `🏆 XP: ${sayi.format(veri.xp)}  (Seviye ${seviye(veri.xp)})`,
    ]

    if (veri.last_seen) lines.push(`🕒 Son mesaj: ${formatAgo(veri.last_seen)}`)

    await sock.sendMessage(
      from,
      { text: lines.join('\n'), mentions: [jid] },
      { quoted: msg },
    )
  },
}
