import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarEngeli, MIN_BAHIS, MIN_KUMAR_BAKIYESI, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { getGame } from '../games/gameManager.js'
import { KAT, kuleCarpani, start, ZORLUK, zorlukCoz } from '../games/kule.js'

export default {
  name: 'kule',
  aliases: ['ejderha', 'dragon', 'dragontower', 'dragontier'],
  description: 'Ejderha kulesine tırman, her katta yumurtayı bul',
  usage: '.kule <miktar|hepsi|yarısı> [kolay|orta|zor]',
  details: [
    '🐉 *Nasıl oynanır*',
    `1. \`.kule <miktar> <zorluk>\` yaz, ${KAT} katlı kule çıkar. En alt kattan başlarsın.`,
    '2. Botun mesajını yanıtlayarak o kattaki kutulardan birinin numarasını yaz.',
    '3. Altından 🥚 çıkarsa bir kat çıkarsın ve çarpan büyür. 🐉 çıkarsa bahis yanar.',
    '4. İstediğin an `çek` yaz, ulaştığın katın çarpanını al. Tepeye çıkarsan kendiliğinden çekilir.',
    'Kulenin yanındaki sayı o katın çarpanıdır.',
    '📊 *Zorluklar*',
    ...Object.entries(ZORLUK).map(
      ([ad, z]) => `${ad}: ${z.kutu} kutuda ${z.kutu - z.yumurta} ejderha  •  ${[1, 2, 3].map((k) => `${kuleCarpani(ad, k)}x`).join(', ')} … tepe ${kuleCarpani(ad, KAT)}x`,
    ),
    '📝 *Örnek*: `.kule 1000 kolay` → `2` 🥚 (1.28x) → `4` 🥚 (1.7x) → `çek` → 1.700 XP',
    'Zorluk yazılmazsa orta. Yalnızca başlatan oynar.',
    `Süre 3 dk, dolarsa kazanç otomatik çekilir. En az ${MIN_BAHIS} XP basılır, cüzdanda en az ${MIN_KUMAR_BAKIYESI} XP olmalı. Grupta aynı anda tek oyun.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    if (getGame(from)) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

    const { miktar, secim } = argumanlariAyir(args)
    const zorluk = zorlukCoz(secim)
    if (!zorluk) return yaz('🐉 Zorluk `kolay`, `orta` ya da `zor` olmalı.')

    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp, kumarYasagi(from, sender))
    if (engel) return yaz(`🐉 ${engel}`)

    const cozum = miktarCoz(miktar, xp)
    if (cozum.hata) return yaz(`🐉 ${cozum.hata}`)

    await start({ sock, msg, from, sender, miktar: cozum.miktar, zorluk })
  },
}
