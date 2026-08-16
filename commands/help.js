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

    const satir = (c) =>
      `• \`${prefix}${c.name}\` — ${c.description}${c.ownerOnly ? ' _(sadece sahip)_' : ''}`

    const sirala = (list) => list.sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(satir)

    // Kategorisiz komutlar eski düz listeyi aynen korur; oyunlar sona ayrı
    // başlıkla eklenir.
    const genel = sirala(visible.filter((c) => c.category !== 'oyun'))
    const oyunlar = sirala(visible.filter((c) => c.category === 'oyun'))

    await sock.sendMessage(
      from,
      {
        text: [
          `*${botName}* — ${genel.length + oyunlar.length} komut`,
          '',
          ...genel,
          ...(oyunlar.length ? ['', '🎮 *OYUNLAR*', ...oyunlar] : []),
          '',
          `Ayrıntı için: \`${prefix}help <komut>\``,
        ].join('\n'),
      },
      { quoted: msg },
    )
  },
}
