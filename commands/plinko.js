import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarOyna, MIN_BAHIS, MIN_KUMAR_BAKIYESI, PLINKO_RISK, PLINKO_SIRA, plinkoAt, plinkoRiskCoz } from '../lib/kumar.js'

const tablo = (risk, kutu = -1) =>
  PLINKO_RISK[risk].map((c, i) => (i === kutu ? `[${c}]` : String(c))).join(' ')

export default {
  name: 'plinko',
  aliases: ['pachinko'],
  description: 'Topu bırak, çivilerden sekip düştüğü kutunun çarpanını al',
  usage: '.plinko <miktar|hepsi|yarısı> [düşük|orta|yüksek]',
  details: [
    '🎯 *Nasıl oynanır*',
    '1. `.plinko <miktar> <risk>` yaz, top hemen düşer. Tek mesajlık oyun, cevap beklemez.',
    `2. Top ${PLINKO_SIRA} sıra çividen geçer, her çivide rastgele sola (↙) ya da sağa (↘) seker.`,
    '3. Düştüğü kutunun çarpanı kadar alırsın: 1000 XP bastın, 5x kutusuna düştü → 5.000 XP.',
    '1x altındaki kutularda bahsin bir kısmı geri gelir: 0.5x yarısı demek.',
    '📊 *Kutular* (soldan sağa; ortadakiler sık, kenarlar nadir)',
    ...Object.keys(PLINKO_RISK).map((r) => `${r}: ${tablo(r)}`),
    'Risk büyüdükçe kenarlar büyür, orta küçülür.',
    '📝 *Örnek*: `.plinko 1000` (orta risk), `.plinko hepsi yüksek`',
    `En az ${MIN_BAHIS} XP basılır, cüzdanda en az ${MIN_KUMAR_BAKIYESI} XP olmalı.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed, isOwner }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const { miktar, secim } = argumanlariAyir(args)
    const risk = plinkoRiskCoz(secim)
    if (!risk) {
      await sock.sendMessage(from, { text: '🔴 Risk `düşük`, `orta` ya da `yüksek` olmalı.' }, { quoted: msg })
      return
    }

    await kumarOyna({
      oyun: 'plinko',
      sock, msg, from, sender,
      sahip: isOwner,
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
