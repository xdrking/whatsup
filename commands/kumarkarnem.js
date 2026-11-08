import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, kumarKarnesi } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

// Bu oyunlarda kayıp başka oyuncuya gider, kasaya değil.
const OYUNCUYA_KARSI = new Set(['vs', 'piyango'])

const isaretli = (n) => `${n > 0 ? '+' : ''}${binlik(n)}`

export default {
  name: 'kumarkarnem',
  aliases: ['karnem', 'kumarkarne'],
  description: 'Kendi kumar geçmişin: oyun oyun kazanç, kayıp ve kasaya kaptırdığın',
  usage: '.kumarkarnem  —  .kumarkarnem @kişi',
  details: [
    'Her oyunda net sonuç, oyun sayısı, en büyük vurgun ve en ağır kayıp yazılır.',
    'Oyun dökümü bu özellik eklendiğinden beri tutulur, eski oyunlar yalnızca toplamda görünür.',
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })
      if (botHesabiMi(jid) && !isOwner) return await yaz('🤖 Kasanın karnesi gizli.')

      const { toplam, oyunlar } = kumarKarnesi(from, jid)
      if (!toplam?.games) return await yaz(`🎰 ${mentionOf(jid)} henüz kumar oynamadı.`, [jid])

      const kasa = oyunlar.filter((o) => !OYUNCUYA_KARSI.has(o.oyun)).reduce((t, o) => t + o.lost - o.won, 0)
      const vurgun = oyunlar.reduce((en, o) => (o.en_buyuk > (en?.en_buyuk ?? 0) ? o : en), null)
      const darbe = oyunlar.reduce((en, o) => (o.en_kotu > (en?.en_kotu ?? 0) ? o : en), null)

      const lines = [
        `🎰 ${mentionOf(jid)} *kumar karnesi*`,
        '',
        `📊 Net: *${isaretli(toplam.won - toplam.lost)} XP*  •  ${binlik(toplam.games)} oyun`,
        `✅ Kazanılan: ${binlik(toplam.won)} XP  •  ❌ Kaybedilen: ${binlik(toplam.lost)} XP`,
      ]

      if (oyunlar.length) {
        lines.push('', '*Oyunlar*', ...oyunlar.map((o) => `${o.won >= o.lost ? '🟢' : '🔴'} ${o.oyun}: ${isaretli(o.won - o.lost)} XP (${binlik(o.games)} oyun)`))
        if (vurgun) lines.push('', `💰 En büyük vurgun: +${binlik(vurgun.en_buyuk)} XP (${vurgun.oyun})`)
        if (darbe) lines.push(`💀 En ağır kayıp: −${binlik(darbe.en_kotu)} XP (${darbe.oyun})`)
        if (kasa > 0) lines.push(`🤖 Kasaya net kaptırılan: ${binlik(kasa)} XP`)
        else if (kasa < 0) lines.push(`🤖 Kasadan net kazanılan: ${binlik(-kasa)} XP`)
      } else {
        lines.push('', '_Oyun dökümü yeni tutulmaya başladı, bundan sonraki oyunlar burada görünecek._')
      }

      await yaz(lines.join('\n'), [jid])
    } catch (err) {
      logger.error({ err, from }, '.kumarkarnem başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.kumarkarnem hata mesajı gönderilemedi'))
    }
  },
}
