import { isAdmin, requireGroupMetadata } from '../lib/group.js'

export default {
  name: 'say',
  aliases: ['sayi', 'sayı', 'uyesayisi', 'üyesayısı'],
  description: 'Grubun üye sayısını gösterir',
  usage: '.say',
  category: 'grup',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const meta = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!meta) return

    const uyeler = meta.participants || []
    const adminSayisi = uyeler.filter(isAdmin).length

    await sock.sendMessage(
      from,
      { text: `👥 ${uyeler.length} üye (${adminSayisi} admin)` },
      { quoted: msg },
    )
  },
}
