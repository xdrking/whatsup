import { requireGroup, senderIsAdmin } from '../lib/group.js'
import { setMuted } from '../lib/mute.js'
import { endGame, getGame } from '../games/gameManager.js'

export default {
  name: 'sus',
  aliases: ['botsus', 'mute'],
  description: 'Botu bu grupta susturur (admin) — açmak için .konuş',
  usage: '.sus',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed, isOwner }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    if (!isOwner && !(await senderIsAdmin(sock, from, sender))) {
      await sock.sendMessage(from, { text: 'Botu yalnızca grup adminleri susturabilir.' }, { quoted: msg })
      return
    }

    // Aktif oyun kapatılır: yoksa zaman aşımı mesajı susturulmuş grupta
    // kendiliğinden düşer.
    const oyunVardi = Boolean(getGame(from))
    if (oyunVardi) endGame(from)

    setMuted(from, true)

    await sock.sendMessage(
      from,
      {
        text: [
          '🤐 Tamam, susuyorum.',
          ...(oyunVardi ? ['Aktif oyun da kapatıldı.'] : []),
          'Tekrar konuşmam için bir admin `.konuş` yazsın.',
        ].join('\n'),
      },
      { quoted: msg },
    )
  },
}
