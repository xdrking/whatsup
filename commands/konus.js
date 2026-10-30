import { requireGroup, senderIsAdmin } from '../lib/group.js'
import { isMuted, setMuted } from '../lib/mute.js'

export default {
  name: 'konuş',
  aliases: ['konus', 'unmute'],
  description: 'Susturulan botu bu grupta tekrar açar (admin)',
  usage: '.konuş',
  details: [
    'Yalnızca grup adminleri ve bot sahibi kullanabilir.',
    'Susturulmuş grupta çalışan tek komut budur.',
  ],
  ownerOnly: false,
  // Susturulmuş grupta çalışan tek komut.
  worksWhenMuted: true,

  async execute({ sock, msg, from, sender, parsed, isOwner }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    if (!isMuted(from)) {
      await sock.sendMessage(from, { text: 'Zaten konuşuyorum 🙂' }, { quoted: msg })
      return
    }

    if (!isOwner && !(await senderIsAdmin(sock, from, sender))) {
      await sock.sendMessage(from, { text: 'Botu yalnızca grup adminleri açabilir.' }, { quoted: msg })
      return
    }

    setMuted(from, false)

    await sock.sendMessage(from, { text: '🗣️ Geri döndüm!' }, { quoted: msg })
  },
}
