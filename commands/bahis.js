import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarOyna, MIN_BAHIS, yaziTura, yuzCoz } from '../lib/kumar.js'

export default {
  name: 'bahis',
  aliases: ['bet', 'yazıturabahis'],
  description: 'XP\'ne yazı-tura bahsi — bilirsen ikiye katlanır',
  usage: '.bahis <miktar|hepsi|yarısı> [yazı|tura]',
  details: [
    `Örnek: \`.bahis 100 tura\` — tura gelirse +100 XP, yazı gelirse −100 XP.`,
    'Yüz yazılmazsa senin yerine rastgele seçilir.',
    `\`hepsi\` bütün XP'ni, \`yarısı\` yarısını basar. En az ${MIN_BAHIS} XP.`,
    'Kaybedilen XP seviyeni de düşürebilir. Kasa her grupta ayrıdır.',
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const { miktar, secim } = argumanlariAyir(args)
    if (secim && !yuzCoz(secim)) {
      await sock.sendMessage(from, { text: '🪙 `yazı` ya da `tura` yaz. Örnek: `.bahis 100 tura`' }, { quoted: msg })
      return
    }
    const yuz = yuzCoz(secim) || (Math.random() < 0.5 ? 'Yazı' : 'Tura')

    await kumarOyna({
      oyun: 'bahis',
      sock, msg, from, sender,
      miktarArg: miktar,
      cevir: () => yaziTura(yuz),
      anlat: (s) => [`🪙 Senin seçimin: *${yuz}*`, `Para döndü… *${s.sonuc}*!`],
    })
  },
}
