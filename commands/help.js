export default {
  name: 'help',
  aliases: ['yardim', 'yardım', 'menu', 'komutlar'],
  description: 'Komut listesini veya tek bir komutun ayrıntısını gösterir',
  usage: '.help  ya da  .help sticker',
  ownerOnly: false,

  async execute({ sock, msg, from, args, commands, isOwner }) {
    const prefix = process.env.PREFIX || '.'
    const botName = process.env.BOT_NAME || 'wp-bot'

    // ownerOnly komutlar, sahibi olmayana hiç gösterilmez.
    const visible = [...new Set(commands.values())].filter((c) => !c.ownerOnly || isOwner)

    if (args[0]) {
      const wanted = args[0].toLowerCase().replace(prefix, '')
      const command = commands.get(wanted)

      if (!command || (command.ownerOnly && !isOwner)) {
        await sock.sendMessage(
          from,
          { text: `\`${wanted}\` diye bir komut yok. Listeyi görmek için \`${prefix}help\`.` },
          { quoted: msg },
        )
        return
      }

      const aliases = command.aliases?.length
        ? command.aliases.map((a) => `${prefix}${a}`).join(', ')
        : 'yok'

      await sock.sendMessage(
        from,
        {
          text: [
            `*${prefix}${command.name}*`,
            command.description,
            '',
            `Kullanım: \`${command.usage}\``,
            `Diğer adları: ${aliases}`,
          ].join('\n'),
        },
        { quoted: msg },
      )
      return
    }

    const lines = visible
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((c) => `• \`${prefix}${c.name}\` — ${c.description}${c.ownerOnly ? ' _(sadece sahip)_' : ''}`)

    await sock.sendMessage(
      from,
      {
        text: [
          `*${botName}* — ${lines.length} komut`,
          '',
          ...lines,
          '',
          `Ayrıntı için: \`${prefix}help <komut>\``,
        ].join('\n'),
      },
      { quoted: msg },
    )
  },
}
