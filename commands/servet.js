import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, servetDurumu, servetSiralama } from '../lib/stats.js'
import { displayName, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'
import { sulyYaz } from '../lib/kripto.js'

export default {
  name: 'servet',
  aliases: ['varlık', 'varlik', 'networth'],
  description: 'Cüzdan, banka, coin, mülk, hisse ve borçlarla net servet',
  usage: '.servet  —  .servet @kişi  —  .servet top',
  details: [
    'Her şey bugün nakde çevrilse ne edeceğiyle sayılır: coin ve mülk satış fiyatından (%90), hisse son fiyatından.',
    'Kredi, tefeci borcu ve eksi cüzdan düşülür. `.servet top` gerçek zengin sıralamasıdır, `.tüik` yalnızca cüzdan ve bankaya bakar.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      if (['top', 'sıralama', 'siralama'].includes(trLower(args[0] || ''))) {
        const liste = servetSiralama({ chatJid: from })
        if (!liste.length) return await yaz('💎 Henüz servet sahibi yok.')
        return await yaz(
          ['💎 *En zenginler (net servet)*', '', ...liste.map((r, i) => `${i + 1}. ${displayName(r.user_jid)} — ${binlik(r.net)} XP`)].join('\n'),
        )
      }

      const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })
      if (botHesabiMi(jid) && jid !== parsed.sender && !isOwner) return await yaz('🤖 Botun hesabı gizli.')

      const s = servetDurumu({ chatJid: from, userJid: jid })
      if (!s) return await yaz('💎 Servet şu an hesaplanamıyor.')

      const satir = (emoji, ad, n) => (n ? [`${emoji} ${ad}: ${binlik(n)} XP`] : [])
      const ad = jid === parsed.sender && parsed.pushName ? parsed.pushName : displayName(jid)

      await yaz([
        `💎 *${ad}* servet dökümü`,
        '',
        ...satir('👛', 'Cüzdan', Math.max(0, s.cuzdan)),
        ...satir('🏦', 'Banka', s.banka),
        ...(s.coinAdet ? [`🪙 Coin: ${binlik(s.coinAdet)} adet ≈ ${binlik(s.coin)} XP`] : []),
        ...(s.kriptoBirim ? [`🟠 Suly: ${sulyYaz(s.kriptoBirim)} ≈ ${binlik(s.kripto)} XP`] : []),
        ...satir('🏠', 'Mülk ve kira', s.mulk),
        ...satir('📈', 'Hisse', s.borsa),
        ...satir('💼', 'Yatırım', s.yatirim),
        ...satir('🤝', 'Tefeci alacağı', s.alacak),
        ...(s.borc
          ? ['', ...satir('📉', 'Eksi cüzdan', Math.max(0, -s.cuzdan)), ...satir('💳', 'Kredi borcu', s.kredi), ...satir('🦈', 'Tefeci borcu', s.tefeci)]
          : []),
        '',
        `🧾 *Net servet: ${binlik(s.net)} XP*`,
      ].join('\n'), [jid])
    } catch (err) {
      logger.error({ err, from }, '.servet başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.servet hata mesajı gönderilemedi'))
    }
  },
}
