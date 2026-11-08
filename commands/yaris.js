import { requireGroup } from '../lib/group.js'
import { argumanlariAyir, kumarEngeli, MIN_BAHIS, MIN_KUMAR_BAKIYESI, miktarCoz } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { ATLAR, atOrani, BAHIS_SURESI_MS, bahisYap, yarisDurumu } from '../games/yaris.js'

export default {
  name: 'yarış',
  aliases: ['yaris', 'atyarışı', 'atyarisi', 'hipodrom'],
  description: 'At yarışı — herkes aynı koşuya bahis yapar',
  usage: '.yarış <miktar|hepsi|yarısı> <at no>',
  details: [
    '🏇 *Nasıl oynanır*',
    '1. `.yarış <miktar> <at no>` yaz. Açık yarış yoksa bu bahis yeni yarışı açar.',
    `2. ${BAHIS_SURESI_MS / 1000} sn boyunca gruptaki herkes aynı komutla kendi atına basar. Kişi başı bir bahis.`,
    '3. Süre dolunca atlar koşar. Kazanan ata basan herkes bahsinin oran katını alır, diğerleri bahsini kaybeder.',
    'Bahis komutla verilir, bota yanıt yazmak gerekmez.',
    '📊 *Atlar* (oran büyüdükçe kazanma şansı düşer)',
    ...ATLAR.map((at, i) => `${i + 1}. ${at.ad}  •  ${atOrani(at)}x  •  %${at.sans} şans`),
    '📝 *Örnek*: `.yarış 1000 4` → Tosun kazanırsa 8.000 XP alırsın, kaybederse 1.000 XP gider.',
    '`.yarış` tek başına atları ve açık yarışın bahislerini gösterir. `.oyunbitir` koşuyu hemen başlatır, iade yok.',
    `En az ${MIN_BAHIS} XP basılır, cüzdanda en az ${MIN_KUMAR_BAKIYESI} XP olmalı.`,
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
