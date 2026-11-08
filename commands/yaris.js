import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarEngeli, MIN_BAHIS, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { ATLAR, atListesi, BAHIS_SURESI_MS, bahisYap, yarisDurumu } from '../games/yaris.js'

export default {
  name: 'yarış',
  aliases: ['yaris', 'atyarışı', 'atyarisi', 'hipodrom'],
  description: 'At yarışı — herkes aynı koşuya bahis yapar',
  usage: '.yarış <miktar|hepsi|yarısı> <at no>',
  details: [
    `İlk bahis yarışı açar, ${BAHIS_SURESI_MS / 1000} sn boyunca başkaları da \`.yarış <miktar> <at no>\` ile katılır.`,
    'Süre dolunca koşu yapılır, kazanan ata basanlar orandaki katı alır. Kişi başı bir bahis.',
    ...atListesi().split('\n'),
    `\`.yarış\` tek başına atları ve açık yarışın bahislerini gösterir. En az ${MIN_BAHIS} XP.`,
  ],
  category: 'kumar',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })
    if (!args.length) return sock.sendMessage(from, yarisDurumu(from), { quoted: msg })

    const { miktar, secim } = argumanlariAyir(args)
    const no = /^\d$/.test(secim ?? '') ? Number(secim) : 0
    if (no < 1 || no > ATLAR.length) return yaz(`🏇 At numarası yaz (1-${ATLAR.length}). Örnek: \`.yarış 1000 3\``)

    const { xp } = getStats(from, sender)
    const engel = kumarEngeli(xp, kumarYasagi(from, sender))
    if (engel) return yaz(`🏇 ${engel}`)

    const cozum = miktarCoz(miktar, xp)
    if (cozum.hata) return yaz(`🏇 ${cozum.hata}`)

    await bahisYap({ sock, msg, from, sender, miktar: cozum.miktar, at: no - 1 })
  },
}
