import { binlik } from '../lib/sayi.js'
import { requireGroup } from '../lib/group.js'
import {
  argumanlariAyir, CRASH_DONUS, CRASH_EN_AZ, CRASH_EN_COK, crashHedefCoz, crashUc, kumarOyna, MIN_BAHIS, MIN_KUMAR_BAKIYESI,
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
    '🚀 *Nasıl oynanır*',
    '1. `.crash <miktar> <hedef>` yaz. Hedef, roketin varmasını beklediğin çarpandır.',
    '2. Roket 1x\'ten kalkar, çarpan yükselir ve rastgele bir noktada patlar.',
    '3. Patlamadan hedefe varırsa bahsinin hedef katını alırsın, varamazsa bahis yanar.',
    'Tek mesajlık oyun: canlı "şimdi çek" yok, hedef otomatik çekimdir.',
    '📊 *Tutma şansı* (hedef büyüdükçe kazanç artar, şans düşer)',
    [1.5, 2, 5, 10, 100].map((h) => `${h}x → %${Math.round(CRASH_DONUS * 1000 / h) / 10}`).join('  •  '),
    '📝 *Örnek*: `.crash 1000 2` → roket 3.4x\'te patlarsa 2.000 XP alırsın, 1.7x\'te patlarsa 1.000 XP gider.',
    `Hedef ${CRASH_EN_AZ}x-${binlik(CRASH_EN_COK)}x, ondalık \`2.5\` ya da \`2,5\` yazılır. Önce miktar, sonra hedef.`,
    `En az ${MIN_BAHIS} XP basılır, cüzdanda en az ${MIN_KUMAR_BAKIYESI} XP olmalı.`,
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
      oyun: 'crash',
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
