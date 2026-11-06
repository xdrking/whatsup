import { requireGroup } from '../lib/group.js'
import { SEZON_ODULLERI, haftaBitisi } from '../lib/sezon.js'
import { sezonDurumu } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')
const MADALYA = ['🥇', '🥈', '🥉']

export default {
  name: 'sezon',
  aliases: ['season', 'hafta'],
  description: 'Bu haftanın en çok XP kazananları',
  usage: '.sezon',
  details: [
    'Her pazartesi sıfırlanır. Yalnızca mesaj, oyun, `.günlük` ve `.görev` XP\'si sayılır; kumar ve soygun sayılmaz.',
    `İlk üç ${SEZON_ODULLERI.map((o) => sayi.format(o)).join(' / ')} XP alır, birincinin şampiyonluğu \`.profil\`'de görünür.`,
    'Ödüller yeni haftada `.sezon` ilk yazıldığında dağıtılır.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const s = sezonDurumu({ chatJid: from })
      if (!s) return await yaz('🏆 Sezon şu an okunamıyor, sonra dene.')

      const gun = Math.ceil((haftaBitisi(s.hafta) - Date.now()) / 86_400_000)
      const lines = []
      const etiketler = []

      for (const { kazananlar, cete } of s.kapanan) {
        lines.push('🎉 *Sezon bitti!*')
        kazananlar.forEach((k, i) => {
          lines.push(`${MADALYA[i]} ${mentionOf(k.user_jid)} +${sayi.format(k.odul)} XP`)
          etiketler.push(k.user_jid)
        })
        if (cete) lines.push(`🏴 Haftanın çetesi: *${cete.ad}*, kasaya +${sayi.format(cete.odul)} XP`)
        lines.push('')
      }

      lines.push(`🏆 *Bu hafta*  •  ${gun} gün kaldı`, '')
      if (s.siralama.length) {
        s.siralama.forEach((k, i) => {
          lines.push(`${MADALYA[i] ?? `${i + 1}.`} ${mentionOf(k.user_jid)} — ${sayi.format(k.puan)} XP`)
          etiketler.push(k.user_jid)
        })
      } else {
        lines.push('Henüz kimse XP kazanmadı.')
      }

      if (s.sonSampiyon) {
        lines.push('', `👑 Son şampiyon: ${mentionOf(s.sonSampiyon.user_jid)} (${s.sonSampiyon.kez} kez)`)
        etiketler.push(s.sonSampiyon.user_jid)
      }

      await yaz(lines.join('\n'), [...new Set(etiketler)])
    } catch (err) {
      logger.error({ err, from }, '.sezon başarısız')
      await yaz('🏆 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.sezon hata mesajı gönderilemedi'),
      )
    }
  },
}
