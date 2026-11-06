import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import { requireGroup } from '../lib/group.js'
import { kumarEngeli, MIN_BAHIS, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi, piyangoBilet, piyangoBiletleri } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

/** Bilet yüzde kaç şans veriyor: yatırılan XP oranında. */
export function agirlikliSec(biletler, rnd = randomInt) {
  let r = rnd(biletler.reduce((t, b) => t + b.xp, 0))
  for (const b of biletler) {
    if (r < b.xp) return b.user_jid
    r -= b.xp
  }
  return biletler[0].user_jid
}

export default {
  name: 'piyango',
  aliases: ['lotto', 'bilet'],
  description: 'Ortak havuza XP yatır, çekilişte biri hepsini alır',
  usage: '.piyango <miktar|hepsi|yarısı>  —  .piyango (havuzu gösterir)',
  details: [
    'Yatırdığın XP oranında şansın olur: havuzun yarısı senin olursa şansın %50.',
    'Çekilişi bir grup admini ya da bot sahibi `.çekiliş` ile yapar, en az 2 kişi gerekir.',
    `Havuzun tamamı kazananındır. En az ${MIN_BAHIS} XP. Biletler iade edilmez.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      if (args[0]) {
        const { xp } = getStats(from, sender)
        const engel = kumarEngeli(xp, kumarYasagi(from, sender))
        if (engel) return await yaz(`🎫 ${engel}`)

        const cozum = miktarCoz(args[0], xp)
        if (cozum.hata) return await yaz(`🎫 ${cozum.hata}`)

        const s = piyangoBilet({ chatJid: from, userJid: sender, miktar: cozum.miktar })
        if (!s) return await yaz('🎫 Piyango şu an kapalı, sonra dene.')
        if (s.yetersiz) return await yaz(`🎫 O kadar XP'n yok. Senin XP'n: ${binlik(s.xp)}`)
      }

      const biletler = piyangoBiletleri(from)
      if (!biletler.length) return await yaz('🎫 Havuz boş. `.piyango 50` ile ilk bileti al.')

      const havuz = biletler.reduce((t, b) => t + b.xp, 0)
      const yuzde = (xp) => Math.round((xp / havuz) * 100)
      await yaz(
        [
          `🎫 *PİYANGO*  •  Havuz: *${binlik(havuz)} XP*`,
          '',
          ...biletler.map((b) => `${mentionOf(b.user_jid)} — ${binlik(b.xp)} XP (%${yuzde(b.xp)})`),
        ].join('\n'),
        biletler.map((b) => b.user_jid),
      )
    } catch (err) {
      logger.error({ err, from }, '.piyango başarısız')
      await yaz('🎫 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.piyango hata mesajı gönderilemedi'),
      )
    }
  },
}
