import { formatAgo, lastSender } from '../lib/activity.js'
import { requireGroup } from '../lib/group.js'
import { mentionOf } from '../lib/target.js'

export default {
  name: 'son',
  aliases: ['sonmesaj', 'sonyazan'],
  description: 'Grupta en son mesaj yazan kişiyi gösterir',
  usage: '.son',
  category: 'grup',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const entry = lastSender(from)

    if (!entry) {
      await sock.sendMessage(
        from,
        { text: 'Henüz kayıt yok. (Bot yeni başlatıldıysa ilk mesajlarla dolmaya başlar.)' },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(
      from,
      {
        text: `🗣️ En son yazan: ${mentionOf(entry.jid)} — ${formatAgo(entry.at)}`,
        mentions: [entry.jid],
      },
      { quoted: msg },
    )
  },
}
