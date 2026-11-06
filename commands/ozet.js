import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { haftaOzeti } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

const MADALYA = ['🥇', '🥈', '🥉']

export default {
  name: 'özet',
  aliases: ['ozet', 'haftaözeti', 'haftaozeti'],
  description: 'Grubun son 7 gününün özeti',
  usage: '.özet',
  details: ['Mesaj sayıları son 7 günün, gece kuşu ve kumar sonuçları tüm zamanların verisidir.'],
  category: 'istatistik',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const o = haftaOzeti({ chatJid: from })
      if (!o) return await yaz('📰 Özet şu an çıkarılamıyor, sonra dene.')

      const etiketler = []
      const kisi = (jid) => {
        etiketler.push(jid)
        return mentionOf(jid)
      }

      const lines = ['📰 *Haftanın Özeti*', '', `💬 Son 7 günde ${binlik(o.toplamMesaj)} mesaj`]
      o.yazanlar.forEach((y, i) => lines.push(`${MADALYA[i]} ${kisi(y.user_jid)} — ${binlik(y.mesaj)} mesaj`))

      lines.push('')
      if (o.sezonLideri) lines.push(`🏆 Sezon lideri: ${kisi(o.sezonLideri.user_jid)}`)
      if (o.baskan) lines.push(`🏛️ Başkan: ${kisi(o.baskan)}`)
      if (o.hapiste) lines.push(`🚔 Hapiste ${o.hapiste} kişi`)

      lines.push('', '*Tüm zamanlar*')
      if (o.geceKusu) lines.push(`🦉 Gece kuşu: ${kisi(o.geceKusu.user_jid)} (${binlik(o.geceKusu.mesaj)} mesaj)`)
      if (o.kumarKazanan) lines.push(`🎰 Kumarın kralı: ${kisi(o.kumarKazanan.user_jid)} (+${binlik(o.kumarKazanan.net)} XP)`)
      if (o.kumarKaybeden) lines.push(`🪦 Kumarın kurbanı: ${kisi(o.kumarKaybeden.user_jid)} (${binlik(o.kumarKaybeden.net)} XP)`)

      await yaz(lines.join('\n'), [...new Set(etiketler)])
    } catch (err) {
      logger.error({ err, from }, '.özet başarısız')
      await yaz('📰 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.özet hata mesajı gönderilemedi'),
      )
    }
  },
}
