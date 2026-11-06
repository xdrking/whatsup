import { AZAMI_DAVA_YUZDESI, DAVA_SURE_DK, MIN_DAVA, MIN_OY } from '../lib/dava.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, davaAc } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/dava.js'
import logger from '../lib/logger.js'

export default {
  name: 'dava',
  aliases: ['mahkeme', 'sue'],
  description: 'Birini XP için dava et, karar grubun',
  usage: '.dava @kişi <miktar> <sebep>',
  details: [
    `Grup ${DAVA_SURE_DK} dk boyunca botun mesajına \`haklı\` ya da \`haksız\` yazar. Taraflar oy veremez, kişi başı tek oy.`,
    'Kaybeden miktarı öder: davacı kaybederse aynı miktarı sanığa verir.',
    `En az ${MIN_OY} oy gerekir, berabere ya da az oyda dava düşer. %5 harç peşin alınır, iade edilmez.`,
    `Miktar en az ${MIN_DAVA} XP, en çok sanığın cüzdanının %${AZAMI_DAVA_YUZDESI}'idir. Borçlular mahkemelik olamaz.`,
  ],
  category: 'oyun',
  cooldown: 300,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      // `args` verilmez: miktar 8+ haneliyse elle yazılmış numara sanılırdı.
      const [hedef] = resolveTargets(parsed)
      const miktarArg = args.find((a) => /^\d+$/.test(a))
      const miktar = Number(miktarArg)
      if (!hedef || !Number.isSafeInteger(miktar)) return await yaz('Kullanım: `.dava @kişi <miktar> <sebep>`')

      const sanik = uyeKimligiBul(metadata, hedef)
      if (!sanik) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (sanik === sender) return await yaz('Kendini dava edemezsin 🙃')
      if (botHesabiMi(sanik)) return await yaz('🤖 Bot dokunulmazlık sahibi.')
      if (miktar < MIN_DAVA) return await yaz(`⚖️ En az ${MIN_DAVA} XP'lik dava açılır.`)
      if (getGame(from)) return await yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

      const s = davaAc({ chatJid: from, davaci: sender, sanik, miktar })
      if (!s) return await yaz('⚖️ Mahkeme şu an kapalı, sonra dene.')
      if (s.borclu) return await yaz(`⚖️ ${mentionOf(s.borclu)} borçlu, dava açılamaz.`, [s.borclu])
      if (s.yetersiz) return await yaz(`⚖️ Kaybedersen ödeyeceğin miktar ve harç cüzdanında olmalı. XP'n: ${binlik(s.xp)}`)
      if (s.fazla) return await yaz(`⚖️ Bu sanığa en çok ${binlik(s.azami)} XP'lik dava açabilirsin.`)

      const sebep = args.filter((a) => a !== miktarArg && !a.startsWith('@')).join(' ').slice(0, 150)
      await start({ sock, msg, from, sender, sanik, miktar, harc: s.harc, sebep })
    } catch (err) {
      logger.error({ err, from }, '.dava başarısız')
      await yaz('⚖️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.dava hata mesajı gönderilemedi'),
      )
    }
  },
}
