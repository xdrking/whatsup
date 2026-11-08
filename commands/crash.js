import { binlik } from '../lib/sayi.js'
import { requireGroup } from '../lib/group.js'
import {
  argumanlariAyir, CRASH_DONUS, CRASH_EN_AZ, CRASH_EN_COK, crashHedefCoz, crashUc, kumarOyna, MIN_BAHIS,
} from '../lib/kumar.js'

/** Roketin yolu: patlama noktasına kadar birkaç ara çarpan. */
function ucus(nokta, hedef) {
  const duraklar = [1, 1.5, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000].filter((x) => x < Math.min(nokta, hedef))
  return [...duraklar.slice(-4).map((x) => `${x}x`), nokta >= hedef ? `✅ ${hedef}x` : `💥 ${nokta}x`].join(' → ')
}

export default {
  name: 'crash',
  aliases: ['roket'],
  description: 'Roket hedef çarpana varmadan patlamazsa kazanırsın',
  usage: '.crash <miktar|hepsi|yarısı> <hedef çarpan>',
  details: [
    'Roket kalkar, çarpan yükselir ve rastgele bir anda patlar.',
    'Hedefi baştan söylersin: roket hedefe varırsa bahsin o kadar katını alırsın, önce patlarsa bahis yanar.',
    `Örnek: \`.crash 1000 2.5\`. Hedef ${CRASH_EN_AZ}x-${binlik(CRASH_EN_COK)}x. Hedef büyüdükçe şans düşer:`,
    `2x hedefin tutma şansı %${CRASH_DONUS * 50}, 10x hedefin %${CRASH_DONUS * 10}. En az ${MIN_BAHIS} XP.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const { miktar, secim } = argumanlariAyir(args)
    const hedef = crashHedefCoz(secim)
    if (!hedef) {
      await sock.sendMessage(
        from,
        { text: `🚀 Hedef çarpanı yaz (${CRASH_EN_AZ}-${CRASH_EN_COK}). Örnek: \`.crash 1000 2.5\`` },
        { quoted: msg },
      )
      return
    }

    await kumarOyna({
      sock, msg, from, sender,
      miktarArg: miktar,
      cevir: () => crashUc(hedef),
      anlat: (s) => [
        `🚀 *CRASH*  •  hedef ${s.hedef}x`,
        '',
        ucus(s.nokta, s.hedef),
        '',
        s.carpan ? `Roket ${s.hedef}x'i geçti, ${s.nokta}x'te patladı.` : `Roket ${s.nokta}x'te patladı.`,
      ],
    })
  },
}
