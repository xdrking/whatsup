const YUZLER = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

export default {
  name: 'zar',
  aliases: ['zaratt', 'dice'],
  description: '1-6 arası zar atar',
  usage: '.zar',
  ownerOnly: false,

  async execute({ sock, msg, from }) {
    const sonuc = 1 + Math.floor(Math.random() * 6)

    await sock.sendMessage(
      from,
      { text: `🎲 ${YUZLER[sonuc - 1]}  *${sonuc}*` },
      { quoted: msg },
    )
  },
}
