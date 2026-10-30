import { getBusiestHour, getDailyStreak, getStats, seviye } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'

// Rozetler yalnızca mevcut sayaçlardan hesaplanır; ayrıca saklanmaz. Yeni rozet
// = bu listeye bir satır. `deger` kişinin verisinden ilerlemeyi, `hedef` eşiği verir.
const ROZETLER = [
  { ad: '✍️ Çaylak Yazar', aciklama: '100 mesaj', deger: (v) => v.messages, hedef: 100 },
  { ad: '💬 Geveze', aciklama: '1.000 mesaj', deger: (v) => v.messages, hedef: 1000 },
  { ad: '⌨️ Klavye Delikanlısı', aciklama: '10.000 mesaj', deger: (v) => v.messages, hedef: 10000 },
  { ad: '😂 Sticker Avcısı', aciklama: '100 sticker', deger: (v) => v.stickers, hedef: 100 },
  { ad: '🖼️ Sticker Ustası', aciklama: '1.000 sticker', deger: (v) => v.stickers, hedef: 1000 },
  { ad: '🎤 Podcast\'çi', aciklama: '100 sesli mesaj', deger: (v) => v.voices, hedef: 100 },
  { ad: '⭐ Yükselen Yıldız', aciklama: 'Seviye 5', deger: (v) => v.level, hedef: 5 },
  { ad: '🏅 Kıdemli', aciklama: 'Seviye 10', deger: (v) => v.level, hedef: 10 },
  { ad: '👑 Efsane', aciklama: 'Seviye 20', deger: (v) => v.level, hedef: 20 },
  { ad: '🔥 Sadık', aciklama: '7 günlük `.günlük` serisi', deger: (v) => v.seri, hedef: 7 },
  { ad: '💎 Bağımlı', aciklama: '30 günlük `.günlük` serisi', deger: (v) => v.seri, hedef: 30 },
  // Saat rozetleri eşik değil durumdur: en aktif saat bu aralıktaysa kazanılır.
  { ad: '🦉 Gece Kuşu', aciklama: 'En aktif saat 00-04', deger: (v) => (v.saat !== null && v.saat <= 4 ? 1 : 0), hedef: 1 },
  { ad: '🐓 Erkenci', aciklama: 'En aktif saat 05-08', deger: (v) => (v.saat >= 5 && v.saat <= 8 ? 1 : 0), hedef: 1 },
]

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
