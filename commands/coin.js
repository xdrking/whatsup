export default {
  name: 'coin',
  aliases: ['yazitura', 'yazıtura', 'para'],
  description: 'Yazı tura atar',
  usage: '.coin',
  category: 'eğlence',
  ownerOnly: false,

  async execute({ sock, msg, from }) {
    const sonuc = Math.random() < 0.5 ? 'Yazı' : 'Tura'

    await sock.sendMessage(from, { text: `🪙 *${sonuc}*` }, { quoted: msg })
  },
}
