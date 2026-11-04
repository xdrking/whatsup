import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { kartBul, SETLER } from '../lib/kart.js'
import { kartlariOku, kartVer, setTamamla } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')

function koleksiyon(sahip) {
  return SETLER.flatMap((set, i) => {
    const toplanan = set.kartlar.filter((k) => sahip.get(k.no))
    return [
      '',
      `*${i + 1}. ${set.ad}* (${toplanan.length}/${set.kartlar.length})  •  ${sayi.format(set.odul)} XP`,
      ...set.kartlar.map((k) => {
        const adet = sahip.get(k.no)
        return adet ? `${k.no}. ${k.ad}${adet > 1 ? ` x${adet}` : ''}` : `${k.no}. ❔`
      }),
    ]
  })
}

export default {
  name: 'kart',
  aliases: ['kartlar', 'koleksiyon', 'cards'],
  description: 'Key\'lerden çıkan kartları topla, seti bitirip XP al',
  usage: '.kart  —  .kart @kişi  —  .kart ver @kişi <no>  —  .kart tamamla <set no>',
  details: [
    'Kartlar `.market`\'teki random key\'lerden çıkar: Bronz-Gümüş 1. set, Altın-Platin 2. set, Elmas-Efsane 3. set.',
    'Seti bitirince `.kart tamamla 1` ödülü verir, kullanılan kartlardan birer tane gider. Set tekrar toplanabilir.',
    'Takas: `.kart ver @ali 7` kartı verir. Karşılığını `.devret` ile alırsın, bot arada durmaz.',
    '⭐ kartlar nadirdir.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const islem = trLower(args[0] || '')

      if (['tamamla', 'bitir'].includes(islem)) {
        const set = SETLER[Number(args[1]) - 1]
        if (!set) return await yaz(`🃏 Set numarası yaz: \`.kart tamamla 1\` (1-${SETLER.length})`)

        const s = setTamamla({ chatJid: from, userJid: sender, set })
        if (!s) return await yaz('🃏 Kartlar şu an okunamıyor, sonra dene.')
        if (s.eksik) return await yaz(`🃏 Eksik kartlar: ${s.eksik.map((k) => k.ad).join(', ')}`)

        return await yaz(`🎉 *${set.ad}* tamamlandı!\n💰 +${sayi.format(set.odul)} XP  •  XP'n: ${sayi.format(s.xp)}`)
      }

      if (['ver', 'gönder', 'gonder'].includes(islem)) {
        const [hedefHam] = resolveTargets(parsed)
        const kart = kartBul(Number(args.slice(1).find((a) => /^\d{1,2}$/.test(a))))
        if (!hedefHam || !kart) return await yaz('Kullanım: `.kart ver @kişi <kart no>`')

        const hedef = uyeKimligiBul(metadata, hedefHam)
        if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
        if (hedef === sender) return await yaz('Kendine kart veremezsin 🙃')

        const s = kartVer({ chatJid: from, kaynak: sender, hedef, no: kart.no })
        if (!s) return await yaz('🃏 Kartlar şu an okunamıyor, sonra dene.')
        if (s.yok) return await yaz(`🃏 Sende ${kart.ad} yok.`)

        return await yaz(`🃏 ${mentionOf(sender)} → ${mentionOf(hedef)}: *${kart.ad}*`, [sender, hedef])
      }

      const [hedefHam] = resolveTargets(parsed, { limit: 1, includeSender: true })
      const hedef = uyeKimligiBul(metadata, hedefHam) ?? hedefHam
      const sahip = new Map(kartlariOku(from, hedef).map((k) => [k.no, k.adet]))

      await yaz(
        [`🃏 *Koleksiyon*  ${mentionOf(hedef)}`, ...koleksiyon(sahip)].join('\n'),
        [hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.kart başarısız')
      await yaz('🃏 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.kart hata mesajı gönderilemedi'),
      )
    }
  },
}
