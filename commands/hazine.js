import { requireGroupMetadata, sahipUyeKimligi, uyeKimligiBul } from '../lib/group.js'
import { HAZINE_KISI, HAZINE_YUZDESI } from '../lib/devlet.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, hazineAktar, hazineDurumu } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🏦 Hazine şu an kapalı, sonra dene.'

export default {
  name: 'hazine',
  aliases: [],
  description: 'Hazine: başkan üyelere XP aktarır, kumar ve kira buradan ödenir',
  usage: '.hazine  —  .hazine ver @kişi <miktar>',
  details: [
    `Başkan günde en çok ${HAZINE_KISI} kişiye aktarır, bir kişiye günde o anki piyasanın %${HAZINE_YUZDESI}'sinden fazlasını veremez.`,
    'Başkan kendine aktaramaz. Hazine botun kasasıdır, `.tüik`\'te görünür.',
    'Kumar kazançları ve kiralar hazineden ödenir, yetmezse yeni para basılır. Kumar kayıpları ve vergiler hazineye girer.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      if (trLower(args[0] || '') !== 'ver') {
        const d = hazineDurumu({ chatJid: from })
        if (!d) return await yaz(KAPALI)
        const baskan = d.baskan ?? sahipUyeKimligi(metadata)
        return await yaz([
          '🏦 *Hazine*',
          '',
          `🏛️ Başkan: ${baskan ? displayName(baskan) : 'yok'}${d.darbe ? ' 🪖' : ''}`,
          `💰 Kasa: ${binlik(d.kasa)} XP`,
          `📤 Kişi başı sınır: ${binlik(d.limit)} XP (piyasanın %${HAZINE_YUZDESI}'si, anlık)`,
          `📊 Bugün aktarılan: ${binlik(d.kullanilan)} XP (${d.kisiler.length}/${HAZINE_KISI} kişi)`,
          ...(d.kisiler.length ? [`👥 ${d.kisiler.map(displayName).join(', ')}`] : []),
        ].join('\n'))
      }

      const [ham] = resolveTargets(parsed)
      const miktar = Number(args.at(-1))
      if (!ham || !Number.isSafeInteger(miktar) || miktar < 1) return await yaz('Kullanım: `.hazine ver @kişi <miktar>`')
      const hedef = uyeKimligiBul(metadata, ham)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (botHesabiMi(hedef)) return await yaz('🤖 Hazine zaten botta.')

      const s = hazineAktar({ chatJid: from, userJid: sender, hedef, miktar, sahip: isOwner })
      if (!s) return await yaz(KAPALI)
      if (s.degil) return await yaz('🏦 Hazineden yalnızca başkan aktarabilir.')
      if (s.kendine) return await yaz('🏦 Başkan kendine aktaramaz.')
      if (s.kisiSiniri) return await yaz(`🏦 Bugün ${HAZINE_KISI} kişiye aktardın, yarın tekrar.`)
      if (s.kasaYetersiz) return await yaz(`🏦 Hazinede o kadar yok: ${binlik(s.kasa)} XP`)
      if (s.limit !== undefined) return await yaz(`🏦 Bir kişiye günlük sınır ${binlik(s.limit)} XP, bu kişiye kalan ${binlik(s.kalan)} XP.`)

      await yaz(
        `🏦 Hazineden ${mentionOf(hedef)} kişisine *${binlik(s.miktar)} XP* aktarıldı.\n📤 Bu kişiye bugün kalan: ${binlik(s.kalan)} XP  •  ${s.kisi}/${HAZINE_KISI} kişi`,
        [hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.hazine başarısız')
      await yaz('🏦 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.hazine hata mesajı gönderilemedi'))
    }
  },
}
