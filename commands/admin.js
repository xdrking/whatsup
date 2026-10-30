import { isAdmin, requireGroupMetadata } from '../lib/group.js'
import { mentionOf } from '../lib/target.js'

export default {
  name: 'admin',
  aliases: ['adminler', 'yoneticiler', 'yöneticiler'],
  description: 'Gruptaki adminleri etiketleyerek listeler',
  usage: '.admin',
  category: 'grup',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const meta = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!meta) return

    const adminler = (meta.participants || []).filter(isAdmin)

    if (!adminler.length) {
      await sock.sendMessage(from, { text: 'Bu grupta admin görünmüyor.' }, { quoted: msg })
      return
    }

    const jids = adminler.map((uye) => uye.id)
    const lines = adminler.map((uye) => {
      const isaret = uye.admin === 'superadmin' ? '👑' : '🛡️'
      return `${isaret} ${mentionOf(uye.id)}`
    })

    await sock.sendMessage(
      from,
      { text: [`*Adminler* (${adminler.length})`, '', ...lines].join('\n'), mentions: jids },
      { quoted: msg },
    )
  },
}
