import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { KASALAR, kasaCek } from '../lib/kasa.js'
import { URUNLER } from '../lib/market.js'
import { haftaAnahtari } from '../lib/sezon.js'
import { getStats, kasaAc, marketAl, marketDurumu, vitrinKalan } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { vitrinUrunu } from '../lib/vitrin.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')

export default {
  name: 'market',
  aliases: ['mağaza', 'magaza', 'shop'],
  description: 'XP ile kalkan, bonus, unvan ve random key satın al',
  usage: '.market  —  .market al <numara>',
  details: [
    '`.market` ürünleri ve XP\'ni gösterir, `.market al 1` satın alır.',
    'Unvan `.profil`\'de görünür; yeni unvan eskisinin yerine geçer.',
    'Kalkan süresi üst üste eklenir. Bonus varken yenisi alınırsa güçlü olan kalır, süre 1 saate döner.',
    'Random key içinden rastgele XP, bonus, kalkan, çark ya da soygun hakkı, `.kart`, özel unvan çıkar; boş da çıkabilir.',
    'Key\'den unvan çıktığında zaten unvanın varsa unvanın korunur, yerine XP verilir.',
    'Vitrin ürünü her hafta değişir, stoğu sınırlıdır, kişi başı haftada bir alınır.',
    'Satın alınan XP geri gelmez. Market her grupta ayrıdır.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const hafta = haftaAnahtari()
      const vitrin = vitrinUrunu(hafta)
      const liste = [...URUNLER, vitrin]

      if (['al', 'satınal', 'satinal', 'buy'].includes(trLower(args[0] || ''))) {
        const urun = liste[Number(args[1]) - 1]
        if (!urun) return await yaz(`🛒 Ürün numarası yaz: \`.market al 1\` (1-${liste.length})`)

        if (urun === vitrin) {
          const v = kasaAc({ chatJid: from, userJid: sender, kasa: urun, cek: () => urun.odul, vitrinHafta: hafta })
          if (!v) return await yaz('🛒 Market şu an kapalı, sonra dene.')
          if (v.zatenAldin) return await yaz('🛒 Vitrinden bu hafta zaten aldın.')
          if (v.tukendi) return await yaz('🛒 Vitrin tükendi, pazartesi yenilenir.')
          if (v.yetersiz) return await yaz(`🛒 ${sayi.format(urun.fiyat)} XP gerekiyor. Senin XP'n: ${sayi.format(v.xp)}`)
          return await yaz(`✨ *${urun.ad}* senin!\n💰 Kalan XP: ${sayi.format(v.xp)}`)
        }

        if (urun.tur === 'kasa') {
          const k = kasaAc({ chatJid: from, userJid: sender, kasa: urun, cek: () => kasaCek(urun) })
          if (!k) return await yaz('🛒 Market şu an kapalı, sonra dene.')
          if (k.yetersiz) return await yaz(`🛒 ${sayi.format(urun.fiyat)} XP gerekiyor. Senin XP'n: ${sayi.format(k.xp)}`)

          const satirlar = [`🗝️ *${urun.ad}* açıldı!`, `🎁 ${k.odul.etiket}`]
          if (k.yedekXp) satirlar.push(`🏷️ Unvanın olduğu için yerine +${sayi.format(k.yedekXp)} XP`)
          satirlar.push(`💰 XP'n: ${sayi.format(k.xp)}`)
          return await yaz(satirlar.join('\n'))
        }

        const s = marketAl({ chatJid: from, userJid: sender, urun })
        if (!s) return await yaz('🛒 Market şu an kapalı, sonra dene.')
        if (s.zatenVar) return await yaz('🛒 Bu unvan zaten sende.')
        if (s.yetersiz) return await yaz(`🛒 ${sayi.format(urun.fiyat)} XP gerekiyor. Senin XP'n: ${sayi.format(s.xp)}`)

        return await yaz(`🛒 *${urun.ad}* satın alındı.\n💰 Kalan XP: ${sayi.format(s.xp)}`)
      }

      const { unvan, kalkan } = marketDurumu(from, sender)
      const lines = [
        '🛒 *Market*',
        '',
        ...URUNLER.flatMap((u, i) => [
          ...(u === KASALAR[0] ? ['', '🗝️ *Random Key* (içinden rastgele ödül çıkar)'] : []),
          `${i + 1}. ${u.ad} — ${sayi.format(u.fiyat)} XP`,
        ]),
        '',
        '✨ *Haftanın vitrini*',
        `${liste.length}. ${vitrin.ad} — ${sayi.format(vitrin.fiyat)} XP (${vitrinKalan(from, hafta, vitrin.stok)}/${vitrin.stok} kaldı)`,
        '',
        `💰 XP'n: ${sayi.format(getStats(from, sender).xp)}`,
      ]
      if (unvan) lines.push(`🏷️ Unvanın: ${unvan}`)
      if (kalkan) lines.push(`🛡️ Kalkan: ${sureYaz(kalkan - Date.now())} kaldı`)
      lines.push('', 'Satın almak için `.market al <numara>`')

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.market başarısız')
      await yaz('🛒 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.market hata mesajı gönderilemedi'),
      )
    }
  },
}
