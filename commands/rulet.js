import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarOyna, MIN_BAHIS, ruletCevir, ruletSecimCoz } from '../lib/kumar.js'

const RENK_EMOJI = { kırmızı: '🔴', siyah: '⚫', yeşil: '🟢' }

function secimMetni(secim) {
  if (secim.tur === 'sayi') return `${secim.deger} numara`
  return secim.deger
}

export default {
  name: 'rulet',
  aliases: ['roulette', 'rulo'],
  description: 'XP\'ne rulet oyna — renk, tek/çift ya da sayı',
  usage: '.rulet <miktar|hepsi|yarısı> <kırmızı|siyah|tek|çift|0-36>',
  details: [
    'Örnek: `.rulet 100 kırmızı`, `.rulet 50 çift`, `.rulet 20 17`',
    'Renk ve tek/çift bahsi 2x öder, tek sayı bahsi 36x.',
    '0 (yeşil) gelirse renk ve tek/çift bahisleri kaybeder.',
    `İkisi de sayıysa önce miktar yazılır. En az ${MIN_BAHIS} XP.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const { miktar, secim: secimArg } = argumanlariAyir(args)
    const secim = ruletSecimCoz(secimArg)
    if (!secim) {
      await sock.sendMessage(
        from,
        { text: '🎡 Neye basıyorsun? `kırmızı`, `siyah`, `tek`, `çift` ya da 0-36 arası bir sayı.\nÖrnek: `.rulet 100 kırmızı`' },
        { quoted: msg },
      )
      return
    }

    await kumarOyna({
      oyun: 'rulet',
      sock, msg, from, sender,
      miktarArg: miktar,
      cevir: () => ruletCevir(secim),
      anlat: (s) => [
        `🎡 Senin bahsin: *${secimMetni(secim)}*`,
        `Top durdu… ${RENK_EMOJI[s.renk]} *${s.sayi}* (${s.renk})`,
      ],
    })
  },
}
