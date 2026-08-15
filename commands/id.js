import { resolveTargets } from '../lib/target.js'

export default {
  name: 'id',
  aliases: ['jid', 'kimlik'],
  description: 'WhatsApp JID bilgini (ve sohbetin JID\'ini) gösterir',
  usage: '.id  —  ya da .id @kişi / bir mesajı yanıtlayarak .id',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const [target] = resolveTargets(parsed, { args, limit: 1 })

    const lines = [
      `👤 Sen: \`${parsed.sender}\``,
      `💬 Sohbet: \`${parsed.from}\``,
      `📦 Tür: ${parsed.isGroup ? 'grup' : 'özel sohbet'}`,
    ]

    if (target && target !== parsed.sender) {
      lines.push(`🎯 Hedef: \`${target}\``)
    }

    await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg })
  },
}
