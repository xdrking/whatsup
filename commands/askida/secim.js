// Askıda: commands/index.js alt klasöre inmediği için yüklenmez. Açmak için bir üst klasöre taşınır,
// `.faizkararı`na başkan yetkisi geri eklenir (bkz. CLAUDE.md, Faz 39).
import { requireGroupMetadata, uyeKimligiBul } from '../../lib/group.js'
import { OY_UCRETI } from '../../lib/secim.js'
import { binlik } from '../../lib/sayi.js'
import { haftaBitisi } from '../../lib/sezon.js'
import { adayOl, botHesabiMi, oyVer, secimDurumu } from '../../lib/stats.js'
import { mentionOf, resolveTargets } from '../../lib/target.js'
import { trLower } from '../../lib/turkishWords.js'
import logger from '../../lib/logger.js'

const KAPALI = '🗳️ Sandıklar şu an kapalı, sonra dene.'

async function oyKullan({ yaz, from, sender, parsed, metadata }) {
  const [hedef] = resolveTargets(parsed)
  if (!hedef) return yaz('Kullanım: `.seçim oy @kişi`')

  const aday = uyeKimligiBul(metadata, hedef)
  if (!aday) return yaz('❌ Bu kişi grupta bulunamadı.')

  const s = oyVer({ chatJid: from, secmen: sender, aday })
  if (!s) return yaz(KAPALI)
  if (s.adayDegil) return yaz(`🗳️ ${mentionOf(aday)} aday değil.`, [aday])
  if (s.zaten) return yaz('🗳️ Bu hafta oyunu kullandın.')
  if (s.yetersiz) return yaz(`🗳️ Oy ${OY_UCRETI} XP, cüzdanında ${binlik(s.xp)} XP var.`)

  return yaz(`🗳️ Oyun sandığa atıldı.  •  💰 ${binlik(s.xp)} XP`)
}

export default {
  name: 'seçim',
  aliases: ['secim', 'başkan', 'baskan'],
  description: 'Haftalık Merkez Bankası başkanı seçimi',
  usage: '.seçim  —  .seçim aday  —  .seçim oy @kişi',
  details: [
    'Bu haftanın seçimini kazanan gelecek hafta başkan olur ve `.faizkararı` ile faizi günde bir kez değiştirir.',
    `Adaylık coin kurunun %1'i, oy ${OY_UCRETI} XP'dir, ikisi de yanar. Kişi başı haftada tek oy, kendine de verebilirsin.`,
    'Eşitlikte önce aday olan kazanır. Sonuç yeni haftada ilk `.seçim` yazılınca açıklanır.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const islem = trLower(args[0] || '')

      if (islem === 'oy') return await oyKullan({ yaz, from, sender, parsed, metadata })

      if (islem === 'aday') {
        const s = adayOl({ chatJid: from, userJid: sender })
        if (!s) return await yaz(KAPALI)
        if (s.zaten) return await yaz('🗳️ Zaten adaysın.')
        if (s.yetersiz) return await yaz(`🗳️ Adaylık ${binlik(s.ucret)} XP, cüzdanında ${binlik(s.xp)} XP var.`)
        return await yaz(`🗳️ ${mentionOf(sender)} aday oldu!\n💸 ${binlik(s.ucret)} XP  •  💰 ${binlik(s.xp)} XP`, [sender])
      }

      const s = secimDurumu({ chatJid: from, userJid: sender })
      if (!s) return await yaz(KAPALI)

      const gun = Math.ceil((haftaBitisi(s.hafta) - Date.now()) / 86_400_000)
      const etiketler = s.adaylar.map((a) => a.user_jid)
      const lines = []

      if (s.yeniBaskan) lines.push(`🎉 Seçimi ${mentionOf(s.yeniBaskan.user_jid)} kazandı (${s.yeniBaskan.oy} oy)!`, '')
      lines.push(`🏛️ Başkan: ${s.baskan ? mentionOf(s.baskan) : 'yok'}`)
      if (s.baskan) etiketler.push(s.baskan)

      lines.push('', `🗳️ *Bu haftanın seçimi*  •  ${gun} gün kaldı`, '')
      if (s.adaylar.length) lines.push(...s.adaylar.map((a) => `👤 ${mentionOf(a.user_jid)} — ${a.oy} oy`))
      else lines.push('Henüz aday yok.')

      lines.push('', `Adaylık ${binlik(s.ucret)} XP: \`.seçim aday\``)
      lines.push(s.oyVerdi ? '✅ Oyunu kullandın.' : `Oy ${OY_UCRETI} XP: \`.seçim oy @kişi\``)

      await yaz(lines.join('\n'), [...new Set(etiketler.filter((jid) => !botHesabiMi(jid)))])
    } catch (err) {
      logger.error({ err, from }, '.seçim başarısız')
      await yaz('🗳️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.seçim hata mesajı gönderilemedi'),
      )
    }
  },
}
