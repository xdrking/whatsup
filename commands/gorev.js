import { binlik } from '../lib/sayi.js'
import { requireGroup } from '../lib/group.js'
import { gorevTopla } from '../lib/stats.js'

export default {
  name: 'görev',
  aliases: ['gorev', 'görevler', 'gorevler', 'quest'],
  description: 'Günlük görevleri gösterir, tamamlananların XP\'sini verir',
  usage: '.görev',
  details: [
    'Her gün 3 görev çıkar; görevler gün gün değişir, gruptaki herkese aynıdır.',
    'Ödül otomatik gelmez: görevi bitirince `.görev` yazarak alırsın.',
    'Gün Türkiye saatiyle 00:00\'da yenilenir, alınmamış ödül yanar.',
  ],
  category: 'istatistik',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const s = gorevTopla({ chatJid: from, userJid: sender })
    if (!s) {
      await sock.sendMessage(from, { text: '📋 Görevler şu an kullanılamıyor.' }, { quoted: msg })
      return
    }

    const lines = [
      '📋 *Günlük Görevler*',
      '',
      ...s.gorevler.map(
        (g) => `${g.tamam ? '✅' : '⬜'} ${g.etiket} (${g.sayac}/${g.hedef}) — ${binlik(g.odul)} XP`,
      ),
    ]
    if (s.kazanilan) lines.push('', `🎁 *+${binlik(s.kazanilan)} XP* aldın!`)

    await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
  },
}
