import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { MIN_ODUL, ODUL_KESINTI_YUZDESI } from '../lib/soygun.js'
import { odulKoy, odulListesi } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')

export default {
  name: 'ödül',
  aliases: ['odul', 'bounty'],
  description: 'Birinin başına XP koy, onu ilk soyan alır',
  usage: '.ödül @kişi <miktar>  —  .ödül (aranan listesi)',
  details: [
    'Örnek: `.ödül @ali 500` — Ali\'yi ilk başarıyla soyan ödülü de alır.',
    `En az ${MIN_ODUL} XP. Koyarken %${ODUL_KESINTI_YUZDESI}'u kesilir, koyulan XP geri gelmez.`,
    'Aynı kişiye koyulan ödüller birikir. Kalkanı olan kişi soyulamadığı için ödülü de alınamaz.',
  ],
  category: 'ekonomi',
  cooldown: 10,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const [hedefHam] = resolveTargets(parsed)
      if (!hedefHam) {
        const liste = odulListesi(from)
        if (!liste.length) return await yaz('🎯 Aranan kimse yok. `.ödül @kişi 100` ile başlat.')
        return await yaz(
          ['🎯 *ARANANLAR*', '', ...liste.map((o) => `${mentionOf(o.user_jid)} — ${sayi.format(o.xp)} XP`)].join('\n'),
          liste.map((o) => o.user_jid),
        )
      }

      const miktar = Number(args.find((a) => /^\d+$/.test(a)))
      if (!Number.isSafeInteger(miktar) || miktar < MIN_ODUL) {
        return await yaz(`Kullanım: \`.ödül @kişi <miktar>\` (en az ${MIN_ODUL} XP)`)
      }

      const hedef = uyeKimligiBul(metadata, hedefHam)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (hedef === sender) return await yaz('Kendi başına ödül koyamazsın 🙃')

      const s = odulKoy({ chatJid: from, koyan: sender, hedef, miktar })
      if (!s) return await yaz('🎯 Şu an ödül koyulamıyor, sonra dene.')
      if (s.yetersiz) return await yaz(`🎯 O kadar XP'n yok. Senin XP'n: ${sayi.format(s.xp)}`)

      await yaz(
        [
          `🎯 ${mentionOf(hedef)} *ARANIYOR*`,
          `💰 Başındaki ödül: ${sayi.format(s.havuz)} XP`,
          `💸 Kesinti: ${sayi.format(s.kesinti)} XP  •  Kalan XP'n: ${sayi.format(s.xp)}`,
        ].join('\n'),
        [hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.ödül başarısız')
      await yaz('🎯 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.ödül hata mesajı gönderilemedi'),
      )
    }
  },
}
