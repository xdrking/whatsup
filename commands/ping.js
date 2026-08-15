// Baileys zaman damgasını bazen düz sayı, bazen protobuf Long nesnesi verir.
function toMillis(timestamp) {
  if (!timestamp) return 0
  const seconds = typeof timestamp === 'object' ? Number(timestamp.low ?? 0) : Number(timestamp)
  return seconds * 1000
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts = []
  if (days) parts.push(`${days}g`)
  if (hours) parts.push(`${hours}sa`)
  if (minutes) parts.push(`${minutes}dk`)
  parts.push(`${secs}sn`)
  return parts.join(' ')
}

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Botun ayakta olduğunu ve gecikmeyi gösterir',
  usage: '.ping',
  ownerOnly: false,

  async execute({ sock, msg, from }) {
    const sentAt = toMillis(msg.messageTimestamp)
    const latency = sentAt ? Date.now() - sentAt : null
    const memory = Math.round(process.memoryUsage().rss / 1024 / 1024)

    await sock.sendMessage(
      from,
      {
        text: [
          'pong',
          latency === null ? 'gecikme: bilinmiyor' : `gecikme: ${latency} ms`,
          `çalışma süresi: ${formatUptime(process.uptime())}`,
          `bellek: ${memory} MB`,
        ].join('\n'),
      },
      { quoted: msg },
    )
  },
}
