import { isAdmin, requireGroupMetadata } from '../lib/group.js'
import { displayName } from '../lib/target.js'

// Kalabalık grupta tek mesaj hem okunmaz hem WhatsApp'ın metin sınırına dayanır.
const SATIR_PER_MESAJ = 60

export default {
  name: 'üyeler',
  aliases: ['uyeler', 'liste', 'members'],
  description: 'Grup üyelerini listeler (etiketlemeden)',
  usage: '.üyeler',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const meta = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!meta) return

    const uyeler = meta.participants || []

    if (!uyeler.length) {
      await sock.sendMessage(from, { text: 'Üye listesi alınamadı.' }, { quoted: msg })
      return
    }

    // Bilerek etiketsiz: liste bilgi amaçlı, herkese bildirim göndermek
    // `.etiket` komutunun işi.
    const lines = uyeler.map((uye, index) => {
      const isaret = isAdmin(uye) ? '🛡️ ' : ''
      return `${index + 1}. ${isaret}${displayName(uye.id)}`
    })

    for (let i = 0; i < lines.length; i += SATIR_PER_MESAJ) {
      const parca = lines.slice(i, i + SATIR_PER_MESAJ)
      const baslik = i === 0
        ? `*Üyeler* (${uyeler.length})\n`
        : `*Üyeler* (${i + 1}-${i + parca.length})\n`

      await sock.sendMessage(from, { text: baslik + parca.join('\n') }, { quoted: msg })
    }
  },
}
