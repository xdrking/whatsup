import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarOyna, MIN_BAHIS, PLINKO_RISK, PLINKO_SIRA, plinkoAt, plinkoRiskCoz } from '../lib/kumar.js'

const tablo = (risk, kutu = -1) =>
  PLINKO_RISK[risk].map((c, i) => (i === kutu ? `[${c}]` : String(c))).join(' ')

export default {
  name: 'plinko',
  aliases: ['pachinko'],
  description: 'Topu bırak, çivilerden sekip düştüğü kutunun çarpanını al',
  usage: '.plinko <miktar|hepsi|yarısı> [düşük|orta|yüksek]',
  details: [
    `Top ${PLINKO_SIRA} sıra çividen geçer, her çivide sola ya da sağa düşer. Kenar kutular nadir ama büyük.`,
    ...Object.keys(PLINKO_RISK).map((r) => `${r}: ${tablo(r)}`),
    `Örnek: \`.plinko 1000 yüksek\`. Risk yazılmazsa orta. En az ${MIN_BAHIS} XP.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const { miktar, secim } = argumanlariAyir(args)
    const risk = plinkoRiskCoz(secim)
    if (!risk) {
      await sock.sendMessage(from, { text: '🔴 Risk `düşük`, `orta` ya da `yüksek` olmalı.' }, { quoted: msg })
      return
    }

    await kumarOyna({
      sock, msg, from, sender,
      miktarArg: miktar,
      cevir: () => plinkoAt(risk),
      anlat: (s) => [
        `🔴 *PLINKO* (${risk} risk)`,
        '',
        s.yol.map((x) => (x ? '↘' : '↙')).join(' '),
        tablo(risk, s.kutu),
        '',
        `Top *${s.carpan}x* kutusuna düştü.`,
      ],
    })
  },
}
