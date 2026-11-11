import { requireGroupMetadata, sahipUyeKimligi, uyeKimligiBul } from '../lib/group.js'
import { OY_UCRETI, SECIM_SURE_MS } from '../lib/secim.js'
import { MAKAMLAR, makamBul, makamKoduyla } from '../lib/devlet.js'
import { binlik } from '../lib/sayi.js'
import { adayOl, oyVer, secimDurumu } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { secimSonucunuZamanla } from '../games/secim.js'
import logger from '../lib/logger.js'

const KAPALI = '🗳️ Sandıklar şu an kapalı, sonra dene.'
const askida = (makam) => (makam.kod === 'baskan' ? '🪖 Başkanlık seçimi askıya alındı.' : `🪖 ${makam.ad} kayyumla yönetiliyor, seçim askıda.`)
const MAKAM_LISTESI = MAKAMLAR.map((m) => m.adlar[0]).join(', ')
const SURE_DK = SECIM_SURE_MS / 60_000
const kalanDk = (bitis) => Math.max(1, Math.ceil((bitis - Date.now()) / 60_000))

/** `.seçim oy [makam] @kişi`: makam yazılmazsa başkanlık. */
async function oyKullan({ yaz, args, from, sender, parsed, metadata }) {
  const makam = makamBul(args[1]) ?? makamKoduyla('baskan')
  const [hedef] = resolveTargets(parsed)
  if (!hedef) return yaz(`Kullanım: \`.seçim oy [makam] @kişi\`  •  Makamlar: ${MAKAM_LISTESI}`)

  const aday = uyeKimligiBul(metadata, hedef)
  if (!aday) return yaz('❌ Bu kişi grupta bulunamadı.')

  const s = oyVer({ chatJid: from, secmen: sender, aday, makam: makam.kod })
  if (!s) return yaz(KAPALI)
  if (s.askida) return yaz(askida(makam))
  if (s.secimYok) return yaz(`🗳️ ${makam.ad} için açık seçim yok. Başlatmak için: \`.seçim aday ${makam.adlar[0]}\``)
  if (s.adayDegil) return yaz(`🗳️ ${mentionOf(aday)} ${makam.ad} adayı değil.`, [aday])
  if (s.zaten) return yaz(`🗳️ ${makam.ad} seçiminde oyunu kullandın.`)
  if (s.yetersiz) return yaz(`🗳️ Oy ${OY_UCRETI} XP, cüzdanında ${binlik(s.xp)} XP var.`)

  return yaz(`🗳️ ${makam.ad} oyun sandığa atıldı.  •  ⏱️ ${kalanDk(s.bitis)} dk kaldı  •  💰 ${binlik(s.xp)} XP`)
}

export default {
  name: 'seçim',
  aliases: ['secim', 'başkan', 'baskan'],
  description: '30 dakikalık başkan ve bakan seçimleri',
  usage: '.seçim  —  .seçim aday [makam]  —  .seçim oy [makam] @kişi',
  details: [
    `Makamlar: ${MAKAMLAR.map((m) => m.ad).join(', ')}. Makam yazılmazsa başkanlık sayılır.`,
    `Bir makama ilk aday olan o makamın seçimini başlatır, sandık ${SECIM_SURE_MS / 60_000} dakika sonra kapanır. En çok oy alan (en az 1 oy) kazanır ve yenisi seçilene kadar görevde kalır. Başkan seçilmeden önce başkan bot sahibidir.`,
    'Başkan günde bir `.faizkararı` verir, `.hazine ver` ile hazineden para dağıtır. Bakanların yetkisi `.bakan`\'dadır.',
    `Adaylık coin kurunun %1'i, oy ${OY_UCRETI} XP'dir, ikisi de yanar. Seçim başına tek oy, kendine de verebilirsin.`,
    'Eşitlikte önce aday olan kazanır. Sonuç süre dolunca gruba yazılır.',
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
        if (s.askida) return await yaz(askida(makam))
        if (s.zaten) return await yaz(`🗳️ Zaten ${makam.ad} adayısın.`)
        if (s.yetersiz) return await yaz(`🗳️ Adaylık ${binlik(s.ucret)} XP, cüzdanında ${binlik(s.xp)} XP var.`)
        secimSonucunuZamanla({ sock, chatJid: from, makam: makam.kod, bitis: s.bitis })
        const baslik = s.basladi
          ? `🗳️ *${makam.ad} seçimi başladı!* ${mentionOf(sender)} ilk aday. ⏱️ ${SURE_DK} dakika sonra sandık kapanır.`
          : `🗳️ ${mentionOf(sender)} ${makam.ad} adayı oldu!  •  ⏱️ ${kalanDk(s.bitis)} dk kaldı`
        return await yaz(`${baslik}\nOy: \`.seçim oy ${makam.kod === 'baskan' ? '' : `${makam.adlar[0]} `}@kişi\`\n💸 ${binlik(s.ucret)} XP  •  💰 ${binlik(s.xp)} XP`, [sender])
      }

      const s = secimDurumu({ chatJid: from, userJid: sender })
      if (!s) return await yaz(KAPALI)

      const sahip = sahipUyeKimligi(metadata)
      const lines = []

      // Yeni gelenler bir kez, kapanışta duyurulur ve etiketlenir.
      for (const y of s.yeniler) lines.push(`🎉 ${makamKoduyla(y.makam).ad}: ${mentionOf(y.user_jid)} (${y.oy} oy)`)
      if (s.yeniler.length) lines.push('')

      lines.push('🏛️ *Hükümet*')
      for (const m of s.makamlar) {
        const kisi = m.sahip ?? (m.kod === 'baskan' ? sahip : null)
        lines.push(`${makamKoduyla(m.kod).ad}: ${kisi ? displayName(kisi) : 'boş'}${m.askida && m.kod !== 'baskan' ? ' (kayyum)' : ''}`)
      }

      lines.push('', '🗳️ *Açık seçimler*')
      let acikVar = false
      for (const m of MAKAMLAR) {
        if (s.makamlar.find((x) => x.kod === m.kod)?.askida) {
          lines.push('', `${m.ad}: askıda`)
          continue
        }
        const secim = s.secimler[m.kod]
        if (!secim) continue
        acikVar = true
        lines.push('', `${m.ad}  •  ⏱️ ${kalanDk(secim.bitis)} dk kaldı${secim.oyVerdi ? '  ✅' : ''}`)
        lines.push(...secim.adaylar.map((a) => `👤 ${displayName(a.user_jid)} — ${a.oy} oy`))
      }
      if (!acikVar) lines.push('Şu an açık seçim yok.')

      lines.push('', `Aday ol ya da seçim başlat: \`.seçim aday [makam]\` (${binlik(s.ucret)} XP)`)
      lines.push(`Oy ver: \`.seçim oy [makam] @kişi\` (${OY_UCRETI} XP)  •  Makamlar: ${MAKAM_LISTESI}`)

      await yaz(lines.join('\n'), s.yeniler.map((y) => y.user_jid))
    } catch (err) {
      logger.error({ err, from }, '.seçim başarısız')
      await yaz('🗳️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.seçim hata mesajı gönderilemedi'),
      )
    }
  },
}
