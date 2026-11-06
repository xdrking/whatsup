import { binlik } from '../lib/sayi.js'
import { requireGroupMetadata } from '../lib/group.js'
import { getStats } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/acikartirma.js'

const MIN_SN = 10
const MAX_SN = 600

export default {
  name: 'açıkartırma',
  aliases: ['açıkarttırma', 'acikartirma', 'acikarttirma', 'mezat'],
  description: 'Kendi XP\'ni açık artırmaya çıkar, en yüksek teklifi bot bildirir',
  usage: '.açıkartırma <xp> <saniye>',
  details: [
    'Örnek: `.açıkartırma 500 60` — 500 XP için 60 saniyelik açık artırma başlar, herkes etiketlenir.',
    'Teklifler botun ilk mesajına sayıyla yanıt olarak yazılır, en yüksek sayı kazanır.',
    'Bot XP aktarmaz ve teklifi tahsil etmez: süre bitince kazananı yazar, satıcı `.devret` ile gönderir.',
    `Yalnızca sahip olduğun XP'yi satabilirsin. Süre ${MIN_SN}-${MAX_SN} sn.`,
  ],
  category: 'oyun',
  // Her çağrı tüm gruba bildirim düşürür.
  cooldown: 60,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed, isOwner }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!metadata) return

    const [miktarArg, sureArg] = args
    const miktar = /^\d+$/.test(miktarArg || '') ? Number(miktarArg) : 0
    const sureSn = /^\d+$/.test(sureArg || '') ? Number(sureArg) : 0

    if (!Number.isSafeInteger(miktar) || miktar <= 0 || !sureSn) {
      return yaz('Kullanım: `.açıkartırma <xp> <saniye>`\nÖrnek: `.açıkartırma 500 60`')
    }
    if (sureSn < MIN_SN || sureSn > MAX_SN) return yaz(`⏱️ Süre ${MIN_SN}-${MAX_SN} saniye olmalı.`)

    // Sahip XP'yi sonradan `.xpver` ile verebilir; başkaları yalnızca kendi XP'sini satar.
    const xp = getStats(from, sender).xp
    if (!isOwner && miktar > xp) return yaz(`❌ O kadar XP'n yok. Senin XP'n: ${binlik(xp)}`)

    if (getGame(from)) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

    await start({
      sock, msg, from, sender, miktar, sureSn,
      uyeler: (metadata.participants || []).map((u) => u.id),
    })
  },
}
