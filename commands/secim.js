import { requireGroupMetadata, sahipUyeKimligi, uyeKimligiBul } from '../lib/group.js'
import { OY_UCRETI } from '../lib/secim.js'
import { MAKAMLAR, makamBul, makamKoduyla } from '../lib/devlet.js'
import { binlik } from '../lib/sayi.js'
import { haftaBitisi } from '../lib/sezon.js'
import { adayOl, oyVer, secimDurumu } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🗳️ Sandıklar şu an kapalı, sonra dene.'
const ASKIDA = '🪖 Başkanlık seçimi askıya alındı.'
const MAKAM_LISTESI = MAKAMLAR.map((m) => m.adlar[0]).join(', ')

/** `.seçim oy [makam] @kişi`: makam yazılmazsa başkanlık. */
async function oyKullan({ yaz, args, from, sender, parsed, metadata }) {
  const makam = makamBul(args[1]) ?? makamKoduyla('baskan')
  const [hedef] = resolveTargets(parsed)
  if (!hedef) return yaz(`Kullanım: \`.seçim oy [makam] @kişi\`  •  Makamlar: ${MAKAM_LISTESI}`)

  const aday = uyeKimligiBul(metadata, hedef)
  if (!aday) return yaz('❌ Bu kişi grupta bulunamadı.')

  const s = oyVer({ chatJid: from, secmen: sender, aday, makam: makam.kod })
  if (!s) return yaz(KAPALI)
  if (s.askida) return yaz(ASKIDA)
  if (s.adayDegil) return yaz(`🗳️ ${mentionOf(aday)} ${makam.ad} adayı değil.`, [aday])
  if (s.zaten) return yaz(`🗳️ ${makam.ad} için bu hafta oyunu kullandın.`)
  if (s.yetersiz) return yaz(`🗳️ Oy ${OY_UCRETI} XP, cüzdanında ${binlik(s.xp)} XP var.`)

  return yaz(`🗳️ ${makam.ad} oyun sandığa atıldı.  •  💰 ${binlik(s.xp)} XP`)
}

export default {
  name: 'seçim',
  aliases: ['secim', 'başkan', 'baskan'],
  description: 'Haftalık başkan ve bakan seçimleri',
  usage: '.seçim  —  .seçim aday [makam]  —  .seçim oy [makam] @kişi',
  details: [
    `Makamlar: ${MAKAMLAR.map((m) => m.ad).join(', ')}. Makam yazılmazsa başkanlık sayılır.`,
    'Bu haftanın kazananı yeni hafta başlayınca göreve gelir ve yenisi seçilene kadar kalır. Başkan seçilmeden önce başkan bot sahibidir.',
    'Başkan günde bir `.faizkararı` verir, `.hazine ver` ile hazineden para dağıtır. Bakanların yetkisi `.bakan`\'dadır.',
    `Adaylık coin kurunun %1'i, oy ${OY_UCRETI} XP'dir, ikisi de yanar. Makam başına haftada tek oy, kendine de verebilirsin.`,
    'Eşitlikte önce aday olan kazanır. Sonuç yeni haftada ilk `.seçim` yazılınca açıklanır.',
  ],
  category: 'toplum',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const islem = trLower(args[0] || '')

      if (islem === 'oy') return await oyKullan({ yaz, args, from, sender, parsed, metadata })

      if (islem === 'aday') {
        const makam = args[1] ? makamBul(args[1]) : makamKoduyla('baskan')
        if (!makam) return await yaz(`🗳️ Böyle bir makam yok. Makamlar: ${MAKAM_LISTESI}`)
        const s = adayOl({ chatJid: from, userJid: sender, makam: makam.kod })
        if (!s) return await yaz(KAPALI)
        if (s.askida) return await yaz(ASKIDA)
        if (s.zaten) return await yaz(`🗳️ Zaten ${makam.ad} adayısın.`)
        if (s.yetersiz) return await yaz(`🗳️ Adaylık ${binlik(s.ucret)} XP, cüzdanında ${binlik(s.xp)} XP var.`)
        return await yaz(`🗳️ ${mentionOf(sender)} ${makam.ad} adayı oldu!\n💸 ${binlik(s.ucret)} XP  •  💰 ${binlik(s.xp)} XP`, [sender])
      }

      const s = secimDurumu({ chatJid: from, userJid: sender })
      if (!s) return await yaz(KAPALI)

      const gun = Math.ceil((haftaBitisi(s.hafta) - Date.now()) / 86_400_000)
      const sahip = sahipUyeKimligi(metadata)
      const lines = []

      // Yeni gelenler bir kez, kapanışta duyurulur ve etiketlenir.
      for (const y of s.yeniler) lines.push(`🎉 ${makamKoduyla(y.makam).ad}: ${mentionOf(y.user_jid)} (${y.oy} oy)`)
      if (s.yeniler.length) lines.push('')

      lines.push('🏛️ *Hükümet*')
      for (const m of s.makamlar) {
        const kisi = m.sahip ?? (m.kod === 'baskan' ? sahip : null)
        lines.push(`${makamKoduyla(m.kod).ad}: ${kisi ? displayName(kisi) : 'boş'}`)
      }

      lines.push('', `🗳️ *Bu haftanın seçimleri*  •  ${gun} gün kaldı`)
      for (const m of MAKAMLAR) {
        if (m.kod === 'baskan' && s.darbe) {
          lines.push('', `${m.ad}: askıda`)
          continue
        }
        const adaylar = s.adaylar[m.kod]
        lines.push('', `${m.ad}${s.oyVerdi[m.kod] ? '  ✅' : ''}`)
        if (adaylar.length) lines.push(...adaylar.map((a) => `👤 ${displayName(a.user_jid)} — ${a.oy} oy`))
        else lines.push('Henüz aday yok.')
      }

      lines.push('', `Adaylık ${binlik(s.ucret)} XP: \`.seçim aday [makam]\`  •  Oy ${OY_UCRETI} XP: \`.seçim oy [makam] @kişi\``)
      lines.push(`Makamlar: ${MAKAM_LISTESI}`)

      await yaz(lines.join('\n'), s.yeniler.map((y) => y.user_jid))
    } catch (err) {
      logger.error({ err, from }, '.seçim başarısız')
      await yaz('🗳️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.seçim hata mesajı gönderilemedi'),
      )
    }
  },
}
