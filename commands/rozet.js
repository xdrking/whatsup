import { ROZETLER } from '../lib/rozet.js'
import { getBusiestHour, getDailyStreak, getStats, seviye } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')

export default {
  name: 'rozet',
  aliases: ['rozetler', 'başarım', 'basarim'],
  description: 'Kazanılan rozetleri ve sıradakileri gösterir',
  usage: '.rozet  —  .rozet @kişi',
  details: [
    'Rozetler mesaj, sticker, ses sayılarından, seviyeden, `.günlük` serisinden ve en aktif saatten hesaplanır.',
    'Kazanılmamış rozetlerin yanında ne kadar kaldığı yazar.',
    'Başkasının rozetleri için etiketle ya da mesajını yanıtla.',
  ],
  category: 'istatistik',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })

    const s = getStats(from, jid)
    const veri = {
      ...s,
      level: seviye(s.xp),
      seri: getDailyStreak(from, jid),
      saat: getBusiestHour(from, jid)?.hour ?? null,
    }

    const kazanilan = ROZETLER.filter((r) => r.deger(veri) >= r.hedef)
    const kalan = ROZETLER.filter((r) => r.deger(veri) < r.hedef)

    const ad = jid === parsed.sender && parsed.pushName ? parsed.pushName : displayName(jid)
    const ilerleme = (r) =>
      r.hedef > 1 ? ` (${sayi.format(r.deger(veri))}/${sayi.format(r.hedef)})` : ''

    const lines = [
      `🏆 *${ad}*  ${mentionOf(jid)} — ${kazanilan.length}/${ROZETLER.length} rozet`,
      '',
      ...(kazanilan.length ? kazanilan.map((r) => `${r.ad} — ${r.aciklama}`) : ['Henüz rozet yok, yazmaya devam!']),
    ]

    if (kalan.length) {
      lines.push('', '🔒 *Sıradakiler*', ...kalan.map((r) => `${r.ad} — ${r.aciklama}${ilerleme(r)}`))
    }

    await sock.sendMessage(from, { text: lines.join('\n'), mentions: [jid] }, { quoted: msg })
  },
}
